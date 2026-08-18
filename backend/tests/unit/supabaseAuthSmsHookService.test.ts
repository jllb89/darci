import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMock: vi.fn(),
  commandInputs: [] as unknown[],
}));

vi.mock("@aws-sdk/client-pinpoint-sms-voice-v2", () => {
  class SendTextMessageCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
      mocks.commandInputs.push(input);
    }
  }

  class PinpointSMSVoiceV2Client {
    send = mocks.sendMock;
  }

  return {
    PinpointSMSVoiceV2Client,
    SendTextMessageCommand,
  };
});

import {
  __testUtils,
  sendSupabaseAuthSms,
  SupabaseAuthSmsHookError,
} from "../../src/services/supabaseAuthSmsHookService";

describe("supabaseAuthSmsHookService", () => {
  beforeEach(() => {
    process.env.SUPABASE_AUTH_SMS_HOOK_ENABLED = "true";
    process.env.PINPOINT_SMS_REGION = "us-east-1";
    process.env.SUPABASE_AUTH_SMS_ORIGINATION_IDENTITY = "+18773624121";
    mocks.sendMock.mockReset();
    mocks.commandInputs = [];
    __testUtils.resetSmsClientCache();
  });

  it("normalizes NANP destination numbers before sending to Pinpoint", async () => {
    mocks.sendMock.mockResolvedValue({ MessageId: "message-1" });

    const result = await sendSupabaseAuthSms({
      phone: "(555) 555-0123",
      otp: "12345678",
      userId: "user-1",
    });

    expect(result.phone).toBe("+15555550123");
    expect(mocks.commandInputs[0]).toEqual(
      expect.objectContaining({
        DestinationPhoneNumber: "+15555550123",
        OriginationIdentity: "+18773624121",
        MessageType: "TRANSACTIONAL",
      }),
    );
  });

  it("rejects invalid destination phone numbers before calling Pinpoint", async () => {
    await expect(
      sendSupabaseAuthSms({
        phone: "123",
        otp: "12345678",
      }),
    ).rejects.toMatchObject({
      code: "invalid_destination_phone_number",
    } satisfies Partial<SupabaseAuthSmsHookError>);
    expect(mocks.sendMock).not.toHaveBeenCalled();
  });
});
