import { Router } from "express";
import {
  appendAcknowledgment,
  createDocument,
  getDocument,
  signDocument,
  submitNotarization,
  watermarkDocument,
} from "../controllers/documentsController";

const router = Router();

router.post("/", createDocument);
router.get("/:id", getDocument);
router.post("/:id/sign", signDocument);
router.post("/:id/submit-notarization", submitNotarization);
router.post("/:id/append-acknowledgment", appendAcknowledgment);
router.post("/:id/watermark", watermarkDocument);

export default router;
