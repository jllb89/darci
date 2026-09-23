import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({from:vi.fn(),refresh:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({from:mocks.from})}));
vi.mock("../../src/services/memberAllowanceWindowService",()=>({refreshMemberAllowanceWindow:mocks.refresh}));
vi.mock("../../src/services/billingPolicyService",()=>({getBillingEnforcementMode:()=>"enforced",evaluateMemberBillingPolicy:async()=>({allowed:true,canProceed:true,wouldBlock:false})}));
vi.mock("../../src/config/stripe",()=>({getStripeEnvironment:()=>"test"}));
import {MEMBER_PRICING_V2} from "../../src/config/memberPricing";
import {getMemberMembershipStatus} from "../../src/services/memberBillingService";
describe("membership v2 read contract",()=>{
  let records:Record<string,any>, pending:number;
  beforeEach(()=>{
    vi.clearAllMocks();pending=0;
    records={users:{id:"user",status:"active"},billing_accounts:{id:"account",status:"active"},
      billing_catalog_prices:[{price_code:"member_plus_monthly",display_name:"Legacy Plus",unit_amount_cents:9900,billing_interval:"month",usage_limit_quantity:10},...MEMBER_PRICING_V2.map(p=>({price_code:p.priceCode,display_name:p.name,unit_amount_cents:p.amount,billing_interval:p.interval,usage_limit_quantity:p.allowance,included_entitlement_quantity:p.allowance,is_unlimited:p.unlimited}))],
      billing_subscriptions:{id:"sub",status:"active",current_period_start:"2026-01-01",current_period_end:"2027-01-01",metadata:{}},
      billing_subscription_items:{id:"item",price_code_snapshot:"member_unlimited_annual_v2"},
      billing_entitlements:{id:"window",is_unlimited:true,quantity_total:null,quantity_used:32,starts_at:"2026-09-01",ends_at:"2026-10-01"}};
    mocks.from.mockImplementation(table=>{
      const result={data:records[table]??null,error:null,count:table==="billing_orders"?pending:0};
      const query:any={then:(resolve:any)=>Promise.resolve(result).then(resolve)};
      for(const method of ["select","eq","in","order","limit"])query[method]=()=>query;
      query.single=query.maybeSingle=async()=>result;return query;
    });
  });
  it("does not send null quota/annual plans to old iOS decoders",async()=>{
    await expect(getMemberMembershipStatus({dbUserId:"user"})).rejects.toMatchObject({statusCode:426,code:"billing_client_update_required"});
  });
  it("separates paid-through renewal from the monthly allowance and preserves legacy read labels",async()=>{
    const result=await getMemberMembershipStatus({dbUserId:"user",catalogVersion:2});
    expect(result.membership.allowance).toMatchObject({total:null,remaining:null,used:32,isUnlimited:true,periodEnd:"2026-10-01",exhausted:false});
    expect(result.membership.currentPeriodEnd).toBe("2027-01-01");
    expect(result.plans.filter(p=>p.availableForPurchase)).toHaveLength(6);
    expect(result.plans.find(p=>p.priceCode==="member_plus_monthly")?.availableForPurchase).toBe(false);
    expect(mocks.refresh).toHaveBeenCalledWith("account");
  });
  it("allows re-subscription after cancellation but not duplicate checkout during reactivation",async()=>{
    records.billing_subscriptions.status="canceled";
    expect((await getMemberMembershipStatus({dbUserId:"user",catalogVersion:2})).actions.canCheckout).toBe(true);
    pending=1;
    const result=await getMemberMembershipStatus({dbUserId:"user",catalogVersion:2});
    expect(result.actions.canCheckout).toBe(false);
    expect(result.membership.state).toBe("activation_pending");
  });
  it("keeps paused sale options readable for existing members but not purchasable",async()=>{
    records.billing_catalog_prices.forEach((p:any)=>{p.available_for_purchase=false;});
    const result=await getMemberMembershipStatus({dbUserId:"user",catalogVersion:2});
    expect(result.plans).toHaveLength(7);
    expect(result.plans.filter(p=>p.availableForPurchase)).toHaveLength(0);
  });
});
