import { Router } from "express";
import {
  cancelDocumentGenerationRunInternal,
  claimNextDocumentGenerationRun,
  completeDocumentGenerationRun,
  recheckDocumentGenerationRun,
  failDocumentGenerationRun,
} from "../controllers/documentsController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.post(
  "/generation-runs/claim-next",
  requireRole(["service_role"]),
  claimNextDocumentGenerationRun,
);
router.post(
  "/generation-runs/:runId/recheck",
  requireRole(["service_role"]),
  recheckDocumentGenerationRun,
);
router.post(
  "/generation-runs/:runId/complete",
  requireRole(["service_role"]),
  completeDocumentGenerationRun,
);
router.post(
  "/generation-runs/:runId/fail",
  requireRole(["service_role"]),
  failDocumentGenerationRun,
);
router.post(
  "/generation-runs/:runId/cancel",
  requireRole(["service_role"]),
  cancelDocumentGenerationRunInternal,
);

export default router;