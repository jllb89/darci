import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  appAccountInactiveError,
  authAuditActionNames,
  authLogoutScopes,
  defaultAuthLogoutScope,
  isActiveAppAccountStatus,
} from "../auth/authPolicy";
import {
  ensureUserIdentityFromAuth,
  type UserIdentityContext,
  toUserResponse,
} from "../services/userRoleService";
import {
  findRecentAuditEventByEmail,
  recordAuditEvent,
} from "../services/auditService";
import { sendValidationError } from "../utils/validation";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const defaultAuthEmailSendCooldownSeconds = 5 * 60;
const configuredAuthEmailSendCooldownSeconds = Number(
  process.env.AUTH_EMAIL_SEND_COOLDOWN_SECONDS,
);
const authEmailSendCooldownSeconds = Number.isFinite(
  configuredAuthEmailSendCooldownSeconds,
) && configuredAuthEmailSendCooldownSeconds > 0
  ? configuredAuthEmailSendCooldownSeconds
  : defaultAuthEmailSendCooldownSeconds;

const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const returnToSchema = z.string().trim().min(1).max(500).optional();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const signupSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  returnTo: returnToSchema,
});

const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1),
  scope: z.enum(authLogoutScopes).default(defaultAuthLogoutScope),
});

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const emailActionSchema = z.object({
  email: z.string().email(),
  returnTo: returnToSchema,
});

const emailOtpVerifySchema = z.object({
  email: z.string().email(),
  token: z.string().trim().min(4).max(32),
  returnTo: returnToSchema,
});

const passwordResetSchema = z.object({
  refreshToken: z.string().trim().min(1),
  password: z.string().min(8),
});

const syncSessionSchema = z.object({
  refreshToken: z.string().trim().min(1).nullable().optional(),
  intent: z.enum(["signup", "magic-link", "otp", "oauth"]).optional(),
});

const ensureConfigured = (res: Response) => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    res.status(500).json({
      error: "internal_error",
      message: "Supabase auth is not configured",
    });
    return false;
  }

  return true;
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.authorization ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "").trim() || null;
};

const sanitizeReturnTo = (value?: string | null) => {
  const candidate = value?.trim() ?? "";
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/app";
  }

  const isAppRoute =
    candidate === "/app" || candidate.startsWith("/app/") || candidate.startsWith("/app?");

  return isAppRoute ? candidate : "/app";
};

const normalizeEmailForAuthAction = (email: string) => email.trim().toLowerCase();
const normalizeOtpToken = (token: string) => token.replace(/\s+/g, "").trim();

const passwordlessEmailActions = [
  authAuditActionNames.magicLinkRequested,
  authAuditActionNames.otpRequested,
];

const getAuthEmailCooldownSince = () =>
  new Date(Date.now() - authEmailSendCooldownSeconds * 1000).toISOString();

const findRecentAuthEmailSend = (input: { actions: string[]; email: string }) =>
  findRecentAuditEventByEmail({
    actions: input.actions,
    email: input.email,
    since: getAuthEmailCooldownSince(),
  });

const sendRecentAuthEmailResponse = (res: Response, message: string) =>
  res.status(200).json({
    status: "ok",
    message,
    recentlySent: true,
    cooldownSeconds: authEmailSendCooldownSeconds,
  });

const isSupabaseEmailRateLimitError = (message?: string | null) =>
  /email.*rate limit|rate limit.*email|too many requests/i.test(message ?? "");

const sendAuthEmailRateLimitResponse = (res: Response, message: string) => {
  res.setHeader("Retry-After", String(authEmailSendCooldownSeconds));
  return res.status(429).json({
    error: "rate_limited",
    message,
    cooldownSeconds: authEmailSendCooldownSeconds,
  });
};

