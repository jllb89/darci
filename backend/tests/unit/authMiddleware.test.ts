import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
  isAuthSessionActiveMock: vi.fn(),
}));

vi.mock("../../src/services/authSessionService", () => ({ isAuthSessionActive: mocks.isAuthSessionActiveMock }));

vi.mock("../../src/services/userRoleService", () => ({
  getUserIdentityContextBySupabaseId: mocks.getUserIdentityContextBySupabaseIdMock,
  normalizeRuntimeRole: (value?: string | null) => {
    if (value === "pro" || value === "notary" || value === "admin") {
      return value;
    }

    return "member";
  },
}));

type TokenPayload = {
  sub?: string;
  iss?: string;
  aud?: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string };
  user_metadata?: { role?: string };
};

const previousNodeEnv = process.env.NODE_ENV;

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign({
    iss: `${(process.env.SUPABASE_URL ?? "").replace(/\/+$/, "")}/auth/v1`,
    aud: "authenticated",
    ...payload,
  }, secret, { expiresIn: "1h" });
};

const buildIdentityContext = (overrides: Record<string, unknown> = {}) => ({
  id: "db-user-1",
  supabaseUserId: "auth-user-1",
  email: "member@example.com",
  role: "member",
  status: "active",
  firstName: null,
  lastName: null,
  availableRoles: ["member"],
  roleAssignments: [],
  ...overrides,
});

const buildApp = async () => {
  const { requireAuth } = await import("../../src/middleware/auth.ts");
  const app = express();

  app.use(express.json());
  app.use(requireAuth);
  app.get("/protected", (req, res) => {
    res.status(200).json({ user: req.user });
  });
  app.post("/auth/logout", (req, res) => {
    res.status(200).json({ user: req.user });
  });
  app.post("/auth/session/sync", (req, res) => {
    res.status(200).json({ user: req.user });
  });
  app.post("/auth/password/reset", (req, res) => {
    res.status(200).json({ user: req.user });
  });
  app.post("/auth/otp/phone/start", (req, res) => {
    res.status(200).json({ user: req.user ?? null });
  });
  app.post("/auth/otp/phone/verify", (req, res) => {
    res.status(200).json({ user: req.user ?? null });
  });

  return app;
};

describe("request profile authorization", () => {
  it.each(["user_metadata", "app_metadata"] as const)("does not elevate a %s service-role claim", async metadataKey => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(buildIdentityContext());
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1", role: "authenticated", [metadataKey]: { role: "service_role" } })}`);
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("member");
    expect(response.body.user.dbUserId).toBe("db-user-1");
  });
  it("accepts a genuine top-level service credential", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockClear();
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "service-worker", role: "service_role" })}`);
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("service_role");
    expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
  });
  it("uses a currently granted notary profile when another device selected member", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(buildIdentityContext({ availableRoles: ["member", "notary"] }));
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1", app_metadata: { role: "member" } })}`)
      .set("X-DARCi-Profile", "notary");
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("notary");
  });
  it("rejects a forged or revoked notary profile", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(buildIdentityContext());
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1", app_metadata: { role: "notary" } })}`)
      .set("X-DARCi-Profile", "notary");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("active_profile_unavailable");
  });
});

