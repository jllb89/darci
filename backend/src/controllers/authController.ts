import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
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

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
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

const phoneActionSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  returnTo: returnToSchema,
});

const phoneOtpVerifySchema = z.object({
  phone: z.string().trim().min(10).max(20),
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


const getAllowedAuthOrigins = () => {
  const configured = process.env.AUTH_ALLOWED_ORIGINS?.split(",").map((o) => o.trim()) ?? [];
  const defaults = [
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.WEB_APP_URL ?? "",
    process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "",
    process.env.APP_BASE_URL ?? "",
  ].filter((o) => o && o.length > 0);
  return [...new Set([...configured, ...defaults])];
};

const validateOrigin = (req: Request): boolean => {
  const origin = req.headers.origin ?? "";
  if (!origin) return true;
  const allowedOrigins = getAllowedAuthOrigins();
  return allowedOrigins.includes(origin);
};

const validateCsrfToken = (req: Request): boolean => {
  const csrfTokenFromBody = (req.body as Record<string, unknown>)?._csrf;
  const csrfTokenFromHeader = req.headers["x-csrf-token"];
  if (!csrfTokenFromBody && !csrfTokenFromHeader) return true;
  return csrfTokenFromBody === csrfTokenFromHeader;
};

const getResendFailureMode = () => {
  const mode = process.env.RESEND_FAILURE_MODE?.toLowerCase() ?? "fallback";
  return mode === "strict" ? "strict" : "fallback";
};

const validateRequestSignature = (req: Request): boolean => {
  const signature = req.headers["x-request-signature"];
  if (!signature) return true;
  const secret = process.env.AUTH_REQUEST_SIGNATURE_SECRET;
  if (!secret) return true;
  const crypto = require("crypto");
  const body = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return signature === expectedSignature;
};

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

const getOtpEmailFromAddress = () => {
  return (
    process.env.AUTH_OTP_FROM_ADDRESS?.trim() ||
    process.env.RESEND_FROM_ADDRESS?.trim() ||
    process.env.NOTIFICATION_FROM_ADDRESS?.trim() ||
    "DARCi <support@darciregistry.dev>"
  );
};

const getOtpEmailSubject = () => {
  return process.env.AUTH_OTP_EMAIL_SUBJECT?.trim() || "Your DARCi verification code";
};

const sendCustomOtpEmail = async (input: { email: string; otp: string }) => {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(resendApiKey);
  const subject = getOtpEmailSubject();
  const from = getOtpEmailFromAddress();
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111111;line-height:1.5;">
      <p style="margin:0 0 12px;">Use this DARCi verification code to sign in:</p>
      <p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:700;">${input.otp}</p>
      <p style="margin:0;color:#555555;">This code expires shortly. If you did not request this, you can ignore this email.</p>
    </div>
  `;
  const text = `Your DARCi verification code is ${input.otp}. This code expires shortly.`;

  const { error } = await resend.emails.send({
    from,
    to: input.email,
    subject,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || "Failed to send OTP email");
  }
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
  if (!validateOrigin(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
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
  if (!validateOrigin(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
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

  // ✅ CRITICAL: Rate limit check BEFORE OTP generation to prevent brute-force OTP generation
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

  // ✅ CRITICAL: Rate limit check BEFORE OTP generation to prevent brute-force OTP generation
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

  // ✅ CRITICAL: Rate limit check BEFORE OTP generation to prevent brute-force OTP generation
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

  
  if (!validateOrigin(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
  }

  const parsed = emailActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { returnTo } = parsed.data;
  const email = normalizeEmailForAuthAction(parsed.data.email);

  // ✅ CRITICAL: Rate limit check BEFORE OTP generation to prevent brute-force OTP generation
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

  const redirectTo = buildAuthActionRedirectUrl(req, {
    intent: "otp",
    returnTo: returnTo ?? null,
  });

  let usedCustomOtpEmail = false;
  let fallbackSupabaseError: string | null = null;

  const generated = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo,
    },
  });

  const generatedOtp = generated.data.properties?.email_otp?.trim();
  if (!generated.error && generatedOtp) {
    try {
      await sendCustomOtpEmail({ email, otp: generatedOtp });
      usedCustomOtpEmail = true;
    } catch (customEmailError) {
      fallbackSupabaseError =
        customEmailError instanceof Error ? customEmailError.message : "custom_otp_email_failed";
    }
  } else {
    fallbackSupabaseError = generated.error?.message ?? "otp_generation_failed";
  }

  if (!usedCustomOtpEmail) {
    const resendFailureMode = getResendFailureMode();
    const { error } = await supabasePublic.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false,
      },
    });

    if (error) {
      await recordAuthEvent({
        action: authAuditActionNames.otpFailed,
        metadata: {
          email,
          message: error.message,
          stage: "otp_request",
          custom_otp_error: fallbackSupabaseError,
          resend_failure_mode: resendFailureMode,
        },
      });

      if (isSupabaseEmailRateLimitError(error.message)) {
        return sendAuthEmailRateLimitResponse(
          res,
          "Passwordless sign-in emails are temporarily rate limited. Please use the latest email or try again in about an hour.",
        );
      }

      // ✅ ENHANCED: Configurable fallback behavior when both custom and Supabase delivery fails
      if (resendFailureMode === "strict") {
        return res.status(400).json({
          error: "delivery_failed",
          message: "Unable to send verification code. Please try again later.",
        });
      }

      return res.status(200).json({
        status: "ok",
        message: "If this email can use passwordless sign-in, a one-time code will arrive shortly.",
      });
    }
  }

  await recordAuthEvent({
    action: authAuditActionNames.otpRequested,
    metadata: {
      email,
      return_to: sanitizeReturnTo(returnTo),
      delivery: usedCustomOtpEmail ? "custom_email_otp" : "supabase_fallback",
      custom_otp_error: usedCustomOtpEmail ? null : fallbackSupabaseError,
    },
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

  if (!validateOrigin(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
  }

  const parsed = emailOtpVerifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const email = normalizeEmailForAuthAction(parsed.data.email);
  const token = normalizeOtpToken(parsed.data.token);
  let { data, error } = await supabasePublic.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  // ✅ EXPLAINED: Fallback to magiclink type because Supabase may generate OTP codes
  // as type "magiclink" internally even when we request "email" type. This handles
  // both custom OTP email flows and Supabase fallback OTP delivery gracefully.
  if (error || !data.session || !data.user) {
    const fallbackResult = await supabasePublic.auth.verifyOtp({
      email,
      token,
      type: "magiclink",
    });
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

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

export const requestPhoneOtp = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  if (!validateOrigin(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
  }

  const parsed = phoneActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { returnTo } = parsed.data;
  const phone = parsed.data.phone.trim();
  const recentSend = await findRecentAuditEventByEmail({
    actions: passwordlessEmailActions,
    email: phone,
    since: getAuthEmailCooldownSince(),
  });

  if (recentSend) {
    return sendRecentAuthEmailResponse(
      res,
      "Passwordless sign-in SMS already requested recently. Please use the latest code or try again shortly.",
    );
  }

  const { error } = await supabasePublic.auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser: true,
    },
  });

  if (error) {
    await recordAuthEvent({
      action: authAuditActionNames.otpFailed,
      metadata: {
        phone,
        message: error.message,
        stage: "phone_otp_request",
      },
    });

    if (isSupabaseEmailRateLimitError(error.message)) {
      return sendAuthEmailRateLimitResponse(
        res,
        "SMS sends are temporarily rate limited. Please try again in about an hour.",
      );
    }

    return res.status(200).json({
      status: "ok",
      message: "If this phone can use passwordless sign-in, a verification code will arrive shortly.",
    });
  }

  await recordAuthEvent({
    action: authAuditActionNames.otpRequested,
    metadata: {
      phone,
      return_to: sanitizeReturnTo(returnTo),
      delivery: "phone_sms",
    },
  });

  return res.status(200).json({
    status: "ok",
    message: "SMS code sent",
  });
};

export const verifyPhoneOtp = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  if (!validateOrigin(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
  }

  const parsed = phoneOtpVerifySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const phone = parsed.data.phone.trim();
  const token = normalizeOtpToken(parsed.data.token);

  const { data, error } = await supabasePublic.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });

  if (error || !data.session || !data.user) {
    await recordAuthEvent({
      action: authAuditActionNames.otpFailed,
      metadata: {
        phone,
        message: error?.message ?? "Missing OTP session",
        stage: "phone_otp_verify",
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
      phoneFallback: phone,
    });

    if (!ensureActiveAccount(profile, res)) {
      return;
    }

    await recordAuthEvent({
      action: authAuditActionNames.otpVerified,
      actorSupabaseId: data.user.id,
      metadata: { phone },
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
  if (!validateOrigin(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
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
