import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const signOutMock = vi.fn();
const setSessionMock = vi.fn();
const createClientMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe("logout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    createClientMock
      .mockReturnValueOnce({ auth: {} })
      .mockReturnValueOnce({ auth: {} })
      .mockReturnValue({
        auth: {
          setSession: setSessionMock,
          signOut: signOutMock,
        },
      });
  });

  it("revokes the current session when bearer and refresh token are provided", async () => {
    setSessionMock.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });

    const { logout } = await import("../../src/controllers/authController.ts");

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      headers: { authorization: "Bearer access-token" },
      body: { refreshToken: "refresh-token" },
      user: { id: "user-1" },
    } as unknown as Request;
    const res = {
      status,
    } as unknown as Response;

    await logout(req, res);

    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(signOutMock).toHaveBeenCalledWith({ scope: "global" });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: "ok",
      message: "Signed out",
    });
  });

  it("rejects logout without a refresh token", async () => {
    const { logout } = await import("../../src/controllers/authController.ts");

    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const req = {
      headers: { authorization: "Bearer access-token" },
      body: {},
      user: { id: "user-1" },
    } as unknown as Request;
    const res = {
      status,
    } as unknown as Response;

    await logout(req, res);

    expect(setSessionMock).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(400);
  });
});