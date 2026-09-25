import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({account: null as Record<string, unknown> | null,
  entitlement: null as Record<string, unknown> | null, audit: vi.fn(), refresh: vi.fn()}));
vi.mock("../../src/services/memberAllowanceWindowService", () => ({refreshMemberAllowanceWindow: state.refresh}));
vi.mock("@supabase/supabase-js", () => ({createClient: () => ({from: (table: string) => {
  const query = {select: () => query, eq: () => query, lte: () => query, gt: () => query,
    order: () => query, limit: () => query,
    maybeSingle: async () => ({data: table === "billing_accounts" ? state.account : state.entitlement, error: null}),
    insert: state.audit};
  return query;
}})}));
import {assertMemberCanCreateWorkflow} from "../../src/services/billingPolicyService";

describe("new workflow billing enforcement", () => {
  beforeEach(() => {
    vi.stubEnv("BILLING_ENFORCEMENT_MODE", "enforced");
    state.account = null; state.entitlement = null;
    state.audit.mockReset().mockResolvedValue({error: null});
    state.refresh.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());
  const member = (used: number, total: number | null = 3, unlimited = false) => {
    state.account = {id: "account", owner_user_id: "fixture", status: "active"};
    state.entitlement = {id: "allowance", quantity_total: total, quantity_used: used, is_unlimited: unlimited};
  };
  it("denies a nonmember and records the denial", async () => {
    await expect(assertMemberCanCreateWorkflow({ownerUserId: "fixture"})).rejects.toMatchObject({statusCode: 402, code: "billing_membership_required"});
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({metadata: expect.objectContaining({can_proceed: false, enforcement_mode: "enforced"})}));
  });
  it("denies an exhausted allowance", async () => {
    member(3);
    await expect(assertMemberCanCreateWorkflow({ownerUserId: "fixture"})).rejects.toMatchObject({statusCode: 409, code: "billing_workflow_limit_reached"});
  });
  it("preserves an active member's remaining allowance", async () => {
    member(1);
    await expect(assertMemberCanCreateWorkflow({ownerUserId: "fixture"})).resolves.toMatchObject({canProceed: true, quantityRemaining: 2});
  });
  it("denies an inactive membership or missing current allowance", async () => {
    member(0); state.account!.status = "inactive";
    await expect(assertMemberCanCreateWorkflow({ownerUserId: "fixture"})).rejects.toMatchObject({statusCode: 402});
    state.account!.status = "active"; state.entitlement = null;
    await expect(assertMemberCanCreateWorkflow({ownerUserId: "fixture"})).rejects.toMatchObject({statusCode: 402});
  });
  it("keeps genuine Unlimited entitlements usable", async () => {
    member(1000, null, true);
    await expect(assertMemberCanCreateWorkflow({ownerUserId: "fixture"})).resolves.toMatchObject({canProceed: true, quantityRemaining: null});
  });
  it("demonstrates observe counts without blocking and does not confuse it with enforcement", async () => {
    vi.stubEnv("BILLING_ENFORCEMENT_MODE", "observe"); member(3);
    await expect(assertMemberCanCreateWorkflow({ownerUserId: "fixture"})).resolves.toMatchObject({canProceed: true, wouldBlock: true});
  });
});
