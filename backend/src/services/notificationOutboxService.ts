import { randomUUID } from "crypto";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { ApnsClientError, sendApnsNotification } from "./apnsClient";
import { renderNotificationTemplate } from "./notificationTemplateRenderService";
import { invalidatePushDeviceTokenById } from "./pushDeviceTokenService";
import { captureException } from "../utils/sentry";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type NotificationChannel = "email" | "sms" | "in_app" | "push";
export type NotificationProviderName =
  | "internal"
  | "resend"
  | "sendgrid"
  | "ses"
  | "sns"
  | "twilio"
  | "webhook"
  | "apns";
export type NotificationJobStatus =
  | "queued"
  | "scheduled"
  | "processing"
  | "sent"
  | "partially_sent"
  | "completed"
  | "failed"
  | "canceled"
  | "suppressed";
export type NotificationDeliveryStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "accepted"
  | "suppressed";
export type OutboundMessageEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "deferred"
  | "failed"
  | "bounced"
  | "complained"
  | "opened"
  | "clicked"
  | "accepted"
  | "suppressed"
  | "rejected"
  | "unsubscribed"
  | "rendered";

type JsonObject = Record<string, unknown>;

type NotificationTemplateRecord = {
  id: string;
  template_key: string;
  channel: NotificationChannel;
  trigger_event: string | null;
  subject_template: string | null;
  body_template: string | null;
  body_format: string | null;
  audience_scope: string | null;
};

type NotificationJobRecord = {
  id: string;
  template_id: string | null;
  invite_id: string | null;
  document_id: string | null;
  billing_payment_request_id: string | null;
  notarization_request_id: string | null;
  requested_by_user_id: string | null;
  job_kind: string;
  channel: NotificationChannel;
  status: NotificationJobStatus;
  priority: string;
  dedupe_key: string | null;
  scheduled_for: string;
  processing_started_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  last_attempt_at: string | null;
  attempt_count: number;
  payload_json: JsonObject;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
};

type NotificationDeliveryRecord = {
  id: string;
  notification_job_id: string;
  invite_recipient_id: string | null;
  target_user_id: string | null;
  device_push_token_id: string | null;
  channel: NotificationChannel;
  recipient_address: string | null;
  recipient_display_name: string | null;
  provider: NotificationProviderName;
  provider_message_id: string | null;
  status: NotificationDeliveryStatus;
  attempt_number: number;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  bounced_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  accepted_at: string | null;
  error_code: string | null;
  error_message: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
};

type DocumentInviteLifecycleStatus =
  | "draft"
  | "queued"
  | "sent"
  | "opened"
  | "claimed"
  | "accepted"
  | "declined"
  | "revoked"
  | "expired"
  | "completed"
  | "failed";

type DocumentInviteLifecycleRow = {
  id: string;
  status: DocumentInviteLifecycleStatus;
  sent_at: string | null;
  first_opened_at: string | null;
  first_clicked_at: string | null;
  metadata: JsonObject;
};

type InviteRecipientLifecycleStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced"
  | "opened"
  | "clicked"
  | "claimed"
  | "suppressed"
  | "unsubscribed";

type InviteRecipientLifecycleRow = {
  id: string;
  invite_id: string;
  status: InviteRecipientLifecycleStatus;
  metadata: JsonObject;
};

type OutboundMessageEventRecord = {
  id: string;
  notification_delivery_id: string;
  event_type: OutboundMessageEventType;
  provider: NotificationProviderName;
  provider_event_id: string | null;
  event_at: string;
  payload: JsonObject;
  metadata: JsonObject;
  created_at: string;
};

type DevicePushTokenRecord = {
  id: string;
  user_id: string;
  platform: "ios";
  provider: "apns";
  environment: "sandbox" | "production";
  app_bundle_id: string;
  device_token: string | null;
  permission_status: "authorized" | "provisional" | "denied" | "unknown";
  is_active: boolean;
  invalidated_at: string | null;
};

type NotificationProviderDispatchEvent = {
  eventType: OutboundMessageEventType;
  eventAt: string;
  payload?: JsonObject;
  metadata?: JsonObject;
};

type NotificationProviderDispatchResult = {
  provider: NotificationProviderName;
  providerMessageId: string | null;
  deliveryStatus: NotificationDeliveryStatus;
  events: NotificationProviderDispatchEvent[];
  metadata?: JsonObject;
};

type NotificationProviderDispatchInput = {
  job: NotificationJobRecord;
  delivery: NotificationDeliveryRecord;
  template: NotificationTemplateRecord | null;
  workerId?: string | null | undefined;
  now: string;
};

type NotificationProviderAdapter = {
  provider: NotificationProviderName;
  send: (
    input: NotificationProviderDispatchInput,
  ) => Promise<NotificationProviderDispatchResult>;
};

export type NotificationJobProcessSummary = {
  jobId: string;
  status: NotificationJobStatus;
  attemptedDeliveryCount: number;
  deliveredCount: number;
  failedCount: number;
  scheduledFor: string | null;
  completedAt: string | null;
};

export type RunDueNotificationJobsResult = {
  scannedCount: number;
  claimedCount: number;
  processedCount: number;
  jobs: NotificationJobProcessSummary[];
};

export type NotificationJobListItem = {
  id: string;
  templateId: string | null;
  templateKey: string | null;
  jobKind: string;
  channel: NotificationChannel;
  status: NotificationJobStatus;
  priority: string;
  scheduledFor: string;
  processingStartedAt: string | null;
  completedAt: string | null;
  lastAttemptAt: string | null;
  attemptCount: number;
  dedupeKey: string | null;
  documentId: string | null;
  notarizationRequestId: string | null;
  inviteId: string | null;
  requestedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  deliveryCounts: {
    total: number;
    queued: number;
    sent: number;
    delivered: number;
    failed: number;
    suppressed: number;
  };
};

export type NotificationJobDetail = {
  job: NotificationJobListItem & {
    billingPaymentRequestId: string | null;
    canceledAt: string | null;
    payload: JsonObject;
    metadata: JsonObject;
  };
  deliveries: Array<{
    id: string;
    targetUserId: string | null;
    devicePushTokenId: string | null;
    channel: NotificationChannel;
    recipientAddress: string | null;
    recipientDisplayName: string | null;
    provider: NotificationProviderName;
    providerMessageId: string | null;
    status: NotificationDeliveryStatus;
    attemptNumber: number;
    queuedAt: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    failedAt: string | null;
    bouncedAt: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    acceptedAt: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    metadata: JsonObject;
    createdAt: string;
    updatedAt: string;
  }>;
  events: Array<{
    id: string;
    deliveryId: string;
    eventType: OutboundMessageEventType;
    provider: NotificationProviderName;
    providerEventId: string | null;
    eventAt: string;
    payload: JsonObject;
    metadata: JsonObject;
    createdAt: string;
  }>;
};

export type NotificationJobsListResponse = {
  jobs: NotificationJobListItem[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
};

export type NotificationJobsMetrics = {
  windowHours: number;
  generatedAt: string;
  jobs: {
    total: number;
    byStatus: Record<NotificationJobStatus, number>;
    byChannel: Record<NotificationChannel, number>;
    inviteJobs: number;
    inviteJobsByStatus: Record<NotificationJobStatus, number>;
  };
  deliveries: {
    total: number;
    byStatus: Record<NotificationDeliveryStatus, number>;
    inviteDeliveries: number;
    inviteDeliveriesByStatus: Record<NotificationDeliveryStatus, number>;
  };
};

export class NotificationOutboxServiceError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "NotificationOutboxServiceError";
  }
}

class NotificationProviderDispatchError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotificationProviderDispatchError";
  }
}

