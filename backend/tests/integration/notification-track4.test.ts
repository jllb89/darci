import request from "supertest";
import jwt from "jsonwebtoken";
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

const mocks = vi.hoisted(() => ({
  listNotificationJobsMock: vi.fn(),
  getNotificationJobDetailMock: vi.fn(),
  runDueNotificationJobsMock: vi.fn(),
  recordNotificationDeliveryEventMock: vi.fn(),
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

vi.mock("../../src/services/notificationOutboxService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notificationOutboxService")>(
    "../../src/services/notificationOutboxService",
  );

  return {
    ...actual,
    listNotificationJobs: mocks.listNotificationJobsMock,
    getNotificationJobDetail: mocks.getNotificationJobDetailMock,
    runDueNotificationJobs: mocks.runDueNotificationJobsMock,
    recordNotificationDeliveryEvent: mocks.recordNotificationDeliveryEventMock,
  };
});

vi.mock("../../src/services/userRoleService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/userRoleService")>(
    "../../src/services/userRoleService",
  );

  return {
    ...actual,
    getUserIdentityContextBySupabaseId:
      mocks.getUserIdentityContextBySupabaseIdMock,
  };
});

import { app } from "../../src/index";

const signToken = (payload: {
  sub: string;
  app_metadata?: { role?: string };
}) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

describe("Track 4 notification routes", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.listNotificationJobsMock.mockReset();
    mocks.getNotificationJobDetailMock.mockReset();
    mocks.runDueNotificationJobsMock.mockReset();
    mocks.recordNotificationDeliveryEventMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockReset();
    mocks.getUserIdentityContextBySupabaseIdMock.mockImplementation(
      async (supabaseUserId: string) => {
        const identities = {
          "admin-1": {
            id: "admin-db-1",
            supabaseUserId,
            email: "admin@example.com",
            role: "admin",
            status: "active",
            firstName: "Ada",
            lastName: "Admin",
            availableRoles: ["admin"],
            roleAssignments: [],
          },
        } as const;

        return identities[supabaseUserId as keyof typeof identities] ?? null;
      },
    );
  });

  it("lists notification jobs for admin observability", async () => {
    mocks.listNotificationJobsMock.mockResolvedValue({
      jobs: [
        {
          id: "job-1",
          templateId: "template-1",
          templateKey: "notary_next_step_email",
          jobKind: "notary_code",
          channel: "email",
          status: "queued",
          priority: "normal",
          scheduledFor: "2026-04-22T12:00:00.000Z",
          processingStartedAt: null,
          completedAt: null,
          lastAttemptAt: null,
          attemptCount: 0,
          dedupeKey: "notary_next_step:req-1",
          documentId: "doc-1",
          notarizationRequestId: "req-1",
          inviteId: null,
          requestedByUserId: "member-db-1",
          createdAt: "2026-04-22T12:00:00.000Z",
          updatedAt: "2026-04-22T12:00:00.000Z",
          deliveryCounts: {
            total: 1,
            queued: 1,
            sent: 0,
            delivered: 0,
            failed: 0,
            suppressed: 0,
          },
        },
      ],
      page: {
        limit: 10,
        offset: 5,
        total: 1,
      },
    });

    const response = await request(app)
      .get("/admin/notification-jobs?status=queued&channel=email&limit=10&offset=5")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "admin-1", app_metadata: { role: "admin" } })}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.jobs).toHaveLength(1);
    expect(mocks.listNotificationJobsMock).toHaveBeenCalledWith({
      status: "queued",
      channel: "email",
      limit: 10,
      offset: 5,
    });
  });

  it("gets a notification job detail payload", async () => {
    mocks.getNotificationJobDetailMock.mockResolvedValue({
      job: {
        id: "job-1",
        templateId: "template-1",
        templateKey: "notary_next_step_email",
        jobKind: "notary_code",
        channel: "email",
        status: "completed",
        priority: "normal",
        scheduledFor: "2026-04-22T12:00:00.000Z",
        processingStartedAt: null,
        completedAt: "2026-04-22T12:01:00.000Z",
        lastAttemptAt: "2026-04-22T12:01:00.000Z",
        attemptCount: 1,
        dedupeKey: "notary_next_step:req-1",
        documentId: "doc-1",
        notarizationRequestId: "req-1",
        inviteId: null,
        requestedByUserId: "member-db-1",
        createdAt: "2026-04-22T12:00:00.000Z",
        updatedAt: "2026-04-22T12:01:00.000Z",
        deliveryCounts: {
          total: 1,
          queued: 0,
          sent: 0,
          delivered: 1,
          failed: 0,
          suppressed: 0,
        },
        billingPaymentRequestId: null,
        canceledAt: null,
        payload: { hello: "world" },
        metadata: { source: "test" },
      },
      deliveries: [],
      events: [],
    });

    const response = await request(app)
      .get("/admin/notification-jobs/job-1")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "admin-1", app_metadata: { role: "admin" } })}`,
      );

    expect(response.status).toBe(200);
    expect(response.body.job.id).toBe("job-1");
    expect(mocks.getNotificationJobDetailMock).toHaveBeenCalledWith("job-1");
  });

  it("runs due notification jobs through the internal worker route", async () => {
    mocks.runDueNotificationJobsMock.mockResolvedValue({
      scannedCount: 1,
      claimedCount: 1,
      processedCount: 1,
      jobs: [
        {
          jobId: "job-1",
          status: "completed",
          attemptedDeliveryCount: 1,
          deliveredCount: 1,
          failedCount: 0,
          scheduledFor: null,
          completedAt: "2026-04-22T12:01:00.000Z",
        },
      ],
    });

    const response = await request(app)
      .post("/internal/notification-jobs/run-due")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "service-role-1", app_metadata: { role: "service_role" } })}`,
      )
      .send({ limit: 3 });

    expect(response.status).toBe(200);
    expect(response.body.processedCount).toBe(1);
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 3,
      workerId: "service-role-1",
    });
  });

  it("records provider delivery events through the internal worker route", async () => {
    mocks.recordNotificationDeliveryEventMock.mockResolvedValue({
      jobId: "job-1",
      jobStatus: "completed",
      deliveryId: "delivery-1",
      deliveryStatus: "delivered",
    });

    const response = await request(app)
      .post("/internal/notification-deliveries/delivery-1/events")
      .set(
        "Authorization",
        `Bearer ${signToken({ sub: "service-role-1", app_metadata: { role: "service_role" } })}`,
      )
      .send({
        provider: "internal",
        eventType: "delivered",
        providerEventId: "provider-msg-1",
        eventAt: "2026-04-22T12:05:00.000Z",
        payload: { ok: true },
        metadata: { source: "test" },
      });

    expect(response.status).toBe(200);
    expect(response.body.deliveryStatus).toBe("delivered");
    expect(mocks.recordNotificationDeliveryEventMock).toHaveBeenCalledWith({
      deliveryId: "delivery-1",
      provider: "internal",
      eventType: "delivered",
      providerEventId: "provider-msg-1",
      eventAt: "2026-04-22T12:05:00.000Z",
      payload: { ok: true },
      metadata: { source: "test" },
    });
  });
});