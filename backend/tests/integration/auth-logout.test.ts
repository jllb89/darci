import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";

const signOutMock = vi.fn();
const setSessionMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

type TokenPayload = {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const buildSupabaseClient = () => ({
  auth: {
    signInWithPassword: vi.fn(),
    setSession: setSessionMock,
    signOut: signOutMock,
  },
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  })),
});

const buildTestApp = async () => {
  const { requireAuth } = await import("../../src/middleware/auth.ts");
  const { logout } = await import("../../src/controllers/authController.ts");
  const app = express();

  app.use(express.json());
  app.use(requireAuth);
  app.post("/auth/logout", logout);

  return app;
};

describe("POST /auth/logout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.SUPABASE_JWT_SECRET = "test-secret";

    createClientMock.mockImplementation(() => buildSupabaseClient());
  });

  it("revokes the Supabase session through the Express route", async () => {
    setSessionMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });

    const app = await buildTestApp();
    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .send({ refreshToken: "refresh-token" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      message: "Signed out",
    });
    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: token,
      refresh_token: "refresh-token",
    });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "global" });
  });

  it("returns validation error when refresh token is missing", async () => {
    const app = await buildTestApp();
    const token = signToken({
      sub: "user-1",
      app_metadata: { role: "member" },
    });

    const response = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("validation_error");
    expect(setSessionMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});