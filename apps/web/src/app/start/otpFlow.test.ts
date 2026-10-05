import { describe, it, expect } from "vitest";
import { otpContinuation, otpVerifyRequest } from "./otpFlow";

describe("SMS to email account linking", () => {
  const proof = "a".repeat(64);
  it("routes normal phone and email verification to their existing endpoints", () => {
    expect(otpVerifyRequest({ kind: "phone", value: "+12025550147" }, "12345678", "/app", null)).toEqual({ path: "/auth/otp/phone/verify", body: { phone: "+12025550147", token: "12345678", returnTo: "/app" } });
    expect(otpVerifyRequest({ kind: "email", value: "member@example.com" }, "12345678", "/app", null).path).toBe("/auth/otp/verify");
  });
  it("treats phone verification as an email-entry continuation, not an authenticated session", () => {
    expect(otpContinuation({ phoneLink: { token: proof, message: "Enter email" } })).toEqual({ kind: "link-email", token: proof, message: "Enter email" });
  });
  it("handles the existing step-up response from phone verification", () => {
    expect(otpContinuation({ stepUp: { method: "email", identifier: " Member@Example.COM ", otpLength: 8, cooldownSeconds: 60 } })).toEqual({ kind: "verify-email", stepUp: { method: "email", identifier: "member@example.com", otpLength: 8, cooldownSeconds: 60 } });
  });
  it("carries the phone proof only in the email-link request body, not a URL", () => {
    const request = otpVerifyRequest({ kind: "email", value: "member@example.com" }, "12345678", "/app", proof);
    expect(request.path).toBe("/auth/otp/phone/link/verify");
    expect(request.path).not.toContain(proof);
    expect(request.body).toEqual({ email: "member@example.com", token: "12345678", returnTo: "/app", phoneLinkToken: proof });
    expect(otpVerifyRequest({ kind: "phone", value: "+12025550147" }, "12345678", "/app", proof).body).not.toHaveProperty("phoneLinkToken");
  });
  it("rejects malformed continuation data", () => {
    expect(() => otpContinuation({ phoneLink: { token: "bad" } })).toThrow();
    expect(() => otpContinuation({ stepUp: { method: "email", identifier: "bad" } })).toThrow();
  });
  it("does not manufacture another challenge for ordinary session responses or errors", () => {
    expect(otpContinuation(null)).toBeNull();
    expect(otpContinuation({})).toBeNull();
  });
});
