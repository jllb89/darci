import { Router } from "express";
import {
  appendAcknowledgment,
  createDocument,
  finalizeDocumentUpload,
  getDocument,
  getDocumentTimeline,
  getSignatureFields,
  listDocumentVersions,
  listDocuments,
  signDocument,
  submitNotarization,
  watermarkDocument,
} from "../controllers/documentsController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.post("/", createDocument);
router.post("/:id/upload-finalize", finalizeDocumentUpload);
router.get("/", listDocuments);
router.get("/:id", getDocument);
router.get("/:id/versions", listDocumentVersions);
router.get("/:id/timeline", getDocumentTimeline);
router.get("/:id/signature-fields", getSignatureFields);
router.post("/:id/sign", signDocument);
router.post("/:id/submit-notarization", submitNotarization);
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
