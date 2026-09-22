import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), list: vi.fn(), retrieve: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock("../../src/config/stripe", async (original) => ({
  ...await original<typeof import("../../src/config/stripe")>(),
  getStripeClient: () => ({ subscriptions: { list: mocks.list, retrieve: mocks.retrieve } }),
}));
import { getBillingOperationsReport } from "../../src/services/billingOperationsService";

describe("provider reconciliation list omissions", () => {
  let internal: Record<string, unknown>[];
  const provider = () => ({
    id: "sub_clock_fixture", status: "canceled", livemode: false,
    metadata: { darci_environment: "test", darci_billing_account_id: "account-fixture" },
    items: { data: [{ price: { id: "price_fixture", metadata: {} }, current_period_start: 1790107200, current_period_end: 1792699200 }] },
  });
  beforeEach(() => {
    vi.resetAllMocks();
    internal = [{ id: "internal-fixture", billing_account_id: "account-fixture", provider_subscription_id: "sub_clock_fixture", provider_environment: "test", status: "canceled", current_period_start: "2026-09-22T20:00:00.000Z", current_period_end: "2026-10-22T20:00:00.000Z" }];
    mocks.from.mockImplementation((table: string) => {
      const result = { data: table === "billing_subscriptions" ? internal : [], error: null };
      const query: Record<string, any> = { then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      for (const method of ["select", "eq", "order", "limit"]) query[method] = () => query;
      return query;
    });
    mocks.list.mockReturnValue({ autoPagingToArray: async () => [] });
    mocks.retrieve.mockResolvedValue(provider());
  });

  it("retrieves known IDs omitted by Stripe's test-clock list without a false missing alert", async () => {
    const report = await getBillingOperationsReport();
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith("sub_clock_fixture");
    expect(report.providerScanComplete).toBe(true);
    expect(report.counts.providerSubscriptions).toBe(1);
    expect(report.issues).not.toEqual(expect.arrayContaining([expect.objectContaining({ code: "internal_subscription_missing_in_stripe" })]));
  });

  it("preserves a critical missing-subscription alert after a genuine provider 404", async () => {
    mocks.retrieve.mockRejectedValue({ code: "resource_missing", statusCode: 404 });
    const report = await getBillingOperationsReport();
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "internal_subscription_missing_in_stripe", severity: "critical" }));
  });

  it.each([429, 500, 401])("does not claim a completed scan after provider failure %s", async (statusCode) => {
    mocks.retrieve.mockRejectedValue({ statusCode });
    await expect(getBillingOperationsReport()).rejects.toMatchObject({ statusCode: 502, code: "billing_provider_reconciliation_failed" });
  });

  it("rejects a retrieved object from the wrong environment", async () => {
    mocks.retrieve.mockResolvedValue({ ...provider(), livemode: true });
    await expect(getBillingOperationsReport()).rejects.toMatchObject({ code: "billing_provider_reconciliation_failed" });
  });

  it("retains account-mismatch detection on a directly retrieved subscription", async () => {
    mocks.retrieve.mockResolvedValue({ ...provider(), metadata: { darci_billing_account_id: "wrong-account" } });
    const report = await getBillingOperationsReport();
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "provider_account_mismatch", severity: "critical" }));
  });

  it("does not retrieve already-listed IDs or duplicate missing IDs twice", async () => {
    mocks.list.mockReturnValue({ autoPagingToArray: async () => [provider()] });
    await getBillingOperationsReport();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    mocks.list.mockReturnValue({ autoPagingToArray: async () => [] });
    internal.push({ ...internal[0], id: "duplicate-fixture" });
    await getBillingOperationsReport();
    expect(mocks.retrieve).toHaveBeenCalledTimes(1);
  });

  it("keeps database-only mode offline and never retrieves another environment's IDs", async () => {
    expect((await getBillingOperationsReport({ includeProvider: false })).providerScanComplete).toBe(false);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    internal[0]!.provider_environment = "live";
    const report = await getBillingOperationsReport();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(report.issues).toContainEqual(expect.objectContaining({ code: "internal_environment_mismatch" }));
  });
});
