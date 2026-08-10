import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveEmailNotificationProvider,
  resolvePushNotificationProvider,
  resolveSmsNotificationProvider,
} from "../../src/services/notificationProviderPolicy";

const providerEnvKeys = [
  "NOTIFICATION_PROVIDER",
  "NOTIFICATION_PROVIDER_RESEND_ENABLED",
  "NOTIFICATION_RESEND_ENABLED",
  "NOTIFICATION_PROVIDER_ALLOWED_ENVS",
  "NOTIFICATION_RESEND_ALLOWED_ENVS",
  "NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT",
  "NOTIFICATION_RESEND_ROLLOUT_PERCENT",
  "NOTIFICATION_SMS_PROVIDER",
  "SMS_NOTIFICATION_PROVIDER",
  "NOTIFICATION_PROVIDER_SMS",
  "NOTIFICATION_PROVIDER_SNS_ENABLED",
  "NOTIFICATION_SNS_ENABLED",
  "NOTIFICATION_SMS_ENABLED",
  "NOTIFICATION_SMS_ALLOWED_ENVS",
  "NOTIFICATION_SNS_ALLOWED_ENVS",
  "NOTIFICATION_PROVIDER_SNS_ROLLOUT_PERCENT",
  "NOTIFICATION_SNS_ROLLOUT_PERCENT",
  "NOTIFICATION_SMS_ROLLOUT_PERCENT",
  "NOTIFICATION_PUSH_PROVIDER",
  "PUSH_NOTIFICATION_PROVIDER",
  "NOTIFICATION_PROVIDER_PUSH",
  "NOTIFICATION_PROVIDER_APNS_ENABLED",
  "NOTIFICATION_APNS_ENABLED",
  "NOTIFICATION_PUSH_ENABLED",
  "NOTIFICATION_PUSH_ALLOWED_ENVS",
  "NOTIFICATION_APNS_ALLOWED_ENVS",
  "NOTIFICATION_PROVIDER_APNS_ROLLOUT_PERCENT",
  "NOTIFICATION_APNS_ROLLOUT_PERCENT",
  "NOTIFICATION_PUSH_ROLLOUT_PERCENT",
  "APP_ENV",
  "DARCI_ENV",
] as const;

const originalProviderEnv = new Map(
  providerEnvKeys.map((key) => [key, process.env[key]]),
);

const clearProviderEnv = () => {
  providerEnvKeys.forEach((key) => {
    delete process.env[key];
  });
};

const restoreProviderEnv = () => {
  providerEnvKeys.forEach((key) => {
    const originalValue = originalProviderEnv.get(key);
    if (originalValue === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalValue;
    }
  });
};

describe("email notification provider policy", () => {
  beforeEach(() => {
    clearProviderEnv();
  });

  afterEach(() => {
    restoreProviderEnv();
  });

  it("defaults to the internal provider", () => {
    const resolution = resolveEmailNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("provider_not_resend");
  });

  it("uses Resend when explicitly configured with a full rollout", () => {
    process.env.NOTIFICATION_PROVIDER = "resend";

    const resolution = resolveEmailNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("resend");
    expect(resolution.reason).toBe("rollout_percent_full");
  });

  it("supports an emergency Resend disable flag", () => {
    process.env.NOTIFICATION_PROVIDER = "resend";
    process.env.NOTIFICATION_PROVIDER_RESEND_ENABLED = "false";

    const resolution = resolveEmailNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("resend_disabled");
  });

  it("limits Resend to allowed environments when configured", () => {
    process.env.NOTIFICATION_PROVIDER = "resend";
    process.env.APP_ENV = "production";
    process.env.NOTIFICATION_PROVIDER_ALLOWED_ENVS = "staging";

    const resolution = resolveEmailNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("environment_not_allowed");
  });

  it("honors a zero percent rollout", () => {
    process.env.NOTIFICATION_PROVIDER = "resend";
    process.env.NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT = "0";

    const resolution = resolveEmailNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("rollout_percent_zero");
  });

  it("requires a rollout key for partial rollouts", () => {
    process.env.NOTIFICATION_PROVIDER = "resend";
    process.env.NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT = "50";

    const resolution = resolveEmailNotificationProvider();

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("rollout_key_missing");
  });

  it("selects partial rollout traffic deterministically", () => {
    process.env.NOTIFICATION_PROVIDER = "resend";
    process.env.NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT = "50";

    const selected = resolveEmailNotificationProvider({ rolloutKey: "user-0" });
    const notSelected = resolveEmailNotificationProvider({ rolloutKey: "alpha" });
    const selectedAgain = resolveEmailNotificationProvider({ rolloutKey: "user-0" });

    expect(selected.provider).toBe("resend");
    expect(selected.reason).toBe("rollout_key_selected");
    expect(selectedAgain.provider).toBe(selected.provider);
    expect(notSelected.provider).toBe("internal");
    expect(notSelected.reason).toBe("rollout_key_not_selected");
  });
});

