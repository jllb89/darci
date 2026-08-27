import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import {
  assertStripeObjectIsTestMode,
  getStripeClient,
  getStripeWebhookSecret,
} from "../config/stripe";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
]);

type StoredWebhook = {
  id: string;
  event_id: string;
  event_type: string;
  attempt_count: number;
};

const objectIdFromEvent = (event: Stripe.Event) => {
  const object = event.data.object as { id?: unknown };
  return typeof object.id === "string" ? object.id : null;
};

export const ingestStripeWebhook = async (input: {
  rawBody: Buffer;
  signature: string;
  requestId?: string | null;
}) => {
  const stripe = getStripeClient();
  const event = stripe.webhooks.constructEvent(
    input.rawBody,
    input.signature,
    getStripeWebhookSecret(),
  );
  if (event.livemode) {
    throw new Error("Stripe live-mode webhook rejected by private-beta endpoint");
  }

  const { data, error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({
      provider: "stripe",
      provider_environment: "test",
      event_id: event.id,
      event_type: event.type,
      object_id: objectIdFromEvent(event),
      livemode: event.livemode,
      api_version: event.api_version,
      status: "received",
      payload: {
        created: event.created,
        request_id: typeof event.request === "string" ? event.request : event.request?.id ?? null,
      },
      next_attempt_at: new Date().toISOString(),
      payload_retention_until: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        ingress_request_id: input.requestId ?? null,
        payload_policy: "minimized_event_envelope",
      },
    })
    .select("id, event_id, event_type, attempt_count")
    .single();

  if (!error && data) return { stored: data as StoredWebhook, duplicate: false };
  if (error?.code !== "23505") {
    throw new Error(`Stripe webhook persistence failed: ${error?.message ?? "unknown_error"}`);
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("id, event_id, event_type, attempt_count")
    .eq("provider", "stripe")
    .eq("provider_environment", "test")
    .eq("event_id", event.id)
    .single();
  if (existingError || !existing) {
    throw new Error(`Stripe webhook duplicate lookup failed: ${existingError?.message}`);
  }
  return { stored: existing as StoredWebhook, duplicate: true };
};

const stripeId = (value: string | { id: string } | null) => {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
};

const invoiceSubscriptionId = (invoice: Stripe.Invoice) => {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return subscription ? stripeId(subscription) : null;
};

const normalizeSubscriptionStatus = (
  subscription: Stripe.Subscription,
  invoice: Stripe.Invoice | null,
) => {
  const status = subscription.status;
  if (status === "active" && invoice && invoice.status !== "paid") {
    return invoice.status === "open" ? "incomplete" : status;
  }
  return status;
};

const syncSubscription = async (subscriptionId: string, eventId: string) => {
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice"],
  });
  assertStripeObjectIsTestMode(subscription, "Stripe Subscription");

  if (subscription.items.data.length !== 1) {
    throw new Error("DARCi member subscription must contain exactly one Stripe item");
  }
  const item = subscription.items.data[0]!;
  const price = item.price;
  assertStripeObjectIsTestMode(price, "Stripe subscription Price");
  if (
    subscription.metadata.darci_environment !== "test" ||
    price.metadata.darci_product_code !== "member_membership"
  ) {
    throw new Error("Stripe subscription is outside the DARCi test member allowlist");
  }

  const billingAccountId = subscription.metadata.darci_billing_account_id;
  const ownerUserId = subscription.metadata.darci_owner_user_id;
  if (!billingAccountId || !ownerUserId) {
    throw new Error("Stripe subscription is missing DARCi correlation metadata");
  }

  const customerId = stripeId(subscription.customer);
  if (!customerId) throw new Error("Stripe subscription is missing a Customer");
  let invoice: Stripe.Invoice | null = null;
  if (subscription.latest_invoice) {
    invoice = typeof subscription.latest_invoice === "string"
      ? await stripe.invoices.retrieve(subscription.latest_invoice)
      : subscription.latest_invoice;
    assertStripeObjectIsTestMode(invoice, "Stripe Invoice");
  }

  const status = normalizeSubscriptionStatus(subscription, invoice);
  const { data, error } = await supabaseAdmin.rpc("apply_stripe_member_subscription_snapshot", {
    p_billing_account_id: billingAccountId,
    p_owner_user_id: ownerUserId,
    p_provider_customer_id: customerId,
    p_provider_subscription_id: subscription.id,
    p_provider_price_id: price.id,
    p_subscription_status: status,
    p_period_start: new Date(item.current_period_start * 1000).toISOString(),
    p_period_end: new Date(item.current_period_end * 1000).toISOString(),
    p_cancel_at_period_end: subscription.cancel_at_period_end,
    p_canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    p_ended_at: subscription.ended_at
      ? new Date(subscription.ended_at * 1000).toISOString()
      : null,
    p_order_id: subscription.metadata.darci_order_id || null,
    p_invoice_id: invoice?.id ?? null,
    p_invoice_status: invoice?.status ?? null,
    p_invoice_amount_cents: invoice?.amount_paid ?? invoice?.amount_due ?? 0,
    p_invoice_currency: invoice?.currency?.toUpperCase() ?? subscription.currency.toUpperCase(),
    p_event_id: eventId,
  });
  if (error) throw new Error(`Stripe subscription fulfillment failed: ${error.message}`);
  return data;
};