const getWebBaseUrl = (req: Request) => {
  const configuredBaseUrl =
    process.env.WEB_APP_URL ??
    process.env.NEXT_PUBLIC_WEB_BASE_URL ??
    process.env.APP_BASE_URL ??
    null;
  const origin = req.headers.origin;
  const baseUrl = configuredBaseUrl ?? (typeof origin === "string" ? origin : null);

  return (baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
};

const buildAuthActionRedirectUrl = (
  req: Request,
  input: { intent: "signup" | "recovery" | "magic-link" | "otp"; returnTo?: string | null },
) => {
  const redirectUrl = new URL("/auth/callback", getWebBaseUrl(req));
  redirectUrl.searchParams.set("intent", input.intent);
  redirectUrl.searchParams.set("returnTo", sanitizeReturnTo(input.returnTo));
  return redirectUrl.toString();
};

const createSupabaseSessionClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

const ensureActiveAccount = (profile: UserIdentityContext, res: Response) => {
  if (isActiveAppAccountStatus(profile.status)) {
    return true;
  }

  res.status(403).json(appAccountInactiveError);
  return false;
};

type SupabaseAuthUserLike = {
  id: string;
  email?: string | null;
  phone?: string | null;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  email_confirmed_at?: string | null;
  phone_confirmed_at?: string | null;
  confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

const getStringMetadata = (metadata: Record<string, unknown> | undefined, key: string) => {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
};

const syncProfileFromAuthUser = async (input: {
  user: SupabaseAuthUserLike;
  emailFallback?: string | null;
  phoneFallback?: string | null;
  firstNameFallback?: string | null;
  lastNameFallback?: string | null;
}) => {
  const emailConfirmedAt =
    input.user.email_confirmed_at ??
    (input.user.email ? input.user.confirmed_at ?? null : null);
  const phoneConfirmedAt =
    input.user.phone_confirmed_at ??
    (input.user.phone ? input.user.confirmed_at ?? null : null);

  return ensureUserIdentityFromAuth({
    supabaseUserId: input.user.id,
    email: input.user.email ?? input.emailFallback ?? null,
    phone: input.user.phone ?? input.phoneFallback ?? null,
    role: (input.user.app_metadata?.role as string | undefined) ?? "member",
    firstName:
      getStringMetadata(input.user.user_metadata, "first_name") ??
      input.firstNameFallback ??
      null,
    lastName:
      getStringMetadata(input.user.user_metadata, "last_name") ??
      input.lastNameFallback ??
      null,
    emailConfirmedAt,
    phoneConfirmedAt,
    lastSignInAt: input.user.last_sign_in_at ?? null,
    lastAuthSyncedAt: new Date().toISOString(),
  });
};

const recordAuthEvent = async (input: {
  action: string;
  actorSupabaseId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  await recordAuditEvent({
    ...(input.actorSupabaseId ? { actorSupabaseId: input.actorSupabaseId } : {}),
    entityType: "auth",
    entityId: null,
    action: input.action,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
};

export const login = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { data, error } = await supabasePublic.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session || !data.user) {
    return res.status(401).json({
      error: "unauthorized",
      message: error?.message ?? "Invalid email or password",
    });
  }

  try {
    const profile = await syncProfileFromAuthUser({
      user: data.user,
      emailFallback: parsed.data.email,
    });

    if (!ensureActiveAccount(profile, res)) {
      return;
    }

    return res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const parsed = logoutSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid authorization header",
    });
  }

  const supabaseSessionClient = createSupabaseSessionClient();
  const { error: sessionError } = await supabaseSessionClient.auth.setSession({
    access_token: accessToken,
    refresh_token: parsed.data.refreshToken,
  });

  if (sessionError) {
    return res.status(401).json({
      error: "unauthorized",
      message: sessionError.message,
    });
  }

  const { error: signOutError } = await supabaseSessionClient.auth.signOut({
    scope: parsed.data.scope,
  });

  if (signOutError) {
    return res.status(500).json({
      error: "internal_error",
      message: signOutError.message,
    });
  }

  return res.status(200).json({
    status: "ok",
    message: "Signed out",
  });
};

export const refresh = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = refreshSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const supabaseSessionClient = createSupabaseSessionClient();
  const { data, error } = await supabaseSessionClient.auth.refreshSession({
    refresh_token: parsed.data.refreshToken,
  });

  if (error || !data.session || !data.user) {
    return res.status(401).json({
      error: "unauthorized",
      message: error?.message ?? "Invalid refresh token",
    });
  }

  try {
    const profile = await syncProfileFromAuthUser({
      user: data.user,
    });

    if (!ensureActiveAccount(profile, res)) {
      return;
    }

    return res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: "internal_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};

export const signup = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { firstName, lastName, password, returnTo } = parsed.data;
  const email = normalizeEmailForAuthAction(parsed.data.email);
  await recordAuthEvent({
    action: authAuditActionNames.signupRequested,
    metadata: { email },
  });

  const { data, error: signUpError } = await supabasePublic.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: buildAuthActionRedirectUrl(req, {
        intent: "signup",
        returnTo: returnTo ?? null,
      }),
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });

  if (signUpError || !data.user) {
    const message = signUpError?.message ?? "Unable to create account";
    const status = /already registered|already been registered|already exists/i.test(
      message
    )
      ? 409
      : 400;

    await recordAuthEvent({
      action: authAuditActionNames.signupFailed,
      metadata: { email, status, message },
    });

    return res.status(status).json({
      error: status === 409 ? "conflict" : "validation_error",
      message,
    });
  }

  try {
    const profile = await syncProfileFromAuthUser({
      user: data.user,
      emailFallback: email,
      firstNameFallback: firstName,
      lastNameFallback: lastName,
    });

    if (!ensureActiveAccount(profile, res)) {
      return;
    }

    const emailConfirmedAt =
      data.user.email_confirmed_at ??
      (data.user.email ? data.user.confirmed_at ?? null : null);
    const session = emailConfirmedAt ? data.session : null;
    const requiresEmailConfirmation = !session;

    await recordAuthEvent({
      action: authAuditActionNames.signupSucceeded,
      actorSupabaseId: data.user.id,
      metadata: {
        email,
        requires_email_confirmation: requiresEmailConfirmation,
        email_confirmation_sent: true,
      },
    });

    return res.status(201).json({
      accessToken: session?.access_token ?? null,
      refreshToken: session?.refresh_token ?? null,
      user: toUserResponse(profile),
      requiresEmailConfirmation,
      emailConfirmationSent: true,
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: "internal_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};

export const resendConfirmation = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = emailActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { returnTo } = parsed.data;
  const email = normalizeEmailForAuthAction(parsed.data.email);
  const recentSend = await findRecentAuthEmailSend({
    actions: [
      authAuditActionNames.signupSucceeded,
      authAuditActionNames.emailConfirmationResent,
    ],
    email,
  });

  if (recentSend) {
    return sendRecentAuthEmailResponse(
      res,
      "Confirmation email already requested recently. Please use the latest email before requesting another.",
    );
  }

  const { error } = await supabasePublic.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: buildAuthActionRedirectUrl(req, {
        intent: "signup",
        returnTo: returnTo ?? null,
      }),
    },
  });

  if (error) {
    await recordAuthEvent({
      action: authAuditActionNames.signupFailed,
      metadata: { email, message: error.message, stage: "resend_confirmation" },
    });

    if (isSupabaseEmailRateLimitError(error.message)) {
      return sendAuthEmailRateLimitResponse(
        res,
        "Confirmation email sends are temporarily rate limited. Please use the latest email or try again shortly.",
      );
    }

    return res.status(400).json({
      error: "validation_error",
      message: error.message,
    });
  }

  await recordAuthEvent({
    action: authAuditActionNames.emailConfirmationResent,
    metadata: { email },
  });

  return res.status(200).json({
    status: "ok",
    message: "Confirmation email sent",
  });
};

