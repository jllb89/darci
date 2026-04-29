import { createHash } from "crypto";

export type EmailNotificationProvider = "internal" | "resend";

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

const parseAllowedEnvironments = () => {
  const raw =
    process.env.NOTIFICATION_PROVIDER_ALLOWED_ENVS ??
    process.env.NOTIFICATION_RESEND_ALLOWED_ENVS ??
    "";

  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const parseRolloutPercent = () => {
  const raw =
    process.env.NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT ??
    process.env.NOTIFICATION_RESEND_ROLLOUT_PERCENT ??
    "100";
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
  const rolloutPercent = parseRolloutPercent();

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

  const allowedEnvironments = parseAllowedEnvironments();
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