describe("SMS notification provider policy", () => {
  beforeEach(() => {
    clearProviderEnv();
  });

  afterEach(() => {
    restoreProviderEnv();
  });

  it("defaults to the internal provider", () => {
    const resolution = resolveSmsNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("provider_not_sns");
  });

  it("uses SNS when explicitly configured", () => {
    process.env.NOTIFICATION_SMS_PROVIDER = "sns";

    const resolution = resolveSmsNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("sns");
    expect(resolution.reason).toBe("rollout_percent_full");
  });

  it("supports an emergency SNS disable flag", () => {
    process.env.NOTIFICATION_SMS_PROVIDER = "sns";
    process.env.NOTIFICATION_PROVIDER_SNS_ENABLED = "false";

    const resolution = resolveSmsNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("sns_disabled");
  });

  it("limits SNS to allowed environments when configured", () => {
    process.env.NOTIFICATION_SMS_PROVIDER = "sns";
    process.env.APP_ENV = "production";
    process.env.NOTIFICATION_SMS_ALLOWED_ENVS = "staging";

    const resolution = resolveSmsNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("environment_not_allowed");
  });
});

describe("push notification provider policy", () => {
  beforeEach(() => {
    clearProviderEnv();
  });

  afterEach(() => {
    restoreProviderEnv();
  });

  it("defaults to the internal provider", () => {
    const resolution = resolvePushNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("provider_not_apns");
  });

  it("uses APNs when explicitly configured", () => {
    process.env.NOTIFICATION_PUSH_PROVIDER = "apns";

    const resolution = resolvePushNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("apns");
    expect(resolution.reason).toBe("rollout_percent_full");
  });

  it("supports an emergency APNs disable flag", () => {
    process.env.NOTIFICATION_PUSH_PROVIDER = "apns";
    process.env.NOTIFICATION_PROVIDER_APNS_ENABLED = "false";

    const resolution = resolvePushNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("apns_disabled");
  });

  it("limits APNs to allowed environments", () => {
    process.env.NOTIFICATION_PUSH_PROVIDER = "apns";
    process.env.APP_ENV = "production";
    process.env.NOTIFICATION_APNS_ALLOWED_ENVS = "staging";

    const resolution = resolvePushNotificationProvider({ rolloutKey: "user-1" });

    expect(resolution.provider).toBe("internal");
    expect(resolution.reason).toBe("environment_not_allowed");
  });

  it("selects partial APNs rollout traffic deterministically", () => {
    process.env.NOTIFICATION_PUSH_PROVIDER = "apns";
    process.env.NOTIFICATION_PROVIDER_APNS_ROLLOUT_PERCENT = "50";

    const selected = resolvePushNotificationProvider({ rolloutKey: "user-0" });
    const notSelected = resolvePushNotificationProvider({ rolloutKey: "alpha" });
    const selectedAgain = resolvePushNotificationProvider({ rolloutKey: "user-0" });

    expect(selected.provider).toBe("apns");
    expect(selected.reason).toBe("rollout_key_selected");
    expect(selectedAgain.provider).toBe(selected.provider);
    expect(notSelected.provider).toBe("internal");
    expect(notSelected.reason).toBe("rollout_key_not_selected");
  });
});
