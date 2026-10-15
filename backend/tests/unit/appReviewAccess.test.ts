import { scryptSync } from "node:crypto";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), eval: vi.fn(), ready: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../../src/middleware/productionSafety", () => ({
  readySafetyRedis: mocks.ready, RATE_LIMIT_SCRIPT: "atomic-counter",
}));
import { APP_REVIEW_EMAIL, createAppReviewSession, getAppReviewConfig,
  isReviewSessionAllowed, verifyReviewCredential } from "../../src/auth/appReviewAccess";
import { enforceAppReviewScope } from "../../src/middleware/appReviewScope";

const code = "84729163"; // Synthetic test credential, never a deployment credential.
const config = {
  enabled: true, email: APP_REVIEW_EMAIL,
  authId: "11223344-1111-4111-8111-112233445566",
  userId: "11223344-2222-4222-8222-112233445566",
  expiresAt: "2026-11-12T00:00:00.000Z", salt: "ab".repeat(16),
  codeHash: scryptSync(code, Buffer.from("ab".repeat(16), "hex"), 32).toString("hex"),
};
const user = { id: config.authId, email: config.email,
  app_metadata: { app_review: { version: 1, expires_at: config.expiresAt } } };
const claims = { sub: user.id, email: user.email, app_metadata: user.app_metadata };
const response = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const request = (path: string, method = "GET", role = "member", body: unknown = {}) => ({
  path, method, body, user: { id: config.authId, dbUserId: config.userId,
    email: config.email, role, rawClaims: claims },
}) as Request;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
  vi.stubEnv("APP_REVIEW_ACCESS_CONFIG", JSON.stringify(config));
  vi.clearAllMocks(); mocks.eval.mockResolvedValue(1); mocks.ready.mockResolvedValue({ eval: mocks.eval });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("scoped App Review credential", () => {
  it("accepts only the configured eight-digit credential", async () => {
    expect(await verifyReviewCredential(config, code)).toBe(true);
    for (const bad of ["00000000", "8472916", "847291630", "letters!"]) {
      expect(await verifyReviewCredential(config, bad)).toBe(false);
    }
  });
  it.each(["", "{}", "not-json", JSON.stringify({ ...config, enabled: false }),
    JSON.stringify({ ...config, email: "someone@example.com" }), JSON.stringify({ ...config, codeHash: "bad" })])
  ("fails closed for invalid/disabled configuration", raw => {
    vi.stubEnv("APP_REVIEW_ACCESS_CONFIG", raw);
    expect(getAppReviewConfig()).toBeNull(); expect(isReviewSessionAllowed(claims)).toBe(false);
  });
  it("expires both new login and existing API sessions", async () => {
    vi.setSystemTime(new Date(config.expiresAt));
    expect(isReviewSessionAllowed(claims)).toBe(false);
    await expect(createAppReviewSession(code)).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.ready).not.toHaveBeenCalled();
  });
  it("does not elevate ordinary users or trust editable user_metadata", () => {
    expect(isReviewSessionAllowed({ sub: "ordinary", user_metadata: user.app_metadata })).toBe(true);
    expect(isReviewSessionAllowed({ ...claims, sub: "different" })).toBe(false);
    expect(isReviewSessionAllowed({ ...claims, app_metadata: {} })).toBe(false);
  });
  it("rejects a wrong code before any Supabase session request", async () => {
    await expect(createAppReviewSession("00000000")).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("limits guesses across IPs and fails closed on Redis failure", async () => {
    mocks.eval.mockResolvedValue(11);
    await expect(createAppReviewSession(code)).rejects.toMatchObject({ statusCode: 429 });
    mocks.ready.mockRejectedValue(new Error("unavailable"));
    await expect(createAppReviewSession(code)).rejects.toThrow("unavailable");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("issues a real pinned Supabase session without sending email", async () => {
    const getUserById = vi.fn().mockResolvedValue({ data: { user }, error: null });
    const generateLink = vi.fn().mockResolvedValue({ data: { user, properties: { hashed_token: "single-use-hash" } }, error: null });
    const verifyOtp = vi.fn().mockResolvedValue({ data: { user, session: { access_token: "real-session" } }, error: null });
    mocks.createClient.mockReturnValueOnce({ auth: { admin: { getUserById, generateLink } } })
      .mockReturnValueOnce({ auth: { verifyOtp } });
    expect((await createAppReviewSession(code)).data.user?.id).toBe(config.authId);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: config.email });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "single-use-hash", type: "email" });
  });
  it("rejects account replacement before exchanging a generated token", async () => {
    const generateLink = vi.fn().mockResolvedValue({ data: { user: { ...user, id: "replacement" }, properties: { hashed_token: "hash" } }, error: null });
    mocks.createClient.mockReturnValue({ auth: { admin: {
      getUserById: vi.fn().mockResolvedValue({ data: { user }, error: null }), generateLink,
    } } });
    await expect(createAppReviewSession(code)).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });
});
describe("App Review production isolation", () => {
  it.each(["CA", "OH", "US-CA", "US-OH"])("allows only the read-only address POSTs for %s", jurisdiction => {
    for (const operation of ["autocomplete", "details"]) {
      const req = request(`/rules/member-form/${jurisdiction}/address-${operation}`, "POST", "notary");
      expect(enforceAppReviewScope(req, response() as unknown as Response)).toBe(false);
      expect(req.user?.role).toBe("member");
    }
  });
  it.each([
    ["/rules/member-form/US-CA/validate", "POST"],
    ["/rules/member-form/US-TX/address-autocomplete", "POST"],
    ["/rules/member-form/US-CA/address-details/extra", "POST"],
    ["/rules/member-form/US-CA/address-details", "PUT"],
    ["/rules/member-form/US-CA/address-autocomplete", "DELETE"],
  ])("keeps unrelated rules operations blocked: %s %s", (path, method) => {
    const res = response();
    expect(enforceAppReviewScope(request(path, method), res as unknown as Response)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it.each(["/admin/users", "/internal/jobs", "/billing/member-membership/checkout", "/invites",
    "/notary/idn/resolve", "/notary/requests/client/sign", "/documents/client/submit-notarization",
    "/documents/client/watermark", "/documents/client/signature-reminders", "/users/me/notary-application"])
  ("blocks %s before reaching its controller", path => {
    const res = response();
    expect(enforceAppReviewScope(request(path, "POST", "notary"), res as unknown as Response)).toBe(true);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it("uses member ownership ACLs instead of assigned-client notary ACLs", () => {
    const req = request("/documents/client", "GET", "notary");
    expect(enforceAppReviewScope(req, response() as unknown as Response)).toBe(false);
    expect(req.user?.role).toBe("member");
  });
  it("exposes no client queue/realtime channel until synthetic notary fixtures exist", () => {
    const res = response();
    expect(enforceAppReviewScope(request("/notary/requests", "GET", "notary"), res as unknown as Response)).toBe(true);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ requests: [], realtimeQueueUserId: null }));
  });
  it("allows only the granted member/notary switch, never admin", () => {
    expect(enforceAppReviewScope(request("/users/me/active-role", "PATCH", "member", { role: "notary" }), response() as unknown as Response)).toBe(false);
    expect(enforceAppReviewScope(request("/users/me/active-role", "PATCH", "member", { role: "admin" }), response() as unknown as Response)).toBe(true);
  });
  it("allows deletion without modifying normal accounts", () => {
    expect(enforceAppReviewScope(request("/users/me", "DELETE"), response() as unknown as Response)).toBe(false);
    const req = request("/admin/users"); req.user!.email = "ordinary@example.com"; req.user!.rawClaims = {};
    expect(enforceAppReviewScope(req, response() as unknown as Response)).toBe(false);
  });
});
