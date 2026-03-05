import { Router } from "express";
import {
  getNotaryContext,
  regenerateCode,
  resendCode,
  resolveCode,
  signRequest,
  submitRequest,
} from "../controllers/notaryController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.post(
  "/code/resolve",
  requireRole(["notary", "admin", "service_role"]),
  resolveCode
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