const notificationJobSelect = [
  "id",
  "template_id",
  "invite_id",
  "document_id",
  "billing_payment_request_id",
  "notarization_request_id",
  "requested_by_user_id",
  "job_kind",
  "channel",
  "status",
  "priority",
  "dedupe_key",
  "scheduled_for",
  "processing_started_at",
  "completed_at",
  "canceled_at",
  "last_attempt_at",
  "attempt_count",
  "payload_json",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const notificationDeliverySelect = [
  "id",
  "notification_job_id",
  "invite_recipient_id",
  "target_user_id",
  "device_push_token_id",
  "channel",
  "recipient_address",
  "recipient_display_name",
  "provider",
  "provider_message_id",
  "status",
  "attempt_number",
  "queued_at",
  "sent_at",
  "delivered_at",
  "failed_at",
  "bounced_at",
  "opened_at",
  "clicked_at",
  "accepted_at",
  "error_code",
  "error_message",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const devicePushTokenSelect = [
  "id",
  "user_id",
  "platform",
  "provider",
  "environment",
  "app_bundle_id",
  "device_token",
  "permission_status",
  "is_active",
  "invalidated_at",
].join(", ");

const outboundEventSelect = [
  "id",
  "notification_delivery_id",
  "event_type",
  "provider",
  "provider_event_id",
  "event_at",
  "payload",
  "metadata",
  "created_at",
].join(", ");

const eventTypeToDeliveryStatus: Partial<
  Record<OutboundMessageEventType, NotificationDeliveryStatus>
> = {
  queued: "queued",
  sent: "sent",
  delivered: "delivered",
  deferred: "queued",
  failed: "failed",
  bounced: "bounced",
  complained: "complained",
  opened: "opened",
  clicked: "clicked",
  accepted: "accepted",
  suppressed: "suppressed",
  rejected: "failed",
  unsubscribed: "suppressed",
};

const inviteSentCandidateStatuses = new Set<DocumentInviteLifecycleStatus>([
  "draft",
  "queued",
  "sent",
]);

const inviteOpenedCandidateStatuses = new Set<DocumentInviteLifecycleStatus>([
  "draft",
  "queued",
  "sent",
  "opened",
]);

const inviteFailureCandidateStatuses = new Set<DocumentInviteLifecycleStatus>([
  "draft",
  "queued",
  "sent",
]);

const eventTypesWithDeliveryIssueMetadata = new Set<OutboundMessageEventType>([
  "deferred",
  "failed",
  "bounced",
  "complained",
  "rejected",
  "suppressed",
  "unsubscribed",
]);

const inviteFailureEventTypes = new Set<OutboundMessageEventType>([
  "failed",
  "bounced",
  "complained",
  "rejected",
  "suppressed",
  "unsubscribed",
]);

const terminalSuccessStatuses = new Set<NotificationDeliveryStatus>([
  "delivered",
  "opened",
  "clicked",
  "accepted",
]);

const sentLikeStatuses = new Set<NotificationDeliveryStatus>([
  "sent",
  ...terminalSuccessStatuses,
]);

const failureStatuses = new Set<NotificationDeliveryStatus>([
  "failed",
  "bounced",
  "complained",
  "suppressed",
]);

const queueableDeliveryStatuses = new Set<NotificationDeliveryStatus>([
  "pending",
  "queued",
  "failed",
]);

const queueableJobStatuses = new Set<NotificationJobStatus>(["queued", "scheduled"]);

const objectOrEmpty = (value: unknown): JsonObject => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
};

const castValue = <T>(value: unknown) => {
  return value as T;
};

const assertSupabaseConfigured = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new NotificationOutboxServiceError(
      500,
      "Supabase service role is not configured",
    );
  }
};

