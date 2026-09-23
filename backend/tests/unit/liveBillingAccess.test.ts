import { describe, expect, it, vi, afterEach } from "vitest";
import { liveBillingAccess, OPERATOR_PRICE_CODE } from "../../src/config/liveBillingAccess";

const operator = "11111111-1111-4111-8111-111111111111";
const start = Date.parse("2026-09-23T12:00:00Z");
const env = {
  APP_ENV: "production", STRIPE_PROVIDER_ENVIRONMENT: "live", STRIPE_LIVE_MODE_ENABLED: "true",
  BILLING_LIVE_ACCESS_MODE: "operator", BILLING_LIVE_OPERATOR_USER_ID: operator,
  BILLING_LIVE_OPERATOR_STARTS_AT: new Date(start).toISOString(),
  BILLING_LIVE_OPERATOR_EXPIRES_AT: new Date(start + 86400000).toISOString(),
};

describe("production billing rollout gate", () => {
  it("preserves staging purchases", () => expect(liveBillingAccess("staging-user", "checkout", "any", {APP_ENV:"staging"}, start).allowed).toBe(true));
  it("only permits the approved operator and Starter monthly price", () => {
    expect(liveBillingAccess(operator, "checkout", OPERATOR_PRICE_CODE, env, start)).toEqual({allowed:true,checkoutExpiresAt:(start+86400000)/1000});
    expect(liveBillingAccess("22222222-2222-4222-8222-222222222222", "checkout", OPERATOR_PRICE_CODE, env, start).allowed).toBe(false);
    for (const price of [undefined,"member_plus_monthly_v2","member_starter_annual_v2","member_starter_monthly"]) {
      expect(liveBillingAccess(operator,"checkout",price,env,start).allowed).toBe(false);
    }
    expect(liveBillingAccess(operator,"plan_change",OPERATOR_PRICE_CODE,env,start).allowed).toBe(false);
    expect(liveBillingAccess(operator,"portal",undefined,env,start).allowed).toBe(true);
  });
  it.each([
    {BILLING_LIVE_ACCESS_MODE:undefined}, {BILLING_LIVE_ACCESS_MODE:"closed"}, {BILLING_LIVE_ACCESS_MODE:"typo"},
    {BILLING_LIVE_OPERATOR_USER_ID:""}, {BILLING_LIVE_OPERATOR_STARTS_AT:"invalid"}, {BILLING_LIVE_OPERATOR_EXPIRES_AT:"invalid"},
    {BILLING_LIVE_OPERATOR_EXPIRES_AT:new Date(start+86400001).toISOString()},
    {STRIPE_LIVE_MODE_ENABLED:"false"}, {STRIPE_PROVIDER_ENVIRONMENT:"test"}, {APP_ENV:"staging"},
  ])("fails closed for malformed or disabled configuration %j", patch => {
    expect(liveBillingAccess(operator,"checkout",OPERATOR_PRICE_CODE,{...env,...patch},start).allowed).toBe(false);
  });
  it("expires without requiring a deployment and bounds session lifetime", () => {
    for (const now of [start-1,start+86400000,start+86400001]) expect(liveBillingAccess(operator,"portal",undefined,env,now).allowed).toBe(false);
    expect(liveBillingAccess(operator,"checkout",OPERATOR_PRICE_CODE,env,start+86400000-1800000).allowed).toBe(false);
  });
  it("requires an explicit open mode for general sales", () => {
    expect(liveBillingAccess("another-user","plan_change",undefined,{...env,BILLING_LIVE_ACCESS_MODE:"open"},start).allowed).toBe(true);
  });
  it("cannot bypass the production gate with whitespace accepted by Stripe configuration", () => {
    expect(liveBillingAccess("another-user","checkout",OPERATOR_PRICE_CODE,{...env,APP_ENV:" production ",STRIPE_PROVIDER_ENVIRONMENT:" live "},start).allowed).toBe(false);
  });
});

const from = vi.hoisted(() => vi.fn(() => { throw new Error("Database must not be accessed"); }));
vi.mock("@supabase/supabase-js", () => ({createClient: () => ({from})}));
import {createMemberMembershipCheckout, createMemberCustomerPortalSession, changeMemberMembershipPlan} from "../../src/services/memberBillingService";

describe("service boundary rejects before customer, order or provider mutations", () => {
  afterEach(() => {vi.unstubAllEnvs();vi.clearAllMocks();});
  it("guards every purchase entrypoint", async () => {
    vi.stubEnv("APP_ENV","production");vi.stubEnv("STRIPE_PROVIDER_ENVIRONMENT","live");
    vi.stubEnv("STRIPE_LIVE_MODE_ENABLED","true");vi.stubEnv("BILLING_LIVE_ACCESS_MODE","closed");
    await expect(createMemberMembershipCheckout({dbUserId:operator,priceCode:OPERATOR_PRICE_CODE,idempotencyKey:"fixture"})).rejects.toMatchObject({statusCode:403,code:"billing_purchase_unavailable"});
    await expect(createMemberCustomerPortalSession({dbUserId:operator})).rejects.toMatchObject({statusCode:403});
    await expect(changeMemberMembershipPlan({dbUserId:operator,targetPriceCode:OPERATOR_PRICE_CODE,idempotencyKey:"fixture"})).rejects.toMatchObject({statusCode:403});
    expect(from).not.toHaveBeenCalled();
  });
});
