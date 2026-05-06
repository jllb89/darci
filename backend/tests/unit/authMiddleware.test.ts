import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserIdentityContextBySupabaseIdMock: vi.fn(),
}));

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
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string };
};

const previousNodeEnv = process.env.NODE_ENV;

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
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

  return app;
};

describe("auth middleware Phase 0 guardrails", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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
});
