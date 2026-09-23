import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: vi.fn(), identity: vi.fn(), roles: vi.fn(), telemetry: vi.fn() }));
vi.mock("../../src/telemetry/authTelemetry", () => ({ reportAuthIssue: state.telemetry }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: () => ({ abortSignal: state.session }),
    from: (table: string) => {
      const execute = () => table === "users" ? state.identity() : state.roles();
      const builder = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        order: () => builder,
        abortSignal: () => builder,
        maybeSingle: execute,
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
      };
      return builder;
    },
  }),
}));
import { requireAuth } from "../../src/middleware/auth";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("APP_ENV", "staging");
  vi.stubEnv("NODE_ENV", "production");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  state.session.mockResolvedValue({ data: true, error: null });
  state.identity.mockResolvedValue({ data: { id: "db-test-user", supabase_user_id: "00000000-0000-4000-8000-000000000001", role: "member", status: "active" }, error: null });
  state.roles.mockResolvedValue({ data: [{ id: "test-role", role: "member", status: "active", is_active_profile: true }], error: null });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const invoke = async (path: string) => {
  const action = vi.fn();
  const app = express();
  app.use(requireAuth);
  app.post(path, (_req, res) => { action(); res.sendStatus(200); });
  const token = jwt.sign({
    sub: "00000000-0000-4000-8000-000000000001",
    session_id: "00000000-0000-4000-8000-000000000002",
    role: "authenticated", aud: "authenticated",
    iss: `${process.env.SUPABASE_URL!.replace(/\/+$/, "")}/auth/v1`,
  }, process.env.SUPABASE_JWT_SECRET!, { expiresIn: "1h" });
  const response = await request(app).post(path).set("Authorization", `Bearer ${token}`);
  return { action, response };
};

describe("authorization recovery before document mutations", () => {
  it.each(["session", "identity", "roles"] as const)("recovers transient %s reads and calls the downstream action once", async dependency => {
    state[dependency].mockResolvedValueOnce({ error: { message: "TypeError: fetch failed" }, status: 0 });
    const { action, response } = await invoke("/documents/test/review/approve");
    expect(response.status).toBe(200);
    expect(action).toHaveBeenCalledTimes(1);
    expect(state[dependency]).toHaveBeenCalledTimes(2);
  });

  it.each(["session", "identity", "roles"] as const)("never submits to a notary when %s reads remain unavailable", async dependency => {
    state[dependency].mockResolvedValue({ error: { message: "TypeError: fetch failed" }, status: 0 });
    const { action, response } = await invoke("/documents/test/notary-requests");
    expect(response.status).toBe(503);
    expect(response.body.error).toBe("identity_unavailable");
    expect(action).not.toHaveBeenCalled();
    expect(state[dependency]).toHaveBeenCalledTimes(2);
    const operation = { session: "session_liveness", identity: "identity_lookup", roles: "role_lookup" }[dependency];
    expect(state.telemetry).toHaveBeenCalledWith(expect.objectContaining({
      operation, statusCode: 503,
      details: expect.objectContaining({ attempts: 2, dependencyFailure: "AUTH_READ_TRANSPORT" }),
    }));
  });

  it("does not retry denied database permissions", async () => {
    state.roles.mockResolvedValue({ error: { code: "42501" }, status: 403 });
    const { action, response } = await invoke("/documents/test/review/approve");
    expect(response.status).toBe(503);
    expect(action).not.toHaveBeenCalled();
    expect(state.roles).toHaveBeenCalledTimes(1);
  });

  it("rejects a session revoked before the recovery read", async () => {
    state.session.mockResolvedValueOnce({ error: { message: "TypeError: fetch failed" }, status: 0 })
      .mockResolvedValueOnce({ data: false, error: null });
    const { action, response } = await invoke("/documents/test/review/approve");
    expect(response.status).toBe(401);
    expect(action).not.toHaveBeenCalled();
    expect(state.identity).not.toHaveBeenCalled();
  });

  it.each(["suspended", "revoked"])("does not resurrect a %s role after recovering the role read", async status => {
    state.roles.mockResolvedValueOnce({ error: { message: "TypeError: fetch failed" }, status: 0 })
      .mockResolvedValueOnce({ data: [{ id: "test-role", role: "member", status, is_active_profile: true }], error: null });
    const { action, response } = await invoke("/documents/test/notary-requests");
    expect(response.status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });
});
