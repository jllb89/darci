import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApnsClientError, __testUtils, sendApnsNotification } from "../../src/services/apnsClient";

const testPrivateKey = [
  "-----BEGIN PRIVATE KEY-----",
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgrwtQikl9O0RPxi91",
  "j4wBZZ44EvGjONivJIyq4iYZSlahRANCAARomtHe7X0cVsXSdjCCI2G1WZZtiqmi",
  "vHW9w1b1oaie2ovxsyFKb8orABGMUl3V/6kGhgjKN2t6VJ7rY9+dvFzz",
  "-----END PRIVATE KEY-----",
].join("\n");

const resetApnsEnv = () => {
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_PRIVATE_KEY;
  delete process.env.APNS_PROVIDER_TOKEN_TTL_SECONDS;
  delete process.env.APNS_REQUEST_TIMEOUT_MS;
};

describe("apnsClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z"));
    resetApnsEnv();
    process.env.APNS_KEY_ID = "C2HA3XYY5S";
    process.env.APNS_TEAM_ID = "38K3YA2857";
    process.env.APNS_PRIVATE_KEY = testPrivateKey;
    __testUtils.resetProviderTokenCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    __testUtils.setTransport(null);
    __testUtils.resetProviderTokenCache();
    resetApnsEnv();
  });

  it("sends APNs alert requests with token auth and required headers", async () => {
    const transport = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { "apns-id": "apns-message-1" },
      body: "",
    });
    __testUtils.setTransport(transport);

    const result = await sendApnsNotification({
      deviceToken: "a".repeat(64),
      environment: "sandbox",
      topic: "com.illuminote.darci",
      collapseId: "request-1",
      expiration: Math.floor(Date.now() / 1000) + 600,
      payload: {
        aps: {
          alert: { title: "Ready", body: "Continue in DARCi." },
          sound: "default",
        },
        notificationId: "delivery-1",
      },
    });

    expect(result).toEqual({ apnsId: "apns-message-1", statusCode: 200 });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "api.sandbox.push.apple.com",
        path: `/3/device/${"a".repeat(64)}`,
        body: JSON.stringify({
          aps: {
            alert: { title: "Ready", body: "Continue in DARCi." },
            sound: "default",
          },
          notificationId: "delivery-1",
        }),
        headers: expect.objectContaining({
          "apns-topic": "com.illuminote.darci",
          "apns-push-type": "alert",
          "apns-priority": 10,
          "apns-collapse-id": "request-1",
        }),
      }),
    );
    expect(transport.mock.calls[0][0].headers.authorization).toMatch(/^bearer /);
  });

  it("rejects oversized APNs payloads before dispatch", async () => {
    const transport = vi.fn();
    __testUtils.setTransport(transport);

    await expect(
      sendApnsNotification({
        deviceToken: "a".repeat(64),
        environment: "production",
        topic: "com.illuminote.darci",
        payload: {
          aps: { alert: { title: "Ready", body: "x".repeat(4100) } },
        },
      }),
    ).rejects.toMatchObject({
      name: "ApnsClientError",
      code: "apns_payload_too_large",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("classifies permanent APNs token failures", async () => {
    __testUtils.setTransport(
      vi.fn().mockResolvedValue({
        statusCode: 400,
        headers: { "apns-id": "apns-error-1" },
        body: JSON.stringify({ reason: "BadDeviceToken" }),
      }),
    );

    await expect(
      sendApnsNotification({
        deviceToken: "a".repeat(64),
        environment: "sandbox",
        topic: "com.illuminote.darci",
        payload: { aps: { alert: { title: "Ready", body: "Continue." } } },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApnsClientError);
      const apnsError = error as ApnsClientError;
      expect(apnsError.code).toBe("apns_BadDeviceToken");
      expect(apnsError.statusCode).toBe(400);
      expect(apnsError.apnsId).toBe("apns-error-1");
      expect(apnsError.permanentTokenFailure).toBe(true);
      expect(apnsError.retryable).toBe(false);
      return true;
    });
  });

  it("classifies throttling as retryable", async () => {
    __testUtils.setTransport(
      vi.fn().mockResolvedValue({
        statusCode: 429,
        headers: { "apns-id": "apns-error-2" },
        body: JSON.stringify({ reason: "TooManyRequests" }),
      }),
    );

    await expect(
      sendApnsNotification({
        deviceToken: "a".repeat(64),
        environment: "sandbox",
        topic: "com.illuminote.darci",
        payload: { aps: { alert: { title: "Ready", body: "Continue." } } },
      }),
    ).rejects.toMatchObject({
      name: "ApnsClientError",
      code: "apns_TooManyRequests",
      retryable: true,
      permanentTokenFailure: false,
    });
  });
});
