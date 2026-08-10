import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  verifyWebhookMock: vi.fn(),
}));

const snsMocks = vi.hoisted(() => ({
  publishMock: vi.fn(),
}));

const apnsMocks = vi.hoisted(() => {
  class MockApnsClientError extends Error {
    constructor(
      readonly code: string,
      message: string,
      readonly options: {
        statusCode?: number;
        apnsId?: string | null;
        reason?: string | null;
        retryable?: boolean;
        permanentTokenFailure?: boolean;
      } = {},
    ) {
      super(message);
      this.name = "ApnsClientError";
    }

    get permanentTokenFailure() {
      return this.options.permanentTokenFailure === true;
    }

    get reason() {
      return this.options.reason ?? null;
    }
  }

  return {
    sendMock: vi.fn(),
    ApnsClientError: MockApnsClientError,
  };
});

vi.mock("@aws-sdk/client-sns", () => ({
  SNSClient: vi.fn().mockImplementation(() => ({
    send: snsMocks.publishMock,
  })),
  PublishCommand: vi.fn((input) => ({ input })),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: resendMocks.sendEmailMock,
    },
    webhooks: {
      verify: resendMocks.verifyWebhookMock,
    },
  })),
}));

vi.mock("../../src/services/apnsClient", () => ({
  ApnsClientError: apnsMocks.ApnsClientError,
  sendApnsNotification: apnsMocks.sendMock,
}));

const supabaseMocks = vi.hoisted(() => ({
  client: {
    from: vi.fn(),
  },
  state: {
    document_access_invites: [] as any[],
    invite_recipients: [] as any[],
    notification_jobs: [] as any[],
    notification_deliveries: [] as any[],
    notification_templates: [] as any[],
    device_push_tokens: [] as any[],
    outbound_message_events: [] as any[],
    nextEventId: 1,
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => supabaseMocks.client),
}));

import {
  __testUtils,
  recordNotificationDeliveryEvent,
  runDueNotificationJobs,
} from "../../src/services/notificationOutboxService";

type Filter =
  | { kind: "eq"; field: string; value: unknown }
  | { kind: "in"; field: string; values: unknown[] }
  | { kind: "lte"; field: string; value: unknown }
  | { kind: "gte"; field: string; value: unknown };

type OrderBy = {
  field: string;
  ascending: boolean;
};

const nowIso = "2026-04-29T12:00:00.000Z";

class FakeSupabaseQueryBuilder {
  private action: "select" | "insert" | "update" = "select";
  private filters: Filter[] = [];
  private orders: OrderBy[] = [];
  private limitCount: number | null = null;
  private patch: Record<string, unknown> = {};
  private rowsToInsert: Record<string, unknown>[] = [];

  constructor(private readonly table: keyof typeof supabaseMocks.state) {}

  select() {
    return this;
  }

