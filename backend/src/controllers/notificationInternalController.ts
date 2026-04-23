import { Request, Response } from "express";
import { z } from "zod";
import {
  NotificationOutboxServiceError,
  recordNotificationDeliveryEvent,
  runDueNotificationJobs,
} from "../services/notificationOutboxService";
import { sendValidationError } from "../utils/validation";

const runDueNotificationJobsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

const deliveryParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const deliveryEventSchema = z.object({
  provider: z.enum(["internal", "resend", "sendgrid", "ses", "twilio", "webhook"]),
  eventType: z.enum([
    "queued",
    "sent",
    "delivered",
    "deferred",
    "failed",
    "bounced",
    "complained",
    "opened",
    "clicked",
    "accepted",
    "rejected",
    "unsubscribed",
    "rendered",
  ]),
  providerEventId: z.string().trim().min(1).optional(),
  eventAt: z.string().datetime().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

export const runDueNotificationJobsInternal = async (req: Request, res: Response) => {
  const parsed = runDueNotificationJobsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await runDueNotificationJobs({
      limit: parsed.data.limit,
      workerId: req.user?.id ?? null,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const recordNotificationDeliveryEventInternal = async (
  req: Request,
  res: Response,
) => {
  const parsedParams = deliveryParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = deliveryEventSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const result = await recordNotificationDeliveryEvent({
      deliveryId: parsedParams.data.id,
      provider: parsedBody.data.provider,
      eventType: parsedBody.data.eventType,
      providerEventId: parsedBody.data.providerEventId ?? null,
      eventAt: parsedBody.data.eventAt ?? null,
      payload: parsedBody.data.payload,
      metadata: parsedBody.data.metadata,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};