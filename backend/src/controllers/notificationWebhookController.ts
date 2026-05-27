import { Request, Response } from "express";
import { Resend } from "resend";
import {
  NotificationOutboxServiceError,
  recordNotificationDeliveryEvent,
  recordNotificationDeliveryEventByProviderMessageId,
} from "../services/notificationOutboxService";

type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    to?: string[];
    from?: string;
    subject?: string;
    tags?: Record<string, string>;
    bounce?: Record<string, unknown>;
    click?: Record<string, unknown>;
    failed?: Record<string, unknown>;
    suppressed?: Record<string, unknown>;
  };
};

const resendEventTypeToOutboundEventType = {
  "email.sent": "sent",
  "email.scheduled": "queued",
  "email.delivered": "delivered",
  "email.delivery_delayed": "deferred",
  "email.complained": "complained",
  "email.bounced": "bounced",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
} as const;

const getHeader = (req: Request, name: string) => req.get(name)?.trim() ?? "";

const getWebhookHeaders = (req: Request): ResendWebhookHeaders | null => {
  const id = getHeader(req, "svix-id");
  const timestamp = getHeader(req, "svix-timestamp");
  const signature = getHeader(req, "svix-signature");

  if (!id || !timestamp || !signature) {
    return null;
  }

  return { id, timestamp, signature };
};

const getRawBody = (req: Request) => {
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString("utf8");
  }

  if (typeof req.body === "string") {
    return req.body;
  }

  return "";
};

const isMappableEmailEvent = (
  eventType: string,
): eventType is keyof typeof resendEventTypeToOutboundEventType => {
  return eventType in resendEventTypeToOutboundEventType;
};

const sendServiceError = (res: Response, error: unknown) => {
  if (error instanceof NotificationOutboxServiceError) {
    if (error.statusCode === 404) {
      return res.status(202).json({
        received: true,
        ignored: true,
        reason: error.message,
      });
    }

    const errorCode = error.statusCode === 404 ? "not_found" : "bad_request";
    return res.status(error.statusCode).json({
      error: errorCode,
      message: error.message,
    });
  }

  const message = error instanceof Error ? error.message : "Webhook processing failed";
  return res.status(500).json({
    error: "internal_error",
    message,
  });
};

export const receiveResendWebhook = async (req: Request, res: Response) => {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return res.status(500).json({
      error: "misconfigured",
      message: "RESEND_WEBHOOK_SECRET is not configured",
    });
  }

  const headers = getWebhookHeaders(req);
  if (!headers) {
    return res.status(400).json({
      error: "validation_error",
      message: "Missing Resend webhook signature headers",
    });
  }

  const rawBody = getRawBody(req);
  if (!rawBody) {
    return res.status(400).json({
      error: "validation_error",
      message: "Webhook body must be provided as raw JSON",
    });
  }

  const resend = new Resend(process.env.RESEND_API_KEY ?? "webhook_verifier");

  let event: ResendWebhookEvent;
  try {
    event = resend.webhooks.verify({
      webhookSecret,
      payload: rawBody,
      headers,
    }) as ResendWebhookEvent;
  } catch (_error) {
    return res.status(400).json({
      error: "invalid_signature",
      message: "Invalid Resend webhook signature",
    });
  }

  if (!isMappableEmailEvent(event.type)) {
    return res.status(202).json({
      received: true,
      ignored: true,
      reason: `Unhandled Resend webhook type: ${event.type}`,
    });
  }

  const outboundEventType = resendEventTypeToOutboundEventType[event.type];
  const providerMessageId = event.data?.email_id?.trim() ?? null;
  const deliveryIdFromTag = event.data?.tags?.delivery_id?.trim() ?? null;
  const eventAt = event.created_at ?? event.data?.created_at ?? new Date().toISOString();

  const payload: Record<string, unknown> = {
    resendType: event.type,
    emailId: providerMessageId,
    to: event.data?.to ?? [],
    from: event.data?.from ?? null,
    subject: event.data?.subject ?? null,
    bounce: event.data?.bounce ?? null,
    click: event.data?.click ?? null,
    failed: event.data?.failed ?? null,
    suppressed: event.data?.suppressed ?? null,
  };

  const metadata: Record<string, unknown> = {
    source: "resend_webhook",
    svixId: headers.id,
    svixTimestamp: headers.timestamp,
  };

  try {
    if (deliveryIdFromTag) {
      const result = await recordNotificationDeliveryEvent({
        deliveryId: deliveryIdFromTag,
        provider: "resend",
        providerMessageId,
        providerEventId: headers.id,
        eventType: outboundEventType,
        eventAt,
        payload,
        metadata,
      });

      return res.status(200).json({ received: true, result });
    }

    if (!providerMessageId) {
      return res.status(202).json({
        received: true,
        ignored: true,
        reason: "Webhook event did not include email_id or delivery_id tag",
      });
    }

    const result = await recordNotificationDeliveryEventByProviderMessageId({
      provider: "resend",
      providerMessageId,
      providerEventId: headers.id,
      eventType: outboundEventType,
      eventAt,
      payload,
      metadata,
    });

    if (!result) {
      return res.status(202).json({
        received: true,
        ignored: true,
        reason: `No notification delivery matched provider_message_id ${providerMessageId}`,
      });
    }

    return res.status(200).json({ received: true, result });
  } catch (error) {
    return sendServiceError(res, error);
  }
};