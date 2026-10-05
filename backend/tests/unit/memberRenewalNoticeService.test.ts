import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), retrieve: vi.fn(), invoice: vi.fn(), preview: vi.fn(), queue: vi.fn(), capture: vi.fn(), eq: vi.fn(), select: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock("../../src/config/stripe", () => ({
  getStripeEnvironment: () => "test", assertStripeObjectMatchesEnvironment: (obj: any) => { if (obj.livemode) throw new Error("Wrong environment"); },
  getStripeClient: () => ({ subscriptions: { retrieve: mocks.retrieve }, invoices: { retrieve: mocks.invoice, createPreview: mocks.preview } }),
}));
vi.mock("../../src/services/notificationService", () => ({ queueMemberRenewalNoticeEmail: mocks.queue }));
vi.mock("../../src/utils/sentry", () => ({ captureException: mocks.capture }));
import { getMemberRenewalNotice, getStripeRenewalNotice, queueDueMemberRenewalNotices } from "../../src/services/memberRenewalNoticeService";

describe("owner-scoped renewal notices", () => {
  const now = Date.now(), end = Math.floor(now / 1000) + 86400;
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.retrieve.mockResolvedValue({
      id: "sub_test", metadata: { darci_owner_user_id: "owner", darci_environment: "test" }, status: "active",
      discounts: [], items: { data: [{ current_period_start: end - 30 * 86400, current_period_end: end }] }, latest_invoice: "in_test",
    });
    mocks.invoice.mockResolvedValue({ discounts: [{ id: "di_once", end: null, source: { coupon: { duration: "once" } } }] });
    mocks.preview.mockResolvedValue({ amount_due: 999, currency: "usd" });
    mocks.queue.mockResolvedValue({ existing: false });
    mocks.from.mockImplementation(table => {
      const result = { data: table === "billing_accounts" ? { id: "account" } : { provider_subscription_id: "sub_test" }, error: null };
      const q: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
      for (const method of ["select", "eq", "in", "order", "limit", "gt", "lte", "range"]) q[method] = (...args: any[]) => { if (method === "eq") mocks.eq(...args); if (method === "select") mocks.select(...args); return q; };
      q.maybeSingle = async () => result;
      return q;
    });
  });
  it("scopes the database account and environment, then checks Stripe ownership", async () => {
    expect(await getMemberRenewalNotice("owner")).toMatchObject({ kind: "discount_ending", estimatedAmountCents: 999 });
    expect(mocks.eq).toHaveBeenCalledWith("owner_user_id", "owner");
    expect(mocks.eq).toHaveBeenCalledWith("billing_account_id", "account");
    expect(mocks.eq).toHaveBeenCalledWith("provider_environment", "test");
    expect(mocks.preview).toHaveBeenCalledWith({ subscription: "sub_test" });
  });
  it("rejects mismatched owners before fetching invoice data", async () => {
    await expect(getStripeRenewalNotice("sub_test", "someone-else", now)).rejects.toThrow("ownership mismatch");
    expect(mocks.invoice).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("rejects live objects in test mode", async () => {
    mocks.retrieve.mockResolvedValue({ livemode: true });
    await expect(getStripeRenewalNotice("sub_test", "owner", now)).rejects.toThrow("Wrong environment");
  });
  it("does not fetch a preview after cancellation", async () => {
    const sub = await mocks.retrieve();
    sub.cancel_at_period_end = true;
    expect(await getStripeRenewalNotice("sub_test", "owner", now)).toBeNull();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("does not substitute list price when Stripe preview is unavailable", async () => {
    mocks.preview.mockRejectedValue(new Error("Stripe unavailable"));
    await expect(getStripeRenewalNotice("sub_test", "owner", now)).rejects.toThrow("Stripe unavailable");
  });
  it("queues only due subscriber notices and respects outbox deduplication", async () => {
    const rows = [{ id: "internal", subscriber_user_id: "owner", provider_subscription_id: "sub_test" }];
    const q: any = { then: (resolve: any) => Promise.resolve({ data: rows, error: null }).then(resolve) };
    for (const method of ["eq", "in", "order", "gt", "lte", "range"]) q[method] = vi.fn(() => q);
    q.select = mocks.select.mockReturnValue(q);
    mocks.from.mockReturnValue(q);
    expect(await queueDueMemberRenewalNotices(now)).toEqual({ scanned: 1, queued: 1, failed: 0 });
    expect(mocks.select).toHaveBeenCalledWith("id, subscriber_user_id, provider_subscription_id");
    expect(mocks.queue).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "owner", subscriptionId: "sub_test" }));
    mocks.queue.mockResolvedValue({ existing: true });
    expect(await queueDueMemberRenewalNotices(now)).toEqual({ scanned: 1, queued: 0, failed: 0 });
    mocks.preview.mockRejectedValue(new Error("retry later"));
    expect(await queueDueMemberRenewalNotices(now)).toEqual({ scanned: 1, queued: 0, failed: 1 });
    expect(mocks.capture).toHaveBeenCalled();
  });
});
