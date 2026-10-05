import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), checkout: vi.fn(), retrieve: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock("../../src/config/liveBillingAccess", () => ({ liveBillingAccess: () => ({ allowed: true }), OPERATOR_PRICE_CODE: "operator" }));
vi.mock("../../src/config/stripe", () => ({
  getStripeEnvironment: () => "test", assertStripeObjectMatchesEnvironment: vi.fn(),
  buildStripeCheckoutReturnUrls: () => ({ successUrl: "https://app.example.test/success", cancelUrl: "https://app.example.test/cancel" }),
  getStripeClient: () => ({ checkout: { sessions: { create: mocks.checkout, retrieve: mocks.retrieve } } }),
}));
import { createMemberMembershipCheckout } from "../../src/services/memberBillingService";

describe("promotion-code Checkout creation", () => {
  let existing: any;
  beforeEach(() => {
    vi.resetAllMocks(); existing = null;
    mocks.from.mockImplementation(table => {
      const records: any = {
        users: { id: "owner", email: "test@example.invalid", status: "active", email_confirmed_at: "2026-01-01" },
        billing_accounts: { id: "account", status: "active" },
        billing_catalog_prices: { id: "catalog", product_id: "product", price_code: "member_starter_monthly", currency_code: "USD", unit_amount_cents: 999 },
        billing_provider_price_mappings: { provider_price_id: "price_test" },
        billing_customers: { id: "customer", provider_customer_id: "cus_test" },
      };
      const q: any = { then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
      for (const method of ["select", "eq", "neq", "in", "order", "limit", "update", "insert"]) q[method] = () => q;
      q.single = async () => ({ data: table === "billing_orders" ? { id: "order" } : records[table], error: null });
      q.maybeSingle = async () => ({ data: table === "billing_orders" ? existing : records[table] ?? null, error: null });
      return q;
    });
    mocks.checkout.mockResolvedValue({ id: "cs_test", url: "https://checkout.stripe.com/test", expires_at: 1893456000 });
    mocks.retrieve.mockResolvedValue({ id: "cs_existing", url: "https://checkout.stripe.com/existing", expires_at: 1893456000 });
  });
  it.each(["web", "ios"] as const)("enables Stripe's promo field for %s without automatic discounts or trials", async clientPlatform => {
    await createMemberMembershipCheckout({ dbUserId: "owner", priceCode: "member_starter_monthly", idempotencyKey: "promo-test", clientPlatform });
    const [params, options] = mocks.checkout.mock.calls[0]!;
    expect(params).toMatchObject({ mode: "subscription", allow_promotion_codes: true, payment_method_collection: "always", line_items: [{ price: "price_test", quantity: 1 }] });
    expect(params).not.toHaveProperty("discounts");
    expect(params.subscription_data).not.toHaveProperty("trial_period_days");
    expect(options).toEqual({ idempotencyKey: "darci:test:checkout:order" });
  });
  it("reuses an existing Checkout instead of creating duplicate subscriptions", async () => {
    existing = { id: "order", provider_checkout_session_id: "cs_existing", billing_order_items: [{ price_code_snapshot: "member_starter_monthly" }] };
    expect(await createMemberMembershipCheckout({ dbUserId: "owner", priceCode: "member_starter_monthly", idempotencyKey: "promo-test" })).toMatchObject({ reused: true });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
