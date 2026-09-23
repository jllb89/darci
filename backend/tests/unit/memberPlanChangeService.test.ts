import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), retrieveSubscription: vi.fn(), createSchedule: vi.fn(),
  retrieveSchedule: vi.fn(), updateSchedule: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock("../../src/config/stripe", () => ({
  getStripeEnvironment: () => "test",
  assertStripeObjectMatchesEnvironment: vi.fn(),
  getStripeClient: () => ({
    subscriptions: { retrieve: mocks.retrieveSubscription },
    subscriptionSchedules: { create: mocks.createSchedule, retrieve: mocks.retrieveSchedule, update: mocks.updateSchedule },
  }),
}));
import { changeMemberMembershipPlan } from "../../src/services/memberBillingService";

describe("member downgrade provider contract", () => {
  let records: Record<string, any>;
  const start = 1790107200, end = 1792699200;
  const subscription = { id: "internal-sub", provider_subscription_id: "sub_fixture", status: "active", cancel_at_period_end: false, metadata: {} };
  beforeEach(() => {
    vi.resetAllMocks();
    records = {
      users: { id: "user-fixture", email: "fixture@example.invalid", status: "active", email_confirmed_at: "2026-09-22" },
      billing_accounts: { id: "account-fixture", status: "active" },
      billing_catalog_prices: { id: "catalog-fixture", price_code: "member_starter_monthly", usage_limit_quantity: 3 },
      billing_provider_price_mappings: { provider_price_id: "price_starter" },
      billing_subscriptions: subscription,
      billing_subscription_items: { price_code_snapshot: "member_plus_monthly", usage_limit_quantity: 10 },
    };
    mocks.from.mockImplementation((table: string) => {
      const result = { data: records[table] ?? null, error: null };
      const query: Record<string, any> = { then: (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve) };
      for (const method of ["select", "eq", "in", "order", "limit", "update", "insert"]) query[method] = vi.fn(() => query);
      query.single = query.maybeSingle = vi.fn(async () => result);
      return query;
    });
    mocks.retrieveSubscription.mockResolvedValue({ id: "sub_fixture", schedule: null, items: { data: [{ price: { id: "price_plus" }, current_period_start: start, current_period_end: end }] } });
    mocks.createSchedule.mockImplementation(async (params: Record<string, unknown>) => {
      // Model the real Stripe constraint that a permissive mock previously missed.
      if (params.from_subscription && Object.keys(params).length !== 1) throw new Error("from_subscription cannot be combined with metadata");
      return { id: "sched_fixture", current_phase: { start_date: start, end_date: end } };
    });
    mocks.updateSchedule.mockResolvedValue({ id: "sched_fixture" });
  });

  it("creates from_subscription alone, then attaches metadata and next-period phases", async () => {
    const result = await changeMemberMembershipPlan({ dbUserId: "user-fixture", targetPriceCode: "member_starter_monthly", idempotencyKey: "downgrade-fixture" });
    expect(mocks.createSchedule).toHaveBeenCalledWith({ from_subscription: "sub_fixture" }, { idempotencyKey: "darci:test:plan-change:downgrade-fixture:schedule" });
    expect(mocks.updateSchedule).toHaveBeenCalledWith("sched_fixture", expect.objectContaining({
      metadata: { darci_environment: "test", darci_billing_account_id: "account-fixture", darci_plan_change_kind: "downgrade" },
      phases: [
        expect.objectContaining({ start_date: start, end_date: end, items: [{ price: "price_plus", quantity: 1 }], proration_behavior: "none" }),
        expect.objectContaining({ start_date: end, items: [{ price: "price_starter", quantity: 1 }], proration_behavior: "none" }),
      ],
    }), { idempotencyKey: "darci:test:plan-change:downgrade-fixture:downgrade" });
    expect(result).toMatchObject({ changeType: "downgrade", status: "scheduled", effectiveAt: new Date(end * 1000).toISOString() });
  });

  it("updates an existing schedule without creating a second one", async () => {
    const provider = await mocks.retrieveSubscription();
    mocks.retrieveSubscription.mockResolvedValue({ ...provider, schedule: "sched_existing" });
    mocks.retrieveSchedule.mockResolvedValue({ id: "sched_existing", current_phase: { start_date: start, end_date: end } });
    await changeMemberMembershipPlan({ dbUserId: "user-fixture", targetPriceCode: "member_starter_monthly", idempotencyKey: "downgrade-existing" });
    expect(mocks.createSchedule).not.toHaveBeenCalled();
    expect(mocks.retrieveSchedule).toHaveBeenCalledWith("sched_existing");
    expect(mocks.updateSchedule.mock.calls[0]?.[0]).toBe("sched_existing");
  });
  it("defers a monthly-to-annual change and uses a full annual target phase", async () => {
    records.billing_catalog_prices = {id:"catalog-annual",price_code:"member_plus_annual_v2",usage_limit_quantity:25,billing_interval:"year",is_unlimited:false};
    const result = await changeMemberMembershipPlan({dbUserId:"user-fixture",targetPriceCode:"member_plus_annual_v2",idempotencyKey:"annual-fixture"});
    expect(result.changeType).toBe("cadence_change");
    expect(mocks.updateSchedule.mock.calls[0]?.[1].phases[1]).toMatchObject({start_date:end,duration:{interval:"year",interval_count:1},proration_behavior:"none"});
  });
  it("keeps an annual downgrade at the paid-through annual renewal", async () => {
    records.billing_subscription_items = {price_code_snapshot:"member_unlimited_annual_v2",usage_limit_quantity:null,is_unlimited:true};
    records.billing_catalog_prices = {id:"catalog-annual",price_code:"member_starter_annual_v2",usage_limit_quantity:3,billing_interval:"year",is_unlimited:false};
    const annualEnd = start + 365*24*60*60;
    mocks.retrieveSubscription.mockResolvedValue({id:"sub_fixture",schedule:null,items:{data:[{price:{id:"price_annual"},current_period_start:start,current_period_end:annualEnd}]}});
    mocks.createSchedule.mockResolvedValue({id:"sched_annual",current_phase:{start_date:start,end_date:annualEnd}});
    const result = await changeMemberMembershipPlan({dbUserId:"user-fixture",targetPriceCode:"member_starter_annual_v2",idempotencyKey:"annual-down"});
    expect(result).toMatchObject({changeType:"downgrade",effectiveAt:new Date(annualEnd*1000).toISOString()});
  });
});
