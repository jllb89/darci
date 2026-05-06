export const appAccountActiveStatus = "active" as const;

export const appAccountInactiveError = {
  error: "account_inactive",
  message: "Account is not active",
} as const;

export const missingAppProfileError = {
  error: "account_profile_required",
  message: "Account profile is required",
} as const;

export const authLogoutScopes = ["local", "global"] as const;
export type AuthLogoutScope = (typeof authLogoutScopes)[number];
export const defaultAuthLogoutScope = "local" satisfies AuthLogoutScope;

export const authAuditActionNames = {
  loginSucceeded: "auth.login_succeeded",
  loginFailed: "auth.login_failed",
  signupRequested: "auth.signup_requested",
  signupSucceeded: "auth.signup_succeeded",
  signupFailed: "auth.signup_failed",
  refreshSucceeded: "auth.refresh_succeeded",
  refreshFailed: "auth.refresh_failed",
  logoutSucceeded: "auth.logout_succeeded",
  logoutFailed: "auth.logout_failed",
  accountInactiveBlocked: "auth.account_inactive_blocked",
  accountProfileMissingBlocked: "auth.account_profile_missing_blocked",
  passwordRecoveryRequested: "auth.password_recovery_requested",
  passwordResetSucceeded: "auth.password_reset_succeeded",
  emailConfirmationResent: "auth.email_confirmation_resent",
  emailConfirmed: "auth.email_confirmed",
  magicLinkRequested: "auth.magic_link_requested",
  magicLinkVerified: "auth.magic_link_verified",
  magicLinkFailed: "auth.magic_link_failed",
  otpRequested: "auth.otp_requested",
  otpVerified: "auth.otp_verified",
  otpFailed: "auth.otp_failed",
  oauthCallbackExchanged: "auth.oauth_callback_exchanged",
  mfaEnrolled: "auth.mfa_enrolled",
  mfaVerified: "auth.mfa_verified",
  reauthenticationSucceeded: "auth.reauthentication_succeeded",
  reauthenticationFailed: "auth.reauthentication_failed",
} as const;

export const authRateLimitPolicy = [
  {
    bucket: "auth.credentials",
    routes: ["POST /auth/login", "POST /auth/signup"],
    windowSeconds: 60,
    maxAttempts: 10,
    escalation: "captcha_after_repeated_failures",
  },
  {
    bucket: "auth.session_refresh",
    routes: ["POST /auth/refresh"],
    windowSeconds: 60,
    maxAttempts: 30,
    escalation: "block_abusive_refresh_clients",
  },
  {
    bucket: "auth.recovery_and_confirmation",
    routes: ["POST /auth/resend-confirmation", "POST /auth/password/recovery"],
    windowSeconds: 3600,
    maxAttempts: 5,
    escalation: "cooldown_by_email_and_ip",
  },
  {
    bucket: "auth.otp",
    routes: [
      "POST /auth/magic-link",
      "POST /auth/otp/start",
      "POST /auth/otp/verify",
      "POST /auth/phone/otp/start",
    ],
    windowSeconds: 3600,
    maxAttempts: 5,
    escalation: "cooldown_by_destination_and_ip",
  },
] as const;

export const sensitiveActionPolicy = {
  recentReauthWindowSeconds: 15 * 60,
  requireRecentReauthFor: [
    "auth.password_change",
    "auth.email_change",
    "auth.phone_change",
    "auth.mfa_enroll_or_unenroll",
    "admin.role_grant_or_revoke",
    "admin.user_invite_for_privileged_role",
    "notary.commission_profile_change",
    "notary.seal_or_signature_asset_change",
    "notary.finalization_or_seal_action",
    "billing.payment_method_change",
    "billing.high_value_checkout",
    "billing.refund_or_cancel",
    "billing.pro_credit_adjustment",
    "billing.notary_membership_override",
  ],
  requireMfaFor: [
    "admin.role_grant_or_revoke",
    "admin.user_invite_for_privileged_role",
    "admin.billing_override",
    "notary.finalization_or_seal_action",
    "billing.pro_credit_adjustment",
    "billing.notary_membership_override",
  ],
} as const;

export const isActiveAppAccountStatus = (status?: string | null) => {
  return (status ?? appAccountActiveStatus) === appAccountActiveStatus;
};

export const shouldAllowInactiveAccountRequest = (path: string) => {
  return path === "/auth/logout";
};

export const shouldAllowMissingIdentityRequest = (path: string) => {
  return path === "/auth/session/sync" || path === "/auth/password/reset";
};

export const shouldFailClosedOnMissingIdentity = () => {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.AUTH_ALLOW_MISSING_DB_USER_FALLBACK !== "true"
  );
};
