import { applyFinalPackageBillingPolicy, getDocumentReleaseControl } from "./billingPolicyService";

// Call only after the assigned actor, complete package and stored bytes have
// been revalidated. Atomic completion already wrote the pending control row.
export async function resumePendingFinalPackageRelease(input: {
  ownerUserId: string;
  documentId: string;
  documentVersionId: string;
  documentHashRecordId: string;
  actorUserId?: string | null;
}) {
  const control = await getDocumentReleaseControl(input.documentId);
  if (!control) throw new Error("Completed package has no release evidence; operator review required");
  // Never reevaluate an existing terminal decision on a completed retry.
  if (control.release_status !== "pending") return control;
  if (control.document_version_id !== input.documentVersionId || control.document_hash_record_id !== input.documentHashRecordId) {
    throw new Error("Pending release does not match the verified final package");
  }
  return applyFinalPackageBillingPolicy(input);
}
