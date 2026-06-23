import { Router } from "express";
import {
  claimPublicInvite,
  createInvite,
  getPublicInvite,
  listInvites,
  openInvite,
  resendInvite,
  revokeInvite,
} from "../controllers/inviteController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.get("/public/:token", getPublicInvite);
router.post("/public/:token/claim", claimPublicInvite);

router.get("/", requireRole(["member", "admin", "service_role"]), listInvites);
router.post("/", requireRole(["member", "admin", "service_role"]), createInvite);
router.post(
  "/:id/open",
  requireRole(["member", "notary", "admin", "service_role"]),
  openInvite,
);
router.post(
  "/:id/resend",
  requireRole(["member", "admin", "service_role"]),
  resendInvite,
);
router.post(
  "/:id/revoke",
  requireRole(["member", "admin", "service_role"]),
  revokeInvite,
);

export default router;