describe("auth middleware Phase 0 guardrails", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.isAuthSessionActiveMock.mockResolvedValue(true);
    process.env.NODE_ENV = "test";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    delete process.env.AUTH_ALLOW_MISSING_DB_USER_FALLBACK;
  });

  afterEach(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("blocks suspended app accounts", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(
      buildIdentityContext({ status: "suspended" }),
    );

    const app = await buildApp();
    const token = signToken({ sub: "auth-user-1", app_metadata: { role: "member" } });
    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "account_inactive",
      message: "Account is not active",
    });
  });

  it.each([{ role: "anon" }, { role: "authenticated" }, { sub: "", role: "authenticated" }])(
    "rejects public/non-user credentials even when their signature is valid: %j", async payload => {
      const app = await buildApp();
      const response = await request(app).get("/protected").set("Authorization", `Bearer ${signToken(payload)}`);
      expect(response.status).toBe(401);
      expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
    },
  );

  it.each([{ iss: "https://different.supabase.co/auth/v1" }, { aud: "anon" }])(
    "rejects signed tokens for another issuer/audience in production: %j", async claims => {
      process.env.NODE_ENV = "production";
      const app = await buildApp();
      const response = await request(app).get("/protected")
        .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1", ...claims })}`);
      expect(response.status).toBe(401);
      expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
    },
  );

  it("does not authorize all-revoked assignments, but preserves logout", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(buildIdentityContext({ role: "notary", availableRoles: [] }));
    const app = await buildApp();
    const token = signToken({ sub: "auth-user-1", app_metadata: { role: "notary" } });
    expect((await request(app).get("/protected").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).post("/auth/logout").set("Authorization", `Bearer ${token}`).set("X-DARCi-Profile", "notary")).status).toBe(200);
  });

  it("cannot enable the old production missing-identity bypass", async () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_ALLOW_MISSING_DB_USER_FALLBACK = "true";
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(null);
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1" })}`);
    expect(response.status).toBe(403);
  });

  it("fails closed on a production identity outage even if a test flag is present", async () => {
    process.env.NODE_ENV = "production";
    mocks.getUserIdentityContextBySupabaseIdMock.mockRejectedValue(new Error("Simulated database outage"));
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1" })}`);
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("identity_unavailable");
  });

  it("rejects a revoked production session before loading any app identity", async () => {
    process.env.NODE_ENV = "production";
    mocks.isAuthSessionActiveMock.mockResolvedValue(false);
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1" })}`);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("session_expired");
    expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
  });

  it("fails closed during a session-check database outage", async () => {
    process.env.NODE_ENV = "production";
    mocks.isAuthSessionActiveMock.mockRejectedValue(new Error("Simulated session lookup outage"));
    const app = await buildApp();
    const response = await request(app).get("/protected")
      .set("Authorization", `Bearer ${signToken({ sub: "auth-user-1" })}`);
    expect(response.status).toBe(503);
    expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
  });

  it("allows inactive users to reach logout", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(
      buildIdentityContext({ status: "suspended" }),
    );

    const app = await buildApp();
    const token = signToken({ sub: "auth-user-1", app_metadata: { role: "member" } });
    const response = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .send({ refreshToken: "refresh-token" });

    expect(response.status).toBe(200);
    expect(response.body.user.status).toBe("suspended");
  });

  it("fails closed for missing app identity in production", async () => {
    process.env.NODE_ENV = "production";
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(null);

    const app = await buildApp();
    const token = signToken({ sub: "auth-user-1", app_metadata: { role: "member" } });
    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "account_profile_required",
      message: "Account profile is required",
    });
  });

  it("keeps the non-production fallback for tests and local development", async () => {
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(null);

    const app = await buildApp();
    const token = signToken({ sub: "auth-user-1", app_metadata: { role: "member" } });
    const response = await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("member");
    expect(response.body.user.dbUserId).toBeUndefined();
  });

  it("lets session sync validate Supabase action tokens in the controller", async () => {
    process.env.NODE_ENV = "production";
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(null);

    const app = await buildApp();
    const response = await request(app)
      .post("/auth/session/sync")
      .send({ refreshToken: "refresh-token" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
  });

  it("lets password reset validate Supabase action tokens in the controller", async () => {
    process.env.NODE_ENV = "production";
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(null);

    const app = await buildApp();
    const response = await request(app)
      .post("/auth/password/reset")
      .send({ refreshToken: "refresh-token", password: "newpassword123" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
  });

  it.each([
    "/auth/otp/phone/start",
    "/auth/otp/phone/verify",
  ])("allows public phone OTP requests to reach the controller: %s", async (path) => {
    process.env.NODE_ENV = "production";
    mocks.getUserIdentityContextBySupabaseIdMock.mockResolvedValue(null);

    const app = await buildApp();
    const response = await request(app).post(path).send({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: null });
    expect(mocks.getUserIdentityContextBySupabaseIdMock).not.toHaveBeenCalled();
  });
});
