import { Router } from "express";
import {
  listUserRoles,
  switchUserActiveRole,
  updateUserRole,
  upsertUserRole,
} from "../controllers/adminController";
import {
  getAdminProfileDashboard,
  getAdminProfileMe,
  grantAdminProfileTeamMember,
  listAdminProfileActivity,
  listAdminProfileTeam,
  listAdminProfileUsers,
  revokeAdminProfileTeamMember,
  updateAdminProfileUserStatus,
} from "../controllers/adminProfileController";
import {
  getNotificationMetricsAdmin,
  getNotificationJobDetailAdmin,
  listNotificationJobsAdmin,
  retryNotificationJobAdmin,
} from "../controllers/notificationAdminController";
import {
  getNotificationTemplateAdmin,
  listNotificationTemplatesAdmin,
  previewNotificationTemplateAdmin,
  updateNotificationTemplateAdmin,
} from "../controllers/notificationTemplateAdminController";
import {
  createTemplateBindingRuleAdmin,
  deactivateTemplateBindingRuleAdmin,
  listTemplateBindingRulesAdmin,
  updateTemplateBindingRuleAdmin,
} from "../controllers/templateBindingRulesAdminController";
import {
  approveNotaryApplicationAdminHandler,
  listNotaryApplicationsAdminHandler,
  rejectNotaryApplicationAdminHandler,
} from "../controllers/notaryProfileController";
import { requireRole } from "../middleware/roles";
import {
  releaseBillingHeldDocumentAdmin,
  reverseMemberUsageAdmin,
} from "../controllers/billingAdminController";

const router = Router();

router.post(
  "/billing/usage-events/:usageEventId/reverse",
  requireRole(["admin", "service_role"]),
  reverseMemberUsageAdmin,
);

router.post(
  "/billing/documents/:documentId/release",
  requireRole(["admin", "service_role"]),
  releaseBillingHeldDocumentAdmin,
);

router.get(
  "/profile/me",
  requireRole(["admin", "service_role"]),
  getAdminProfileMe,
);

router.get(
  "/profile/dashboard",
  requireRole(["admin", "service_role"]),
  getAdminProfileDashboard,
);

router.get(
  "/profile/users",
  requireRole(["admin", "service_role"]),
  listAdminProfileUsers,
);

router.patch(
  "/profile/users/:id/status",
  requireRole(["admin", "service_role"]),
  updateAdminProfileUserStatus,
);

router.get(
  "/profile/team",
  requireRole(["admin", "service_role"]),
  listAdminProfileTeam,
);

router.post(
  "/profile/team",
  requireRole(["admin", "service_role"]),
  grantAdminProfileTeamMember,
);

router.delete(
  "/profile/team/:id",
  requireRole(["admin", "service_role"]),
  revokeAdminProfileTeamMember,
);

router.get(
  "/profile/activity",
  requireRole(["admin", "service_role"]),
  listAdminProfileActivity,
);

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

router.post(
  "/notification-jobs/:id/retry",
  requireRole(["admin", "service_role"]),
  retryNotificationJobAdmin,
);

router.get(
  "/notification-templates",
  requireRole(["admin", "service_role"]),
  listNotificationTemplatesAdmin,
);

router.get(
  "/notification-templates/:id",
  requireRole(["admin", "service_role"]),
  getNotificationTemplateAdmin,
);

router.patch(
  "/notification-templates/:id",
  requireRole(["admin", "service_role"]),
  updateNotificationTemplateAdmin,
);

router.post(
  "/notification-templates/:id/preview",
  requireRole(["admin", "service_role"]),
  previewNotificationTemplateAdmin,
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

router.get(
  "/notary-applications",
  requireRole(["admin", "service_role"]),
  listNotaryApplicationsAdminHandler,
);

router.post(
  "/notary-applications/:id/approve",
  requireRole(["admin", "service_role"]),
  approveNotaryApplicationAdminHandler,
);

router.post(
  "/notary-applications/:id/reject",
  requireRole(["admin", "service_role"]),
  rejectNotaryApplicationAdminHandler,
);

export default router;
