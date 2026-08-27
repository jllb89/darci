import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reverseUsage: vi.fn(),
  releaseDocument: vi.fn(),
  operations: vi.fn(),
  lifecycle: vi.fn(),
  replayWebhook: vi.fn(),
  resyncSubscription: vi.fn(),
  retryReleases: vi.fn(),
  retention: vi.fn(),
}));

vi.mock("../../src/services/billingPolicyService", () => ({
  BillingPolicyError: class BillingPolicyError extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  reverseMemberWorkflowUsage: mocks.reverseUsage,
  forceReleaseBillingHeldDocument: mocks.releaseDocument,
}));

vi.mock("../../src/services/billingOperationsService", () => ({
  BillingOperationsError: class BillingOperationsError extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
  getBillingOperationsReport: mocks.operations,
  getBillingLifecycleAcceptanceReport: mocks.lifecycle,
  replayStripeWebhookForAdmin: mocks.replayWebhook,
  resyncStripeSubscriptionForAdmin: mocks.resyncSubscription,
  retryBillingHeldReleasesForAdmin: mocks.retryReleases,
  runStripeWebhookRetentionCleanup: mocks.retention,
}));

import adminRoutes from "../../src/routes/admin";

const buildApp = (authTime: number) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = {
      id: "auth-admin-1",
      dbUserId: "00000000-0000-4000-8000-000000000101",
      role: "admin",
      status: "active",
      rawClaims: { auth_time: authTime },
    };
    next();
  });
  app.use("/admin", adminRoutes);
  return app;
};

describe("billing admin support actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lifecycle.mockResolvedValue({ complete: false, passedCount: 0, totalCount: 15, checks: [] });
  });

  it("reverses usage with a recent admin reauthentication and audit inputs", async () => {
    mocks.reverseUsage.mockResolvedValue({ usage_event_id: "usage-1", was_already_reversed: false });
    const response = await request(buildApp(Math.floor(Date.now() / 1000)))
      .post("/admin/billing/usage-events/00000000-0000-4000-8000-000000000201/reverse")
      .send({ reason: "Customer support correction", idempotencyKey: "support-reversal-0001" });

    expect(response.status).toBe(200);
    expect(mocks.reverseUsage).toHaveBeenCalledWith({
      usageEventId: "00000000-0000-4000-8000-000000000201",
      idempotencyKey: "support-reversal-0001",
      reason: "Customer support correction",
      actorUserId: "00000000-0000-4000-8000-000000000101",
    });
  });

  it("rejects support overrides when the admin authentication is stale", async () => {
    const staleAuthTime = Math.floor(Date.now() / 1000) - (16 * 60);
    const response = await request(buildApp(staleAuthTime))
      .post("/admin/billing/documents/00000000-0000-4000-8000-000000000301/release")
      .send({ reason: "Approved package release" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("recent_reauthentication_required");
    expect(mocks.releaseDocument).not.toHaveBeenCalled();
  });

  it("returns the provider-backed reconciliation report to admins", async () => {
    mocks.operations.mockResolvedValue({
      enforcementMode: "observe",
      readiness: { blockingIssueCount: 0, enforcementReady: false },
      issues: [],
    });
    const response = await request(buildApp(0))
      .get("/admin/billing/operations?includeProvider=true&webhookLimit=75");

    expect(response.status).toBe(200);
    expect(response.body.enforcementMode).toBe("observe");
    expect(mocks.operations).toHaveBeenCalledWith({ includeProvider: true, webhookLimit: 75 });
  });

  it("replays a stored webhook with a recent admin reauthentication", async () => {
    mocks.replayWebhook.mockResolvedValue({ replayId: "replay-1", result: { outcome: "processed" } });
    const response = await request(buildApp(Math.floor(Date.now() / 1000)))
      .post("/admin/billing/webhook-events/00000000-0000-4000-8000-000000000401/replay")
      .send({ reason: "Recover failed Stripe fulfillment" });

    expect(response.status).toBe(200);
    expect(mocks.replayWebhook).toHaveBeenCalledWith({
      storedEventId: "00000000-0000-4000-8000-000000000401",
      actorUserId: "00000000-0000-4000-8000-000000000101",
      reason: "Recover failed Stripe fulfillment",
    });
  });

  it("resynchronizes a subscription through the narrow support endpoint", async () => {
    mocks.resyncSubscription.mockResolvedValue({ internalSubscriptionId: "sub-internal-1" });
    const response = await request(buildApp(Math.floor(Date.now() / 1000)))
      .post("/admin/billing/subscriptions/00000000-0000-4000-8000-000000000501/resync")
      .send({ reason: "Repair subscription state drift" });

    expect(response.status).toBe(200);
    expect(mocks.resyncSubscription).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: "00000000-0000-4000-8000-000000000501",
      reason: "Repair subscription state drift",
    }));
  });

  it("requires recent reauthentication for retention cleanup", async () => {
    const response = await request(buildApp(Math.floor(Date.now() / 1000) - (16 * 60)))
      .post("/admin/billing/webhook-retention/cleanup")
      .send({ reason: "Scheduled retention cleanup", limit: 100 });

    expect(response.status).toBe(403);
    expect(mocks.retention).not.toHaveBeenCalled();
  });
});
