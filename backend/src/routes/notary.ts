import { Router } from "express";
import {
  advanceNotarySession,
  cancelMeeting,
  confirmMeeting,
  createMeetingArtifactRecord,
  listIdentityDocumentSchema,
  proposeMeeting,
  recordIdentityVerification,
  recordVenueCapture,
  regenerateCode,
  recordMeetingCheckin,
  recordMeetingNoShow,
  recordProximityEvaluation,
  rescheduleMeeting,
  resendCode,
  reviewRequestDecision,
  resolveCode,
  signRequest,
  startInPersonSession,
  submitRequest,
} from "../controllers/notaryController";
import {
  getNotaryContext,
  listNotaryRequests,
  resolveIdn,
} from "../controllers/notaryWorkspaceController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.get(
  "/requests",
  requireRole(["notary", "admin", "service_role"]),
  listNotaryRequests
);

router.get(
  "/identity-document-types",
  requireRole(["notary", "admin", "service_role"]),
  listIdentityDocumentSchema,
);

router.post(
  "/code/resolve",
  requireRole(["notary", "admin", "service_role"]),
  resolveCode
);
router.post(
  "/idn/resolve",
  requireRole(["notary", "admin", "service_role"]),
  resolveIdn
);
router.post(
  "/code/resend",
  requireRole(["notary", "admin", "service_role"]),
  resendCode
);
router.post(
  "/code/regenerate",
  requireRole(["notary", "admin", "service_role"]),
  regenerateCode
);
router.get(
  "/requests/:id/context",
  requireRole(["notary", "admin", "service_role"]),
  getNotaryContext
);
router.post(
  "/requests/:id/review-decision",
  requireRole(["notary", "admin", "service_role"]),
  reviewRequestDecision
);
router.post(
  "/requests/:id/meeting/propose",
  requireRole(["member", "notary", "admin", "service_role"]),
  proposeMeeting
);
router.post(
  "/requests/:id/meeting/check-in",
  requireRole(["member", "notary", "admin", "service_role"]),
  recordMeetingCheckin
);
router.post(
  "/requests/:id/meeting/start",
  requireRole(["notary", "admin", "service_role"]),
  startInPersonSession
);
router.post(
  "/requests/:id/meeting/confirm",
  requireRole(["member", "notary", "admin", "service_role"]),
  confirmMeeting
);
router.post(
  "/requests/:id/meeting/reschedule",
  requireRole(["notary", "admin", "service_role"]),
  rescheduleMeeting
);
router.post(
  "/requests/:id/meeting/cancel",
  requireRole(["member", "notary", "admin", "service_role"]),
  cancelMeeting
);
router.post(
  "/requests/:id/meeting/no-show",
  requireRole(["notary", "admin", "service_role"]),
  recordMeetingNoShow
);
router.post(
  "/requests/:id/meeting/identity-verification",
  requireRole(["notary", "admin", "service_role"]),
  recordIdentityVerification
);
router.post(
  "/requests/:id/meeting/venue-capture",
  requireRole(["notary", "admin", "service_role"]),
  recordVenueCapture
);
router.post(
  "/requests/:id/meeting/proximity-evaluation",
  requireRole(["notary", "admin", "service_role"]),
  recordProximityEvaluation
);
router.post(
  "/requests/:id/meeting/artifacts",
  requireRole(["member", "notary", "admin", "service_role"]),
  createMeetingArtifactRecord
);
router.post(
  "/requests/:id/session/advance",
  requireRole(["notary", "admin", "service_role"]),
  advanceNotarySession
);
router.post(
  "/requests/:id/sign",
  requireRole(["notary", "admin", "service_role"]),
  signRequest
);
router.post(
  "/requests/:id/submit",
  requireRole(["notary", "admin", "service_role"]),
  submitRequest
);

export default router;
