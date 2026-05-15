import { createHash } from "crypto";

export type EmailNotificationProvider = "internal" | "resend";
export type SmsNotificationProvider = "internal" | "sns";

export type EmailProviderResolution = {
  provider: EmailNotificationProvider;
  configuredProvider: string | null;
  environment: string;
  rolloutPercent: number;
  reason:
    | "provider_not_resend"
    | "resend_disabled"
    | "environment_not_allowed"
    | "rollout_percent_zero"
    | "rollout_percent_full"
    | "rollout_key_missing"
    | "rollout_key_selected"
    | "rollout_key_not_selected";
};

export type SmsProviderResolution = {
  provider: SmsNotificationProvider;
  configuredProvider: string | null;
  environment: string;
  rolloutPercent: number;
  reason:
    | "provider_not_sns"
    | "sns_disabled"
    | "environment_not_allowed"
    | "rollout_percent_zero"
    | "rollout_percent_full"
    | "rollout_key_missing"
    | "rollout_key_selected"
    | "rollout_key_not_selected";
};

const truthyValues = new Set(["1", "true", "yes", "on"]);
const falsyValues = new Set(["0", "false", "no", "off"]);

const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getCurrentEnvironment = () => {
  return (
    process.env.APP_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    process.env.DARCI_ENV?.trim() ||
    "local"
  ).toLowerCase();
};

const parseBooleanFlag = (value: string | null | undefined) => {
  const normalized = normalize(value);
  if (!normalized) {
    return null;
  }

  if (truthyValues.has(normalized)) {
    return true;
  }

  if (falsyValues.has(normalized)) {
    return false;
  }

  return null;
};

const firstConfiguredEnvValue = (keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
};

const parseAllowedEnvironments = (keys: string[]) => {
  const raw = firstConfiguredEnvValue(keys);

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const parseRolloutPercent = (keys: string[]) => {
  const raw = firstConfiguredEnvValue(keys) || "100";
  const parsed = Number.parseFloat(raw);

  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.min(Math.max(parsed, 0), 100);
};

const hashRolloutKey = (rolloutKey: string) => {
  const digest = createHash("sha256").update(rolloutKey).digest("hex").slice(0, 8);
  return Number.parseInt(digest, 16) % 100;
};

export const resolveEmailNotificationProvider = (input?: {
  rolloutKey?: string | null | undefined;
  environment?: string | null | undefined;
}): EmailProviderResolution => {
  const configuredProvider = normalize(process.env.NOTIFICATION_PROVIDER) || null;
  const environment = normalize(input?.environment) || getCurrentEnvironment();
  const rolloutPercent = parseRolloutPercent([
    "NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT",
    "NOTIFICATION_RESEND_ROLLOUT_PERCENT",
  ]);

  if (configuredProvider !== "resend") {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "provider_not_resend",
    };
  }

  const resendEnabled = parseBooleanFlag(
    process.env.NOTIFICATION_PROVIDER_RESEND_ENABLED ??
      process.env.NOTIFICATION_RESEND_ENABLED,
  );
  if (resendEnabled === false) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "resend_disabled",
    };
  }

  const allowedEnvironments = parseAllowedEnvironments([
    "NOTIFICATION_PROVIDER_ALLOWED_ENVS",
    "NOTIFICATION_RESEND_ALLOWED_ENVS",
  ]);
  if (
    allowedEnvironments.length > 0 &&
    !allowedEnvironments.includes(environment)
  ) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "environment_not_allowed",
    };
  }

  if (rolloutPercent <= 0) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "rollout_percent_zero",
    };
  }

  if (rolloutPercent >= 100) {
    return {
      provider: "resend",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "rollout_percent_full",
    };
  }

  const rolloutKey = input?.rolloutKey?.trim();
  if (!rolloutKey) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "rollout_key_missing",
    };
  }

  const bucket = hashRolloutKey(`${environment}:${rolloutKey}`);
  const selected = bucket < rolloutPercent;

  return {
    provider: selected ? "resend" : "internal",
    configuredProvider,
    environment,
    rolloutPercent,
    reason: selected ? "rollout_key_selected" : "rollout_key_not_selected",
  };
};

export const resolveSmsNotificationProvider = (input?: {
  rolloutKey?: string | null | undefined;
  environment?: string | null | undefined;
}): SmsProviderResolution => {
  const configuredProvider =
    normalize(
      process.env.NOTIFICATION_SMS_PROVIDER ??
        process.env.SMS_NOTIFICATION_PROVIDER ??
        process.env.NOTIFICATION_PROVIDER_SMS,
    ) || null;
  const environment = normalize(input?.environment) || getCurrentEnvironment();
  const rolloutPercent = parseRolloutPercent([
    "NOTIFICATION_PROVIDER_SNS_ROLLOUT_PERCENT",
    "NOTIFICATION_SNS_ROLLOUT_PERCENT",
    "NOTIFICATION_SMS_ROLLOUT_PERCENT",
  ]);

  if (configuredProvider !== "sns") {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "provider_not_sns",
    };
  }

  const snsEnabled = parseBooleanFlag(
    process.env.NOTIFICATION_PROVIDER_SNS_ENABLED ??
      process.env.NOTIFICATION_SNS_ENABLED ??
      process.env.NOTIFICATION_SMS_ENABLED,
  );
  if (snsEnabled === false) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "sns_disabled",
    };
  }

  const allowedEnvironments = parseAllowedEnvironments([
    "NOTIFICATION_SMS_ALLOWED_ENVS",
    "NOTIFICATION_SNS_ALLOWED_ENVS",
    "NOTIFICATION_PROVIDER_ALLOWED_ENVS",
  ]);
  if (
    allowedEnvironments.length > 0 &&
    !allowedEnvironments.includes(environment)
  ) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "environment_not_allowed",
    };
  }

  if (rolloutPercent <= 0) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "rollout_percent_zero",
    };
  }

  if (rolloutPercent >= 100) {
    return {
      provider: "sns",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "rollout_percent_full",
    };
  }

  const rolloutKey = input?.rolloutKey?.trim();
  if (!rolloutKey) {
    return {
      provider: "internal",
      configuredProvider,
      environment,
      rolloutPercent,
      reason: "rollout_key_missing",
    };
  }

  const bucket = hashRolloutKey(`${environment}:sms:${rolloutKey}`);
  const selected = bucket < rolloutPercent;

  return {
    provider: selected ? "sns" : "internal",
    configuredProvider,
    environment,
    rolloutPercent,
    reason: selected ? "rollout_key_selected" : "rollout_key_not_selected",
  };
};
