import {
  CheckIfPhoneNumberIsOptedOutCommand,
  GetSMSAttributesCommand,
  GetSMSSandboxAccountStatusCommand,
  ListSMSSandboxPhoneNumbersCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import request from "supertest";
import { Webhook } from "standardwebhooks";
import { app } from "../src/index";

type ProbeMode = "status" | "send-hook";

type ProbeOptions = {
  mode: ProbeMode;
  phone: string | null;
  otp: string;
  region: string;
  hookSecret: string;
  origin: string;
};

const getArgValue = (name: string) => {
  const prefix = `${name}=`;
  const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
};

const maskPhone = (phone: string | null) => {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) {
    return "[phone]";
  }

  return `${phone.startsWith("+") ? "+" : ""}${digits.slice(0, 1)}***${digits.slice(-2)}`;
};

const normalizeHookSecret = (value: string) => value.trim().replace(/^v\d+,/, "");

const getLocalHookSecret = () => {
  const configured = getArgValue("--hook-secret") ?? process.env.SUPABASE_AUTH_SMS_HOOK_SECRET;
  if (configured?.trim()) {
    return normalizeHookSecret(configured);
  }

  return `whsec_${Buffer.from("darci-local-auth-sms-hook-probe").toString("base64")}`;
};

const getProbeOptions = (): ProbeOptions => {
  const sendHook = process.argv.includes("--send-hook");
  const phone = getArgValue("--phone") ?? process.env.SMS_TEST_PHONE ?? null;

  if (sendHook && !phone) {
    throw new Error("Pass --phone +15551234567 when using --send-hook");
  }

  return {
    mode: sendHook ? "send-hook" : "status",
    phone,
    otp: getArgValue("--otp") ?? "123456",
    region:
      getArgValue("--region") ??
      process.env.SNS_REGION ??
      process.env.AWS_REGION ??
      process.env.AWS_DEFAULT_REGION ??
      "us-east-1",
    hookSecret: getLocalHookSecret(),
    origin: getArgValue("--origin") ?? "http://localhost:3000",
  };
};

const getSnsClient = (region: string) => new SNSClient({ region });

const getSmsAttributes = async (snsClient: SNSClient) => {
  const response = await snsClient.send(
    new GetSMSAttributesCommand({
      attributes: [
        "DefaultSMSType",
        "DefaultSenderID",
        "MonthlySpendLimit",
        "DeliveryStatusIAMRole",
        "DeliveryStatusSuccessSamplingRate",
        "UsageReportS3Bucket",
      ],
    }),
  );

  const attributes = response.attributes ?? {};
  return {
    defaultSmsType: attributes.DefaultSMSType ?? null,
    defaultSenderIdConfigured: Boolean(attributes.DefaultSenderID?.trim()),
    monthlySpendLimitUsd: attributes.MonthlySpendLimit ?? null,
    deliveryStatusIamRoleConfigured: Boolean(attributes.DeliveryStatusIAMRole?.trim()),
    deliveryStatusSuccessSamplingRate: attributes.DeliveryStatusSuccessSamplingRate ?? null,
    usageReportS3BucketConfigured: Boolean(attributes.UsageReportS3Bucket?.trim()),
  };
};

const getSmsSandboxStatus = async (snsClient: SNSClient) => {
  const status = await snsClient.send(new GetSMSSandboxAccountStatusCommand({}));
  const phoneNumbers = await snsClient.send(
    new ListSMSSandboxPhoneNumbersCommand({ MaxResults: 100 }),
  );

  const sandboxPhones = phoneNumbers.PhoneNumbers ?? [];
  const statusCounts = sandboxPhones.reduce<Record<string, number>>((counts, entry) => {
    const statusKey = entry.Status ?? "UNKNOWN";
    counts[statusKey] = (counts[statusKey] ?? 0) + 1;
    return counts;
  }, {});

  return {
    isInSandbox: Boolean(status.IsInSandbox),
    sandboxPhoneCount: sandboxPhones.length,
    sandboxPhoneStatusCounts: statusCounts,
  };
};

const getOptOutStatus = async (snsClient: SNSClient, phone: string | null) => {
  if (!phone) {
    return null;
  }

  const response = await snsClient.send(
    new CheckIfPhoneNumberIsOptedOutCommand({ phoneNumber: phone }),
  );

  return {
    phone: maskPhone(phone),
    isOptedOut: Boolean(response.isOptedOut),
  };
};

const probeSnsStatus = async (options: ProbeOptions) => {
  const snsClient = getSnsClient(options.region);
  const [attributes, sandboxStatus, optOutStatus] = await Promise.all([
    getSmsAttributes(snsClient),
    getSmsSandboxStatus(snsClient),
    getOptOutStatus(snsClient, options.phone),
  ]);

  console.info("[auth.sms.probe] sns_status", {
    region: options.region,
    attributes,
    sandboxStatus,
    optOutStatus,
  });
};

const probeSignedLocalHook = async (options: ProbeOptions) => {
  process.env.SUPABASE_AUTH_SMS_HOOK_ENABLED = "true";
  process.env.SUPABASE_AUTH_SMS_HOOK_SECRET = options.hookSecret;
  process.env.SNS_REGION = options.region;

  if (!process.env.SUPABASE_AUTH_SMS_MESSAGE_TEMPLATE?.trim()) {
    process.env.SUPABASE_AUTH_SMS_MESSAGE_TEMPLATE =
      "DARCi local SMS probe code: {{otp}}.";
  }

  const rawBody = JSON.stringify({
    user: { id: "local-sms-probe", phone: options.phone },
    sms: { otp: options.otp },
  });
  const messageId = `local_sms_probe_${Date.now()}`;
  const timestamp = new Date();
  const webhook = new Webhook(options.hookSecret);
  const signature = webhook.sign(messageId, timestamp, rawBody);

  console.info("[auth.sms.probe] signed_hook_start", {
    region: options.region,
    phone: maskPhone(options.phone),
    otpLength: options.otp.length,
    hookEnabled: process.env.SUPABASE_AUTH_SMS_HOOK_ENABLED,
    hookSecretConfigured: Boolean(process.env.SUPABASE_AUTH_SMS_HOOK_SECRET?.trim()),
    sendsProviderSms: true,
  });

  const response = await request(app)
    .post("/webhooks/supabase/auth/send-sms")
    .set("Content-Type", "application/json")
    .set("webhook-id", messageId)
    .set("webhook-timestamp", String(Math.floor(timestamp.getTime() / 1000)))
    .set("webhook-signature", signature)
    .set("Origin", options.origin)
    .send(rawBody);

  console.info("[auth.sms.probe] signed_hook_response", {
    status: response.status,
    body: response.body,
  });
};

const main = async () => {
  const options = getProbeOptions();
  await probeSnsStatus(options);

  if (options.mode === "send-hook") {
    await probeSignedLocalHook(options);
  }
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("[auth.sms.probe] failed", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : null,
    });
    process.exit(1);
  });