const getConfiguredMaxAttempts = () => {
  const parsed = Number.parseInt(process.env.NOTIFICATION_OUTBOX_MAX_ATTEMPTS ?? "3", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
};

export const getNotificationRetryDelaySeconds = (attemptCount: number) => {
  const baseSeconds = Number.parseInt(
    process.env.NOTIFICATION_OUTBOX_RETRY_BASE_SECONDS ?? "300",
    10,
  );
  const boundedBase = Number.isFinite(baseSeconds) && baseSeconds > 0 ? baseSeconds : 300;
  const exponent = Math.max(attemptCount - 1, 0);
  return Math.min(boundedBase * 2 ** exponent, 24 * 60 * 60);
};

const addSecondsToIso = (isoTimestamp: string, seconds: number) => {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
};

const summarizeDeliveryCounts = (deliveries: NotificationDeliveryRecord[]) => {
  return deliveries.reduce(
    (counts, delivery) => {
      counts.total += 1;

      if (delivery.status === "pending" || delivery.status === "queued") {
        counts.queued += 1;
      }
      if (delivery.status === "sent") {
        counts.sent += 1;
      }
      if (terminalSuccessStatuses.has(delivery.status)) {
        counts.delivered += 1;
      }
      if (failureStatuses.has(delivery.status) && delivery.status !== "suppressed") {
        counts.failed += 1;
      }
      if (delivery.status === "suppressed") {
        counts.suppressed += 1;
      }

      return counts;
    },
    {
      total: 0,
      queued: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      suppressed: 0,
    },
  );
};

export const deriveNotificationJobStatus = (input: {
  deliveries: Array<Pick<NotificationDeliveryRecord, "status">>;
  attemptCount: number;
  maxAttempts?: number | undefined;
}) => {
  const maxAttempts = input.maxAttempts ?? getConfiguredMaxAttempts();
  const total = input.deliveries.length;
  const queuedCount = input.deliveries.filter((delivery) =>
    delivery.status === "pending" || delivery.status === "queued",
  ).length;
  const sentCount = input.deliveries.filter((delivery) =>
    sentLikeStatuses.has(delivery.status),
  ).length;
  const terminalSuccessCount = input.deliveries.filter((delivery) =>
    terminalSuccessStatuses.has(delivery.status),
  ).length;
  const failedCount = input.deliveries.filter((delivery) =>
    failureStatuses.has(delivery.status),
  ).length;

  if (total === 0) {
    return {
      status: "failed" as NotificationJobStatus,
      shouldRetry: false,
      isTerminal: true,
    };
  }

  if (queuedCount > 0) {
    return {
      status: "queued" as NotificationJobStatus,
      shouldRetry: false,
      isTerminal: false,
    };
  }

  if (failedCount === 0) {
    if (terminalSuccessCount === total) {
      return {
        status: "completed" as NotificationJobStatus,
        shouldRetry: false,
        isTerminal: true,
      };
    }

    if (sentCount === total) {
      return {
        status: "sent" as NotificationJobStatus,
        shouldRetry: false,
        isTerminal: false,
      };
    }
  }

  if (failedCount > 0 && input.attemptCount < maxAttempts) {
    return {
      status: "scheduled" as NotificationJobStatus,
      shouldRetry: true,
      isTerminal: false,
    };
  }

  if (sentCount > 0) {
    return {
      status: "partially_sent" as NotificationJobStatus,
      shouldRetry: false,
      isTerminal: true,
    };
  }

  return {
    status: "failed" as NotificationJobStatus,
    shouldRetry: false,
    isTerminal: true,
  };
};

export const mapOutboundEventToDeliveryPatch = (input: {
  delivery: Pick<
    NotificationDeliveryRecord,
    | "status"
    | "sent_at"
    | "delivered_at"
    | "failed_at"
    | "bounced_at"
    | "opened_at"
    | "clicked_at"
    | "accepted_at"
  >;
  eventType: OutboundMessageEventType;
  eventAt: string;
}) => {
  const nextStatus = eventTypeToDeliveryStatus[input.eventType] ?? input.delivery.status;
  const patch: Partial<NotificationDeliveryRecord> = {
    status: nextStatus,
  };

  if (input.eventType === "sent") {
    patch.sent_at = input.eventAt;
  }
  if (input.eventType === "delivered") {
    patch.delivered_at = input.eventAt;
    patch.sent_at = input.delivery.sent_at ?? input.eventAt;
  }
  if (input.eventType === "failed" || input.eventType === "rejected") {
    patch.failed_at = input.eventAt;
  }
  if (input.eventType === "bounced") {
    patch.bounced_at = input.eventAt;
  }
  if (input.eventType === "opened") {
    patch.opened_at = input.eventAt;
    patch.delivered_at = input.delivery.delivered_at ?? input.eventAt;
  }
  if (input.eventType === "clicked") {
    patch.clicked_at = input.eventAt;
    patch.delivered_at = input.delivery.delivered_at ?? input.eventAt;
  }
  if (input.eventType === "accepted") {
    patch.accepted_at = input.eventAt;
  }

  return patch;
};

const createOutboundEventInsert = (input: {
  deliveryId: string;
  provider: NotificationProviderName;
  providerEventId?: string | null | undefined;
  eventType: OutboundMessageEventType;
  eventAt: string;
  payload?: JsonObject | undefined;
  metadata?: JsonObject | undefined;
}) => {
  return {
    notification_delivery_id: input.deliveryId,
    provider: input.provider,
    provider_event_id: input.providerEventId ?? null,
    event_type: input.eventType,
    event_at: input.eventAt,
    payload: input.payload ?? {},
    metadata: input.metadata ?? {},
  };
};

const internalProviderAdapter: NotificationProviderAdapter = {
  provider: "internal",
  async send(input) {
    const jobMetadata = objectOrEmpty(input.job.metadata);
    const deliveryMetadata = objectOrEmpty(input.delivery.metadata);
    const simulateFailure =
      deliveryMetadata.simulateFailure === true ||
      jobMetadata.simulateFailure === true ||
      input.delivery.recipient_address?.trim().endsWith("@fail.test") === true;

    if (simulateFailure) {
      throw new NotificationProviderDispatchError(
        "internal_simulated_failure",
        "Internal notification adapter simulated a failure",
      );
    }

    const providerMessageId = `internal_${randomUUID()}`;
    return {
      provider: "internal",
      providerMessageId,
      deliveryStatus: "delivered",
      metadata: {
        dispatchedBy: "internal_notification_adapter",
        workerId: input.workerId ?? null,
        templateKey: input.template?.template_key ?? null,
      },
      events: [
        {
          eventType: "rendered",
          eventAt: input.now,
          payload: {
            channel: input.delivery.channel,
          },
        },
        {
          eventType: "sent",
          eventAt: input.now,
          payload: {
            recipientAddress: input.delivery.recipient_address,
            recipientDisplayName: input.delivery.recipient_display_name,
          },
        },
        {
          eventType: "delivered",
          eventAt: input.now,
          payload: {
            recipientAddress: input.delivery.recipient_address,
          },
        },
      ],
    };
  },
};

const buildResendAdapter = (): NotificationProviderAdapter => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new NotificationProviderDispatchError(
      "provider_misconfigured",
      "RESEND_API_KEY is not set",
    );
  }

  const resend = new Resend(apiKey);

  return {
    provider: "resend",
    async send(input) {
      const recipientEmail = input.delivery.recipient_address?.trim();
      if (!recipientEmail) {
        throw new NotificationProviderDispatchError(
          "missing_recipient_address",
          "Delivery has no recipient_address for Resend send",
        );
      }

      if (!input.template) {
        throw new NotificationProviderDispatchError(
          "missing_template",
          "Resend adapter requires a resolved notification template",
        );
      }

      const { template } = input;

      if (!template.subject_template || !template.body_template) {
        throw new NotificationProviderDispatchError(
          "template_missing_content",
          `Template ${template.template_key} is missing subject_template or body_template`,
        );
      }

      const payload = input.job.payload_json as Record<string, unknown>;

      const rendered = renderNotificationTemplate({
        template: {
          templateKey: template.template_key,
          audienceScope: template.audience_scope,
          subjectTemplate: template.subject_template,
          bodyTemplate: template.body_template,
          bodyFormat:
            template.body_format === "text" ||
            template.body_format === "markdown" ||
            template.body_format === "html"
              ? template.body_format
              : null,
        },
        payload,
        recipientEmail,
        recipientDisplayName: input.delivery.recipient_display_name,
      });

      const { data, error } = await resend.emails.send({
        from: rendered.from,
        to: rendered.to ?? recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: rendered.replyTo,
        tags: [
          { name: "template_key", value: template.template_key },
          { name: "job_id", value: input.job.id },
          { name: "delivery_id", value: input.delivery.id },
        ],
      });

      if (error || !data) {
        const resendErrorMessage = error?.message ?? "Resend returned no data";
        throw new NotificationProviderDispatchError(
          "resend_api_error",
          `Resend send failed from ${rendered.from}: ${resendErrorMessage}`,
        );
      }

      return {
        provider: "resend",
        providerMessageId: data.id,
        deliveryStatus: "sent",
        metadata: {
          resendMessageId: data.id,
          templateKey: template.template_key,
          workerId: input.workerId ?? null,
        },
        events: [
          {
            eventType: "sent",
            eventAt: input.now,
            payload: {
              recipientAddress: recipientEmail,
              recipientDisplayName: input.delivery.recipient_display_name ?? null,
              resendMessageId: data.id,
            },
          },
        ],
      };
    },
  };
};

const interpolateTemplateText = (template: string, payload: JsonObject): string =>
  template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = payload[key];
    return value != null ? String(value) : "";
  });

const resolveSnsRegion = () => {
  const region =
    process.env.SNS_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim();

  if (!region) {
    throw new NotificationProviderDispatchError(
      "provider_misconfigured",
      "SNS_REGION or AWS_REGION is required for SNS SMS delivery",
    );
  }

  return region;
};

const buildSnsAdapter = (): NotificationProviderAdapter => {
  const snsClient = new SNSClient({ region: resolveSnsRegion() });

  return {
    provider: "sns",
    async send(input) {
      const recipientPhone = input.delivery.recipient_address?.trim();
      if (!recipientPhone) {
        throw new NotificationProviderDispatchError(
          "missing_recipient_address",
          "Delivery has no recipient_address for SNS SMS send",
        );
      }

      if (input.delivery.channel !== "sms") {
        throw new NotificationProviderDispatchError(
          "invalid_delivery_channel",
          "SNS adapter only supports sms notification deliveries",
        );
      }

      if (!input.template?.body_template) {
        throw new NotificationProviderDispatchError(
          "missing_template",
          "SNS adapter requires a resolved SMS notification template with body_template",
        );
      }

      const payload = input.job.payload_json as Record<string, unknown>;
      const message = interpolateTemplateText(input.template.body_template, payload).trim();
      if (!message) {
        throw new NotificationProviderDispatchError(
          "template_missing_content",
          `Template ${input.template.template_key} rendered an empty SMS message`,
        );
      }

      const messageAttributes: Record<
        string,
        { DataType: "String"; StringValue: string }
      > = {
        "AWS.SNS.SMS.SMSType": {
          DataType: "String",
          StringValue: process.env.SNS_SMS_TYPE?.trim() || "Transactional",
        },
      };

      const senderId = process.env.SNS_SMS_SENDER_ID?.trim();
      if (senderId) {
        messageAttributes["AWS.SNS.SMS.SenderID"] = {
          DataType: "String",
          StringValue: senderId,
        };
      }

      const response = await snsClient.send(
        new PublishCommand({
          PhoneNumber: recipientPhone,
          Message: message,
          MessageAttributes: messageAttributes,
        }),
      );

      if (!response.MessageId) {
        throw new NotificationProviderDispatchError(
          "sns_api_error",
          "SNS publish returned no MessageId",
        );
      }

      return {
        provider: "sns",
        providerMessageId: response.MessageId,
        deliveryStatus: "sent",
        metadata: {
          snsMessageId: response.MessageId,
          templateKey: input.template.template_key,
          workerId: input.workerId ?? null,
        },
        events: [
          {
            eventType: "sent",
            eventAt: input.now,
            payload: {
              recipientAddress: recipientPhone,
              recipientDisplayName: input.delivery.recipient_display_name ?? null,
              snsMessageId: response.MessageId,
            },
          },
        ],
      };
    },
  };
};

