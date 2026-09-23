import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac } from "node:crypto";
import { SupabaseAuthSmsHookError } from "./supabaseAuthSmsHookService";

const db = createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {auth:{persistSession:false}});
const unavailable = () => new SupabaseAuthSmsHookError(503, "sms_handoff_uncertain", "SMS delivery could not be confirmed. Wait briefly, then request a new code.");

// Called only AFTER signature verification and schema validation. The receipt is
// claimed atomically across replicas. Never store an OTP or an unkeyed OTP digest.
export async function withAuthSmsHookReceipt(input: {
  hookId: string;
  rawBody: string;
  signingSecret: string;
  send: () => Promise<{messageId:string}>;
}) {
  // Staging keeps its existing behavior until its separate migration is approved.
  if (process.env.APP_ENV !== "production") return {...await input.send(), replayed:false};
  const hookHash = createHash("sha256").update(input.hookId).digest("hex");
  const payloadHmac = createHmac("sha256", input.signingSecret).update(input.rawBody).digest("hex");
  const claim = await db.from("auth_sms_hook_receipts").insert({hook_hash:hookHash,payload_hmac:payloadHmac,status:"processing"});
  if (claim.error) {
    if (claim.error.code !== "23505") throw unavailable();
    const existing = await db.from("auth_sms_hook_receipts").select("status,payload_hmac,provider_message_id").eq("hook_hash",hookHash).single();
    if (existing.error || existing.data.payload_hmac !== payloadHmac
      || existing.data.status !== "accepted" || !existing.data.provider_message_id) throw unavailable();
    return {messageId:existing.data.provider_message_id as string,replayed:true};
  }
  let messageId: string;
  try {messageId = (await input.send()).messageId;}
  catch (error) {
    // Even a timeout may have reached the carrier. Do not retry this signed hook.
    await db.from("auth_sms_hook_receipts").update({status:"uncertain",completed_at:new Date().toISOString()}).eq("hook_hash",hookHash);
    throw error;
  }
  const saved = await db.from("auth_sms_hook_receipts").update({status:"accepted",provider_message_id:messageId,completed_at:new Date().toISOString()}).eq("hook_hash",hookHash);
  if (saved.error) throw unavailable();
  return {messageId,replayed:false};
}
