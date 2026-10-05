import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/clientTelemetry", () => ({ captureAppException: vi.fn(), captureAppMessage: vi.fn(), getResponseRequestId: () => null, sanitizeTelemetryData: (value: unknown) => value }));
let auth: typeof import("./auth");
const user = { id: "app-member", email: "member@example.com", role: "admin", status: "active" };
const fetchMock = vi.fn();

beforeEach(async () => {
  vi.resetModules(); fetchMock.mockReset();
  const items = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value), removeItem: (key: string) => items.delete(key) });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() }); vi.stubGlobal("fetch", fetchMock);
  auth = await import("./auth");
  auth.setStoredAuth({ accessToken: "access", refreshToken: "refresh", user });
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ accessToken: "access", refreshToken: "refresh", user }), { status: 200 }));
});
afterEach(() => vi.unstubAllGlobals());

describe("profile session synchronization", () => {
  it("forces a fresh profile read even during the successful-sync cooldown", async () => {
    const input = { accessToken: "access", refreshToken: "refresh", expectedUserId: user.id };
    await auth.syncStoredAuthFromSession(input); await auth.syncStoredAuthFromSession(input);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await auth.syncStoredAuthFromSession({ ...input, force: true }); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("does not sign a user back in if they sign out while the response is in flight", async () => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
    const operation = auth.syncStoredAuthFromSession({ accessToken: "access", refreshToken: "refresh", expectedUserId: user.id });
    auth.clearStoredAuth();
    resolve(new Response(JSON.stringify({ accessToken: "access", user }), { status: 200 }));
    await expect(operation).rejects.toThrow("account changed"); expect(auth.getStoredAuth().accessToken).toBeNull();
  });
  it("refuses a response for another application account", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ accessToken: "other-access", user: { ...user, id: "other" } }), { status: 200 }));
    await expect(auth.syncStoredAuthFromSession({ accessToken: "access", expectedUserId: user.id })).rejects.toThrow("account changed");
    expect(auth.getStoredAuth().user?.id).toBe(user.id);
  });
});
