// Purchase permission is separate from processing already accepted Stripe events.
// Missing/malformed production rollout configuration must never open general sales.
export const OPERATOR_PRICE_CODE = "member_starter_monthly_v2";
type Environment = Record<string, string | undefined>;
type Action = "checkout" | "portal" | "plan_change";

export function liveBillingAccess(
  userId: string,
  action: Action,
  priceCode?: string,
  env: Environment = process.env,
  now = Date.now(),
): { allowed: boolean; checkoutExpiresAt?: number } {
  const appEnvironment = env.APP_ENV?.trim();
  const stripeEnvironment = env.STRIPE_PROVIDER_ENVIRONMENT?.trim();
  if (appEnvironment !== "production" && stripeEnvironment !== "live") return { allowed: true };
  if (appEnvironment !== "production" || stripeEnvironment !== "live"
    || env.STRIPE_LIVE_MODE_ENABLED !== "true") return { allowed: false };
  if (env.BILLING_LIVE_ACCESS_MODE === "open") return { allowed: true };
  if (env.BILLING_LIVE_ACCESS_MODE !== "operator") return { allowed: false };
  const operator = env.BILLING_LIVE_OPERATOR_USER_ID ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operator)
    || operator !== userId || action === "plan_change") return { allowed: false };
  const startsAt = Date.parse(env.BILLING_LIVE_OPERATOR_STARTS_AT ?? "");
  const expiresAt = Date.parse(env.BILLING_LIVE_OPERATOR_EXPIRES_AT ?? "");
  if (!Number.isFinite(startsAt) || !Number.isFinite(expiresAt)
    || expiresAt <= startsAt || expiresAt - startsAt > 24 * 60 * 60 * 1000
    || now < startsAt || now >= expiresAt) return { allowed: false };
  if (action === "portal") return { allowed: true };
  // Stripe requires at least 30 minutes; retain a minute for request transit.
  if (priceCode !== OPERATOR_PRICE_CODE || expiresAt - now < 31 * 60 * 1000) return { allowed: false };
  return { allowed: true, checkoutExpiresAt: Math.floor(expiresAt / 1000) };
}
