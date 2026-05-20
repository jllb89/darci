import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  resendSendMock: vi.fn(),
  ensureUserIdentityFromAuthMock: vi.fn(),
  toUserResponseMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  findRecentAuditEventByEmailMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => mocks.createClientMock(...args),
}));

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mocks.resendSendMock },
  })),
}));

vi.mock("../../src/services/userRoleService", () => ({
  ensureUserIdentityFromAuth: mocks.ensureUserIdentityFromAuthMock,
  toUserResponse: mocks.toUserResponseMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
  findRecentAuditEventByEmail: mocks.findRecentAuditEventByEmailMock,
}));

const buildResponse = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const setHeader = vi.fn();

  return {
    res: { setHeader, status } as unknown as Response,
    setHeader,
    status,
    json,
  };
};

const buildProfile = () => ({
  id: "db-user-1",
  supabaseUserId: "auth-user-1",
  email: "member@example.com",
  phone: null,
  role: "member",
  status: "active",
  firstName: "Dana",
  lastName: "Ray",
  emailConfirmedAt: "2026-04-30T16:00:00.000Z",
  phoneConfirmedAt: null,
  lastSignInAt: "2026-04-30T16:01:00.000Z",
  lastAuthSyncedAt: "2026-04-30T16:02:00.000Z",
  availableRoles: ["member"],
  roleAssignments: [],
});