export const requestPasswordRecovery = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = emailActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { returnTo } = parsed.data;
  const email = normalizeEmailForAuthAction(parsed.data.email);
  const recentSend = await findRecentAuthEmailSend({
    actions: [authAuditActionNames.passwordRecoveryRequested],
    email,
  });

  if (recentSend) {
    return sendRecentAuthEmailResponse(
      res,
      "Password recovery email already requested recently. Please use the latest email before requesting another.",
    );
  }

  const { error } = await supabasePublic.auth.resetPasswordForEmail(email, {
    redirectTo: buildAuthActionRedirectUrl(req, {
      intent: "recovery",
      returnTo: returnTo ?? null,
    }),
  });

  if (error) {
    await recordAuthEvent({
      action: authAuditActionNames.reauthenticationFailed,
      metadata: { email, message: error.message, stage: "password_recovery" },
    });

    if (isSupabaseEmailRateLimitError(error.message)) {
      return sendAuthEmailRateLimitResponse(
        res,
        "Password recovery email sends are temporarily rate limited. Please use the latest email or try again shortly.",
      );
    }

    return res.status(400).json({
      error: "validation_error",
      message: error.message,
    });
  }

  await recordAuthEvent({
    action: authAuditActionNames.passwordRecoveryRequested,
    metadata: { email },
  });

  return res.status(200).json({
    status: "ok",
    message: "Password recovery email sent",
  });
};

