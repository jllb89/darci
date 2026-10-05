import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { assertStripeObjectMatchesEnvironment, getStripeClient, getStripeEnvironment } from "../config/stripe";
import { buildMemberRenewalNotice, renewalNoticeCandidate, RENEWAL_NOTICE_DAYS } from "./memberRenewalNotice";
import { queueMemberRenewalNoticeEmail } from "./notificationService";
import { captureException } from "../utils/sentry";

const db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });

export const getStripeRenewalNotice = async (subscriptionId: string, ownerUserId: string, now = Date.now()) => {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["discounts", "items.data.discounts", "latest_invoice"] });
  assertStripeObjectMatchesEnvironment(subscription, "Renewal reminder subscription");
  if (subscription.metadata.darci_owner_user_id !== ownerUserId || subscription.metadata.darci_environment !== getStripeEnvironment()) {
    throw new Error("Renewal reminder subscription ownership mismatch");
  }
  // Avoid preview requests outside the reminder window or for canceled subscriptions.
  const renewal = subscription.status === "trialing" ? subscription.trial_end : subscription.items.data[0]?.current_period_end;
  if (!renewal || renewal * 1000 <= now || renewal * 1000 > now + RENEWAL_NOTICE_DAYS * 86400_000
    || !["active", "trialing"].includes(subscription.status) || subscription.cancel_at_period_end || subscription.pause_collection
    || (subscription.cancel_at && subscription.cancel_at <= renewal)) return null;
  let invoiceDiscounts: Stripe.Discount[] = [];
  if (subscription.latest_invoice) {
    const invoiceId = typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice.id;
    const invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["discounts.source.coupon"] });
    assertStripeObjectMatchesEnvironment(invoice, "Renewal reminder latest invoice");
    invoiceDiscounts = invoice.discounts.filter((discount): discount is Stripe.Discount => typeof discount !== "string");
  }
  const candidate = renewalNoticeCandidate(subscription, invoiceDiscounts, now);
  if (!candidate) return null;
  const upcoming = await stripe.invoices.createPreview({ subscription: subscription.id });
  assertStripeObjectMatchesEnvironment(upcoming, "Renewal reminder invoice preview");
  return buildMemberRenewalNotice(subscription.id, candidate, upcoming);
};

export const getMemberRenewalNotice = async (ownerUserId: string) => {
  const { data: account, error: accountError } = await db.from("billing_accounts").select("id")
    .eq("owner_user_id", ownerUserId).eq("account_key", "default").eq("status", "active").maybeSingle();
  if (accountError) throw new Error(`Renewal account lookup failed: ${accountError.message}`);
  if (!account) return null;
  const { data, error } = await db.from("billing_subscriptions").select("provider_subscription_id")
    .eq("billing_account_id", account.id).eq("provider_environment", getStripeEnvironment()).eq("role_context", "member")
    .in("status", ["active", "trialing"]).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`Renewal subscription lookup failed: ${error.message}`);
  return data?.provider_subscription_id ? getStripeRenewalNotice(data.provider_subscription_id, ownerUserId) : null;
};

// The existing worker invokes this independently of app opens. Existing outbox
// uniqueness deduplicates each subscription/charge date; no new scheduler needed.
export const queueDueMemberRenewalNotices = async (now = Date.now()) => {
  let scanned = 0, queued = 0, failed = 0;
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.from("billing_subscriptions")
      .select("id, subscriber_user_id, provider_subscription_id")
      .eq("provider_environment", getStripeEnvironment()).eq("role_context", "member")
      .in("status", ["active", "trialing"]).eq("cancel_at_period_end", false)
      .gt("current_period_end", new Date(now).toISOString())
      .lte("current_period_end", new Date(now + RENEWAL_NOTICE_DAYS * 86400_000).toISOString())
      .order("id").range(offset, offset + 99);
    if (error) throw new Error(`Renewal reminder scan failed: ${error.message}`);
    for (const row of data ?? []) {
      scanned++;
      try {
        if (!row.provider_subscription_id || !row.subscriber_user_id) continue;
        const notice = await getStripeRenewalNotice(row.provider_subscription_id, row.subscriber_user_id, now);
        if (!notice) continue;
        const result = await queueMemberRenewalNoticeEmail({ ownerUserId: row.subscriber_user_id, subscriptionId: row.provider_subscription_id, notice });
        if (result && !result.existing) queued++;
      } catch (error) {
        failed++;
        captureException(error, { tags: { service: "worker", operation: "member_renewal_reminder" }, extra: { subscriptionId: row.id } });
      }
    }
    if ((data?.length ?? 0) < 100) break;
  }
  return { scanned, queued, failed };
};