const getApnsCollapseId = (input: NotificationProviderDispatchInput) => {
  const deliveryMetadata = objectOrEmpty(input.delivery.metadata);
  const jobMetadata = objectOrEmpty(input.job.metadata);
  const rawCollapseId =
    typeof deliveryMetadata.apnsCollapseId === "string"
      ? deliveryMetadata.apnsCollapseId
      : typeof jobMetadata.apnsCollapseId === "string"
        ? jobMetadata.apnsCollapseId
        : input.job.dedupe_key;
  const collapseId = rawCollapseId?.trim() ?? "";
  return collapseId.length > 0 ? collapseId : null;
};

const getApnsExpiration = (input: NotificationProviderDispatchInput) => {
  const deliveryMetadata = objectOrEmpty(input.delivery.metadata);
  const jobMetadata = objectOrEmpty(input.job.metadata);
  const rawExpirationSeconds =
    typeof deliveryMetadata.apnsExpirationSeconds === "number"
      ? deliveryMetadata.apnsExpirationSeconds
      : typeof jobMetadata.apnsExpirationSeconds === "number"
        ? jobMetadata.apnsExpirationSeconds
        : 60 * 60;
  return Math.floor(new Date(input.now).getTime() / 1000) + rawExpirationSeconds;
};

const buildApnsAlertPayload = (input: NotificationProviderDispatchInput) => {
  if (!input.template?.subject_template || !input.template.body_template) {
    throw new NotificationProviderDispatchError(
      "missing_template",
      "APNs adapter requires a resolved push template with subject_template and body_template",
    );
  }

  const payload = input.job.payload_json as Record<string, unknown>;
  const title = interpolateTemplateText(input.template.subject_template, payload).trim();
  const body = interpolateTemplateText(input.template.body_template, payload).trim();
  if (!title || !body) {
    throw new NotificationProviderDispatchError(
      "template_missing_content",
      `Template ${input.template.template_key} rendered an empty APNs title or body`,
    );
  }

  const customData = objectOrEmpty(payload.apnsData);
  return {
    aps: {
      alert: { title, body },
      sound: "default",
    },
    notificationId: input.delivery.id,
    ...customData,
  } satisfies JsonObject;
};

const buildApnsAdapter = (): NotificationProviderAdapter => ({
  provider: "apns",
  async send(input) {
    if (input.delivery.channel !== "push") {
      throw new NotificationProviderDispatchError(
        "invalid_delivery_channel",
        "APNs adapter only supports push notification deliveries",
      );
    }

    if (!input.delivery.device_push_token_id) {
      throw new NotificationProviderDispatchError(
        "missing_device_push_token",
        "Push delivery has no device_push_token_id for APNs send",
      );
    }

    const devicePushToken = await getDevicePushTokenById(input.delivery.device_push_token_id);
    if (!devicePushToken?.device_token || !devicePushToken.is_active) {
      throw new NotificationProviderDispatchError(
        "device_token_unavailable",
        "APNs device token is unavailable or inactive",
      );
    }

    if (!["authorized", "provisional"].includes(devicePushToken.permission_status)) {
      throw new NotificationProviderDispatchError(
        "push_permission_not_authorized",
        "APNs device token does not have notification permission",
      );
    }

    const apnsResult = await sendApnsNotification({
      deviceToken: devicePushToken.device_token,
      environment: devicePushToken.environment,
      topic: devicePushToken.app_bundle_id,
      payload: buildApnsAlertPayload(input),
      collapseId: getApnsCollapseId(input),
      expiration: getApnsExpiration(input),
      priority: 10,
      pushType: "alert",
    });

    return {
      provider: "apns",
      providerMessageId: apnsResult.apnsId,
      deliveryStatus: "accepted",
      metadata: {
        apnsId: apnsResult.apnsId,
        apnsEnvironment: devicePushToken.environment,
        apnsTopic: devicePushToken.app_bundle_id,
        templateKey: input.template?.template_key ?? null,
        workerId: input.workerId ?? null,
      },
      events: [
        {
          eventType: "accepted",
          eventAt: input.now,
          payload: {
            apnsId: apnsResult.apnsId,
            environment: devicePushToken.environment,
          },
        },
      ],
    };
  },
});

// Cache the adapter instance to avoid reconstructing on every delivery.
// The API key is read once at first use; a server restart is required to
// pick up a key rotation.
let _resendAdapter: NotificationProviderAdapter | null = null;
const getResendAdapter = (): NotificationProviderAdapter => {
  if (!_resendAdapter) {
    _resendAdapter = buildResendAdapter();
  }
  return _resendAdapter;
};

let _snsAdapter: NotificationProviderAdapter | null = null;
const getSnsAdapter = (): NotificationProviderAdapter => {
  if (!_snsAdapter) {
    _snsAdapter = buildSnsAdapter();
  }
  return _snsAdapter;
};

let _apnsAdapter: NotificationProviderAdapter | null = null;
const getApnsAdapter = (): NotificationProviderAdapter => {
  if (!_apnsAdapter) {
    _apnsAdapter = buildApnsAdapter();
  }
  return _apnsAdapter;
};

// ---------------------------------------------------------------------------
// Provider resolver
// ---------------------------------------------------------------------------

const resolveProviderAdapter = (delivery: NotificationDeliveryRecord) => {
  if (delivery.provider === "internal") {
    return internalProviderAdapter;
  }

  if (delivery.provider === "resend") {
    return getResendAdapter();
  }

  if (delivery.provider === "sns") {
    return getSnsAdapter();
  }

  if (delivery.provider === "apns") {
    return getApnsAdapter();
  }

  throw new NotificationProviderDispatchError(
    "provider_unavailable",
    `Provider ${delivery.provider} is not configured yet`,
  );
};

const getNotificationTemplatesByIds = async (templateIds: string[]) => {
  if (templateIds.length === 0) {
    return new Map<string, NotificationTemplateRecord>();
  }

  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select("id, template_key, channel, trigger_event, subject_template, body_template, body_format, audience_scope")
    .in("id", templateIds);

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  const templates = (data ?? []) as NotificationTemplateRecord[];
  return new Map(templates.map((template) => [template.id, template]));
};