export const requestMagicLink = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = emailActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { returnTo } = parsed.data;
  const email = normalizeEmailForAuthAction(parsed.data.email);
  const recentSend = await findRecentAuthEmailSend({
    actions: passwordlessEmailActions,
    email,
  });

  if (recentSend) {
    return sendRecentAuthEmailResponse(
      res,
      "Passwordless sign-in email already requested recently. Please use the latest email before requesting another.",
    );
  }

  const { error } = await supabasePublic.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: buildAuthActionRedirectUrl(req, {
        intent: "magic-link",
        returnTo: returnTo ?? null,
      }),
      shouldCreateUser: false,
    },
  });

  if (error) {
    await recordAuthEvent({
      action: authAuditActionNames.magicLinkFailed,
      metadata: { email, message: error.message, stage: "magic_link_request" },
    });

    if (isSupabaseEmailRateLimitError(error.message)) {
      return sendAuthEmailRateLimitResponse(
        res,
        "Passwordless sign-in emails are temporarily rate limited. Please use the latest email or try again in about an hour.",
      );
    }

    return res.status(200).json({
      status: "ok",
      message: "If this email can use passwordless sign-in, a magic link will arrive shortly.",
    });
  }

  await recordAuthEvent({
    action: authAuditActionNames.magicLinkRequested,
    metadata: { email, return_to: sanitizeReturnTo(returnTo) },
  });

  return res.status(200).json({
    status: "ok",
    message: "Magic link sent",
  });
};

export const requestEmailOtp = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = emailActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { returnTo } = parsed.data;
  const email = normalizeEmailForAuthAction(parsed.data.email);
  const recentSend = await findRecentAuthEmailSend({
    actions: passwordlessEmailActions,
    email,
  });

  if (recentSend) {
    return sendRecentAuthEmailResponse(
      res,
      "Passwordless sign-in email already requested recently. Please use the latest email before requesting another.",
    );
  }

  const { error } = await supabasePublic.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: buildAuthActionRedirectUrl(req, {
        intent: "otp",
        returnTo: returnTo ?? null,
      }),
      shouldCreateUser: false,
    },
  });

  if (error) {
    await recordAuthEvent({
      action: authAuditActionNames.otpFailed,
      metadata: { email, message: error.message, stage: "otp_request" },
    });

    if (isSupabaseEmailRateLimitError(error.message)) {
      return sendAuthEmailRateLimitResponse(
        res,
        "Passwordless sign-in emails are temporarily rate limited. Please use the latest email or try again in about an hour.",
      );
    }

    return res.status(200).json({
      status: "ok",
      message: "If this email can use passwordless sign-in, a one-time code will arrive shortly.",
    });
  }

  await recordAuthEvent({
    action: authAuditActionNames.otpRequested,
    metadata: { email, return_to: sanitizeReturnTo(returnTo) },
  });

  return res.status(200).json({
    status: "ok",
    message: "Email code sent",
  });
};