  update(patch: Record<string, unknown>) {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  insert(rows: Record<string, unknown> | Record<string, unknown>[]) {
    this.action = "insert";
    this.rowsToInsert = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push({ kind: "eq", field, value });
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push({ kind: "in", field, values });
    return this;
  }

  lte(field: string, value: unknown) {
    this.filters.push({ kind: "lte", field, value });
    return this;
  }

  gte(field: string, value: unknown) {
    this.filters.push({ kind: "gte", field, value });
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    const result = this.execute();
    if (result.error) {
      return Promise.resolve(result);
    }

    return Promise.resolve({ data: result.data[0] ?? null, error: null });
  }

  single() {
    const result = this.execute();
    if (result.error) {
      return Promise.resolve(result);
    }

    return Promise.resolve({ data: result.data[0] ?? null, error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: any[]; error: any; count?: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private execute() {
    if (this.action === "insert") {
      return this.executeInsert();
    }

    if (this.action === "update") {
      const rows = this.applyFilters(this.tableRows());
      for (const row of rows) {
        Object.assign(row, this.patch);
      }
      return { data: rows, error: null, count: rows.length };
    }

    let rows = this.applyFilters(this.tableRows());
    rows = this.applyOrdering(rows);
    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null, count: rows.length };
  }

  private executeInsert() {
    if (this.table === "outbound_message_events") {
      const existingKeys = new Set(
        supabaseMocks.state.outbound_message_events
          .filter((event) => event.provider_event_id)
          .map((event) => `${event.provider}:${event.provider_event_id}`),
      );
      const nextKeys = new Set<string>();

      for (const row of this.rowsToInsert) {
        const providerEventId = row.provider_event_id;
        if (!providerEventId) {
          continue;
        }

        const key = `${row.provider}:${providerEventId}`;
        if (existingKeys.has(key) || nextKeys.has(key)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: "duplicate key value violates unique constraint ux_outbound_message_events_provider_event",
            },
          };
        }

        nextKeys.add(key);
      }
    }

    const insertedRows = this.rowsToInsert.map((row) => ({
      id:
        row.id ??
        (this.table === "outbound_message_events"
          ? `event-${supabaseMocks.state.nextEventId++}`
          : `${this.table}-${Date.now()}`),
      created_at: row.created_at ?? nowIso,
      updated_at: row.updated_at ?? nowIso,
      ...row,
    }));

    this.tableRows().push(...insertedRows);
    return { data: insertedRows, error: null, count: insertedRows.length };
  }

  private tableRows() {
    return supabaseMocks.state[this.table] as any[];
  }

  private applyFilters(rows: any[]) {
    return rows.filter((row) =>
      this.filters.every((filter) => {
        const value = row[filter.field];

        if (filter.kind === "eq") {
          return value === filter.value;
        }

        if (filter.kind === "in") {
          return filter.values.includes(value);
        }

        if (filter.kind === "lte") {
          return String(value) <= String(filter.value);
        }

        return String(value) >= String(filter.value);
      }),
    );
  }

  private applyOrdering(rows: any[]) {
    return [...rows].sort((left, right) => {
      for (const order of this.orders) {
        const leftValue = String(left[order.field] ?? "");
        const rightValue = String(right[order.field] ?? "");
        if (leftValue === rightValue) {
          continue;
        }

        const direction = order.ascending ? 1 : -1;
        return leftValue < rightValue ? -direction : direction;
      }

      return 0;
    });
  }
}

const buildJob = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  template_id: "template-1",
  invite_id: null,
  document_id: "doc-1",
  billing_payment_request_id: null,
  notarization_request_id: null,
  requested_by_user_id: "user-1",
  job_kind: "transactional",
  channel: "email",
  status: "queued",
  priority: "normal",
  dedupe_key: "job:doc-1",
  scheduled_for: "2026-04-29T11:00:00.000Z",
  processing_started_at: null,
  completed_at: null,
  canceled_at: null,
  last_attempt_at: null,
  attempt_count: 0,
  payload_json: { recipientName: "Casey", ctaUrl: "https://app.example.test/review" },
  metadata: {},
  created_at: "2026-04-29T10:00:00.000Z",
  updated_at: "2026-04-29T10:00:00.000Z",
  ...overrides,
});

const buildDelivery = (overrides: Record<string, unknown> = {}) => ({
  id: "delivery-1",
  notification_job_id: "job-1",
  invite_recipient_id: null,
  target_user_id: "user-1",
  channel: "email",
  recipient_address: "casey@example.com",
  recipient_display_name: "Casey Signer",
  provider: "resend",
  provider_message_id: null,
  device_push_token_id: null,
  status: "queued",
  attempt_number: 1,
  queued_at: "2026-04-29T11:00:00.000Z",
  sent_at: null,
  delivered_at: null,
  failed_at: null,
  bounced_at: null,
  opened_at: null,
  clicked_at: null,
  accepted_at: null,
  error_code: null,
  error_message: null,
  metadata: {},
  created_at: "2026-04-29T11:00:00.000Z",
  updated_at: "2026-04-29T11:00:00.000Z",
  ...overrides,
});

const buildTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: "template-1",
  template_key: "document_ready_for_review_email",
  channel: "email",
  trigger_event: "document_ready_for_review",
  subject_template: "Ready for {{recipientName}}",
  body_template: "Hi {{recipientName}}, review here: {{ctaUrl}}",
  body_format: "markdown",
  audience_scope: "member",
  ...overrides,
});

const buildDevicePushToken = (overrides: Record<string, unknown> = {}) => ({
  id: "push-token-1",
  user_id: "user-1",
  platform: "ios",
  provider: "apns",
  environment: "sandbox",
  app_bundle_id: "com.illuminote.darci",
  device_token: "a".repeat(64),
  permission_status: "authorized",
  is_active: true,
  invalidated_at: null,
  metadata: {},
  created_at: "2026-04-29T11:00:00.000Z",
  updated_at: "2026-04-29T11:00:00.000Z",
  ...overrides,
});

const buildInvite = (overrides: Record<string, unknown> = {}) => ({
  id: "invite-1",
  status: "queued",
  sent_at: null,
  first_opened_at: null,
  first_clicked_at: null,
  metadata: {},
  created_at: "2026-04-29T11:00:00.000Z",
  updated_at: "2026-04-29T11:00:00.000Z",
  ...overrides,
});

const buildInviteRecipient = (overrides: Record<string, unknown> = {}) => ({
  id: "recipient-1",
  invite_id: "invite-1",
  status: "queued",
  last_notified_at: "2026-04-29T11:00:00.000Z",
  last_event_at: "2026-04-29T11:00:00.000Z",
  metadata: {},
  created_at: "2026-04-29T11:00:00.000Z",
  updated_at: "2026-04-29T11:00:00.000Z",
  ...overrides,
});

const seedOutbox = (overrides?: {
  job?: Record<string, unknown>;
  delivery?: Record<string, unknown>;
  template?: Record<string, unknown>;
  invite?: Record<string, unknown>;
  inviteRecipient?: Record<string, unknown>;
  devicePushToken?: Record<string, unknown>;
}) => {
  supabaseMocks.state.notification_jobs.push(buildJob(overrides?.job));
  supabaseMocks.state.notification_deliveries.push(buildDelivery(overrides?.delivery));
  supabaseMocks.state.notification_templates.push(buildTemplate(overrides?.template));

  if (overrides?.devicePushToken) {
    supabaseMocks.state.device_push_tokens.push(buildDevicePushToken(overrides.devicePushToken));
  }

  if (overrides?.invite || overrides?.inviteRecipient) {
    supabaseMocks.state.document_access_invites.push(buildInvite(overrides?.invite));
    supabaseMocks.state.invite_recipients.push(buildInviteRecipient(overrides?.inviteRecipient));
  }
};

