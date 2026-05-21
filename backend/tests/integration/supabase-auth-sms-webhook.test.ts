import request from "supertest";
import { Webhook } from "standardwebhooks";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = "http://localhost";
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  }

  if (!process.env.SUPABASE_JWT_SECRET) {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
  }
});

const snsMocks = vi.hoisted(() => ({
  publishMock: vi.fn(),
}));

vi.mock("@aws-sdk/client-sns", () => ({
  SNSClient: vi.fn().mockImplementation(() => ({
    send: snsMocks.publishMock,
  })),
  PublishCommand: vi.fn((input) => ({ input })),
}));

import { app } from "../../src/index";
import { __testUtils as smsHookTestUtils } from "../../src/services/supabaseAuthSmsHookService";

const hookSecret = Buffer.from("darci-supabase-auth-sms-hook-test-secret").toString("base64");
const dashboardHookSecret = `v1,whsec_${hookSecret}`;

const buildSignedHeaders = (rawBody: string) => {
  const messageId = "msg_test_1";
  const timestamp = new Date();
  const signature = new Webhook(`whsec_${hookSecret}`).sign(messageId, timestamp, rawBody);

  return {
    "webhook-id": messageId,
    "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "webhook-signature": signature,
  };
};

const postSignedSmsHook = (rawBody: string) => {
  const headers = buildSignedHeaders(rawBody);
  return request(app)
    .post("/webhooks/supabase/auth/send-sms")
    .set("Content-Type", "application/json")
    .set("webhook-id", headers["webhook-id"])
    .set("webhook-timestamp", headers["webhook-timestamp"])
    .set("webhook-signature", headers["webhook-signature"])
    .send(rawBody);
};

describe("Supabase Auth SMS hook", () => {
  beforeEach(() => {
    process.env.SUPABASE_AUTH_SMS_HOOK_ENABLED = "true";
    process.env.SUPABASE_AUTH_SMS_HOOK_SECRET = dashboardHookSecret;
    process.env.SUPABASE_AUTH_SMS_MESSAGE_TEMPLATE = "Your DARCi verification code is {{otp}}.";
    process.env.AWS_REGION = "us-east-1";
    process.env.SNS_SMS_TYPE = "Transactional";
    delete process.env.SNS_SMS_SENDER_ID;
    snsMocks.publishMock.mockReset();
    smsHookTestUtils.resetSnsClientCache();
  });

  it("verifies Standard Webhooks signatures and publishes OTP via SNS", async () => {
    snsMocks.publishMock.mockResolvedValue({ MessageId: "sns-msg-1" });
    const rawBody = JSON.stringify({
      user: { id: "auth-user-1", phone: "+15551234567" },
      sms: { otp: "123456" },
    });

    const response = await postSignedSmsHook(rawBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(response.headers["content-type"]).toContain("application/json");
    expect(snsMocks.publishMock).toHaveBeenCalledWith({
      input: expect.objectContaining({
        PhoneNumber: "+15551234567",
        Message: "Your DARCi verification code is 123456.",
        MessageAttributes: expect.objectContaining({
          "AWS.SNS.SMS.SMSType": {
            DataType: "String",
            StringValue: "Transactional",
          },
        }),
      }),
    });
  });

  it("rejects unsigned hook requests before SNS publish", async () => {
    const response = await request(app)
      .post("/webhooks/supabase/auth/send-sms")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({
        user: { id: "auth-user-1", phone: "+15551234567" },
        sms: { otp: "123456" },
      }));

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Missing Supabase Auth hook signature headers");
    expect(snsMocks.publishMock).not.toHaveBeenCalled();
  });

  it("returns a Supabase hook-style error when the hook is disabled", async () => {
    process.env.SUPABASE_AUTH_SMS_HOOK_ENABLED = "false";
    const rawBody = JSON.stringify({
      user: { id: "auth-user-1", phone: "+15551234567" },
      sms: { otp: "123456" },
    });

    const response = await postSignedSmsHook(rawBody);

    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      http_code: 503,
      message: "Supabase Auth SMS hook is not enabled",
    });
    expect(snsMocks.publishMock).not.toHaveBeenCalled();
  });
});