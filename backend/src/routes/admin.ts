import { Router } from "express";
import {
  listUserRoles,
  switchUserActiveRole,
  updateUserRole,
  upsertUserRole,
} from "../controllers/adminController";
import {
  getNotificationMetricsAdmin,
  getNotificationJobDetailAdmin,
  listNotificationJobsAdmin,
} from "../controllers/notificationAdminController";
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
  "/users/:id/roles",
  requireRole(["admin", "service_role"]),
  listUserRoles,
);

router.post(
  "/users/:id/roles",
  requireRole(["admin", "service_role"]),
  upsertUserRole,
);

router.patch(
  "/users/:id/active-role",
  requireRole(["admin", "service_role"]),
  switchUserActiveRole,
);

router.get(
  "/notification-jobs",
  requireRole(["admin", "service_role"]),
  listNotificationJobsAdmin,
);

router.get(
  "/notification-jobs/metrics",
  requireRole(["admin", "service_role"]),
  getNotificationMetricsAdmin,
);

router.get(
  "/notification-jobs/:id",
  requireRole(["admin", "service_role"]),
  getNotificationJobDetailAdmin,
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