describe("notification outbox Resend runtime", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.AWS_REGION = "us-east-1";
    process.env.NOTIFICATION_OUTBOX_RETRY_BASE_SECONDS = "300";
    resendMocks.sendEmailMock.mockReset();
    resendMocks.verifyWebhookMock.mockReset();
    snsMocks.publishMock.mockReset();
    apnsMocks.sendMock.mockReset();
    __testUtils.resetResendAdapterCache();
    __testUtils.resetSnsAdapterCache();
    __testUtils.resetApnsAdapterCache();

    supabaseMocks.state.document_access_invites = [];
    supabaseMocks.state.invite_recipients = [];
    supabaseMocks.state.notification_jobs = [];
    supabaseMocks.state.notification_deliveries = [];
    supabaseMocks.state.notification_templates = [];
    supabaseMocks.state.device_push_tokens = [];
    supabaseMocks.state.outbound_message_events = [];
    supabaseMocks.state.nextEventId = 1;
    supabaseMocks.client.from.mockReset();
    supabaseMocks.client.from.mockImplementation(
      (table: keyof typeof supabaseMocks.state) => new FakeSupabaseQueryBuilder(table),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.RESEND_API_KEY;
    delete process.env.AWS_REGION;
    delete process.env.SNS_REGION;
    delete process.env.SNS_SMS_TYPE;
    delete process.env.SNS_SMS_SENDER_ID;
    delete process.env.NOTIFICATION_OUTBOX_RETRY_BASE_SECONDS;
    delete process.env.NOTIFICATION_SIGNATURE_FROM;
    delete process.env.NOTIFICATION_REPLY_TO;
  });

  it("maps a queued email delivery to the Resend send API and provider message id", async () => {
    resendMocks.sendEmailMock.mockResolvedValue({
      data: { id: "resend-msg-1" },
      error: null,
    });

    const adapter = __testUtils.buildResendAdapter();
    const result = await adapter.send({
      job: buildJob(),
      delivery: buildDelivery(),
      template: buildTemplate(),
      workerId: "worker-1",
      now: nowIso,
    } as any);

    expect(resendMocks.sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "DARCI Signatures <no-reply@darciregistry.com>",
        to: "Casey Signer <casey@example.com>",
        subject: "Ready for Casey",
        text: "Hi Casey, review here: https://app.example.test/review",
        replyTo: "support@darciregistry.com",
        tags: [
          { name: "template_key", value: "document_ready_for_review_email" },
          { name: "job_id", value: "job-1" },
          { name: "delivery_id", value: "delivery-1" },
        ],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        provider: "resend",
        providerMessageId: "resend-msg-1",
        deliveryStatus: "sent",
      }),
    );
    expect(result.events).toEqual([
      expect.objectContaining({
        eventType: "sent",
        eventAt: nowIso,
        payload: expect.objectContaining({ resendMessageId: "resend-msg-1" }),
      }),
    ]);
  });

  it("uses configured sender and reply-to addresses for Resend email", async () => {
    process.env.NOTIFICATION_SIGNATURE_FROM = "DARCI Staging <onboarding@resend.dev>";
    process.env.NOTIFICATION_REPLY_TO = "staging-support@example.com";
    resendMocks.sendEmailMock.mockResolvedValue({
      data: { id: "resend-msg-1" },
      error: null,
    });

    const adapter = __testUtils.buildResendAdapter();
    await adapter.send({
      job: buildJob(),
      delivery: buildDelivery(),
      template: buildTemplate(),
      workerId: "worker-1",
      now: nowIso,
    } as any);

    expect(resendMocks.sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "DARCI Staging <onboarding@resend.dev>",
        replyTo: "staging-support@example.com",
      }),
    );
  });

  it("surfaces Resend API failures as dispatch errors", async () => {
    resendMocks.sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Resend API unavailable" },
    });

    const adapter = __testUtils.buildResendAdapter();

    await expect(
      adapter.send({
        job: buildJob(),
        delivery: buildDelivery(),
        template: buildTemplate(),
        workerId: "worker-1",
        now: nowIso,
      } as any),
    ).rejects.toMatchObject({
      name: "NotificationProviderDispatchError",
      code: "resend_api_error",
      message: "Resend send failed from DARCI Signatures <no-reply@darciregistry.com>: Resend API unavailable",
    });
  });

  it("publishes queued SMS deliveries through SNS", async () => {
    process.env.SNS_SMS_SENDER_ID = "DARCI";
    snsMocks.publishMock.mockResolvedValue({ MessageId: "sns-msg-1" });

    const adapter = __testUtils.buildSnsAdapter();
    const result = await adapter.send({
      job: buildJob({
        channel: "sms",
        payload_json: { code: "123456" },
      }),
      delivery: buildDelivery({
        channel: "sms",
        recipient_address: "+15551234567",
        provider: "sns",
      }),
      template: buildTemplate({
        template_key: "auth_step_up_sms",
        channel: "sms",
        subject_template: null,
        body_template: "Your DARCi code is {{code}}.",
        body_format: "text",
      }),
      workerId: "worker-1",
      now: nowIso,
    } as any);

    expect(snsMocks.publishMock).toHaveBeenCalledWith({
      input: expect.objectContaining({
        PhoneNumber: "+15551234567",
        Message: "Your DARCi code is 123456.",
        MessageAttributes: expect.objectContaining({
          "AWS.SNS.SMS.SMSType": {
            DataType: "String",
            StringValue: "Transactional",
          },
          "AWS.SNS.SMS.SenderID": {
            DataType: "String",
            StringValue: "DARCI",
          },
        }),
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        provider: "sns",
        providerMessageId: "sns-msg-1",
        deliveryStatus: "sent",
      }),
    );
  });

  it("runs due Resend deliveries and leaves webhook completion to lifecycle events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    seedOutbox();
    resendMocks.sendEmailMock.mockResolvedValue({
      data: { id: "resend-msg-1" },
      error: null,
    });

    const result = await runDueNotificationJobs({ limit: 5, workerId: "worker-1" });

    expect(result).toEqual(
      expect.objectContaining({
        scannedCount: 1,
        claimedCount: 1,
        processedCount: 1,
      }),
    );
    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        jobId: "job-1",
        status: "sent",
        attemptedDeliveryCount: 1,
        deliveredCount: 0,
        failedCount: 0,
        completedAt: null,
      }),
    );
    expect(supabaseMocks.state.notification_deliveries[0]).toEqual(
      expect.objectContaining({
        status: "sent",
        provider: "resend",
        provider_message_id: "resend-msg-1",
        sent_at: nowIso,
        failed_at: null,
      }),
    );
    expect(supabaseMocks.state.outbound_message_events).toEqual([
      expect.objectContaining({
        notification_delivery_id: "delivery-1",
        event_type: "sent",
        provider: "resend",
        provider_event_id: null,
      }),
    ]);
  });

  it("runs due SNS SMS deliveries through the notification outbox", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    seedOutbox({
      job: {
        channel: "sms",
        payload_json: { code: "987654" },
      },
      delivery: {
        channel: "sms",
        recipient_address: "+15551234567",
        provider: "sns",
      },
      template: {
        template_key: "auth_step_up_sms",
        channel: "sms",
        subject_template: null,
        body_template: "Your DARCi code is {{code}}.",
        body_format: "text",
      },
    });
    snsMocks.publishMock.mockResolvedValue({ MessageId: "sns-msg-1" });

    const result = await runDueNotificationJobs({ limit: 5, workerId: "worker-1" });

    expect(result).toEqual(
      expect.objectContaining({
        scannedCount: 1,
        claimedCount: 1,
        processedCount: 1,
      }),
    );
    expect(snsMocks.publishMock).toHaveBeenCalledWith({
      input: expect.objectContaining({
        PhoneNumber: "+15551234567",
        Message: "Your DARCi code is 987654.",
      }),
    });
    expect(supabaseMocks.state.notification_deliveries[0]).toEqual(
      expect.objectContaining({
        status: "sent",
        provider: "sns",
        provider_message_id: "sns-msg-1",
        sent_at: nowIso,
        failed_at: null,
      }),
    );
    expect(supabaseMocks.state.outbound_message_events).toEqual([
      expect.objectContaining({
        notification_delivery_id: "delivery-1",
        event_type: "sent",
        provider: "sns",
        provider_event_id: null,
      }),
    ]);
  });

  it("runs due APNs push deliveries through the notification outbox", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    seedOutbox({
      job: {
        channel: "push",
        payload_json: {
          recipientName: "Casey",
          apnsData: {
            route: "member_request",
            requestId: "request-1",
            url: "https://example.test/sensitive",
            accessToken: "secret",
          },
        },
      },
      delivery: {
        channel: "push",
        recipient_address: null,
        provider: "apns",
        device_push_token_id: "push-token-1",
      },
      template: {
        template_key: "member_session_push",
        channel: "push",
        subject_template: "Session ready",
        body_template: "Hi {{recipientName}}, continue in DARCi.",
        body_format: "text",
      },
      devicePushToken: { id: "push-token-1" },
    });
    apnsMocks.sendMock.mockResolvedValue({ apnsId: "apns-msg-1", statusCode: 200 });

    const result = await runDueNotificationJobs({ limit: 5, workerId: "worker-1" });

    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        jobId: "job-1",
        status: "completed",
        attemptedDeliveryCount: 1,
        deliveredCount: 1,
        failedCount: 0,
      }),
    );
    expect(apnsMocks.sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceToken: "a".repeat(64),
        environment: "sandbox",
        topic: "com.illuminote.darci",
        collapseId: "job:doc-1",
        payload: expect.objectContaining({
          aps: {
            alert: { title: "Session ready", body: "Hi Casey, continue in DARCi." },
            sound: "default",
          },
          notificationId: "delivery-1",
          route: "member_request",
          requestId: "request-1",
        }),
      }),
    );
    expect(apnsMocks.sendMock.mock.calls[0]?.[0].payload).not.toHaveProperty("url");
    expect(apnsMocks.sendMock.mock.calls[0]?.[0].payload).not.toHaveProperty("accessToken");
    expect(supabaseMocks.state.notification_deliveries[0]).toEqual(
      expect.objectContaining({
        status: "accepted",
        provider: "apns",
        provider_message_id: "apns-msg-1",
        sent_at: nowIso,
        accepted_at: nowIso,
        delivered_at: null,
        failed_at: null,
      }),
    );
    expect(supabaseMocks.state.outbound_message_events).toEqual([
      expect.objectContaining({
        notification_delivery_id: "delivery-1",
        event_type: "accepted",
        provider: "apns",
      }),
    ]);
  });

  it("deactivates device tokens after permanent APNs token failures", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    seedOutbox({
      job: { channel: "push" },
      delivery: {
        channel: "push",
        recipient_address: null,
        provider: "apns",
        device_push_token_id: "push-token-1",
      },
      template: {
        template_key: "member_session_push",
        channel: "push",
        subject_template: "Session ready",
        body_template: "Continue in DARCi.",
        body_format: "text",
      },
      devicePushToken: { id: "push-token-1" },
    });
    apnsMocks.sendMock.mockRejectedValue(
      new apnsMocks.ApnsClientError("apns_BadDeviceToken", "APNs rejected notification: BadDeviceToken", {
        statusCode: 400,
        reason: "BadDeviceToken",
        permanentTokenFailure: true,
      }),
    );

    const result = await runDueNotificationJobs({ limit: 5, workerId: "worker-1" });

    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        status: "scheduled",
        attemptedDeliveryCount: 1,
        failedCount: 1,
        scheduledFor: "2026-04-29T12:05:00.000Z",
      }),
    );
    expect(supabaseMocks.state.device_push_tokens[0]).toEqual(
      expect.objectContaining({
        is_active: false,
        invalidated_at: nowIso,
        metadata: expect.objectContaining({
          invalidationReason: "BadDeviceToken",
          invalidatedBy: "apns_provider_adapter",
        }),
      }),
    );
    expect(supabaseMocks.state.notification_deliveries[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        error_code: "apns_BadDeviceToken",
        error_message: "APNs rejected notification: BadDeviceToken",
      }),
    );
  });

  it("syncs immediate Resend sent events to linked invite lifecycle state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    seedOutbox({
      job: {
        invite_id: "invite-1",
        job_kind: "invite",
      },
      delivery: {
        invite_recipient_id: "recipient-1",
      },
      invite: {
        status: "queued",
        sent_at: null,
      },
      inviteRecipient: {
        status: "queued",
      },
    });
    resendMocks.sendEmailMock.mockResolvedValue({
      data: { id: "resend-msg-1" },
      error: null,
    });

    await runDueNotificationJobs({ limit: 5, workerId: "worker-1" });

    expect(supabaseMocks.state.document_access_invites[0]).toEqual(
      expect.objectContaining({
        status: "sent",
        sent_at: nowIso,
      }),
    );
    expect(supabaseMocks.state.invite_recipients[0]).toEqual(
      expect.objectContaining({
        status: "sent",
        last_event_at: nowIso,
      }),
    );
  });

  it("schedules a retry when Resend dispatch fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    seedOutbox({
      job: {
        invite_id: "invite-1",
        job_kind: "invite",
      },
      delivery: {
        invite_recipient_id: "recipient-1",
      },
      invite: {
        status: "queued",
      },
      inviteRecipient: {
        status: "queued",
      },
    });
    resendMocks.sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Resend temporarily unavailable" },
    });

    const result = await runDueNotificationJobs({ limit: 5, workerId: "worker-1" });

    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        jobId: "job-1",
        status: "scheduled",
        attemptedDeliveryCount: 1,
        deliveredCount: 0,
        failedCount: 1,
        scheduledFor: "2026-04-29T12:05:00.000Z",
      }),
    );
    expect(supabaseMocks.state.notification_deliveries[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        error_code: "resend_api_error",
        error_message: "Resend send failed from DARCI Signatures <no-reply@darciregistry.com>: Resend temporarily unavailable",
        failed_at: nowIso,
      }),
    );
    expect(supabaseMocks.state.outbound_message_events).toEqual([
      expect.objectContaining({
        event_type: "failed",
        provider: "resend",
        payload: expect.objectContaining({ errorCode: "resend_api_error" }),
      }),
    ]);
    expect(supabaseMocks.state.document_access_invites[0]).toEqual(
      expect.objectContaining({
        status: "failed",
      }),
    );
    expect(supabaseMocks.state.invite_recipients[0]).toEqual(
      expect.objectContaining({
        status: "failed",
        last_event_at: nowIso,
      }),
    );
  });

  it("treats duplicate provider webhook event ids as idempotent", async () => {
    seedOutbox({
      job: {
        status: "sent",
        attempt_count: 1,
        last_attempt_at: nowIso,
      },
      delivery: {
        status: "sent",
        provider_message_id: "resend-msg-1",
        sent_at: nowIso,
      },
    });

    const firstResult = await recordNotificationDeliveryEvent({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-event-1",
      eventType: "delivered",
      eventAt: "2026-04-29T12:03:00.000Z",
      payload: { resendType: "email.delivered" },
      metadata: { source: "resend_webhook" },
    });
    const secondResult = await recordNotificationDeliveryEvent({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-event-1",
      eventType: "delivered",
      eventAt: "2026-04-29T12:03:00.000Z",
      payload: { resendType: "email.delivered" },
      metadata: { source: "resend_webhook" },
    });

    expect(firstResult).toEqual(
      expect.objectContaining({
        jobStatus: "completed",
        deliveryStatus: "delivered",
      }),
    );
    expect(secondResult).toEqual(firstResult);
    expect(supabaseMocks.state.outbound_message_events).toHaveLength(1);
    expect(supabaseMocks.state.outbound_message_events[0]).toEqual(
      expect.objectContaining({
        provider: "resend",
        provider_event_id: "svix-event-1",
        event_type: "delivered",
      }),
    );
  });

  it("syncs Resend delivery engagement events to linked invite lifecycle state", async () => {
    seedOutbox({
      job: {
        invite_id: "invite-1",
        status: "sent",
        attempt_count: 1,
        last_attempt_at: nowIso,
      },
      delivery: {
        invite_recipient_id: "recipient-1",
        status: "sent",
        provider_message_id: "resend-msg-1",
        sent_at: nowIso,
      },
      invite: {
        status: "queued",
        sent_at: null,
        first_opened_at: null,
        first_clicked_at: null,
      },
      inviteRecipient: {
        status: "queued",
      },
    });

    await recordNotificationDeliveryEvent({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-delivered",
      eventType: "delivered",
      eventAt: "2026-04-29T12:03:00.000Z",
      payload: { resendType: "email.delivered" },
      metadata: { source: "resend_webhook" },
    });

    expect(supabaseMocks.state.document_access_invites[0]).toEqual(
      expect.objectContaining({
        status: "sent",
        sent_at: "2026-04-29T12:03:00.000Z",
      }),
    );
    expect(supabaseMocks.state.invite_recipients[0]).toEqual(
      expect.objectContaining({
        status: "delivered",
        last_event_at: "2026-04-29T12:03:00.000Z",
      }),
    );

    await recordNotificationDeliveryEvent({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-opened",
      eventType: "opened",
      eventAt: "2026-04-29T12:04:00.000Z",
      payload: { resendType: "email.opened" },
      metadata: { source: "resend_webhook" },
    });

    await recordNotificationDeliveryEvent({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-clicked",
      eventType: "clicked",
      eventAt: "2026-04-29T12:05:00.000Z",
      payload: { resendType: "email.clicked" },
      metadata: { source: "resend_webhook" },
    });

    expect(supabaseMocks.state.document_access_invites[0]).toEqual(
      expect.objectContaining({
        status: "opened",
        sent_at: "2026-04-29T12:03:00.000Z",
        first_opened_at: "2026-04-29T12:04:00.000Z",
        first_clicked_at: "2026-04-29T12:05:00.000Z",
      }),
    );
    expect(supabaseMocks.state.document_access_invites[0].metadata.latestNotificationEvent).toEqual(
      expect.objectContaining({
        deliveryId: "delivery-1",
        provider: "resend",
        providerMessageId: "resend-msg-1",
        providerEventId: "svix-clicked",
        eventType: "clicked",
        eventAt: "2026-04-29T12:05:00.000Z",
      }),
    );
    expect(supabaseMocks.state.invite_recipients[0]).toEqual(
      expect.objectContaining({
        status: "clicked",
        last_event_at: "2026-04-29T12:05:00.000Z",
      }),
    );
  });

  it("syncs Resend failure events to linked invite failure metadata", async () => {
    seedOutbox({
      job: {
        invite_id: "invite-1",
        status: "sent",
        attempt_count: 1,
        last_attempt_at: nowIso,
      },
      delivery: {
        invite_recipient_id: "recipient-1",
        status: "sent",
        provider_message_id: "resend-msg-1",
        sent_at: nowIso,
      },
      invite: {
        status: "sent",
        sent_at: nowIso,
      },
      inviteRecipient: {
        status: "sent",
      },
    });

    await recordNotificationDeliveryEvent({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-bounced",
      eventType: "bounced",
      eventAt: "2026-04-29T12:06:00.000Z",
      payload: { resendType: "email.bounced", bounce: { type: "hard_bounce" } },
      metadata: { source: "resend_webhook" },
    });

    expect(supabaseMocks.state.document_access_invites[0]).toEqual(
      expect.objectContaining({
        status: "failed",
      }),
    );
    expect(supabaseMocks.state.invite_recipients[0]).toEqual(
      expect.objectContaining({
        status: "bounced",
        last_event_at: "2026-04-29T12:06:00.000Z",
      }),
    );
    expect(supabaseMocks.state.invite_recipients[0].metadata.latestDeliveryIssue).toEqual(
      expect.objectContaining({
        deliveryId: "delivery-1",
        provider: "resend",
        providerEventId: "svix-bounced",
        eventType: "bounced",
      }),
    );
  });

  it("keeps delayed Resend delivery events as invite metadata without failing the invite", async () => {
    seedOutbox({
      job: {
        invite_id: "invite-1",
        status: "sent",
        attempt_count: 1,
        last_attempt_at: nowIso,
      },
      delivery: {
        invite_recipient_id: "recipient-1",
        status: "sent",
        provider_message_id: "resend-msg-1",
        sent_at: nowIso,
      },
      invite: {
        status: "sent",
        sent_at: nowIso,
      },
      inviteRecipient: {
        status: "sent",
      },
    });

    await recordNotificationDeliveryEvent({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-delayed",
      eventType: "deferred",
      eventAt: "2026-04-29T12:07:00.000Z",
      payload: { resendType: "email.delivery_delayed" },
      metadata: { source: "resend_webhook" },
    });

    expect(supabaseMocks.state.document_access_invites[0]).toEqual(
      expect.objectContaining({
        status: "sent",
      }),
    );
    expect(supabaseMocks.state.invite_recipients[0]).toEqual(
      expect.objectContaining({
        status: "sent",
        last_event_at: "2026-04-29T12:07:00.000Z",
      }),
    );
    expect(supabaseMocks.state.document_access_invites[0].metadata.latestDeliveryIssue).toEqual(
      expect.objectContaining({
        providerEventId: "svix-delayed",
        eventType: "deferred",
      }),
    );
  });
});
