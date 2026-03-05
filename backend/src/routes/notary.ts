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

router.post("/code/resolve", resolveCode);
router.post("/code/resend", resendCode);
router.post("/code/regenerate", regenerateCode);
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
