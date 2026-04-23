import { Router } from "express";
import { getDashboard, getMemberDashboard } from "../controllers/dashboardController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.get(
  "/",
  requireRole(["member", "pro", "notary", "admin"]),
  getDashboard
);

router.get(
  "/member",
  requireRole(["member", "admin", "service_role"]),
  getMemberDashboard
);

export default router;
