import { scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readySafetyRedis, RATE_LIMIT_SCRIPT } from "../middleware/productionSafety";

const scrypt = promisify(deriveKey);
export const APP_REVIEW_EMAIL = "apple-review@illuminotary.com";
const schema = z.object({
  enabled: z.literal(true), email: z.literal(APP_REVIEW_EMAIL),
  authId: z.uuid(), userId: z.uuid(), expiresAt: z.iso.datetime(),
  salt: z.string().regex(/^[a-f0-9]{32}$/), codeHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AppReviewConfig = z.infer<typeof schema>;

// A single server-only secret, never embedded in an app/web bundle.
export function getAppReviewConfig(): AppReviewConfig | null {
  try {
    const config = schema.parse(JSON.parse(process.env.APP_REVIEW_ACCESS_CONFIG ?? "null"));
    return Date.parse(config.expiresAt) > Date.now() ? config : null;
  } catch { return null; }
}
export class AppReviewAccessError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}
export function requireAppReviewConfig() {
  const config = getAppReviewConfig();
  if (!config) throw new AppReviewAccessError(403, "App Review access is unavailable or expired.");
  return config;
}
export async function verifyReviewCredential(config: AppReviewConfig, code: string) {
  if (!/^\d{8}$/.test(code)) return false;
  const actual = await scrypt(code, Buffer.from(config.salt, "hex"), 32) as Buffer;
  return timingSafeEqual(actual, Buffer.from(config.codeHash, "hex"));
}
export async function createAppReviewSession(code: string) {
  const config = requireAppReviewConfig();
  // Atomic across replicas/IPs, fail closed, no reset on successful guesses.
  const redis = await readySafetyRedis();
  const count = Number(await redis.eval(RATE_LIMIT_SCRIPT, 1,
    `darci:app-review:${process.env.APP_ENV ?? "local"}:${config.authId}`, "900000"));
  if (!Number.isFinite(count)) throw new AppReviewAccessError(503, "Review sign-in is temporarily unavailable.");
  if (count > 10) throw new AppReviewAccessError(429, "Too many review sign-in attempts. Try again in 15 minutes.");
  if (!await verifyReviewCredential(config, code)) throw new AppReviewAccessError(401, "Invalid or expired code");
  const url = process.env.SUPABASE_URL ?? "";
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: identity, error: identityError } = await admin.auth.admin.getUserById(config.authId);
  const marker = identity.user?.app_metadata?.app_review;
  if (identityError || identity.user?.email?.toLowerCase() !== config.email
    || marker?.expires_at !== config.expiresAt || marker?.version !== 1) {
    throw new AppReviewAccessError(403, "App Review identity is unavailable.");
  }
  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email: config.email });
  const hash = generated.data.properties?.hashed_token;
  // Never deliver email or accept a replacement/different account.
  if (generated.error || generated.data.user?.id !== config.authId || !hash) {
    throw new AppReviewAccessError(503, "Review sign-in is temporarily unavailable.");
  }
  const client = createClient(url, process.env.SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await client.auth.verifyOtp({ token_hash: hash, type: "email" });
  if (result.error || !result.data.session || result.data.user?.id !== config.authId
    || result.data.user.app_metadata?.app_review?.expires_at !== config.expiresAt) {
    throw new AppReviewAccessError(503, "Review sign-in is temporarily unavailable.");
  }
  return result;
}
// Deadline/kill switch applies to existing API sessions as well as new logins.
export function isReviewSessionAllowed(claims: Record<string, unknown>) {
  const meta = claims.app_metadata as Record<string, unknown> | undefined;
  const config = getAppReviewConfig();
  let configuredId: unknown;
  try { configuredId = JSON.parse(process.env.APP_REVIEW_ACCESS_CONFIG ?? "null")?.authId; } catch { /* invalid config */ }
  const isReview = Boolean(meta?.app_review) || (typeof configuredId === "string" && claims.sub === configuredId)
    || (typeof claims.email === "string" && claims.email.toLowerCase() === APP_REVIEW_EMAIL);
  if (!isReview) return true;
  const marker = meta?.app_review as Record<string, unknown> | undefined;
  return Boolean(config && claims.sub === config.authId && claims.email === config.email
    && marker?.version === 1 && marker?.expires_at === config.expiresAt);
}
