import { Request, Response } from "express";
import { z } from "zod";
import { getUserIdBySupabaseId } from "../services/documentService";
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

const sendServiceError = (res: Response, error: unknown) => {
  if (error instanceof PushDeviceTokenServiceError) {
    return res.status(error.statusCode).json({
      error: error.code,
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