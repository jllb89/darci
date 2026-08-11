import { Request, Response } from "express";
import { z } from "zod";
import {
  getNotificationJobsMetrics,
  getNotificationJobDetail,
  listNotificationJobs,
  NotificationOutboxServiceError,
  requeueNotificationJobForAdmin,
} from "../services/notificationOutboxService";
import { sendValidationError } from "../utils/validation";

const listNotificationJobsQuerySchema = z.object({
  status: z
    .enum([
      "queued",
      "scheduled",
      "processing",
      "sent",
      "partially_sent",
      "completed",
      "failed",
      "canceled",
      "suppressed",
    ])
    .optional(),
  channel: z.enum(["email", "sms", "in_app", "push"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const notificationJobParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const notificationMetricsQuerySchema = z.object({
  windowHours: z.coerce.number().int().min(1).max(168).default(24),
});

const sendServiceError = (res: Response, error: unknown) => {
  if (error instanceof NotificationOutboxServiceError) {
    const errorCode = error.statusCode === 404 ? "not_found" : "bad_request";
    return res.status(error.statusCode).json({
      error: errorCode,
      message: error.message,
    });
  }

  throw error;
};

export const listNotificationJobsAdmin = async (req: Request, res: Response) => {
  const parsed = listNotificationJobsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await listNotificationJobs({
      status: parsed.data.status ?? null,
      channel: parsed.data.channel ?? null,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const getNotificationJobDetailAdmin = async (req: Request, res: Response) => {
  const parsed = notificationJobParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const detail = await getNotificationJobDetail(parsed.data.id);
    if (!detail) {
      return res.status(404).json({
        error: "not_found",
        message: "Notification job not found",
      });
    }

    return res.status(200).json(detail);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const getNotificationMetricsAdmin = async (req: Request, res: Response) => {
  const parsed = notificationMetricsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const metrics = await getNotificationJobsMetrics({
      windowHours: parsed.data.windowHours,
    });

    return res.status(200).json(metrics);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const retryNotificationJobAdmin = async (req: Request, res: Response) => {
  const parsed = notificationJobParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await requeueNotificationJobForAdmin(parsed.data.id);
    return res.status(202).json({ result });
  } catch (error) {
    return sendServiceError(res, error);
  }
};