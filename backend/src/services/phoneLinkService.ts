import { createHmac, randomBytes, randomInt } from "node:crypto";
import { readySafetyRedis, RATE_LIMIT_SCRIPT } from "../middleware/productionSafety";
import { normalizePhoneForStorage } from "../utils/phone";
import { sendSupabaseAuthSms } from "./supabaseAuthSmsHookService";
import { logSmsHandoff, smsHookHash, smsPhoneHash } from "../telemetry/smsTelemetry";

const SMS_SECONDS = 180;
const PROOF_SECONDS = 600;
export class PhoneLinkError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
type Proof = { phone: string; email?: string; authId?: string | null; attempts?: number };
const digest = (value: string) => {
  const secret = process.env.ABUSE_RATE_KEY_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Phone verification storage is not configured");
  return createHmac("sha256", secret).update(`phone-link:${value}`).digest("hex");
};
const key = (kind: string, value: string) => `darci:phone-link:${process.env.APP_ENV ?? "local"}:${kind}:${digest(value)}`;
const invalid = () => new PhoneLinkError(401, "Verification expired or incorrect. Start again with your phone number.");

// Counters and single-use claims are atomic across API replicas. No OTP or
// bearer proof is stored in plaintext, and no account is created by this flow.
export const VERIFY_SMS_SCRIPT = `local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local value = cjson.decode(raw)
value.attempts = value.attempts + 1
if value.digest == ARGV[1] then redis.call('DEL', KEYS[1]); return 1 end
if value.attempts >= 5 then redis.call('DEL', KEYS[1])
else redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL') end
return 0`;
export const BIND_EMAIL_SCRIPT = `local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local value = cjson.decode(raw)
if value.email and value.email ~= ARGV[1] then return 0 end
if not value.email then value.email = ARGV[1]; value.authId = cjson.decode(ARGV[2]) end
redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL')
return 1`;
export const EMAIL_ATTEMPT_SCRIPT = `local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local value = cjson.decode(raw)
if value.email ~= ARGV[1] then return nil end
value.attempts = (value.attempts or 0) + 1
if value.attempts > 5 then redis.call('DEL', KEYS[1]); return nil end
redis.call('SET', KEYS[1], cjson.encode(value), 'KEEPTTL')
return cjson.encode(value)`;
export const CONSUME_PROOF_SCRIPT = `local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local value = cjson.decode(raw)
if value.email ~= ARGV[1] or value.authId ~= ARGV[2] then return 0 end
redis.call('DEL', KEYS[1]); return 1`;
const RELEASE_LOCK_SCRIPT = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

export const phoneLinkService = {
  async requestSms(rawPhone: string) {
    const phone = normalizePhoneForStorage(rawPhone);
    if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) throw new PhoneLinkError(400, "Enter a valid phone number including country code.");
    const redis = await readySafetyRedis();
    if (await redis.set(key("sms-cooldown", phone), "1", "EX", 60, "NX") !== "OK") {
      throw new PhoneLinkError(429, "Please wait a minute before requesting another SMS code.");
    }
    if (Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key("sms-hour", phone), "3600000")) > 5) {
      throw new PhoneLinkError(429, "Too many SMS requests. Please try again in an hour.");
    }
    const otp = randomInt(0, 100_000_000).toString().padStart(8, "0");
    const smsKey = key("sms", phone);
    const hookHash = smsHookHash(`phone-link:${randomBytes(32).toString("hex")}`);
    const phoneHash = smsPhoneHash(phone);
    await redis.set(smsKey, JSON.stringify({ digest: digest(`${phone}:${otp}`), attempts: 0 }), "EX", SMS_SECONDS);
    try {
      const sent = await sendSupabaseAuthSms({ phone, otp, hookHash });
      logSmsHandoff({ outcome: "accepted", hookHash, phoneHash, messageId: sent.messageId });
    } catch {
      await redis.del(smsKey);
      logSmsHandoff({ outcome: "failed", hookHash, phoneHash, failure: "phone_link_send_failed" });
      throw new PhoneLinkError(503, "Unable to send verification code. Please try again later.");
    }
  },
  async verifySms(rawPhone: string, otp: string) {
    // No fallback SMS could have been issued without shared storage.
    if (!process.env.REDIS_URL) return null;
    const phone = normalizePhoneForStorage(rawPhone);
    if (!phone) return null;
    const redis = await readySafetyRedis();
    const verified = await redis.eval(VERIFY_SMS_SCRIPT, 1, key("sms", phone), digest(`${phone}:${otp}`));
    if (Number(verified) !== 1) return null;
    const token = randomBytes(32).toString("hex");
    await redis.set(key("proof", token), JSON.stringify({ phone }), "EX", PROOF_SECONDS);
    return token;
  },
  async readProof(token: string): Promise<Proof> {
    const raw = await (await readySafetyRedis()).get(key("proof", token));
    if (!raw) throw invalid();
    return JSON.parse(raw) as Proof;
  },
  async bindEmail(token: string, email: string, authId: string | null) {
    const redis = await readySafetyRedis();
    if (Number(await redis.eval(BIND_EMAIL_SCRIPT, 1, key("proof", token), email, JSON.stringify(authId))) !== 1) throw invalid();
    if (await redis.set(key("email-cooldown", email), "1", "EX", 60, "NX") !== "OK") {
      throw new PhoneLinkError(429, "Please wait a minute before requesting another email code.");
    }
    if (Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key("email-hour", email), "3600000")) > 5) {
      throw new PhoneLinkError(429, "Too many email requests. Please try again in an hour.");
    }
  },
  async attemptEmail(token: string, email: string): Promise<Proof> {
    const raw = await (await readySafetyRedis()).eval(EMAIL_ATTEMPT_SCRIPT, 1, key("proof", token), email);
    if (typeof raw !== "string") throw invalid();
    return JSON.parse(raw) as Proof;
  },
  async consumeProof(token: string, email: string, authId: string) {
    if (Number(await (await readySafetyRedis()).eval(CONSUME_PROOF_SCRIPT, 1, key("proof", token), email, authId)) !== 1) throw invalid();
  },
  async withAccountLock<T>(authId: string, operation: () => Promise<T>): Promise<T> {
    const redis = await readySafetyRedis();
    const lockKey = key("account-lock", authId);
    const owner = randomBytes(32).toString("hex");
    if (await redis.set(lockKey, owner, "EX", 60, "NX") !== "OK") throw new PhoneLinkError(409, "Account verification is already in progress. Please try again shortly.");
    try { return await operation(); }
    finally { await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, owner); }
  },
};
