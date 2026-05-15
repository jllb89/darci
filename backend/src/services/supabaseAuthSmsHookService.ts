import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

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
    process.env.SNS_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim();

  if (!region) {
    throw new SupabaseAuthSmsHookError(
      500,
      "provider_misconfigured",
      "SNS_REGION or AWS_REGION is required for Supabase Auth SMS delivery",
    );
  }

  return region;
};

const renderSmsMessage = (otp: string) => {
  const template =
    process.env.SUPABASE_AUTH_SMS_MESSAGE_TEMPLATE?.trim() ||
    "Your DARCi verification code is {{otp}}.";

  return template.replace(/\{\{\s*otp\s*\}\}/g, otp).trim();
};

let snsClient: SNSClient | null = null;

const getSnsClient = () => {
  if (!snsClient) {
    snsClient = new SNSClient({ region: resolveSnsRegion() });
  }

  return snsClient;
};

export const sendSupabaseAuthSms = async (input: SendSupabaseAuthSmsInput) => {
  if (!isHookEnabled()) {
    throw new SupabaseAuthSmsHookError(
      503,
      "hook_disabled",
      "Supabase Auth SMS hook is not enabled",
    );
  }

  const phone = input.phone.trim();
  const otp = input.otp.trim();
  const message = renderSmsMessage(otp);

  if (!phone || !otp || !message) {
    throw new SupabaseAuthSmsHookError(
      400,
      "invalid_payload",
      "Supabase Auth SMS hook requires phone and otp",
    );
  }

  const messageAttributes: Record<
    string,
    { DataType: "String"; StringValue: string }
  > = {
    "AWS.SNS.SMS.SMSType": {
      DataType: "String",
      StringValue: process.env.SNS_SMS_TYPE?.trim() || "Transactional",
    },
  };

  const senderId = process.env.SNS_SMS_SENDER_ID?.trim();
  if (senderId) {
    messageAttributes["AWS.SNS.SMS.SenderID"] = {
      DataType: "String",
      StringValue: senderId,
    };
  }

  try {
    const response = await getSnsClient().send(
      new PublishCommand({
        PhoneNumber: phone,
        Message: message,
        MessageAttributes: messageAttributes,
      }),
    );

    if (!response.MessageId) {
      throw new SupabaseAuthSmsHookError(
        502,
        "sns_api_error",
        "SNS publish returned no MessageId",
      );
    }

    return {
      provider: "sns" as const,
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
      error instanceof Error ? error.message : "SNS publish failed",
    );
  }
};

export const __testUtils = {
  resetSnsClientCache: () => {
    snsClient = null;
  },
};