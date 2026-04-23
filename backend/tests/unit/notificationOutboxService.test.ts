import { describe, expect, it } from "vitest";
import {
  __testUtils,
  deriveNotificationJobStatus,
  getNotificationRetryDelaySeconds,
  mapOutboundEventToDeliveryPatch,
} from "../../src/services/notificationOutboxService";

describe("notificationOutboxService", () => {
  it("marks a job completed when all deliveries have terminal success statuses", () => {
    const result = deriveNotificationJobStatus({
      deliveries: [{ status: "delivered" }, { status: "opened" }, { status: "accepted" }],
      attemptCount: 1,
      maxAttempts: 3,
    });

    expect(result.status).toBe("completed");
    expect(result.shouldRetry).toBe(false);
    expect(result.isTerminal).toBe(true);
  });

  it("schedules a retry when failures remain and attempts are still available", () => {
    const result = deriveNotificationJobStatus({
      deliveries: [{ status: "delivered" }, { status: "failed" }],
      attemptCount: 1,
      maxAttempts: 3,
    });

    expect(result.status).toBe("scheduled");
    expect(result.shouldRetry).toBe(true);
    expect(result.isTerminal).toBe(false);
  });

  it("marks a job partially sent when mixed results are exhausted", () => {
    const result = deriveNotificationJobStatus({
      deliveries: [{ status: "sent" }, { status: "failed" }],
      attemptCount: 3,
      maxAttempts: 3,
    });

    expect(result.status).toBe("partially_sent");
    expect(result.shouldRetry).toBe(false);
    expect(result.isTerminal).toBe(true);
  });

  it("maps delivery events into status and timestamp updates", () => {
    const patch = mapOutboundEventToDeliveryPatch({
      delivery: {
        status: "sent",
        sent_at: "2026-04-22T10:00:00.000Z",
        delivered_at: null,
        failed_at: null,
        bounced_at: null,
        opened_at: null,
        clicked_at: null,
        accepted_at: null,
      },
      eventType: "opened",
      eventAt: "2026-04-22T10:05:00.000Z",
    });

    expect(patch.status).toBe("opened");
    expect(patch.delivered_at).toBe("2026-04-22T10:05:00.000Z");
    expect(patch.opened_at).toBe("2026-04-22T10:05:00.000Z");
  });

  it("backs off exponentially for retries", () => {
    expect(getNotificationRetryDelaySeconds(1)).toBe(300);
    expect(getNotificationRetryDelaySeconds(2)).toBe(600);
    expect(getNotificationRetryDelaySeconds(3)).toBe(1200);
  });

  it("computes observability metrics with invite-specific counters", () => {
    const metrics = __testUtils.computeNotificationJobsMetrics({
      jobs: [
        {
          id: "job-invite-1",
          template_id: null,
          invite_id: "invite-1",
          document_id: "doc-1",
          billing_payment_request_id: null,
          notarization_request_id: null,
          requested_by_user_id: "user-1",
          job_kind: "document_invite",
          channel: "email",
          status: "queued",
          priority: "normal",
          dedupe_key: null,
          scheduled_for: "2026-04-23T10:00:00.000Z",
          processing_started_at: null,
          completed_at: null,
          canceled_at: null,
          last_attempt_at: null,
          attempt_count: 0,
          payload_json: {},
          metadata: {},
          created_at: "2026-04-23T10:00:00.000Z",
          updated_at: "2026-04-23T10:00:00.000Z",
        },
        {
          id: "job-other-1",
          template_id: null,
          invite_id: null,
          document_id: null,
          billing_payment_request_id: null,
          notarization_request_id: null,
          requested_by_user_id: "user-2",
          job_kind: "billing_receipt",
          channel: "email",
          status: "completed",
          priority: "normal",
          dedupe_key: null,
          scheduled_for: "2026-04-23T10:00:00.000Z",
          processing_started_at: null,
          completed_at: "2026-04-23T10:01:00.000Z",
          canceled_at: null,
          last_attempt_at: "2026-04-23T10:01:00.000Z",
          attempt_count: 1,
          payload_json: {},
          metadata: {},
          created_at: "2026-04-23T10:00:00.000Z",
          updated_at: "2026-04-23T10:01:00.000Z",
        },
      ],
      deliveries: [
        {
          id: "delivery-1",
          notification_job_id: "job-invite-1",
          invite_recipient_id: "recipient-1",
          target_user_id: null,
          channel: "email",
          recipient_address: "first@example.com",
          recipient_display_name: "First",
          provider: "internal",
          provider_message_id: null,
          status: "queued",
          attempt_number: 0,
          queued_at: "2026-04-23T10:00:00.000Z",
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
          created_at: "2026-04-23T10:00:00.000Z",
          updated_at: "2026-04-23T10:00:00.000Z",
        },
        {
          id: "delivery-2",
          notification_job_id: "job-other-1",
          invite_recipient_id: null,
          target_user_id: "user-2",
          channel: "email",
          recipient_address: "second@example.com",
          recipient_display_name: "Second",
          provider: "internal",
          provider_message_id: "provider-2",
          status: "delivered",
          attempt_number: 1,
          queued_at: "2026-04-23T10:00:00.000Z",
          sent_at: "2026-04-23T10:00:30.000Z",
          delivered_at: "2026-04-23T10:01:00.000Z",
          failed_at: null,
          bounced_at: null,
          opened_at: null,
          clicked_at: null,
          accepted_at: null,
          error_code: null,
          error_message: null,
          metadata: {},
          created_at: "2026-04-23T10:00:00.000Z",
          updated_at: "2026-04-23T10:01:00.000Z",
        },
      ],
      windowHours: 24,
      generatedAt: "2026-04-23T12:00:00.000Z",
    });

    expect(metrics.jobs.total).toBe(2);
    expect(metrics.jobs.byStatus.queued).toBe(1);
    expect(metrics.jobs.byStatus.completed).toBe(1);
    expect(metrics.jobs.inviteJobs).toBe(1);
    expect(metrics.jobs.inviteJobsByStatus.queued).toBe(1);

    expect(metrics.deliveries.total).toBe(2);
    expect(metrics.deliveries.byStatus.queued).toBe(1);
    expect(metrics.deliveries.byStatus.delivered).toBe(1);
    expect(metrics.deliveries.inviteDeliveries).toBe(1);
    expect(metrics.deliveries.inviteDeliveriesByStatus.queued).toBe(1);
  });
});