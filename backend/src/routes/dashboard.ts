import { Router } from "express";
import { getMemberDashboard } from "../controllers/dashboardController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.get(
  "/member",
  requireRole(["member", "admin", "service_role"]),
  getMemberDashboard
);

export default router;
