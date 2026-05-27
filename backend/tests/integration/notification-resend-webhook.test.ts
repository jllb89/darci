import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = "http://localhost";
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  }

  if (!process.env.SUPABASE_JWT_SECRET) {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
  }
});

const resendMocks = vi.hoisted(() => ({
  verifyWebhookMock: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    webhooks: {
      verify: resendMocks.verifyWebhookMock,
    },
  })),
}));

const serviceMocks = vi.hoisted(() => ({
  recordNotificationDeliveryEventMock: vi.fn(),
  recordNotificationDeliveryEventByProviderMessageIdMock: vi.fn(),
}));

vi.mock("../../src/services/notificationOutboxService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notificationOutboxService")>(
    "../../src/services/notificationOutboxService",
  );

  return {
    ...actual,
    recordNotificationDeliveryEvent: serviceMocks.recordNotificationDeliveryEventMock,
    recordNotificationDeliveryEventByProviderMessageId:
      serviceMocks.recordNotificationDeliveryEventByProviderMessageIdMock,
  };
});

import { app } from "../../src/index";
import { NotificationOutboxServiceError } from "../../src/services/notificationOutboxService";

const postResendWebhook = (body: string) => {
  return request(app)
    .post("/webhooks/resend")
    .set("Content-Type", "application/json")
    .set("svix-id", "svix-event-1")
    .set("svix-timestamp", "1714392000")
    .set("svix-signature", "v1,test-signature")
    .send(body);
};

describe("Resend webhook ingestion", () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    process.env.RESEND_API_KEY = "re_test";
    resendMocks.verifyWebhookMock.mockReset();
    serviceMocks.recordNotificationDeliveryEventMock.mockReset();
    serviceMocks.recordNotificationDeliveryEventByProviderMessageIdMock.mockReset();
  });

  it("rejects unsigned webhook requests before processing", async () => {
    const response = await request(app)
      .post("/webhooks/resend")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "email.delivered" }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    expect(resendMocks.verifyWebhookMock).not.toHaveBeenCalled();
  });

  it("verifies raw payloads and records tagged delivery lifecycle events", async () => {
    const rawBody = JSON.stringify({ type: "email.delivered", data: { email_id: "resend-msg-1" } });
    resendMocks.verifyWebhookMock.mockReturnValue({
      type: "email.delivered",
      created_at: "2026-04-29T12:03:00.000Z",
      data: {
        email_id: "resend-msg-1",
        to: ["casey@example.com"],
        from: "DARCI Signatures <no-reply@darciregistry.com>",
        subject: "Ready for review",
        tags: {
          delivery_id: "delivery-1",
          job_id: "job-1",
        },
      },
    });
    serviceMocks.recordNotificationDeliveryEventMock.mockResolvedValue({
      jobId: "job-1",
      jobStatus: "completed",
      deliveryId: "delivery-1",
      deliveryStatus: "delivered",
    });

    const response = await postResendWebhook(rawBody);

    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
    expect(resendMocks.verifyWebhookMock).toHaveBeenCalledWith({
      webhookSecret: "whsec_test",
      payload: rawBody,
      headers: {
        id: "svix-event-1",
        timestamp: "1714392000",
        signature: "v1,test-signature",
      },
    });
    expect(serviceMocks.recordNotificationDeliveryEventMock).toHaveBeenCalledWith({
      deliveryId: "delivery-1",
      provider: "resend",
      providerMessageId: "resend-msg-1",
      providerEventId: "svix-event-1",
      eventType: "delivered",
      eventAt: "2026-04-29T12:03:00.000Z",
      payload: expect.objectContaining({
        resendType: "email.delivered",
        emailId: "resend-msg-1",
        to: ["casey@example.com"],
        subject: "Ready for review",
      }),
      metadata: {
        source: "resend_webhook",
        svixId: "svix-event-1",
        svixTimestamp: "1714392000",
      },
    });
    expect(serviceMocks.recordNotificationDeliveryEventByProviderMessageIdMock).not.toHaveBeenCalled();
  });

  it("falls back to provider_message_id when a delivery_id tag is absent", async () => {
    resendMocks.verifyWebhookMock.mockReturnValue({
      type: "email.bounced",
      created_at: "2026-04-29T12:04:00.000Z",
      data: {
        email_id: "resend-msg-2",
        to: ["bad@example.com"],
        bounce: {
          type: "hard_bounce",
        },
      },
    });
    serviceMocks.recordNotificationDeliveryEventByProviderMessageIdMock.mockResolvedValue({
      jobId: "job-2",
      jobStatus: "failed",
      deliveryId: "delivery-2",
      deliveryStatus: "bounced",
    });

    const response = await postResendWebhook(JSON.stringify({ type: "email.bounced" }));

    expect(response.status).toBe(200);
    expect(serviceMocks.recordNotificationDeliveryEventByProviderMessageIdMock).toHaveBeenCalledWith({
      provider: "resend",
      providerMessageId: "resend-msg-2",
      providerEventId: "svix-event-1",
      eventType: "bounced",
      eventAt: "2026-04-29T12:04:00.000Z",
      payload: expect.objectContaining({
        resendType: "email.bounced",
        emailId: "resend-msg-2",
        bounce: { type: "hard_bounce" },
      }),
      metadata: {
        source: "resend_webhook",
        svixId: "svix-event-1",
        svixTimestamp: "1714392000",
      },
    });
  });

  it("acknowledges unmatched provider_message_id events without retry storms", async () => {
    resendMocks.verifyWebhookMock.mockReturnValue({
      type: "email.delivered",
      created_at: "2026-04-29T12:05:00.000Z",
      data: {
        email_id: "unknown-resend-msg",
      },
    });
    serviceMocks.recordNotificationDeliveryEventByProviderMessageIdMock.mockResolvedValue(null);

    const response = await postResendWebhook(JSON.stringify({ type: "email.delivered" }));

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      received: true,
      ignored: true,
      reason: "No notification delivery matched provider_message_id unknown-resend-msg",
    });
  });

  it("acknowledges stale delivery_id tagged events without disabling provider webhooks", async () => {
    resendMocks.verifyWebhookMock.mockReturnValue({
      type: "email.delivered",
      created_at: "2026-05-20T17:42:00.000Z",
      data: {
        email_id: "resend-msg-stale-delivery",
        tags: {
          delivery_id: "missing-delivery-id",
        },
      },
    });
    serviceMocks.recordNotificationDeliveryEventMock.mockRejectedValue(
      new NotificationOutboxServiceError(404, "Notification delivery not found"),
    );

    const response = await postResendWebhook(JSON.stringify({ type: "email.delivered" }));

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      received: true,
      ignored: true,
      reason: "Notification delivery not found",
    });
  });

  it("ignores unhandled Resend event types after signature verification", async () => {
    resendMocks.verifyWebhookMock.mockReturnValue({
      type: "domain.created",
      created_at: "2026-04-29T12:05:00.000Z",
      data: {},
    });

    const response = await postResendWebhook(JSON.stringify({ type: "domain.created" }));

    expect(response.status).toBe(202);
    expect(response.body.ignored).toBe(true);
    expect(serviceMocks.recordNotificationDeliveryEventMock).not.toHaveBeenCalled();
    expect(serviceMocks.recordNotificationDeliveryEventByProviderMessageIdMock).not.toHaveBeenCalled();
  });

  it("rejects invalid signatures", async () => {
    resendMocks.verifyWebhookMock.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await postResendWebhook(JSON.stringify({ type: "email.delivered" }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_signature");
  });
});
