import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), event: vi.fn(), subscription: vi.fn(), release: vi.fn(), update: vi.fn(), eq: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("../../src/services/billingPolicyService", () => ({ releaseMemberBillingHeldDocuments: mocks.release }));
vi.mock("../../src/config/stripe", () => ({
  getStripeEnvironment: () => "test", assertStripeObjectMatchesEnvironment: vi.fn(), getStripeWebhookSecret: vi.fn(),
  getStripeClient: () => ({ events: { retrieve: mocks.event }, subscriptions: { retrieve: mocks.subscription } }),
}));
import { processStoredStripeWebhook } from "../../src/services/stripeWebhookService";

describe("promotion billing webhook totals and fulfillment", () => {
  const run = () => processStoredStripeWebhook({ storedEventId: "inbox", workerId: "fixture" });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockImplementation(async (name) => ({ data: name === "claim_stripe_webhook_event" ? { id: "inbox", event_id: "evt_fixture", attempt_count: 1 } : {}, error: null }));
    const query: any = { then: (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve) };
    query.update = mocks.update.mockReturnValue(query);
    query.eq = mocks.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.subscription.mockResolvedValue({
      id: "sub_fixture", customer: "cus_fixture", status: "active", currency: "usd", cancel_at_period_end: false,
      metadata: { darci_environment: "test", darci_billing_account_id: "account", darci_owner_user_id: "owner", darci_order_id: "order" },
      items: { data: [{ price: { id: "price", metadata: { darci_product_code: "member_membership" } }, current_period_start: 1780000000, current_period_end: 1782592000 }] },
      latest_invoice: { id: "in_fixture", status: "paid", amount_paid: 0, amount_due: 0, currency: "usd" },
    });
  });
  it.each([{ discount: 500, tax: 40, total: 539 }, { discount: 999, tax: 0, total: 0 }])("records actual discounted Checkout totals: %j", async ({ discount, tax, total }) => {
    const subscription = await mocks.subscription();
    subscription.latest_invoice.amount_paid = total;
    mocks.event.mockResolvedValue({ id: "evt_fixture", type: "checkout.session.completed", data: { object: {
      id: "cs_fixture", subscription: "sub_fixture", amount_subtotal: 999, amount_total: total,
      total_details: { amount_discount: discount, amount_tax: tax },
      metadata: { darci_order_id: "order", darci_billing_account_id: "account" },
    } } });
    await expect(run()).resolves.toMatchObject({ outcome: "processed" });
    expect(mocks.update).toHaveBeenCalledWith({ subtotal_amount_cents: 999, discount_amount_cents: discount, tax_amount_cents: tax, total_amount_cents: total });
    expect(mocks.eq).toHaveBeenCalledWith("provider_checkout_session_id", "cs_fixture");
    expect(mocks.eq).toHaveBeenCalledWith("provider_environment", "test");
    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_member_subscription_snapshot", expect.objectContaining({ p_invoice_amount_cents: total, p_subscription_status: "active" }));
    expect(mocks.release).toHaveBeenCalledTimes(1); // Includes $0 paid invoices, without a PaymentIntent.
  });
  it("retains the actual outstanding amount on a failed renewal and does not grant access", async () => {
    const subscription = await mocks.subscription();
    subscription.status = "past_due";
    subscription.latest_invoice = { id: "in_failed", status: "open", amount_paid: 0, amount_due: 1599, currency: "usd" };
    mocks.event.mockResolvedValue({ id: "evt_fixture", type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_fixture" } } } } });
    await run();
    expect(mocks.rpc).toHaveBeenCalledWith("apply_stripe_member_subscription_snapshot", expect.objectContaining({ p_invoice_amount_cents: 1599, p_subscription_status: "past_due" }));
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled(); // Never overwrite original order with a renewal/proration.
  });
  it("marks total-sync failures retryable instead of silently reporting success", async () => {
    mocks.event.mockResolvedValue({ id: "evt_fixture", type: "checkout.session.completed", data: { object: { id: "cs_fixture", subscription: "sub_fixture", amount_subtotal: 999, amount_total: 0, metadata: { darci_order_id: "order", darci_billing_account_id: "account" } } } });
    const failed: any = { update: () => failed, eq: () => failed, then: (resolve: any) => Promise.resolve({ error: { message: "unavailable" } }).then(resolve) };
    mocks.from.mockReturnValue(failed);
    await expect(run()).rejects.toThrow("totals synchronization failed");
    expect(mocks.rpc).toHaveBeenCalledWith("resolve_stripe_webhook_event", expect.objectContaining({ p_status: "failed", p_retry_after_seconds: 30 }));
  });
});
