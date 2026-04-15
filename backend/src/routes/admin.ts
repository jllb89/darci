import { Router } from "express";
import { updateUserRole } from "../controllers/adminController";
import {
  createTemplateBindingRuleAdmin,
  deactivateTemplateBindingRuleAdmin,
  listTemplateBindingRulesAdmin,
  updateTemplateBindingRuleAdmin,
} from "../controllers/templateBindingRulesAdminController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.patch(
  "/users/:id/role",
  requireRole(["admin", "service_role"]),
  updateUserRole
);

router.get(
  "/template-binding-rules",
  requireRole(["admin", "service_role"]),
  listTemplateBindingRulesAdmin,
);

router.post(
  "/template-binding-rules",
  requireRole(["admin", "service_role"]),
  createTemplateBindingRuleAdmin,
);

router.patch(
  "/template-binding-rules/:id",
  requireRole(["admin", "service_role"]),
  updateTemplateBindingRuleAdmin,
);

router.delete(
  "/template-binding-rules/:id",
  requireRole(["admin", "service_role"]),
  deactivateTemplateBindingRuleAdmin,
);

export default router;
