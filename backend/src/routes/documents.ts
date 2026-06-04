import { Router } from "express";
import {
  appendAcknowledgment,
  approveDocumentReview,
  bootstrapDocumentIntakeDraft,
  cancelDocumentGenerationRun,
  createDocumentGenerationRuns,
  createDocument,
  getDocumentGenerationRun,
  getDocumentIntakeDraft,
  getDocumentReview,
  getDocumentNextAction,
  listDocumentGenerationRuns,
  finalizeDocumentUpload,
  getDocument,
  listDocumentAvailableNotaries,
  getDocumentParties,
  getDocumentSigning,
  getDocumentSignerObligations,
  getDocumentTimeline,
  getSignatureFields,
  listSavedSignatures,
  listDocumentVersions,
  listDocuments,
  captureSignature,
  finalizeSignatureUpload,
  previewBulkSignatureReminders,
  previewDocumentSignatureReminders,
  requestSignatureUpload,
  resaveDocumentIntakeDraft,
  sendBulkSignatureReminders,
  sendDocumentSignatureReminders,
  submitDocumentIntakeDraft,
  getDocumentIntakePayload,
  signDocument,
  submitNotarization,
  updateDocumentParties,
  watermarkDocument,
  saveDocumentIntakeDraft,
} from "../controllers/documentsController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.post("/", createDocument);
router.post(
  "/intake/bootstrap",
  requireRole(["member", "admin", "service_role"]),
  bootstrapDocumentIntakeDraft,
);
router.post("/:id/upload-finalize", finalizeDocumentUpload);
router.get("/", listDocuments);
router.post(
  "/signature-reminders/preview",
  requireRole(["member", "pro", "admin", "service_role"]),
  previewBulkSignatureReminders,
);
router.post(
  "/signature-reminders",
  requireRole(["member", "pro", "admin", "service_role"]),
  sendBulkSignatureReminders,
);
router.get(
  "/:id/next-action",
  requireRole(["member", "pro", "admin", "service_role"]),
  getDocumentNextAction,
);
router.get(
  "/:id/available-notaries",
  requireRole(["member", "admin", "service_role"]),
  listDocumentAvailableNotaries,
);
router.get("/:id", getDocument);
router.post(
  "/:id/signature-reminders/preview",
  requireRole(["member", "pro", "admin", "service_role"]),
  previewDocumentSignatureReminders,
);
router.post(
  "/:id/signature-reminders",
  requireRole(["member", "pro", "admin", "service_role"]),
  sendDocumentSignatureReminders,
);
router.get(
  "/:id/review",
  requireRole(["member", "admin", "service_role"]),
  getDocumentReview,
);
router.get(
  "/:id/intake-draft",
  requireRole(["member", "admin", "service_role"]),
  getDocumentIntakeDraft,
);
router.put(
  "/:id/intake-draft",
  requireRole(["member", "admin", "service_role"]),
  saveDocumentIntakeDraft,
);
router.post(
  "/:id/intake-draft/resave",
  requireRole(["member", "admin", "service_role"]),
  resaveDocumentIntakeDraft,
);
router.post(
  "/:id/intake-submit",
  requireRole(["member", "admin", "service_role"]),
  submitDocumentIntakeDraft,
);
router.get(
  "/:id/intake-payload",
  requireRole(["member", "admin", "service_role"]),
  getDocumentIntakePayload,
);
router.post(
  "/:id/generation-runs",
  requireRole(["member", "admin", "service_role"]),
  createDocumentGenerationRuns,
);
router.get(
  "/:id/generation-runs",
  requireRole(["member", "admin", "service_role"]),
  listDocumentGenerationRuns,
);
router.get(
  "/:id/generation-runs/:runId",
  requireRole(["member", "admin", "service_role"]),
  getDocumentGenerationRun,
);
router.post(
  "/:id/generation-runs/:runId/cancel",
  requireRole(["member", "admin", "service_role"]),
  cancelDocumentGenerationRun,
);
router.get(
  "/:id/parties",
  requireRole(["member", "admin", "service_role"]),
  getDocumentParties
);
router.get(
  "/:id/signer-obligations",
  requireRole(["member", "admin", "service_role"]),
  getDocumentSignerObligations,
);
router.get(
  "/:id/signing",
  requireRole(["member", "admin", "service_role"]),
  getDocumentSigning,
);
router.put(
  "/:id/parties",
  requireRole(["member", "admin", "service_role"]),
  updateDocumentParties
);
router.get("/:id/versions", listDocumentVersions);
router.get("/:id/timeline", getDocumentTimeline);
router.get("/:id/signature-fields", getSignatureFields);
router.get(
  "/:id/signatures/saved",
  requireRole(["member", "admin", "service_role"]),
  listSavedSignatures,
);
router.post(
  "/:id/signatures",
  requireRole(["member", "admin", "service_role"]),
  captureSignature
);
router.post(
  "/:id/signatures/request",
  requireRole(["member", "admin", "service_role"]),
  requestSignatureUpload
);
router.post(
  "/:id/signatures/finalize",
  requireRole(["member", "admin", "service_role"]),
  finalizeSignatureUpload
);
router.post(
  "/:id/review-approval",
  requireRole(["member", "admin", "service_role"]),
  approveDocumentReview
);
router.post(
  "/:id/sign",
  requireRole(["member", "admin", "service_role"]),
  signDocument
);
router.post(
  "/:id/submit-notarization",
  requireRole(["member", "admin", "service_role"]),
  submitNotarization,
);
router.post(
  "/:id/append-acknowledgment",
  requireRole(["notary", "admin", "service_role"]),
  appendAcknowledgment
);
router.post(
  "/:id/watermark",
  requireRole(["notary", "admin", "service_role"]),
  watermarkDocument
);

export default router;
