import { readMemberBillingReasonCode } from "@/lib/billingPolicy";
import type { DocumentIntakeBootstrapResponsePayload } from "./startPageTypes";

export function readIntakeBootstrapFailure(
  ok: boolean,
  payload: DocumentIntakeBootstrapResponsePayload | null,
) {
  if (ok && payload?.document?.id) return null;
  return {
    billingReasonCode: readMemberBillingReasonCode(payload),
    message: payload?.message || "Your document draft could not be prepared. Please retry loading the form.",
  };
}
