import { Router } from "express";
import { updateUserRole } from "../controllers/adminController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.patch(
  "/users/:id/role",
  requireRole(["admin", "service_role"]),
  updateUserRole
);

export default router;
