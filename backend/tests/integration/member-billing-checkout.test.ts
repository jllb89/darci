import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkout: vi.fn(),
  planChange: vi.fn(),
  portal: vi.fn(),
  status: vi.fn(),
}));

vi.mock("../../src/services/memberBillingService", () => ({
  createMemberMembershipCheckout: mocks.checkout,
  changeMemberMembershipPlan: mocks.planChange,
  createMemberCustomerPortalSession: mocks.portal,
  getMemberMembershipStatus: mocks.status,
  MemberBillingServiceError: class MemberBillingServiceError extends Error {
    constructor(
      public statusCode: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import billingRoutes from "../../src/routes/billing";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "auth-user-1", dbUserId: "db-user-1", role: "member", status: "active" };
    next();
  });
  app.use("/billing", billingRoutes);
  return app;
};

describe("member membership Checkout API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts only an internal allowlisted price code and idempotency token", async () => {
    mocks.checkout.mockResolvedValue({
      orderId: "order-1",
      checkoutSessionId: "cs_test_1",
      checkoutUrl: "https://checkout.stripe.com/test",
      expiresAt: "2026-08-27T00:00:00.000Z",
      reused: false,
    });

    const response = await request(buildApp())
      .post("/billing/member-membership/checkout")
      .send({
        priceCode: "member_plus_monthly",
        idempotencyToken: "checkout-request-0001",
      });

    expect(response.status).toBe(201);
    expect(mocks.checkout).toHaveBeenCalledWith({
      dbUserId: "db-user-1",
      priceCode: "member_plus_monthly",
      idempotencyKey: "checkout-request-0001",
    });
  });

  it("returns the server-authoritative membership and allowance status", async () => {
    mocks.status.mockResolvedValue({
      providerEnvironment: "test",
      paymentsReal: false,
      enforcementMode: "observe",
      plans: [],
      membership: {
        state: "active",
        allowance: { total: 10, used: 4, remaining: 6, exhausted: false },
      },
      eligibility: { canCreateWorkflow: true, reasonCode: "billing_allowed" },
    });

    const response = await request(buildApp()).get("/billing/member-membership");

    expect(response.status).toBe(200);
    expect(response.body.membership.allowance.remaining).toBe(6);
    expect(mocks.status).toHaveBeenCalledWith({ dbUserId: "db-user-1" });
  });

  it("rejects client-supplied provider prices, amounts, or unknown plans", async () => {
    const response = await request(buildApp())
      .post("/billing/member-membership/checkout")
      .send({
        priceCode: "price_unsafe",
        idempotencyToken: "checkout-request-0002",
        amount: 1,
        providerPriceId: "price_test_override",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("creates Portal sessions only for the authenticated DARCi profile", async () => {
    mocks.portal.mockResolvedValue({ portalUrl: "https://billing.stripe.com/test" });
    const response = await request(buildApp())
      .post("/billing/customer-portal-session")
      .send({});

    expect(response.status).toBe(201);
    expect(mocks.portal).toHaveBeenCalledWith({ dbUserId: "db-user-1" });
  });

  it("accepts only a server-catalog plan change for an existing member subscription", async () => {
    mocks.planChange.mockResolvedValue({
      changeType: "upgrade",
      status: "pending_webhook",
      currentPriceCode: "member_starter_monthly",
      targetPriceCode: "member_plus_monthly",
      effectiveAt: null,
    });

    const response = await request(buildApp())
      .post("/billing/member-membership/plan-change")
      .send({
        targetPriceCode: "member_plus_monthly",
        idempotencyToken: "plan-change-request-0001",
      });

    expect(response.status).toBe(202);
    expect(mocks.planChange).toHaveBeenCalledWith({
      dbUserId: "db-user-1",
      targetPriceCode: "member_plus_monthly",
      idempotencyKey: "plan-change-request-0001",
    });
  });

  it("rejects provider IDs and amounts from plan-change requests", async () => {
    const response = await request(buildApp())
      .post("/billing/member-membership/plan-change")
      .send({
        targetPriceCode: "member_volume_monthly",
        idempotencyToken: "plan-change-request-0002",
        providerPriceId: "price_override",
        amount: 1,
      });

    expect(response.status).toBe(400);
    expect(mocks.planChange).not.toHaveBeenCalled();
  });

  it("does not expose member Checkout from a notary workspace", async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: "auth-notary-1", dbUserId: "db-notary-1", role: "notary", status: "active" };
      next();
    });
    app.use("/billing", billingRoutes);

    const response = await request(app)
      .post("/billing/member-membership/checkout")
      .send({
        priceCode: "member_starter_monthly",
        idempotencyToken: "checkout-request-notary",
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("member_billing_context_required");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
