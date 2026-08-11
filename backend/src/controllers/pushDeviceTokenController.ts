import { Request, Response } from "express";
import { z } from "zod";
import { getUserIdBySupabaseId } from "../services/documentService";
import {
  listUserNotificationCenterItems,
  markUserNotificationsRead,
  NotificationOutboxServiceError,
  recordPushNotificationOpen,
} from "../services/notificationOutboxService";
import {
  deactivatePushDeviceInstallation,
  PushDeviceTokenServiceError,
  registerPushDeviceToken,
  updatePushDevicePermission,
} from "../services/pushDeviceTokenService";
import { sendValidationError } from "../utils/validation";

const allowedBundleId = process.env.APNS_BUNDLE_ID?.trim() || "com.illuminote.darci";

const installationParamsSchema = z.object({
  installationId: z.string().uuid(),
});

const notificationDeliveryParamsSchema = z.object({
  deliveryId: z.string().uuid(),
});

const notificationCenterQuerySchema = z.object({
  category: z.enum(["all", "documents", "account"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();

const pushEnvironmentSchema = z.enum(["sandbox", "production"]);
const permissionStatusSchema = z.enum(["authorized", "provisional", "denied", "unknown"]);
const optionalNonEmptyStringSchema = z.string().trim().min(1).max(128).optional();

const deviceRegistrationBodySchema = z.object({
  environment: pushEnvironmentSchema,
  deviceToken: z.string().trim().regex(/^[0-9a-fA-F]{64,}$/, "Invalid APNs device token"),
  permissionStatus: permissionStatusSchema.default("unknown"),
  appBundleId: z.literal(allowedBundleId).default(allowedBundleId),
  platform: z.literal("ios").default("ios"),
  provider: z.literal("apns").default("apns"),
  appVersion: optionalNonEmptyStringSchema,
  buildNumber: optionalNonEmptyStringSchema,
  deviceModel: optionalNonEmptyStringSchema,
  osVersion: optionalNonEmptyStringSchema,
}).strict();

const permissionBodySchema = z.object({
  environment: pushEnvironmentSchema,
  permissionStatus: permissionStatusSchema,
  appBundleId: z.literal(allowedBundleId).default(allowedBundleId),
  platform: z.literal("ios").default("ios"),
  provider: z.literal("apns").default("apns"),
  appVersion: optionalNonEmptyStringSchema,
  buildNumber: optionalNonEmptyStringSchema,
}).strict();

const pushOpenBodySchema = z.object({
  route: z
    .enum([
      "member_session",
      "member_request",
      "notary_request_review",
      "member_document",
      "member_notary_selection",
      "document_review",
      "document_signing",
      "user_settings",
    ])
    .optional(),
}).strict();

const sendServiceError = (res: Response, error: unknown) => {
  if (error instanceof PushDeviceTokenServiceError) {
    return res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
    });
  }

  if (error instanceof NotificationOutboxServiceError) {
    const errorCode = error.statusCode === 404 ? "not_found" : "bad_request";
    return res.status(error.statusCode).json({
      error: errorCode,
      message: error.message,
    });
  }

  throw error;
};

const resolveAuthenticatedUserId = async (req: Request) => {
  if (req.user?.dbUserId) {
    return req.user.dbUserId;
  }

  if (req.user?.id) {
    return getUserIdBySupabaseId(req.user.id);
  }

  return null;
};

export const registerPushDevice = async (req: Request, res: Response) => {
  const parsedParams = installationParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = deviceRegistrationBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const userId = await resolveAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Authenticated user is not linked to a DARCi user",
      });
    }

    const device = await registerPushDeviceToken({
      userId,
      installationId: parsedParams.data.installationId,
      environment: parsedBody.data.environment,
      appBundleId: parsedBody.data.appBundleId,
      deviceToken: parsedBody.data.deviceToken,
      permissionStatus: parsedBody.data.permissionStatus,
      appVersion: parsedBody.data.appVersion,
      buildNumber: parsedBody.data.buildNumber,
      deviceModel: parsedBody.data.deviceModel,
      osVersion: parsedBody.data.osVersion,
    });

    return res.status(200).json({ device });
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const updatePushDevicePermissionStatus = async (req: Request, res: Response) => {
  const parsedParams = installationParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = permissionBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const userId = await resolveAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Authenticated user is not linked to a DARCi user",
      });
    }

    const device = await updatePushDevicePermission({
      userId,
      installationId: parsedParams.data.installationId,
      environment: parsedBody.data.environment,
      appBundleId: parsedBody.data.appBundleId,
      permissionStatus: parsedBody.data.permissionStatus,
      appVersion: parsedBody.data.appVersion,
      buildNumber: parsedBody.data.buildNumber,
    });

    return res.status(200).json({ device });
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const deactivatePushDevice = async (req: Request, res: Response) => {
  const parsedParams = installationParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  try {
    const userId = await resolveAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Authenticated user is not linked to a DARCi user",
      });
    }

    const result = await deactivatePushDeviceInstallation({
      userId,
      installationId: parsedParams.data.installationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const listNotificationCenter = async (req: Request, res: Response) => {
  const parsedQuery = notificationCenterQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    return sendValidationError(res, parsedQuery.error);
  }

  try {
    const userId = await resolveAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Authenticated user is not linked to a DARCi user",
      });
    }

    const result = await listUserNotificationCenterItems({
      userId,
      category: parsedQuery.data.category,
      limit: parsedQuery.data.limit,
      offset: parsedQuery.data.offset,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const markNotificationCenterRead = async (req: Request, res: Response) => {
  try {
    const userId = await resolveAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Authenticated user is not linked to a DARCi user",
      });
    }

    const result = await markUserNotificationsRead({ userId });
    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const recordPushNotificationOpenEvent = async (req: Request, res: Response) => {
  const parsedParams = notificationDeliveryParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = pushOpenBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const userId = await resolveAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "Authenticated user is not linked to a DARCi user",
      });
    }

    const result = await recordPushNotificationOpen({
      deliveryId: parsedParams.data.deliveryId,
      userId,
      route: parsedBody.data.route ?? null,
    });

    return res.status(200).json({ opened: true, ...result });
  } catch (error) {
    return sendServiceError(res, error);
  }
};