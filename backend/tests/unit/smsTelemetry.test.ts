import { afterEach, expect, it, vi } from "vitest";
import { logSmsHandoff, smsHookHash, smsPhoneHash } from "../../src/telemetry/smsTelemetry";
afterEach(() => vi.restoreAllMocks());
it("normalizes phone hashes across the app request and SMS hook", () => {
  expect(smsPhoneHash("+15551234567")).toBe(smsPhoneHash("15551234567"));
  expect(smsPhoneHash("(555) 123-4567")).toBe(smsPhoneHash("+15551234567"));
  expect(smsHookHash("msg_hook_1")).toMatch(/^[a-f0-9]{32}$/);
});
it("logs provider acceptance distinctly from device delivery without private payloads", () => {
  const log = vi.spyOn(console,"info").mockImplementation(() => {});
  logSmsHandoff({ outcome: "accepted", hookHash: smsHookHash("msg_hook_1"), phoneHash: smsPhoneHash("+15551234567"), messageId: "provider-message-1" });
  const event=JSON.parse(log.mock.calls[0]![0]);
  expect(event.outcome).toBe("accepted");
  expect(event.messageId).toBe("provider-message-1");
  expect(event).not.toHaveProperty("delivered");
  expect(log.mock.calls[0]![0]).not.toMatch(/15551234567|msg_hook_1/);
});
