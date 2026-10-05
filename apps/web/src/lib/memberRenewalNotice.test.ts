import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getApiBaseUrl: () => "https://api.example.test", refreshStoredAuth: mocks.refresh }));
import { getMemberRenewalNotice } from "./memberBilling";

afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
describe("membership reminder API", () => {
  it("reads only the signed-in member's notice without a supplied user ID", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ notice: null })));
    vi.stubGlobal("fetch", fetch);
    expect(await getMemberRenewalNotice("token")).toEqual({ notice: null });
    expect(fetch.mock.calls[0]?.[0]).toBe("https://api.example.test/billing/member-membership/renewal-notice");
    expect(new Headers(fetch.mock.calls[0]?.[1].headers).get("Authorization")).toBe("Bearer token");
  });
  it("refreshes an expired session before trying the notice again", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ notice: { id: "notice" } })));
    vi.stubGlobal("fetch", fetch);
    mocks.refresh.mockResolvedValue({ accessToken: "fresh" });
    expect(await getMemberRenewalNotice("expired")).toMatchObject({ notice: { id: "notice" } });
    expect(new Headers(fetch.mock.calls[1]?.[1].headers).get("Authorization")).toBe("Bearer fresh");
  });
  it("fails without inventing a reminder when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(getMemberRenewalNotice("token")).rejects.toThrow("We could not load your renewal reminder");
  });
});
