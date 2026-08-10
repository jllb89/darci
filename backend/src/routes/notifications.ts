import { Router } from "express";
import {
  deactivatePushDevice,
  recordPushNotificationOpenEvent,
  registerPushDevice,
  updatePushDevicePermissionStatus,
} from "../controllers/pushDeviceTokenController";
import { requireRole } from "../middleware/roles";

const router = Router();

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