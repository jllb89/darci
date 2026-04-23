import { Router } from "express";
import {
  cancelDocumentGenerationRunInternal,
  claimNextDocumentGenerationRun,
  completeDocumentGenerationRun,
  recheckDocumentGenerationRun,
  failDocumentGenerationRun,
} from "../controllers/documentsController";
import {
  enforceMeetingArtifactRetentionInternal,
} from "../controllers/meetingInternalController";
import {
  recordNotificationDeliveryEventInternal,
  runDueNotificationJobsInternal,
} from "../controllers/notificationInternalController";
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
router.post(
  "/notification-jobs/run-due",
  requireRole(["service_role"]),
  runDueNotificationJobsInternal,
);
router.post(
  "/notification-deliveries/:id/events",
  requireRole(["service_role"]),
  recordNotificationDeliveryEventInternal,
);
router.post(
  "/meeting-artifacts/enforce-retention",
  requireRole(["service_role"]),
  enforceMeetingArtifactRetentionInternal,
);

export default router;