const listJobDeliveries = async (jobId: string) => {
  const { data, error } = await supabaseAdmin
    .from("notification_deliveries")
    .select(notificationDeliverySelect)
    .eq("notification_job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return castValue<NotificationDeliveryRecord[]>(data ?? []);
};

const listEventsForDeliveryIds = async (deliveryIds: string[]) => {
  if (deliveryIds.length === 0) {
    return [] as OutboundMessageEventRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("outbound_message_events")
    .select(outboundEventSelect)
    .in("notification_delivery_id", deliveryIds)
    .order("event_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return castValue<OutboundMessageEventRecord[]>(data ?? []);
};

const getNotificationJobById = async (jobId: string) => {
  const { data, error } = await supabaseAdmin
    .from("notification_jobs")
    .select(notificationJobSelect)
    .eq("id", jobId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return (data as NotificationJobRecord | null) ?? null;
};

const getDevicePushTokenById = async (devicePushTokenId: string) => {
  const { data, error } = await supabaseAdmin
    .from("device_push_tokens")
    .select(devicePushTokenSelect)
    .eq("id", devicePushTokenId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return (data as DevicePushTokenRecord | null) ?? null;
};

const updateNotificationJob = async (
  jobId: string,
  patch: Partial<NotificationJobRecord> & { metadata?: JsonObject },
) => {
  const { data, error } = await supabaseAdmin
    .from("notification_jobs")
    .update(patch)
    .eq("id", jobId)
    .select(notificationJobSelect)
    .single();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return castValue<NotificationJobRecord>(data);
};

const updateNotificationDelivery = async (
  deliveryId: string,
  patch: Partial<NotificationDeliveryRecord> & { metadata?: JsonObject },
) => {
  const { data, error } = await supabaseAdmin
    .from("notification_deliveries")
    .update(patch)
    .eq("id", deliveryId)
    .select(notificationDeliverySelect)
    .single();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return castValue<NotificationDeliveryRecord>(data);
};

const insertOutboundEvents = async (
  rows: Array<ReturnType<typeof createOutboundEventInsert>>,
) => {
  if (rows.length === 0) {
    return [] as OutboundMessageEventRecord[];
  }

  const { data, error } = await supabaseAdmin
    .from("outbound_message_events")
    .insert(rows)
    .select(outboundEventSelect);

  if (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? ((error as { code?: string }).code ?? null)
        : null;

    if (errorCode === "23505") {
      return [] as OutboundMessageEventRecord[];
    }

    throw new NotificationOutboxServiceError(500, error.message);
  }

  return castValue<OutboundMessageEventRecord[]>(data ?? []);
};

const mapNotificationEventToInviteRecipientStatus = (input: {
  eventType: OutboundMessageEventType;
  currentStatus: InviteRecipientLifecycleStatus;
}) => {
  if (input.currentStatus === "claimed") {
    return input.currentStatus;
  }

  if (input.eventType === "queued" || input.eventType === "deferred") {
    return input.currentStatus === "sent" ? "sent" : "queued";
  }
  if (input.eventType === "sent" || input.eventType === "accepted") {
    return "sent";
  }
  if (input.eventType === "delivered") {
    return "delivered";
  }
  if (input.eventType === "opened") {
    return "opened";
  }
  if (input.eventType === "clicked") {
    return "clicked";
  }
  if (input.eventType === "bounced") {
    return "bounced";
  }
  if (input.eventType === "failed" || input.eventType === "rejected") {
    return "failed";
  }
  if (input.eventType === "unsubscribed") {
    return "unsubscribed";
  }
  if (input.eventType === "complained" || input.eventType === "suppressed") {
    return "suppressed";
  }

  return input.currentStatus;
};

const mapNotificationEventToInviteStatus = (input: {
  eventType: OutboundMessageEventType;
  currentStatus: DocumentInviteLifecycleStatus;
}) => {
  if (
    (input.eventType === "sent" ||
      input.eventType === "delivered" ||
      input.eventType === "accepted") &&
    inviteSentCandidateStatuses.has(input.currentStatus)
  ) {
    return "sent";
  }

  if (
    (input.eventType === "opened" || input.eventType === "clicked") &&
    inviteOpenedCandidateStatuses.has(input.currentStatus)
  ) {
    return "opened";
  }

  if (
    inviteFailureEventTypes.has(input.eventType) &&
    inviteFailureCandidateStatuses.has(input.currentStatus)
  ) {
    return "failed";
  }

  if (input.eventType === "queued" && input.currentStatus === "draft") {
    return "queued";
  }

  return input.currentStatus;
};

const buildNotificationLifecycleMetadata = (input: {
  existingMetadata: JsonObject;
  delivery: NotificationDeliveryRecord;
  provider: NotificationProviderName;
  providerMessageId: string | null;
  providerEventId: string | null;
  eventType: OutboundMessageEventType;
  eventAt: string;
  payload?: JsonObject | undefined;
}) => {
  const latestNotificationEvent = {
    deliveryId: input.delivery.id,
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    eventAt: input.eventAt,
  } satisfies JsonObject;

  return {
    ...input.existingMetadata,
    latestNotificationEvent,
    ...(eventTypesWithDeliveryIssueMetadata.has(input.eventType)
      ? {
          latestDeliveryIssue: {
            ...latestNotificationEvent,
            payload: input.payload ?? {},
          },
        }
      : {}),
  } satisfies JsonObject;
};

const getInviteRecipientLifecycleRow = async (recipientId: string) => {
  const { data, error } = await supabaseAdmin
    .from("invite_recipients")
    .select("id, invite_id, status, metadata")
    .eq("id", recipientId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return (data as InviteRecipientLifecycleRow | null) ?? null;
};

const getDocumentInviteLifecycleRow = async (inviteId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_access_invites")
    .select("id, status, sent_at, first_opened_at, first_clicked_at, metadata")
    .eq("id", inviteId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return (data as DocumentInviteLifecycleRow | null) ?? null;
};

const syncInviteLifecycleForNotificationEvent = async (input: {
  delivery: NotificationDeliveryRecord;
  job: NotificationJobRecord;
  provider: NotificationProviderName;
  providerMessageId: string | null;
  providerEventId: string | null;
  eventType: OutboundMessageEventType;
  eventAt: string;
  payload?: JsonObject | undefined;
}) => {
  if (!input.delivery.invite_recipient_id && !input.job.invite_id) {
    return;
  }

  const recipient = input.delivery.invite_recipient_id
    ? await getInviteRecipientLifecycleRow(input.delivery.invite_recipient_id)
    : null;
  const inviteId = recipient?.invite_id ?? input.job.invite_id;
  if (!inviteId) {
    return;
  }

  const invite = await getDocumentInviteLifecycleRow(inviteId);
  if (!invite) {
    return;
  }

  const inviteMetadata = buildNotificationLifecycleMetadata({
    existingMetadata: objectOrEmpty(invite.metadata),
    delivery: input.delivery,
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    eventAt: input.eventAt,
    payload: input.payload,
  });
  const invitePatch: Partial<DocumentInviteLifecycleRow> & { metadata: JsonObject } = {
    status: mapNotificationEventToInviteStatus({
      eventType: input.eventType,
      currentStatus: invite.status,
    }),
    metadata: inviteMetadata,
  };

  if (["sent", "delivered", "opened", "clicked", "accepted"].includes(input.eventType)) {
    invitePatch.sent_at = invite.sent_at ?? input.eventAt;
  }
  if (input.eventType === "opened" || input.eventType === "clicked") {
    invitePatch.first_opened_at = invite.first_opened_at ?? input.eventAt;
  }
  if (input.eventType === "clicked") {
    invitePatch.first_clicked_at = invite.first_clicked_at ?? input.eventAt;
  }

  const updates: Array<Promise<{ error: { message: string } | null }>> = [
    supabaseAdmin
      .from("document_access_invites")
      .update(invitePatch)
      .eq("id", invite.id) as unknown as Promise<{ error: { message: string } | null }>,
  ];

  if (recipient) {
    const recipientMetadata = buildNotificationLifecycleMetadata({
      existingMetadata: objectOrEmpty(recipient.metadata),
      delivery: input.delivery,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      eventAt: input.eventAt,
      payload: input.payload,
    });

    updates.push(
      supabaseAdmin
        .from("invite_recipients")
        .update({
          status: mapNotificationEventToInviteRecipientStatus({
            eventType: input.eventType,
            currentStatus: recipient.status,
          }),
          last_event_at: input.eventAt,
          metadata: recipientMetadata,
        })
        .eq("id", recipient.id) as unknown as Promise<{ error: { message: string } | null }>,
    );
  }

  const results = await Promise.all(updates);
  const failedUpdate = results.find((result) => result.error);
  if (failedUpdate?.error) {
    throw new NotificationOutboxServiceError(500, failedUpdate.error.message);
  }
};

const listDueNotificationJobs = async (input: {
  limit: number;
  now: string;
  jobKind?: string | null | undefined;
  documentId?: string | null | undefined;
  notificationJobIds?: string[] | null | undefined;
}) => {
  let query = supabaseAdmin
    .from("notification_jobs")
    .select(notificationJobSelect)
    .in("status", Array.from(queueableJobStatuses))
    .lte("scheduled_for", input.now);

  const jobKind = input.jobKind?.trim() ?? "";
  if (jobKind) {
    query = query.eq("job_kind", jobKind);
  }

  const documentId = input.documentId?.trim() ?? "";
  if (documentId) {
    query = query.eq("document_id", documentId);
  }

  const notificationJobIds = Array.from(
    new Set(
      (input.notificationJobIds ?? [])
        .map((jobId) => jobId.trim())
        .filter((jobId) => jobId.length > 0),
    ),
  );
  if (notificationJobIds.length > 0) {
    query = query.in("id", notificationJobIds);
  }

  const { data, error } = await query
    .order("scheduled_for", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(input.limit);

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return castValue<NotificationJobRecord[]>(data ?? []);
};

const claimNotificationJob = async (input: {
  job: NotificationJobRecord;
  workerId?: string | null | undefined;
  claimedAt: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("notification_jobs")
    .update({
      status: "processing",
      processing_started_at: input.claimedAt,
      last_attempt_at: input.claimedAt,
      attempt_count: input.job.attempt_count + 1,
      metadata: {
        ...objectOrEmpty(input.job.metadata),
        lastClaimedByWorkerId: input.workerId ?? null,
        lastClaimedAt: input.claimedAt,
      },
    })
    .eq("id", input.job.id)
    .in("status", Array.from(queueableJobStatuses))
    .select(notificationJobSelect)
    .maybeSingle();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  return (data as NotificationJobRecord | null) ?? null;
};

const buildJobListItem = (input: {
  job: NotificationJobRecord;
  templateById: Map<string, NotificationTemplateRecord>;
  deliveries: NotificationDeliveryRecord[];
}) => {
  const template = input.job.template_id
    ? input.templateById.get(input.job.template_id) ?? null
    : null;

  return {
    id: input.job.id,
    templateId: input.job.template_id,
    templateKey: template?.template_key ?? null,
    jobKind: input.job.job_kind,
    channel: input.job.channel,
    status: input.job.status,
    priority: input.job.priority,
    scheduledFor: input.job.scheduled_for,
    processingStartedAt: input.job.processing_started_at,
    completedAt: input.job.completed_at,
    lastAttemptAt: input.job.last_attempt_at,
    attemptCount: input.job.attempt_count,
    dedupeKey: input.job.dedupe_key,
    documentId: input.job.document_id,
    notarizationRequestId: input.job.notarization_request_id,
    inviteId: input.job.invite_id,
    requestedByUserId: input.job.requested_by_user_id,
    createdAt: input.job.created_at,
    updatedAt: input.job.updated_at,
    deliveryCounts: summarizeDeliveryCounts(input.deliveries),
  } satisfies NotificationJobListItem;
};

const emptyJobStatusCounts = (): Record<NotificationJobStatus, number> => ({
  queued: 0,
  scheduled: 0,
  processing: 0,
  sent: 0,
  partially_sent: 0,
  completed: 0,
  failed: 0,
  canceled: 0,
  suppressed: 0,
});

const emptyJobChannelCounts = (): Record<NotificationChannel, number> => ({
  email: 0,
  sms: 0,
  in_app: 0,
  push: 0,
});

const emptyDeliveryStatusCounts = (): Record<NotificationDeliveryStatus, number> => ({
  pending: 0,
  queued: 0,
  sent: 0,
  delivered: 0,
  failed: 0,
  bounced: 0,
  complained: 0,
  opened: 0,
  clicked: 0,
  accepted: 0,
  suppressed: 0,
});

const computeNotificationJobsMetrics = (input: {
  jobs: NotificationJobRecord[];
  deliveries: NotificationDeliveryRecord[];
  windowHours: number;
  generatedAt: string;
}): NotificationJobsMetrics => {
  const jobsByStatus = emptyJobStatusCounts();
  const inviteJobsByStatus = emptyJobStatusCounts();
  const jobsByChannel = emptyJobChannelCounts();
  const deliveriesByStatus = emptyDeliveryStatusCounts();
  const inviteDeliveriesByStatus = emptyDeliveryStatusCounts();

  const inviteJobIds = new Set<string>();

  for (const job of input.jobs) {
    jobsByStatus[job.status] += 1;
    jobsByChannel[job.channel] += 1;

    if (
      job.invite_id ||
      job.job_kind === "document_invite" ||
      job.job_kind === "invite" ||
      job.job_kind === "invite_reminder"
    ) {
      inviteJobIds.add(job.id);
      inviteJobsByStatus[job.status] += 1;
    }
  }

  for (const delivery of input.deliveries) {
    deliveriesByStatus[delivery.status] += 1;

    if (inviteJobIds.has(delivery.notification_job_id)) {
      inviteDeliveriesByStatus[delivery.status] += 1;
    }
  }

  return {
    windowHours: input.windowHours,
    generatedAt: input.generatedAt,
    jobs: {
      total: input.jobs.length,
      byStatus: jobsByStatus,
      byChannel: jobsByChannel,
      inviteJobs: inviteJobIds.size,
      inviteJobsByStatus,
    },
    deliveries: {
      total: input.deliveries.length,
      byStatus: deliveriesByStatus,
      inviteDeliveries: input.deliveries.filter((delivery) =>
        inviteJobIds.has(delivery.notification_job_id),
      ).length,
      inviteDeliveriesByStatus,
    },
  };
};

const countAttemptableDeliveries = (deliveries: NotificationDeliveryRecord[]) => {
  return deliveries.filter((delivery) => queueableDeliveryStatuses.has(delivery.status)).length;
};

const buildProcessSummary = (input: {
  job: NotificationJobRecord;
  deliveries: NotificationDeliveryRecord[];
  attemptedDeliveryCount: number;
}) => {
  const counts = summarizeDeliveryCounts(input.deliveries);
  return {
    jobId: input.job.id,
    status: input.job.status,
    attemptedDeliveryCount: input.attemptedDeliveryCount,
    deliveredCount: counts.delivered,
    failedCount: counts.failed,
    scheduledFor: input.job.status === "scheduled" ? input.job.scheduled_for : null,
    completedAt: input.job.completed_at,
  } satisfies NotificationJobProcessSummary;
};

const processClaimedNotificationJob = async (input: {
  job: NotificationJobRecord;
  workerId?: string | null | undefined;
}) => {
  const deliveries = await listJobDeliveries(input.job.id);
  const templateById = await getNotificationTemplatesByIds(
    input.job.template_id ? [input.job.template_id] : [],
  );
  const template = input.job.template_id
    ? templateById.get(input.job.template_id) ?? null
    : null;
  const attemptableDeliveries = deliveries.filter((delivery) =>
    queueableDeliveryStatuses.has(delivery.status),
  );
  const attemptStartedAt = new Date().toISOString();

  if (attemptableDeliveries.length === 0) {
    const nextState = deriveNotificationJobStatus({
      deliveries,
      attemptCount: input.job.attempt_count,
    });
    const updatedJob = await updateNotificationJob(input.job.id, {
      status: nextState.status,
      processing_started_at: null,
      completed_at: nextState.isTerminal ? attemptStartedAt : null,
    });

    return buildProcessSummary({
      job: updatedJob,
      deliveries,
      attemptedDeliveryCount: 0,
    });
  }

  for (const delivery of attemptableDeliveries) {
    const effectiveAttemptNumber =
      delivery.status === "failed" ? delivery.attempt_number + 1 : delivery.attempt_number;

    try {
      const adapter = resolveProviderAdapter(delivery);
      const dispatch = await adapter.send({
        job: input.job,
        delivery,
        template,
        workerId: input.workerId,
        now: attemptStartedAt,
      });

      const deliveredAt =
        dispatch.deliveryStatus === "delivered" ||
        dispatch.deliveryStatus === "opened" ||
        dispatch.deliveryStatus === "clicked"
          ? attemptStartedAt
          : null;
      const acceptedAt = dispatch.deliveryStatus === "accepted" ? attemptStartedAt : null;

      const updatedDelivery = await updateNotificationDelivery(delivery.id, {
        provider: dispatch.provider,
        provider_message_id: dispatch.providerMessageId,
        status: dispatch.deliveryStatus,
        attempt_number: effectiveAttemptNumber,
        sent_at: attemptStartedAt,
        delivered_at: deliveredAt,
        accepted_at: acceptedAt,
        failed_at: null,
        error_code: null,
        error_message: null,
        metadata: {
          ...objectOrEmpty(delivery.metadata),
          ...objectOrEmpty(dispatch.metadata),
        },
      });

      await insertOutboundEvents(
        dispatch.events.map((event) =>
          createOutboundEventInsert({
            deliveryId: delivery.id,
            provider: dispatch.provider,
            providerEventId: null,
            eventType: event.eventType,
            eventAt: event.eventAt,
            payload: event.payload,
            metadata: {
              ...(event.metadata ?? {}),
              workerId: input.workerId ?? null,
            },
          }),
        ),
      );

      for (const event of dispatch.events) {
        await syncInviteLifecycleForNotificationEvent({
          delivery: updatedDelivery,
          job: input.job,
          provider: dispatch.provider,
          providerMessageId: dispatch.providerMessageId,
          providerEventId: null,
          eventType: event.eventType,
          eventAt: event.eventAt,
          payload: event.payload,
        });
      }
    } catch (error) {
      const errorCode =
        error instanceof NotificationProviderDispatchError
          ? error.code
          : error instanceof ApnsClientError
            ? error.code
          : "dispatch_failed";
      const errorMessage = error instanceof Error ? error.message : String(error);
      const apnsFailureMetadata =
        error instanceof ApnsClientError
          ? {
              apnsId: error.apnsId ?? null,
              apnsReason: error.reason ?? null,
              apnsStatusCode: error.statusCode ?? null,
              permanentTokenFailure: error.permanentTokenFailure,
              retryable: error.retryable,
            }
          : {};

      if (
        error instanceof ApnsClientError &&
        error.permanentTokenFailure &&
        delivery.device_push_token_id
      ) {
        await invalidatePushDeviceTokenById({
          devicePushTokenId: delivery.device_push_token_id,
          reason: error.reason ?? error.code,
        });
      }

      console.warn("Notification delivery dispatch failed", {
        jobId: input.job.id,
        jobKind: input.job.job_kind,
        documentId: input.job.document_id,
        inviteId: input.job.invite_id,
        deliveryId: delivery.id,
        provider: delivery.provider,
        errorCode,
        errorMessage,
      });
      captureException(error, {
        level: "warning",
        tags: {
          component: "notification_outbox",
          provider: delivery.provider,
          jobKind: input.job.job_kind,
        },
        contexts: {
          notification: {
            jobId: input.job.id,
            documentId: input.job.document_id,
            inviteId: input.job.invite_id,
            deliveryId: delivery.id,
            channel: delivery.channel,
            errorCode,
          },
        },
        extra: {
          errorMessage,
        },
      });

      const updatedDelivery = await updateNotificationDelivery(delivery.id, {
        status: "failed",
        attempt_number: effectiveAttemptNumber,
        failed_at: attemptStartedAt,
        error_code: errorCode,
        error_message: errorMessage,
        metadata: {
          ...objectOrEmpty(delivery.metadata),
          lastFailureAt: attemptStartedAt,
          ...apnsFailureMetadata,
        },
      });

      await insertOutboundEvents([
        createOutboundEventInsert({
          deliveryId: delivery.id,
          provider: delivery.provider,
          eventType: "failed",
          eventAt: attemptStartedAt,
          payload: {
            errorCode,
            errorMessage,
            ...apnsFailureMetadata,
          },
          metadata: {
            workerId: input.workerId ?? null,
          },
        }),
      ]);

      await syncInviteLifecycleForNotificationEvent({
        delivery: updatedDelivery,
        job: input.job,
        provider: delivery.provider,
        providerMessageId: delivery.provider_message_id,
        providerEventId: null,
        eventType: "failed",
        eventAt: attemptStartedAt,
        payload: {
          errorCode,
          errorMessage,
        },
      });
    }
  }

  const refreshedDeliveries = await listJobDeliveries(input.job.id);
  const nextState = deriveNotificationJobStatus({
    deliveries: refreshedDeliveries,
    attemptCount: input.job.attempt_count,
  });

  const completedAt = nextState.isTerminal ? attemptStartedAt : null;
  const scheduledFor = nextState.shouldRetry
    ? addSecondsToIso(
        attemptStartedAt,
        getNotificationRetryDelaySeconds(input.job.attempt_count),
      )
    : input.job.scheduled_for;

  const updatedJob = await updateNotificationJob(input.job.id, {
    status: nextState.status,
    processing_started_at: null,
    scheduled_for: nextState.shouldRetry ? scheduledFor : input.job.scheduled_for,
    completed_at: completedAt,
  });

  return buildProcessSummary({
    job: updatedJob,
    deliveries: refreshedDeliveries,
    attemptedDeliveryCount: attemptableDeliveries.length,
  });
};

export const runDueNotificationJobs = async (input?: {
  limit?: number | null | undefined;
  workerId?: string | null | undefined;
  jobKind?: string | null | undefined;
  documentId?: string | null | undefined;
  notificationJobIds?: string[] | null | undefined;
}) => {
  assertSupabaseConfigured();

  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 100);
  const now = new Date().toISOString();
  const dueJobs = await listDueNotificationJobs({
    limit,
    now,
    jobKind: input?.jobKind,
    documentId: input?.documentId,
    notificationJobIds: input?.notificationJobIds,
  });
  const results: NotificationJobProcessSummary[] = [];
  let claimedCount = 0;

  for (const job of dueJobs) {
    const claimedJob = await claimNotificationJob({
      job,
      workerId: input?.workerId,
      claimedAt: now,
    });
    if (!claimedJob) {
      continue;
    }

    claimedCount += 1;
    results.push(
      await processClaimedNotificationJob({
        job: claimedJob,
        workerId: input?.workerId,
      }),
    );
  }

  return {
    scannedCount: dueJobs.length,
    claimedCount,
    processedCount: results.length,
    jobs: results,
  } satisfies RunDueNotificationJobsResult;
};

export const recordNotificationDeliveryEvent = async (input: {
  deliveryId: string;
  provider: NotificationProviderName;
  eventType: OutboundMessageEventType;
  providerMessageId?: string | null | undefined;
  providerEventId?: string | null | undefined;
  eventAt?: string | null | undefined;
  payload?: JsonObject | undefined;
  metadata?: JsonObject | undefined;
}) => {
  assertSupabaseConfigured();

  const eventAt = input.eventAt?.trim() ? input.eventAt : new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("notification_deliveries")
    .select(notificationDeliverySelect)
    .eq("id", input.deliveryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  const delivery = (data as NotificationDeliveryRecord | null) ?? null;
  if (!delivery) {
    throw new NotificationOutboxServiceError(404, "Notification delivery not found");
  }

  const eventInsert = createOutboundEventInsert({
    deliveryId: input.deliveryId,
    provider: input.provider,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    eventAt,
    payload: input.payload,
    metadata: input.metadata,
  });

  await insertOutboundEvents([eventInsert]);

  const patch = mapOutboundEventToDeliveryPatch({
    delivery,
    eventType: input.eventType,
    eventAt,
  });

  const updatedDelivery = await updateNotificationDelivery(input.deliveryId, {
    ...patch,
    provider: input.provider,
    provider_message_id: input.providerMessageId ?? delivery.provider_message_id,
    metadata: {
      ...objectOrEmpty(delivery.metadata),
      ...objectOrEmpty(input.metadata),
    },
  });

  const job = await getNotificationJobById(updatedDelivery.notification_job_id);
  if (!job) {
    throw new NotificationOutboxServiceError(404, "Notification job not found");
  }

  const deliveries = await listJobDeliveries(job.id);
  const nextState = deriveNotificationJobStatus({
    deliveries,
    attemptCount: job.attempt_count,
  });

  const updatedJob = await updateNotificationJob(job.id, {
    status: nextState.status,
    processing_started_at: nextState.status === "processing" ? job.processing_started_at : null,
    completed_at: nextState.isTerminal ? eventAt : null,
  });

  await syncInviteLifecycleForNotificationEvent({
    delivery: updatedDelivery,
    job: updatedJob,
    provider: input.provider,
    providerMessageId: input.providerMessageId ?? updatedDelivery.provider_message_id,
    providerEventId: input.providerEventId ?? null,
    eventType: input.eventType,
    eventAt,
    payload: input.payload,
  });

  return {
    jobId: updatedJob.id,
    jobStatus: updatedJob.status,
    deliveryId: updatedDelivery.id,
    deliveryStatus: updatedDelivery.status,
  };
};

export const recordNotificationDeliveryEventByProviderMessageId = async (input: {
  provider: NotificationProviderName;
  providerMessageId: string;
  eventType: OutboundMessageEventType;
  providerEventId?: string | null | undefined;
  eventAt?: string | null | undefined;
  payload?: JsonObject | undefined;
  metadata?: JsonObject | undefined;
}) => {
  assertSupabaseConfigured();

  const { data, error } = await supabaseAdmin
    .from("notification_deliveries")
    .select(notificationDeliverySelect)
    .eq("provider", input.provider)
    .eq("provider_message_id", input.providerMessageId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  const delivery = (data as NotificationDeliveryRecord | null) ?? null;
  if (!delivery) {
    return null;
  }

  return recordNotificationDeliveryEvent({
    deliveryId: delivery.id,
    provider: input.provider,
    providerMessageId: input.providerMessageId,
    providerEventId: input.providerEventId,
    eventType: input.eventType,
    eventAt: input.eventAt,
    payload: input.payload,
    metadata: input.metadata,
  });
};

export const listNotificationJobs = async (input: {
  status?: NotificationJobStatus | null | undefined;
  channel?: NotificationChannel | null | undefined;
  limit: number;
  offset: number;
}) => {
  assertSupabaseConfigured();

  let query = supabaseAdmin
    .from("notification_jobs")
    .select(notificationJobSelect, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);

  if (input.status) {
    query = query.eq("status", input.status);
  }
  if (input.channel) {
    query = query.eq("channel", input.channel);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new NotificationOutboxServiceError(500, error.message);
  }

  const jobs = castValue<NotificationJobRecord[]>(data ?? []);
  const templateById = await getNotificationTemplatesByIds(
    jobs.flatMap((job) => (job.template_id ? [job.template_id] : [])),
  );
  const jobIds = jobs.map((job) => job.id);

  let deliveries: NotificationDeliveryRecord[] = [];
  if (jobIds.length > 0) {
    const deliveriesResult = await supabaseAdmin
      .from("notification_deliveries")
      .select(notificationDeliverySelect)
      .in("notification_job_id", jobIds)
      .order("created_at", { ascending: true });

    if (deliveriesResult.error) {
      throw new NotificationOutboxServiceError(500, deliveriesResult.error.message);
    }

    deliveries = castValue<NotificationDeliveryRecord[]>(deliveriesResult.data ?? []);
  }

  const deliveriesByJobId = deliveries.reduce<Map<string, NotificationDeliveryRecord[]>>(
    (map, delivery) => {
      const existing = map.get(delivery.notification_job_id) ?? [];
      existing.push(delivery);
      map.set(delivery.notification_job_id, existing);
      return map;
    },
    new Map(),
  );

  return {
    jobs: jobs.map((job) =>
      buildJobListItem({
        job,
        templateById,
        deliveries: deliveriesByJobId.get(job.id) ?? [],
      }),
    ),
    page: {
      limit: input.limit,
      offset: input.offset,
      total: count ?? 0,
    },
  } satisfies NotificationJobsListResponse;
};

export const getNotificationJobDetail = async (jobId: string) => {
  assertSupabaseConfigured();

  const job = await getNotificationJobById(jobId);
  if (!job) {
    return null;
  }

  const deliveries = await listJobDeliveries(job.id);
  const events = await listEventsForDeliveryIds(deliveries.map((delivery) => delivery.id));
  const templateById = await getNotificationTemplatesByIds(
    job.template_id ? [job.template_id] : [],
  );
  const listItem = buildJobListItem({
    job,
    templateById,
    deliveries,
  });

  return {
    job: {
      ...listItem,
      billingPaymentRequestId: job.billing_payment_request_id,
      canceledAt: job.canceled_at,
      payload: objectOrEmpty(job.payload_json),
      metadata: objectOrEmpty(job.metadata),
    },
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      targetUserId: delivery.target_user_id,
      devicePushTokenId: delivery.device_push_token_id,
      channel: delivery.channel,
      recipientAddress: delivery.recipient_address,
      recipientDisplayName: delivery.recipient_display_name,
      provider: delivery.provider,
      providerMessageId: delivery.provider_message_id,
      status: delivery.status,
      attemptNumber: delivery.attempt_number,
      queuedAt: delivery.queued_at,
      sentAt: delivery.sent_at,
      deliveredAt: delivery.delivered_at,
      failedAt: delivery.failed_at,
      bouncedAt: delivery.bounced_at,
      openedAt: delivery.opened_at,
      clickedAt: delivery.clicked_at,
      acceptedAt: delivery.accepted_at,
      errorCode: delivery.error_code,
      errorMessage: delivery.error_message,
      metadata: objectOrEmpty(delivery.metadata),
      createdAt: delivery.created_at,
      updatedAt: delivery.updated_at,
    })),
    events: events.map((event) => ({
      id: event.id,
      deliveryId: event.notification_delivery_id,
      eventType: event.event_type,
      provider: event.provider,
      providerEventId: event.provider_event_id,
      eventAt: event.event_at,
      payload: objectOrEmpty(event.payload),
      metadata: objectOrEmpty(event.metadata),
      createdAt: event.created_at,
    })),
  } satisfies NotificationJobDetail;
};

export const getNotificationJobsMetrics = async (input?: {
  windowHours?: number | null | undefined;
}) => {
  assertSupabaseConfigured();

  const requestedWindow = input?.windowHours ?? 24;
  const windowHours = Math.min(Math.max(requestedWindow, 1), 24 * 7);
  const generatedAt = new Date().toISOString();
  const windowStart = new Date(
    new Date(generatedAt).getTime() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  const { data: jobsData, error: jobsError } = await supabaseAdmin
    .from("notification_jobs")
    .select(notificationJobSelect)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (jobsError) {
    throw new NotificationOutboxServiceError(500, jobsError.message);
  }

  const jobs = castValue<NotificationJobRecord[]>(jobsData ?? []);
  const jobIds = jobs.map((job) => job.id);

  let deliveries: NotificationDeliveryRecord[] = [];
  if (jobIds.length > 0) {
    const { data: deliveriesData, error: deliveriesError } = await supabaseAdmin
      .from("notification_deliveries")
      .select(notificationDeliverySelect)
      .in("notification_job_id", jobIds);

    if (deliveriesError) {
      throw new NotificationOutboxServiceError(500, deliveriesError.message);
    }

    deliveries = castValue<NotificationDeliveryRecord[]>(deliveriesData ?? []);
  }

  return computeNotificationJobsMetrics({
    jobs,
    deliveries,
    windowHours,
    generatedAt,
  });
};

export const __testUtils = {
  summarizeDeliveryCounts,
  computeNotificationJobsMetrics,
  buildResendAdapter,
  buildSnsAdapter,
  buildApnsAdapter,
  resetResendAdapterCache: () => {
    _resendAdapter = null;
  },
  resetSnsAdapterCache: () => {
    _snsAdapter = null;
  },
  resetApnsAdapterCache: () => {
    _apnsAdapter = null;
  },
};