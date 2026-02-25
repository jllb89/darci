import { Router } from "express";
import {
  appendAcknowledgment,
  createDocument,
  getDocument,
  getDocumentTimeline,
  getSignatureFields,
  listDocumentVersions,
  listDocuments,
  signDocument,
  submitNotarization,
  watermarkDocument,
} from "../controllers/documentsController";

const router = Router();

router.post("/", createDocument);
router.get("/", listDocuments);
router.get("/:id", getDocument);
router.get("/:id/versions", listDocumentVersions);
router.get("/:id/timeline", getDocumentTimeline);
router.get("/:id/signature-fields", getSignatureFields);
router.post("/:id/sign", signDocument);
router.post("/:id/submit-notarization", submitNotarization);
router.post("/:id/append-acknowledgment", appendAcknowledgment);
router.post("/:id/watermark", watermarkDocument);

export default router;