export const verifyEmailOtp = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = emailOtpVerifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const email = normalizeEmailForAuthAction(parsed.data.email);
  const token = normalizeOtpToken(parsed.data.token);
  const { data, error } = await supabasePublic.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.session || !data.user) {
    await recordAuthEvent({
      action: authAuditActionNames.otpFailed,
      metadata: {
        email,
        message: error?.message ?? "Missing OTP session",
        stage: "otp_verify",
      },
    });

    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid or expired code",
    });
  }

  try {
    const profile = await syncProfileFromAuthUser({
      user: data.user,
      emailFallback: email,
    });

    if (!ensureActiveAccount(profile, res)) {
      return;
    }

    await recordAuthEvent({
      action: authAuditActionNames.otpVerified,
      actorSupabaseId: data.user.id,
      metadata: { email },
    });

    return res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = passwordResetSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid authorization header",
    });
  }

  const supabaseSessionClient = createSupabaseSessionClient();
  const { error: sessionError } = await supabaseSessionClient.auth.setSession({
    access_token: accessToken,
    refresh_token: parsed.data.refreshToken,
  });

  if (sessionError) {
    await recordAuthEvent({
      action: authAuditActionNames.reauthenticationFailed,
      ...(req.user?.id ? { actorSupabaseId: req.user.id } : {}),
      metadata: { stage: "password_reset_session", message: sessionError.message },
    });

    return res.status(401).json({
      error: "unauthorized",
      message: sessionError.message,
    });
  }

  const { data, error } = await supabaseSessionClient.auth.updateUser({
    password: parsed.data.password,
  });

  if (error || !data.user) {
    await recordAuthEvent({
      action: authAuditActionNames.reauthenticationFailed,
      ...(req.user?.id ? { actorSupabaseId: req.user.id } : {}),
      metadata: { stage: "password_reset", message: error?.message ?? "Missing user" },
    });

    return res.status(400).json({
      error: "validation_error",
      message: error?.message ?? "Unable to reset password",
    });
  }

  try {
    const profile = await syncProfileFromAuthUser({ user: data.user });
    if (!ensureActiveAccount(profile, res)) {
      return;
    }

    await recordAuthEvent({
      action: authAuditActionNames.passwordResetSucceeded,
      actorSupabaseId: data.user.id,
    });

    return res.status(200).json({
      accessToken,
      refreshToken: parsed.data.refreshToken,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: "internal_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};

export const syncSession = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid authorization header",
    });
  }

  const parsed = syncSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { data, error } = await supabasePublic.auth.getUser(accessToken);
  if (error || !data.user) {
    return res.status(401).json({
      error: "unauthorized",
      message: error?.message ?? "Invalid or expired token",
    });
  }

  try {
    const profile = await syncProfileFromAuthUser({ user: data.user });
    if (!ensureActiveAccount(profile, res)) {
      return;
    }

    const hasEmailConfirmation = Boolean(
      data.user.email_confirmed_at || (data.user.email && data.user.confirmed_at),
    );

    if (hasEmailConfirmation) {
      await recordAuthEvent({
        action: authAuditActionNames.emailConfirmed,
        actorSupabaseId: data.user.id,
      });
    }

    if (parsed.data.intent === "magic-link") {
      await recordAuthEvent({
        action: authAuditActionNames.magicLinkVerified,
        actorSupabaseId: data.user.id,
      });
    } else if (parsed.data.intent === "otp") {
      await recordAuthEvent({
        action: authAuditActionNames.otpVerified,
        actorSupabaseId: data.user.id,
      });
    } else if (parsed.data.intent === "oauth") {
      await recordAuthEvent({
        action: authAuditActionNames.oauthCallbackExchanged,
        actorSupabaseId: data.user.id,
      });
    }

    return res.status(200).json({
      accessToken,
      refreshToken: parsed.data.refreshToken ?? null,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: "internal_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};
