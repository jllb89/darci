import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
  type MessageType,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";

type SendSupabaseAuthSmsInput = {
  phone: string;
  otp: string;
  userId?: string | null;
};

export class SupabaseAuthSmsHookError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "SupabaseAuthSmsHookError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const truthyValues = new Set(["1", "true", "yes", "on"]);

const isHookEnabled = () => {
  const raw = process.env.SUPABASE_AUTH_SMS_HOOK_ENABLED?.trim().toLowerCase();
  return raw ? truthyValues.has(raw) : false;
};

const resolveSnsRegion = () => {
  const region =
    process.env.PINPOINT_SMS_REGION?.trim() ||
    process.env.SNS_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim();

  if (!region) {
    throw new SupabaseAuthSmsHookError(
      500,
      "provider_misconfigured",
      "PINPOINT_SMS_REGION, SNS_REGION, or AWS_REGION is required for Supabase Auth SMS delivery",
    );
  }

  return region;
};

const resolveOriginationIdentity = () => {
  const identity =
    process.env.SUPABASE_AUTH_SMS_ORIGINATION_IDENTITY?.trim() ||
    process.env.PINPOINT_SMS_ORIGINATION_IDENTITY?.trim() ||
    "+18773624121";

  if (!identity) {
    throw new SupabaseAuthSmsHookError(
      500,
      "provider_misconfigured",
      "SUPABASE_AUTH_SMS_ORIGINATION_IDENTITY or PINPOINT_SMS_ORIGINATION_IDENTITY is required for Supabase Auth SMS delivery",
    );
  }

  return identity;
};

const resolveMessageType = (): MessageType => {
  const raw =
    process.env.SUPABASE_AUTH_SMS_MESSAGE_TYPE?.trim().toUpperCase() ||
    process.env.SNS_SMS_TYPE?.trim().toUpperCase() ||
    "TRANSACTIONAL";

  return raw === "PROMOTIONAL" ? "PROMOTIONAL" : "TRANSACTIONAL";
};

const renderSmsMessage = (otp: string) => {
  const template =
    process.env.SUPABASE_AUTH_SMS_MESSAGE_TEMPLATE?.trim() ||
    "Your DARCi verification code is {{otp}}.";

  return template.replace(/\{\{\s*otp\s*\}\}/g, otp).trim();
};

const normalizeDestinationPhoneNumber = (value: string) => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+")) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return digits ? `+${digits}` : "";
};

const isValidE164PhoneNumber = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);

let smsClient: PinpointSMSVoiceV2Client | null = null;

const getSmsClient = () => {
  if (!smsClient) {
    smsClient = new PinpointSMSVoiceV2Client({ region: resolveSnsRegion() });
  }

  return smsClient;
};

export const sendSupabaseAuthSms = async (input: SendSupabaseAuthSmsInput) => {
  if (!isHookEnabled()) {
    throw new SupabaseAuthSmsHookError(
      503,
      "hook_disabled",
      "Supabase Auth SMS hook is not enabled",
    );
  }

  const phone = normalizeDestinationPhoneNumber(input.phone);
  const otp = input.otp.trim();
  const message = renderSmsMessage(otp);

  if (!phone || !otp || !message) {
    throw new SupabaseAuthSmsHookError(
      400,
      "invalid_payload",
      "Supabase Auth SMS hook requires phone and otp",
    );
  }

  if (!isValidE164PhoneNumber(phone)) {
    throw new SupabaseAuthSmsHookError(
      400,
      "invalid_destination_phone_number",
      "Supabase Auth SMS hook requires a valid E.164 destination phone number",
    );
  }

  const originationIdentity = resolveOriginationIdentity();
  const messageType = resolveMessageType();

  try {
    const response = await getSmsClient().send(
      new SendTextMessageCommand({
        DestinationPhoneNumber: phone,
        OriginationIdentity: originationIdentity,
        MessageBody: message,
        MessageType: messageType,
      }),
    );

    if (!response.MessageId) {
      throw new SupabaseAuthSmsHookError(
        502,
        "sns_api_error",
        "Pinpoint SMS Voice v2 send returned no MessageId",
      );
    }

    return {
      provider: "pinpoint_sms_voice_v2" as const,
      messageId: response.MessageId,
      phone,
      userId: input.userId ?? null,
    };
  } catch (error) {
    if (error instanceof SupabaseAuthSmsHookError) {
      throw error;
    }

    throw new SupabaseAuthSmsHookError(
      502,
      "sns_api_error",
      error instanceof Error ? error.message : "Pinpoint SMS Voice v2 send failed",
    );
  }
};

export const __testUtils = {
  resetSmsClientCache: () => {
    smsClient = null;
  },
  resetSnsClientCache: () => {
    smsClient = null;
  },
};