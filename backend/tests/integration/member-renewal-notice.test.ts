import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ notice: vi.fn() }));
vi.mock("../../src/services/memberRenewalNoticeService", () => ({ getMemberRenewalNotice: mocks.notice }));
vi.mock("../../src/services/memberBillingService", () => ({
  createMemberCustomerPortalSession: vi.fn(), createMemberMembershipCheckout: vi.fn(), changeMemberMembershipPlan: vi.fn(), getMemberMembershipStatus: vi.fn(),
  MemberBillingServiceError: class extends Error {},
}));
import routes from "../../src/routes/billing";
const app = (role?: string) => {
  const instance = express();
  instance.use((req, _res, next) => { if (role) req.user = { dbUserId: "signed-in-owner", role } as any; next(); });
  instance.use("/billing", routes);
  return instance;
};
beforeEach(() => vi.resetAllMocks());
describe("renewal reminder API authorization", () => {
  it.each([undefined, "notary", "admin"])("rejects missing/non-member context %s", async role => {
    await request(app(role)).get("/billing/member-membership/renewal-notice").expect(403);
    expect(mocks.notice).not.toHaveBeenCalled();
  });
  it.each(["member", "pro"])("returns only the authenticated %s context with no-store caching", async role => {
    mocks.notice.mockResolvedValue(null);
    const response = await request(app(role)).get("/billing/member-membership/renewal-notice?ownerUserId=someone-else").expect(200);
    expect(response.body).toEqual({ notice: null });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mocks.notice).toHaveBeenCalledWith("signed-in-owner");
  });
});