const expireCheckoutOrder = async (session: Stripe.Checkout.Session, eventId: string) => {
  assertStripeObjectIsTestMode(session, "Stripe Checkout Session");
  const orderId = session.metadata?.darci_order_id ?? session.client_reference_id;
  if (!orderId) return;
  const { error } = await supabaseAdmin
    .from("billing_orders")
    .update({
      status: "expired",
      metadata: {
        source: "stripe_webhook",
        last_stripe_event_id: eventId,
        checkout_expired: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("provider_environment", "test")
    .eq("provider_checkout_session_id", session.id)
    .in("status", ["draft", "pending_payment"]);
  if (error) throw new Error(`Checkout expiration update failed: ${error.message}`);
};

const processStripeEvent = async (event: Stripe.Event) => {
  assertStripeObjectIsTestMode(event, "Stripe Event");
  if (!HANDLED_EVENT_TYPES.has(event.type)) return "ignored" as const;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const subscriptionId = stripeId(session.subscription);
    if (!subscriptionId) throw new Error("Completed subscription Checkout has no Subscription");
    await syncSubscription(subscriptionId, event.id);
    return "processed" as const;
  }

  if (event.type === "checkout.session.expired") {
    await expireCheckoutOrder(event.data.object as Stripe.Checkout.Session, event.id);
    return "processed" as const;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const subscription = event.data.object as Stripe.Subscription;
    await syncSubscription(subscription.id, event.id);
    return "processed" as const;
  }

  if (event.type.startsWith("invoice.")) {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!subscriptionId) return "ignored" as const;
    await syncSubscription(subscriptionId, event.id);
    return "processed" as const;
  }

  return "ignored" as const;
};

const resolveEvent = async (input: {
  eventId: string;
  status: "processed" | "failed" | "ignored" | "dead_lettered";
  errorCode?: string | null;
  errorMessage?: string | null;
  retryAfterSeconds?: number | null;
}) => {
  const { error } = await supabaseAdmin.rpc("resolve_stripe_webhook_event", {
    p_event_id: input.eventId,
    p_status: input.status,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_retry_after_seconds: input.retryAfterSeconds ?? null,
  });
  if (error) throw new Error(`Stripe webhook resolution failed: ${error.message}`);
};

export const processStoredStripeWebhook = async (input: {
  storedEventId: string;
  workerId: string;
}) => {
  const { data, error } = await supabaseAdmin.rpc("claim_stripe_webhook_event", {
    p_event_id: input.storedEventId,
    p_worker_id: input.workerId,
    p_lease_seconds: 90,
    p_max_attempts: 8,
  });
  if (error) throw new Error(`Stripe webhook claim failed: ${error.message}`);
  if (!data) return { claimed: false };

  const claimed = data as StoredWebhook;
  try {
    const event = await getStripeClient().events.retrieve(claimed.event_id);
    const outcome = await processStripeEvent(event);
    await resolveEvent({ eventId: claimed.id, status: outcome });
    return { claimed: true, outcome };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const retryAfterSeconds = Math.min(30 * 2 ** Math.max(claimed.attempt_count - 1, 0), 3600);
    await resolveEvent({
      eventId: claimed.id,
      status: "failed",
      errorCode: "stripe_event_processing_failed",
      errorMessage: message,
      retryAfterSeconds,
    });
    throw error;
  }
};

export const runDueStripeWebhookEvents = async (input: {
  workerId: string;
  limit?: number;
}) => {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const now = new Date().toISOString();
  const [{ data: due, error: dueError }, { data: abandoned, error: abandonedError }] = await Promise.all([
    supabaseAdmin
      .from("stripe_webhook_events")
      .select("id")
      .in("status", ["received", "failed"])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order("received_at", { ascending: true })
      .limit(limit),
    supabaseAdmin
      .from("stripe_webhook_events")
      .select("id")
      .eq("status", "processing")
      .lte("processing_lease_expires_at", now)
      .order("received_at", { ascending: true })
      .limit(limit),
  ]);
  if (dueError || abandonedError) {
    throw new Error(`Stripe webhook queue scan failed: ${dueError?.message ?? abandonedError?.message}`);
  }

  const ids = [...new Set([...(due ?? []), ...(abandoned ?? [])].map((row) => row.id))].slice(0, limit);
  const results = [];
  for (const storedEventId of ids) {
    try {
      results.push(await processStoredStripeWebhook({ storedEventId, workerId: input.workerId }));
    } catch (error) {
      console.error("Stripe webhook processing attempt failed", {
        storedEventId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }
  return { scannedCount: ids.length, results };
};
