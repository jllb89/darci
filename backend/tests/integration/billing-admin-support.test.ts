import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reverseUsage: vi.fn(),
  releaseDocument: vi.fn(),
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
});
