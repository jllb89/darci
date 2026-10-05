import type Stripe from "stripe";

export const RENEWAL_NOTICE_DAYS = 3;
export type MemberRenewalNotice = {
  id: string;
  kind: "trial_ending" | "discount_ending";
  chargeAt: string;
  estimatedAmountCents: number;
  currency: string;
  title: string;
  message: string;
};

// Stripe's once-only discount can disappear from the subscription after the
// first invoice. Inspect that invoice too, not just subscription.discounts.
export const renewalNoticeCandidate = (
  subscription: Stripe.Subscription,
  latestInvoiceDiscounts: Stripe.Discount[],
  now = Date.now(),
) => {
  if (!["active", "trialing"].includes(subscription.status) || subscription.cancel_at_period_end || subscription.pause_collection) return null;
  const renewal = subscription.status === "trialing" ? subscription.trial_end : subscription.items.data[0]?.current_period_end;
  if (!renewal || renewal * 1000 <= now || renewal * 1000 > now + RENEWAL_NOTICE_DAYS * 86400_000) return null;
  if (subscription.cancel_at && subscription.cancel_at <= renewal) return null;
  if (subscription.status === "trialing") return { kind: "trial_ending" as const, renewal };
  const discounts = [...(subscription.discounts ?? []), ...subscription.items.data.flatMap(item => item.discounts ?? []), ...latestInvoiceDiscounts];
  const ending = discounts.some(discount => {
    if (typeof discount === "string") return false;
    const coupon = discount.source?.coupon;
    return (discount.end !== null && discount.end <= renewal && discount.end > (subscription.items.data[0]?.current_period_start ?? 0))
      || (typeof coupon === "object" && coupon?.duration === "once");
  });
  return ending ? { kind: "discount_ending" as const, renewal } : null;
};

export const buildMemberRenewalNotice = (
  subscriptionId: string,
  candidate: NonNullable<ReturnType<typeof renewalNoticeCandidate>>,
  invoice: Pick<Stripe.Invoice, "amount_due" | "currency" | "total_discount_amounts">,
): MemberRenewalNotice | null => {
  if (invoice.amount_due <= 0) return null; // Credit/another offer can cover the next invoice.
  const chargeAt = new Date(candidate.renewal * 1000).toISOString();
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency }).format(invoice.amount_due / 100);
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(chargeAt));
  const title = candidate.kind === "trial_ending" ? "Your trial is ending" : "Your promotional pricing is ending";
  return {
    id: `${subscriptionId}:${candidate.kind}:${candidate.renewal}:${invoice.currency}:${invoice.amount_due}`,
    kind: candidate.kind, chargeAt, estimatedAmountCents: invoice.amount_due, currency: invoice.currency.toUpperCase(), title,
    message: `${title}. Your next membership payment is estimated at ${amount} on ${date} (UTC). This estimate includes current discounts, credits and applicable taxes and may change. Review or cancel your membership in Billing before that date to avoid the upcoming renewal.`,
  };
};
