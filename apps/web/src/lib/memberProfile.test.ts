import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeProfileContact, profileErrorMessage, requestProfileContactChange,
  resendProfileContactCode, saveProfileName, syncProfileChange, verifyProfileContactCode,
  type ProfileChange,
} from "./memberProfile";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), getStoredAuth: vi.fn(), setStoredAuth: vi.fn(), sync: vi.fn(),
  setSession: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(), verifyOtp: vi.fn(), refreshSession: vi.fn(), resend: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("./auth", () => ({ getStoredAuth: mocks.getStoredAuth, setStoredAuth: mocks.setStoredAuth, syncStoredAuthFromSession: mocks.sync }));
const user = { id: "app-user", role: "admin", firstName: "Member", lastName: "User" };
const authUser = { id: "auth-user", email: "old@example.com", phone: "525512345678" };
const session = { access_token: "rotated-access", refresh_token: "rotated-refresh", user: authUser } as Session;
const client = { auth: mocks } as unknown as SupabaseClient;
const change = (overrides: Partial<ProfileChange> = {}): ProfileChange => ({
  client, accountId: user.id, authUserId: authUser.id, currentEmail: authUser.email,
  kind: "email", value: "new@example.com", ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  mocks.getStoredAuth.mockReturnValue({ accessToken: "access", refreshToken: "refresh", user });
  mocks.createClient.mockReturnValue(client);
  mocks.setSession.mockResolvedValue({ data: { session, user: authUser }, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: authUser }, error: null });
  mocks.updateUser.mockResolvedValue({ data: { user: authUser }, error: null });
  mocks.refreshSession.mockResolvedValue({ data: { session }, error: null });
  mocks.resend.mockResolvedValue({ error: null });
  mocks.sync.mockResolvedValue({ user });
});

describe("profile contact validation", () => {
  it("normalizes international phone numbers and emails", () => {
    expect(normalizeProfileContact("phone", "+52 55 1234 5678")).toBe("+525512345678");
    expect(normalizeProfileContact("phone", "+1 (415) 555-0123")).toBe("+14155550123");
    expect(normalizeProfileContact("email", " NEW@Example.COM ")).toBe("new@example.com");
  });
  it.each(["5542850675", "+1", "not a number"])("rejects invalid/missing country codes: %s", value => {
    expect(() => normalizeProfileContact("phone", value)).toThrow("country code");
  });
  it.each(["bad", "bad@", "bad @example.com"])("rejects invalid email: %s", value => {
    expect(() => normalizeProfileContact("email", value)).toThrow("valid email");
  });
  it("provides actionable duplicate, expiry and rate-limit messages", () => {
    expect(profileErrorMessage({ code: "phone_exists" })).toContain("another account");
    expect(profileErrorMessage({ code: "over_email_send_rate_limit" })).toContain("wait a minute");
    expect(profileErrorMessage({ code: "otp_expired" })).toContain("expired");
  });
});