describe("auth controller Phase 1", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.RESEND_API_KEY = "resend-test-key";
    process.env.AUTH_OTP_FROM_ADDRESS = "DARCi <verified@example.com>";
    process.env.WEB_APP_URL = "https://app.example.com";
    delete process.env.AUTH_ALLOWED_ORIGINS;
    delete process.env.AUTH_REQUEST_SIGNATURE_SECRET;
    delete process.env.RESEND_FAILURE_MODE;
    delete process.env.RESEND_FROM_ADDRESS;
    delete process.env.NOTIFICATION_FROM_ADDRESS;

    mocks.ensureUserIdentityFromAuthMock.mockResolvedValue(buildProfile());
    mocks.toUserResponseMock.mockImplementation((profile: { email: string }) => ({
      id: "db-user-1",
      email: profile.email,
      role: "member",
      status: "active",
    }));
    mocks.recordAuditEventMock.mockResolvedValue(undefined);
    mocks.findRecentAuditEventByEmailMock.mockResolvedValue(null);
    mocks.resendSendMock.mockResolvedValue({ error: null });
  });

  it("creates a confirmation-aware signup without bypassing Supabase email confirmation", async () => {
    const signUpMock = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "member@example.com",
          app_metadata: {},
          user_metadata: { first_name: "Dana", last_name: "Ray" },
          email_confirmed_at: null,
          confirmed_at: null,
          last_sign_in_at: null,
        },
        session: null,
      },
      error: null,
    });
    mocks.createClientMock.mockReturnValue({ auth: { signUp: signUpMock } });

    const { signup } = await import("../../src/controllers/authController.ts");
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      body: {
        firstName: "Dana",
        lastName: "Ray",
        email: "member@example.com",
        password: "password123",
        returnTo: "/app/documents",
      },
    } as unknown as Request;

    await signup(req, res);

    expect(signUpMock).toHaveBeenCalledWith({
      email: "member@example.com",
      password: "password123",
      options: {
        emailRedirectTo:
          "https://app.example.com/auth/callback?intent=signup&returnTo=%2Fapp%2Fdocuments",
        data: { first_name: "Dana", last_name: "Ray" },
      },
    });
    expect(mocks.ensureUserIdentityFromAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseUserId: "auth-user-1",
        email: "member@example.com",
        firstName: "Dana",
        lastName: "Ray",
        emailConfirmedAt: null,
        lastSignInAt: null,
      }),
    );
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: null,
        refreshToken: null,
        requiresEmailConfirmation: true,
        emailConfirmationSent: true,
      }),
    );
  });

  it("resends signup confirmation through Supabase", async () => {
    const resendMock = vi.fn().mockResolvedValue({ error: null });
    mocks.createClientMock.mockReturnValue({ auth: { resend: resendMock } });

    const { resendConfirmation } = await import("../../src/controllers/authController.ts");
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      body: { email: "member@example.com", returnTo: "/app" },
    } as unknown as Request;

    await resendConfirmation(req, res);

    expect(resendMock).toHaveBeenCalledWith({
      type: "signup",
      email: "member@example.com",
      options: {
        emailRedirectTo:
          "https://app.example.com/auth/callback?intent=signup&returnTo=%2Fapp",
      },
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: "ok",
      message: "Confirmation email sent",
    });
  });

  it("requests Supabase password recovery with the recovery callback", async () => {
    const resetPasswordForEmailMock = vi.fn().mockResolvedValue({ error: null });
    mocks.createClientMock.mockReturnValue({
      auth: { resetPasswordForEmail: resetPasswordForEmailMock },
    });

    const { requestPasswordRecovery } = await import(
      "../../src/controllers/authController.ts"
    );
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      body: { email: "member@example.com", returnTo: "/app/settings" },
    } as unknown as Request;

    await requestPasswordRecovery(req, res);

    expect(resetPasswordForEmailMock).toHaveBeenCalledWith("member@example.com", {
      redirectTo:
        "https://app.example.com/auth/callback?intent=recovery&returnTo=%2Fapp%2Fsettings",
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: "ok",
      message: "Password recovery email sent",
    });
  });

  it("does not call Supabase when a password recovery email was recently sent", async () => {
    const resetPasswordForEmailMock = vi.fn();
    mocks.createClientMock.mockReturnValue({
      auth: { resetPasswordForEmail: resetPasswordForEmailMock },
    });
    mocks.findRecentAuditEventByEmailMock.mockResolvedValue({
      id: "audit-1",
      actor_id: null,
      entity_type: "auth",
      entity_id: null,
      action: "auth.password_recovery_requested",
      metadata: { email: "member@example.com" },
      created_at: "2026-04-30T16:00:00.000Z",
    });

    const { requestPasswordRecovery } = await import(
      "../../src/controllers/authController.ts"
    );
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      body: { email: "MEMBER@example.com", returnTo: "/app/settings" },
    } as unknown as Request;

    await requestPasswordRecovery(req, res);

    expect(mocks.findRecentAuditEventByEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: ["auth.password_recovery_requested"],
        email: "member@example.com",
      }),
    );
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: "ok",
      message:
        "Password recovery email already requested recently. Please use the latest email before requesting another.",
      recentlySent: true,
      cooldownSeconds: 300,
    });
  });

  it("maps Supabase password recovery email rate limits", async () => {
    const resetPasswordForEmailMock = vi.fn().mockResolvedValue({
      error: { message: "Email rate limit exceeded" },
    });
    mocks.createClientMock.mockReturnValue({
      auth: { resetPasswordForEmail: resetPasswordForEmailMock },
    });

    const { requestPasswordRecovery } = await import(
      "../../src/controllers/authController.ts"
    );
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      body: { email: "member@example.com", returnTo: "/app/settings" },
    } as unknown as Request;

    await requestPasswordRecovery(req, res);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      error: "rate_limited",
      message:
        "Password recovery email sends are temporarily rate limited. Please use the latest email or try again shortly.",
      cooldownSeconds: 300,
    });
  });

  it("requests a magic link without creating passwordless accounts", async () => {
    const signInWithOtpMock = vi.fn().mockResolvedValue({ error: null });
    mocks.createClientMock.mockReturnValue({
      auth: { signInWithOtp: signInWithOtpMock },
    });

    const { requestMagicLink } = await import(
      "../../src/controllers/authController.ts"
    );
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      body: { email: "MEMBER@example.com", returnTo: "/app/invite?token=abc" },
    } as unknown as Request;

    await requestMagicLink(req, res);

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "member@example.com",
      options: {
        emailRedirectTo:
          "https://app.example.com/auth/callback?intent=magic-link&returnTo=%2Fapp%2Finvite%3Ftoken%3Dabc",
        shouldCreateUser: false,
      },
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: "ok",
      message: "Magic link sent",
    });
  });

  it("requests an email OTP through custom delivery without creating passwordless accounts", async () => {
    const signInWithOtpMock = vi.fn().mockResolvedValue({ error: null });
    const generateLinkMock = vi.fn().mockResolvedValue({
      data: {
        properties: {
          email_otp: "12345678",
        },
      },
      error: null,
    });
    mocks.createClientMock
      .mockReturnValueOnce({ auth: { signInWithOtp: signInWithOtpMock } })
      .mockReturnValueOnce({ auth: { admin: { generateLink: generateLinkMock } } });

    const { requestEmailOtp } = await import(
      "../../src/controllers/authController.ts"
    );
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      body: { email: "member@example.com", returnTo: "/app" },
    } as unknown as Request;

    await requestEmailOtp(req, res);

    expect(generateLinkMock).toHaveBeenCalledWith({
      type: "magiclink",
      email: "member@example.com",
      options: {
        redirectTo: "https://app.example.com/auth/callback?intent=otp&returnTo=%2Fapp",
      },
    });
    expect(mocks.resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.com",
        subject: "Your DARCi verification code",
        text: "Your DARCi verification code is 12345678. This code expires shortly.",
      }),
    );
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      status: "ok",
      message: "Email code sent",
      otpLength: 8,
    });
  });

  it("blocks Supabase fallback when strict Resend OTP delivery fails", async () => {
    process.env.RESEND_FAILURE_MODE = "strict";
    const signInWithOtpMock = vi.fn().mockResolvedValue({ error: null });
    const generateLinkMock = vi.fn().mockResolvedValue({
      data: {
        properties: {
          email_otp: "123456",
        },
      },
      error: null,
    });
    mocks.resendSendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid from address" },
    });
    mocks.createClientMock
      .mockReturnValueOnce({ auth: { signInWithOtp: signInWithOtpMock } })
      .mockReturnValueOnce({ auth: { admin: { generateLink: generateLinkMock } } });

    const { requestEmailOtp } = await import(
      "../../src/controllers/authController.ts"
    );
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      method: "POST",
      path: "/auth/otp/start",
      originalUrl: "/auth/otp/start",
      body: { email: "member@example.com", returnTo: "/app" },
    } as unknown as Request;

    await requestEmailOtp(req, res);

    expect(generateLinkMock).toHaveBeenCalled();
    expect(mocks.resendSendMock).toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.otp_failed",
        metadata: expect.objectContaining({
          email: "member@example.com",
          stage: "custom_otp_delivery",
          resend_failure_mode: "strict",
          fallback_blocked: true,
        }),
      }),
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: "delivery_failed",
      message: "Unable to send verification code. Please try again later.",
    });
  });

  it("blocks provider calls when strict email OTP sender config is missing", async () => {
    process.env.RESEND_FAILURE_MODE = "strict";
    delete process.env.AUTH_OTP_FROM_ADDRESS;
    delete process.env.RESEND_FROM_ADDRESS;
    delete process.env.NOTIFICATION_FROM_ADDRESS;
    const signInWithOtpMock = vi.fn().mockResolvedValue({ error: null });
    const generateLinkMock = vi.fn().mockResolvedValue({
      data: {
        properties: {
          email_otp: "123456",
        },
      },
      error: null,
    });
    mocks.createClientMock
      .mockReturnValueOnce({ auth: { signInWithOtp: signInWithOtpMock } })
      .mockReturnValueOnce({ auth: { admin: { generateLink: generateLinkMock } } });

    const { requestEmailOtp } = await import(
      "../../src/controllers/authController.ts"
    );
    const { res, status, json } = buildResponse();
    const req = {
      headers: { origin: "https://app.example.com" },
      method: "POST",
      path: "/auth/otp/start",
      originalUrl: "/auth/otp/start",
      body: { email: "member@example.com", returnTo: "/app" },
    } as unknown as Request;

    await requestEmailOtp(req, res);

    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(mocks.resendSendMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.otp_failed",
        metadata: expect.objectContaining({
          email: "member@example.com",
          stage: "sender_config",
          resend_failure_mode: "strict",
          fallback_blocked: true,
        }),
      }),
    );
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: "delivery_failed",
      message: "Unable to send verification code. Please try again later.",
    });
  });

  it("verifies an email OTP and returns a DARCi session", async () => {
    const verifyOtpMock = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: "otp-access-token",
          refresh_token: "otp-refresh-token",
        },
        user: {
          id: "auth-user-1",
          email: "member@example.com",
          app_metadata: { role: "member" },
          user_metadata: { first_name: "Dana", last_name: "Ray" },
          email_confirmed_at: "2026-04-30T16:00:00.000Z",
          confirmed_at: "2026-04-30T16:00:00.000Z",
          last_sign_in_at: "2026-04-30T16:01:00.000Z",
        },
      },
      error: null,
    });
    mocks.createClientMock.mockReturnValue({ auth: { verifyOtp: verifyOtpMock } });

    const { verifyEmailOtp } = await import("../../src/controllers/authController.ts");
    const { res, status, json } = buildResponse();
    const req = {
      headers: {},
      body: { email: "member@example.com", token: "123 456", returnTo: "/app" },
    } as unknown as Request;

    await verifyEmailOtp(req, res);

    expect(verifyOtpMock).toHaveBeenCalledWith({
      email: "member@example.com",
      token: "123456",
      type: "email",
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      accessToken: "otp-access-token",
      refreshToken: "otp-refresh-token",
      user: {
        id: "db-user-1",
        email: "member@example.com",
        role: "member",
        status: "active",
      },
    });
  });

  it("resets a password through an authenticated recovery session", async () => {
    const setSessionMock = vi.fn().mockResolvedValue({ error: null });
    const updateUserMock = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "member@example.com",
          app_metadata: { role: "member" },
          user_metadata: { first_name: "Dana", last_name: "Ray" },
          email_confirmed_at: "2026-04-30T16:00:00.000Z",
          confirmed_at: "2026-04-30T16:00:00.000Z",
          last_sign_in_at: "2026-04-30T16:01:00.000Z",
        },
      },
      error: null,
    });
    mocks.createClientMock
      .mockReturnValueOnce({ auth: {} })
      .mockReturnValue({ auth: { setSession: setSessionMock, updateUser: updateUserMock } });

    const { resetPassword } = await import("../../src/controllers/authController.ts");
    const { res, status, json } = buildResponse();
    const req = {
      headers: { authorization: "Bearer access-token" },
      body: { refreshToken: "refresh-token", password: "newpassword123" },
      user: { id: "auth-user-1" },
    } as unknown as Request;

    await resetPassword(req, res);

    expect(setSessionMock).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(updateUserMock).toHaveBeenCalledWith({ password: "newpassword123" });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    );
  });

  it("syncs a browser PKCE session into the DARCi profile mirror", async () => {
    const getUserMock = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "member@example.com",
          app_metadata: { role: "member" },
          user_metadata: { first_name: "Dana", last_name: "Ray" },
          email_confirmed_at: "2026-04-30T16:00:00.000Z",
          confirmed_at: "2026-04-30T16:00:00.000Z",
          last_sign_in_at: "2026-04-30T16:01:00.000Z",
        },
      },
      error: null,
    });
    mocks.createClientMock.mockReturnValue({ auth: { getUser: getUserMock } });

    const { syncSession } = await import("../../src/controllers/authController.ts");
    const { res, status, json } = buildResponse();
    const req = {
      headers: { authorization: "Bearer access-token" },
      body: { refreshToken: "refresh-token", intent: "magic-link" },
    } as unknown as Request;

    await syncSession(req, res);

    expect(getUserMock).toHaveBeenCalledWith("access-token");
    expect(mocks.ensureUserIdentityFromAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseUserId: "auth-user-1",
        emailConfirmedAt: "2026-04-30T16:00:00.000Z",
        lastSignInAt: "2026-04-30T16:01:00.000Z",
      }),
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(mocks.recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.magic_link_verified" }),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    );
  });

  it("syncs a phone OTP session into a phone-only DARCi profile mirror", async () => {
    const getUserMock = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: null,
          phone: "+15551234567",
          app_metadata: { role: "member" },
          user_metadata: {},
          email_confirmed_at: null,
          phone_confirmed_at: "2026-05-07T12:00:00.000Z",
          confirmed_at: "2026-05-07T12:00:00.000Z",
          last_sign_in_at: "2026-05-07T12:01:00.000Z",
        },
      },
      error: null,
    });
    mocks.createClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    mocks.ensureUserIdentityFromAuthMock.mockResolvedValue({
      ...buildProfile(),
      email: null,
      phone: "+15551234567",
      emailConfirmedAt: null,
      phoneConfirmedAt: "2026-05-07T12:00:00.000Z",
    });
    mocks.toUserResponseMock.mockImplementation((profile: { email: string | null; phone: string | null }) => ({
      id: "db-user-1",
      email: profile.email ?? "",
      phone: profile.phone,
      role: "member",
      status: "active",
    }));

    const { syncSession } = await import("../../src/controllers/authController.ts");
    const { res, status, json } = buildResponse();
    const req = {
      headers: { authorization: "Bearer access-token" },
      body: { refreshToken: "refresh-token", intent: "otp" },
    } as unknown as Request;

    await syncSession(req, res);

    expect(mocks.ensureUserIdentityFromAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        supabaseUserId: "auth-user-1",
        email: null,
        phone: "+15551234567",
        emailConfirmedAt: null,
        phoneConfirmedAt: "2026-05-07T12:00:00.000Z",
        lastSignInAt: "2026-05-07T12:01:00.000Z",
      }),
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({
          email: "",
          phone: "+15551234567",
        }),
      }),
    );
  });
});