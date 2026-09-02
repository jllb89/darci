import { describe, expect, it } from "vitest";
import { buildAuthTelemetryEvent } from "../../src/telemetry/authTelemetry";

describe("auth telemetry", () => {
  it("groups failures while retaining only a one-way identity fingerprint", () => {
    const event = buildAuthTelemetryEvent({
      area: "email_otp",
      operation: "delivery",
      reason: "provider_failed",
      requestId: "request-1",
      method: "POST",
      path: "/auth/otp/start?email=member@example.com",
      statusCode: 503,
      provider: "resend",
      identifier: "member@example.com",
      error: Object.assign(new Error("provider message containing member@example.com"), {
        code: "provider_error",
      }),
      details: {
        delivery: "custom_email_otp",
        email: "member@example.com",
        rawToken: "secret-token",
      },
    });

    expect(event.eventName).toBe("auth.email_otp.delivery.provider_failed");
    expect(event.context.fingerprint).toEqual([
      "auth",
      "email_otp",
      "delivery",
      "provider_failed",
    ]);
    expect(event.context.contexts.auth.identifierHash).toMatch(/^[a-f0-9]{16}$/);
    expect(event.context.contexts.auth.path).toBe("/auth/otp/start");
    expect(event.context.contexts.auth).not.toHaveProperty("email");
    expect(event.context.contexts.auth).not.toHaveProperty("rawToken");
    expect(JSON.stringify(event)).not.toContain("member@example.com");
    expect(JSON.stringify(event)).not.toContain("secret-token");
  });

  it("normalizes record identifiers out of request paths", () => {
    const event = buildAuthTelemetryEvent({
      area: "token",
      operation: "verify",
      reason: "expired",
      path: "/documents/550e8400-e29b-41d4-a716-446655440000",
    });

    expect(event.context.contexts.auth.path).toBe("/documents/:uuid");
  });
});
