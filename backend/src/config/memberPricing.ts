// Approved 23 September 2026. New contracts never reuse legacy Price mappings.
export const LEGACY_MEMBER_PRICE_CODES = ["member_starter_monthly", "member_plus_monthly", "member_volume_monthly"] as const;
export const MEMBER_PRICING_V2 = [
  { priceCode: "member_starter_monthly_v2", tier: "starter", name: "Starter", interval: "month", amount: 999, allowance: 3, unlimited: false },
  { priceCode: "member_plus_monthly_v2", tier: "plus", name: "Plus", interval: "month", amount: 1999, allowance: 25, unlimited: false },
  { priceCode: "member_unlimited_monthly_v2", tier: "unlimited", name: "Unlimited", interval: "month", amount: 5999, allowance: null, unlimited: true },
  { priceCode: "member_starter_annual_v2", tier: "starter", name: "Starter", interval: "year", amount: 9900, allowance: 3, unlimited: false },
  { priceCode: "member_plus_annual_v2", tier: "plus", name: "Plus", interval: "year", amount: 19900, allowance: 25, unlimited: false },
  { priceCode: "member_unlimited_annual_v2", tier: "unlimited", name: "Unlimited", interval: "year", amount: 59900, allowance: null, unlimited: true },
] as const;
export const MEMBER_PRICE_CODES = [...LEGACY_MEMBER_PRICE_CODES, ...MEMBER_PRICING_V2.map(p => p.priceCode)];
export const isMemberPricingV2 = (code: string) => MEMBER_PRICING_V2.some(p => p.priceCode === code);
export function classifyMemberPlanChange(current: { priceCode: string; limit: number | null; unlimited: boolean }, target: { priceCode: string; limit: number | null; unlimited: boolean }) {
  const cadence = (code: string) => MEMBER_PRICING_V2.find(p => p.priceCode === code)?.interval ?? "month";
  for (const plan of [current, target]) {
    if (plan.unlimited ? plan.limit !== null : plan.limit === null || !Number.isInteger(plan.limit) || plan.limit <= 0) {
      throw new Error("Membership allowance is not configured");
    }
  }
  if (cadence(current.priceCode) !== cadence(target.priceCode)) return "cadence_change" as const;
  return (target.unlimited ? Infinity : target.limit!) > (current.unlimited ? Infinity : current.limit!) ? "upgrade" as const : "downgrade" as const;
}
