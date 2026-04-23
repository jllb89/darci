import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

import { deriveDocumentSigningTemplateKey } from "../../src/services/documentInviteService";
import {
  canClaimInviteToken,
  createInviteAccessToken,
  hashInviteToken,
} from "../../src/services/inviteClaimService";

describe("invite runtime helpers", () => {
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

  it("creates stable token hashes and opaque access tokens", () => {
    const access = createInviteAccessToken();

    expect(access.token.length).toBeGreaterThan(20);
    expect(access.tokenPrefix).toBe(access.token.slice(0, 8));
    expect(hashInviteToken(access.token)).toBe(access.tokenHash);
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