describe("authenticated profile updates", () => {
  it("saves only name metadata; no contact, address or role changes", async () => {
    const operation = await saveProfileName(" Jorge Luis ", " Lopez ");
    expect(mocks.updateUser).toHaveBeenCalledWith({ data: { first_name: "Jorge Luis", last_name: "Lopez" } });
    await syncProfileChange(operation);
    expect(mocks.setStoredAuth).toHaveBeenCalledWith({ accessToken: "rotated-access", refreshToken: "rotated-refresh", user });
    expect(mocks.sync).toHaveBeenCalledWith({ accessToken: "rotated-access", refreshToken: "rotated-refresh", force: true, expectedUserId: "app-user" });
  });
  it("rejects blank names before any provider call", async () => {
    await expect(saveProfileName("", "User")).rejects.toThrow("first and last");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("uses the current DARCi session, without an OAuth/local-storage session or login OTP", async () => {
    const operation = await requestProfileContactChange("phone", "+14155550123");
    expect(mocks.createClient).toHaveBeenCalledWith("https://test.supabase.co", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ phone: "+14155550123" });
    expect(operation.value).toBe("+14155550123");
    expect(mocks.sync).not.toHaveBeenCalled(); // Unverified contacts never enter the app profile.
  });
  it("rejects the unchanged contact without sending an OTP", async () => {
    await expect(requestProfileContactChange("email", "OLD@EXAMPLE.COM")).rejects.toThrow("different contact");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("propagates duplicate/provider errors without claiming success", async () => {
    mocks.updateUser.mockResolvedValue({ error: new Error("Phone already registered") });
    await expect(requestProfileContactChange("phone", "+14155550123")).rejects.toThrow("already registered");
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("requires a signed-in account", async () => {
    mocks.getStoredAuth.mockReturnValue({ accessToken: null, refreshToken: null, user: null });
    await expect(saveProfileName("Member", "User")).rejects.toThrow("sign in again");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("contact verification", () => {
  it.each(["123456", "12345678"])("verifies a complete phone-change code (%s)", async token => {
    mocks.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    expect(await verifyProfileContactCode(change({ kind: "phone", value: "+525512345678" }), token)).toBe(true);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "phone_change", phone: "+525512345678", token });
  });
  it("keeps secure email changes pending after the first confirmation", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null, user: { message: "Other confirmation required" } }, error: null });
    expect(await verifyProfileContactCode(change(), "12345678", "current")).toBe(false);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email_change", email: "old@example.com", token: "12345678" });
    expect(mocks.setStoredAuth).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("completes email verification without switching accounts or active roles", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { ...session, user: { ...authUser, email: "new@example.com" } } }, error: null });
    expect(await verifyProfileContactCode(change(), "12345678")).toBe(true);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email_change", email: "new@example.com", token: "12345678" });
    expect(mocks.setStoredAuth).toHaveBeenCalledWith({ accessToken: "rotated-access", refreshToken: "rotated-refresh", user });
  });
  it("rejects codes for another account before persisting any session", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { ...session, user: { ...authUser, id: "other", email: "new@example.com" } } }, error: null });
    await expect(verifyProfileContactCode(change(), "12345678")).rejects.toThrow("does not belong");
    expect(mocks.setStoredAuth).not.toHaveBeenCalled();
  });
  it("rejects a different confirmed contact before persisting", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    await expect(verifyProfileContactCode(change(), "12345678")).rejects.toThrow("does not match");
    expect(mocks.setStoredAuth).not.toHaveBeenCalled();
  });
  it("rejects short codes and signed-out/account-switched operations", async () => {
    await expect(verifyProfileContactCode(change(), "123")).rejects.toThrow("complete");
    mocks.getStoredAuth.mockReturnValue({ accessToken: "access", user: { id: "other" } });
    await expect(verifyProfileContactCode(change(), "12345678")).rejects.toThrow("account changed");
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });
  it("keeps invalid/expired verification failures pending", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: new Error("Invalid code") });
    await expect(verifyProfileContactCode(change(), "12345678")).rejects.toThrow("Invalid code");
    expect(mocks.setStoredAuth).not.toHaveBeenCalled();
  });
  it("resends contact-change codes, never login codes", async () => {
    await resendProfileContactCode(change());
    expect(mocks.resend).toHaveBeenCalledWith({ type: "email_change", email: "new@example.com" });
    await resendProfileContactCode(change({ kind: "phone", value: "+14155550123" }));
    expect(mocks.resend).toHaveBeenCalledWith({ type: "phone_change", phone: "+14155550123" });
  });
  it("can retry synchronization without reusing a consumed OTP", async () => {
    mocks.sync.mockRejectedValueOnce(new Error("Network offline"));
    await expect(syncProfileChange(change())).rejects.toThrow("Network offline");
    await syncProfileChange(change());
    expect(mocks.sync).toHaveBeenCalledTimes(2); expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.refreshSession).toHaveBeenCalledWith({ refresh_token: "refresh" });
  });
});
