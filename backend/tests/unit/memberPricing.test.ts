import { describe, expect, it } from "vitest";
import { MEMBER_PRICING_V2, classifyMemberPlanChange } from "../../src/config/memberPricing";
const plan = (index: number) => { const p = MEMBER_PRICING_V2[index]!; return { priceCode: p.priceCode, limit: p.allowance, unlimited: p.unlimited }; };
describe("approved member pricing v2", () => {
  it("defines six distinct immutable contracts and the approved USD amounts", () => {
    expect(new Set(MEMBER_PRICING_V2.map(p => p.priceCode)).size).toBe(6);
    expect(MEMBER_PRICING_V2.map(p => [p.amount, p.allowance, p.unlimited])).toEqual([
      [999,3,false], [1999,25,false], [5999,null,true], [9900,3,false], [19900,25,false], [59900,null,true],
    ]);
  });
  it.each([[0,1,"upgrade"],[1,2,"upgrade"],[2,1,"downgrade"],[5,3,"downgrade"],[3,4,"upgrade"],[0,5,"cadence_change"],[5,0,"cadence_change"],[1,4,"cadence_change"]])("classifies %s to %s as %s", (from,to,kind) => {
    expect(classifyMemberPlanChange(plan(Number(from)),plan(Number(to)))).toBe(kind);
  });
  it.each([{limit:null,unlimited:false}, {limit:3,unlimited:true}, {limit:0,unlimited:false}])("fails closed for an invalid allowance %j", invalid => {
    expect(() => classifyMemberPlanChange(plan(0), {priceCode: "member_plus_annual_v2", ...invalid})).toThrow();
  });
});
