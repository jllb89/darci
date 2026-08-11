import { Router } from "express";
import {
  deactivatePushDevice,
  listNotificationCenter,
  markNotificationCenterRead,
  recordPushNotificationOpenEvent,
  registerPushDevice,
  updatePushDevicePermissionStatus,
} from "../controllers/pushDeviceTokenController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.get(
  "/",
  requireRole(["member", "notary", "admin", "service_role"]),
  listNotificationCenter,
);

router.post(
  "/mark-read",
  requireRole(["member", "notary", "admin", "service_role"]),
  markNotificationCenterRead,
);

router.put(
  "/devices/:installationId",
  requireRole(["member", "notary", "admin", "service_role"]),
  registerPushDevice,
);

router.patch(
  "/devices/:installationId/permission",
  requireRole(["member", "notary", "admin", "service_role"]),
  updatePushDevicePermissionStatus,
);

router.delete(
  "/devices/:installationId",
  requireRole(["member", "notary", "admin", "service_role"]),
  deactivatePushDevice,
);

router.post(
  "/push-deliveries/:deliveryId/open",
  requireRole(["member", "notary", "admin", "service_role"]),
  recordPushNotificationOpenEvent,
);

export default router;