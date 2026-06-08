import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

import {
  deriveDocumentSigningTemplateKey,
  resolveDocumentInviteDocumentTypeLabel,
  resolveDocumentInviteEmailProvider,
  resolveDocumentInviteRoleLabel,
} from "../../src/services/documentInviteService";
import {
  canClaimInviteToken,
  createInviteAccessToken,
  hashInviteToken,
} from "../../src/services/inviteClaimService";

const providerEnvKeys = [
  "NOTIFICATION_PROVIDER",
  "NOTIFICATION_PROVIDER_RESEND_ENABLED",
  "NOTIFICATION_RESEND_ENABLED",
  "NOTIFICATION_PROVIDER_ALLOWED_ENVS",
  "NOTIFICATION_RESEND_ALLOWED_ENVS",
  "NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT",
  "NOTIFICATION_RESEND_ROLLOUT_PERCENT",
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

describe("invite runtime helpers", () => {
  beforeEach(() => {
    clearProviderEnv();
  });

  afterEach(() => {
    restoreProviderEnv();
  });

  it("uses the signup-required template when the recipient has no account yet", () => {
    expect(
      deriveDocumentSigningTemplateKey({
        hasExistingUser: false,
        isReminder: false,
        claimMode: "required_signup",
      }),
    ).toBe("signer_signup_required_email");
  });

  it("uses the reminder template on resend regardless of account state", () => {
    expect(
      deriveDocumentSigningTemplateKey({
        hasExistingUser: false,
        isReminder: true,
        claimMode: "required_signup",
      }),
    ).toBe("signer_reminder_email");
  });

  it("routes invite email deliveries through Resend only when explicitly enabled", () => {
    expect(resolveDocumentInviteEmailProvider()).toBe("internal");

    process.env.NOTIFICATION_PROVIDER = "resend";
    expect(resolveDocumentInviteEmailProvider()).toBe("resend");

    process.env.NOTIFICATION_PROVIDER = "internal";
    expect(resolveDocumentInviteEmailProvider()).toBe("internal");
  });

  it("uses the shared rollout policy for invite email deliveries", () => {
    process.env.NOTIFICATION_PROVIDER = "resend";
    process.env.NOTIFICATION_PROVIDER_RESEND_ROLLOUT_PERCENT = "50";

    expect(resolveDocumentInviteEmailProvider({ rolloutKey: "user-0" })).toBe("resend");
    expect(resolveDocumentInviteEmailProvider({ rolloutKey: "alpha" })).toBe("internal");
  });

  it("creates stable token hashes and opaque access tokens", () => {
    const access = createInviteAccessToken();

    expect(access.token.length).toBeGreaterThan(20);
    expect(access.tokenPrefix).toBe(access.token.slice(0, 8));
    expect(hashInviteToken(access.token)).toBe(access.tokenHash);
  });

  it("uses client-facing trust labels for signer invitation payloads", () => {
    expect(resolveDocumentInviteRoleLabel({ partyRole: "grantor" })).toBe("Trustmaker");
    expect(
      resolveDocumentInviteDocumentTypeLabel({
        document_type: "intake",
        product_flow_mode: "trust_bundle",
      } as never),
    ).toBe("trust registration");
  });

  it("blocks claim attempts when existing-account-only invites are anonymous", () => {
    expect(
      canClaimInviteToken({
        tokenStatus: "active",
        useCount: 0,
        maxUses: 1,
        expiresAt: "2999-01-01T00:00:00.000Z",
        inviteStatus: "opened",
        claimMode: "existing_account_only",
        viewerUserId: null,
      }),
    ).toBe(false);
  });

  it("allows active, unexpired invites to be claimed", () => {
    expect(
      canClaimInviteToken({
        tokenStatus: "active",
        useCount: 0,
        maxUses: 1,
        expiresAt: "2999-01-01T00:00:00.000Z",
        inviteStatus: "opened",
        claimMode: "required_signup",
        viewerUserId: null,
      }),
    ).toBe(true);
  });
});