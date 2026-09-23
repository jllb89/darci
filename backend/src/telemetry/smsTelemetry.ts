import { createHash } from "node:crypto";
import { normalizePhoneForComparison } from "../utils/phone";

export const smsPhoneHash = (phone: string) => createHash("sha256")
  .update(normalizePhoneForComparison(phone) ?? "").digest("hex").slice(0, 16);
export const smsHookHash = (hookId: string) => createHash("sha256").update(hookId).digest("hex").slice(0, 32);

export function logSmsHandoff(input: {
  outcome: "accepted" | "failed";
  hookHash: string;
  phoneHash: string;
  messageId?: string;
  failure?: string;
  providerFailure?: string;
}) {
  // A handoff is not a delivery receipt. Never include OTPs, full destinations,
  // user IDs, raw provider errors, webhook signatures or message bodies.
  const event = {
    kind: "auth_sms_handoff", environment: process.env.APP_ENV ?? "local",
    outcome: input.outcome, hookHash: input.hookHash, phoneHash: input.phoneHash,
    ...(input.messageId ? { messageId: input.messageId } : {}),
    ...(input.failure ? { failure: input.failure } : {}),
    ...(input.providerFailure ? { providerFailure: input.providerFailure } : {}),
    at: new Date().toISOString(),
  };
  console.info(JSON.stringify(event));
}
