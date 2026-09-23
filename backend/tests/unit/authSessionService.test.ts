import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));
import { isAuthSessionActive } from "../../src/services/authSessionService";
const user = "00000000-0000-4000-8000-000000000001";
const session = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rpc.mockImplementation(() => ({ abortSignal: mocks.read }));
});

describe("session liveness", () => {
  it("does not query invalid or absent session identifiers", async () => {
    expect(await isAuthSessionActive(user, undefined)).toBe(false);
    expect(await isAuthSessionActive("invalid", session)).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("recovers a transient lookup before accepting a valid session", async () => {
    mocks.read.mockResolvedValueOnce({ error: { message: "TypeError: fetch failed" }, status: 0 })
      .mockResolvedValueOnce({ data: true, error: null });
    expect(await isAuthSessionActive(user, session)).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith("is_auth_session_active", { p_user_id: user, p_session_id: session });
  });
  it("honors a revocation returned by the recovery read", async () => {
    mocks.read.mockResolvedValueOnce({ error: { code: "PGRST003" }, status: 504 })
      .mockResolvedValueOnce({ data: false, error: null });
    expect(await isAuthSessionActive(user, session)).toBe(false);
  });
  it("rechecks a previously valid session rather than caching its authorization", async () => {
    mocks.read.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    expect(await isAuthSessionActive(user, session)).toBe(true);
    expect(await isAuthSessionActive(user, session)).toBe(false);
  });
  it("fails closed on persistent outages", async () => {
    mocks.read.mockResolvedValue({ error: { message: "unavailable" }, status: 503 });
    await expect(isAuthSessionActive(user, session)).rejects.toMatchObject({ operation: "session_liveness", attempts: 2 });
  });
  it.each([null, "true", 1, {}])("rejects malformed success responses: %j", async data => {
    mocks.read.mockResolvedValue({ data, error: null });
    await expect(isAuthSessionActive(user, session)).rejects.toMatchObject({ code: "AUTH_READ_INVALID_RESPONSE", retryable: false });
  });
});
