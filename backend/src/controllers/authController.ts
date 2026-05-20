import { Request, Response } from "express";
import { createHash, createHmac, randomUUID } from "node:crypto";
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getHeaderValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value.find((entry) => entry.trim().length > 0)?.trim() ?? null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const maskEmailForLogs = (email: string) => {
  const [localPart = "", domain = ""] = email.split("@");
  const visibleLocal = localPart.slice(0, 2);
  const visibleDomain = domain.split(".")[0]?.slice(0, 1) ?? "";
  const topLevelDomain = domain.includes(".") ? domain.split(".").pop() ?? "" : "";
  return `${visibleLocal || "**"}***@${visibleDomain || "*"}***${topLevelDomain ? `.${topLevelDomain}` : ""}`;
};

const hashEmailForLogs = (email: string) => {
  return createHash("sha256").update(email).digest("hex").slice(0, 16);
};

const getRequestTraceId = (req: Request) => {
  const requestWithTrace = req as Request & { authOtpRequestId?: string };
  if (requestWithTrace.authOtpRequestId) {
    return requestWithTrace.authOtpRequestId;
  }

  const requestId =
    getHeaderValue(req.headers["x-request-id"]) ??
    getHeaderValue(req.headers["x-amzn-trace-id"]) ??
    randomUUID();

  requestWithTrace.authOtpRequestId = requestId;
  return requestId;
};

const getErrorLogDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (isRecord(error)) {
    const details: Record<string, unknown> = {};
    for (const key of ["name", "message", "statusCode", "status", "code"] as const) {
      const value = error[key];
      if (typeof value === "string" || typeof value === "number") {
        details[key] = value;
      }
    }

    return Object.keys(details).length > 0 ? details : { message: "Unknown provider error" };
  }

  return { message: String(error) };
};

type AuthOtpLogContext = {
  requestId: string;
  emailHash?: string;
  emailMasked?: string;
  origin?: string | null;
  returnTo?: string | null;
};

const buildAuthOtpLogContext = (
  req: Request,
  input: { email?: string; returnTo?: string | null } = {},
): AuthOtpLogContext => {
  const email = input.email ? normalizeEmailForAuthAction(input.email) : null;

  return {
    requestId: getRequestTraceId(req),
    origin: getHeaderValue(req.headers.origin),
    returnTo: input.returnTo ? sanitizeReturnTo(input.returnTo) : null,
    ...(email
      ? {
          emailHash: hashEmailForLogs(email),
          emailMasked: maskEmailForLogs(email),
        }
      : {}),
  };
};

const logAuthOtpEvent = (
  level: "info" | "warn" | "error",
  event: string,
  metadata: Record<string, unknown>,
) => {
  const payload = {
    component: "auth.email_otp",
    event,
    ...metadata,
  };

  if (level === "error") {
    console.error("[auth.email_otp]", payload);
    return;
  }

  if (level === "warn") {
    console.warn("[auth.email_otp]", payload);
    return;
  }

  console.info("[auth.email_otp]", payload);
};

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
  const body = JSON.stringify(req.body);
  const expectedSignature = createHmac("sha256", secret)
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

const otpEmailFromAddressEnvKeys = [
  "AUTH_OTP_FROM_ADDRESS",
  "RESEND_FROM_ADDRESS",
  "NOTIFICATION_FROM_ADDRESS",
] as const;

type OtpEmailFromAddressSource = (typeof otpEmailFromAddressEnvKeys)[number];

type OtpEmailSenderConfig = {
  from: string | null;
  source: OtpEmailFromAddressSource | null;
  senderEmail: string | null;
  senderDomain: string | null;
  configured: boolean;
};

type ConfiguredOtpEmailSenderConfig = OtpEmailSenderConfig & {
  from: string;
  source: OtpEmailFromAddressSource;
};

const getSenderEmailAddress = (from: string) => {
  const bracketedAddress = from.match(/<([^<>]+)>/)?.[1]?.trim();
  const candidate = bracketedAddress || from.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate.toLowerCase() : null;
};

const getOtpEmailSenderConfig = (): OtpEmailSenderConfig => {
  for (const key of otpEmailFromAddressEnvKeys) {
    const from = process.env[key]?.trim();
    if (!from) {
      continue;
    }

    const senderEmail = getSenderEmailAddress(from);
    return {
      from,
      source: key,
      senderEmail,
      senderDomain: senderEmail?.split("@")[1] ?? null,
      configured: true,
    };
  }

  return {
    from: null,
    source: null,
    senderEmail: null,
    senderDomain: null,
    configured: false,
  };
};

const isConfiguredOtpEmailSenderConfig = (
  config: OtpEmailSenderConfig,
): config is ConfiguredOtpEmailSenderConfig => Boolean(config.from && config.source);

const requireOtpEmailSenderConfig = () => {
  const config = getOtpEmailSenderConfig();
  if (!isConfiguredOtpEmailSenderConfig(config)) {
    throw new Error(
      "AUTH_OTP_FROM_ADDRESS, RESEND_FROM_ADDRESS, or NOTIFICATION_FROM_ADDRESS must be configured with a verified Resend sender",
    );
  }

  return config;
};

const getOtpEmailSubject = () => {
  return process.env.AUTH_OTP_EMAIL_SUBJECT?.trim() || "Your DARCi verification code";
};

const sendCustomOtpEmail = async (input: {
  email: string;
  otp: string;
  logContext: AuthOtpLogContext;
  senderConfig?: ConfiguredOtpEmailSenderConfig;
}) => {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const resend = new Resend(resendApiKey);
  const subject = getOtpEmailSubject();
  const senderConfig = input.senderConfig ?? requireOtpEmailSenderConfig();
  const from = senderConfig.from;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111111;line-height:1.5;">
      <p style="margin:0 0 12px;">Use this DARCi verification code to sign in:</p>
      <p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:700;">${input.otp}</p>
      <p style="margin:0;color:#555555;">This code expires shortly. If you did not request this, you can ignore this email.</p>
    </div>
  `;
  const text = `Your DARCi verification code is ${input.otp}. This code expires shortly.`;

  logAuthOtpEvent("info", "resend_send_start", {
    ...input.logContext,
    from,
    fromSource: senderConfig.source,
    fromDomain: senderConfig.senderDomain,
    subject,
    toDomain: input.email.split("@")[1] ?? null,
    htmlLength: html.length,
    textLength: text.length,
  });

  const result = await resend.emails.send({
    from,
    to: input.email,
    subject,
    html,
    text,
  });

  const error = result.error;
  const data = result.data;
  const messageId = isRecord(data) && typeof data.id === "string" ? data.id : null;

  if (error) {
    logAuthOtpEvent("error", "resend_send_failed", {
      ...input.logContext,
      error: getErrorLogDetails(error),
    });
    throw new Error(error.message || "Failed to send OTP email");
  }

  logAuthOtpEvent("info", "resend_send_succeeded", {
    ...input.logContext,
    resendMessageId: messageId,
  });

  return { resendMessageId: messageId };
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
  const requestLogContext = buildAuthOtpLogContext(req);
  logAuthOtpEvent("info", "request_received", {
    ...requestLogContext,
    method: req.method,
    path: req.originalUrl ?? req.path,
    bodyKeys: isRecord(req.body) ? Object.keys(req.body).sort() : [],
  });

  if (!ensureConfigured(res)) {
    logAuthOtpEvent("error", "request_rejected_missing_supabase_config", {
      ...requestLogContext,
      hasSupabaseUrl: Boolean(supabaseUrl),
      hasSupabaseAnonKey: Boolean(supabaseAnonKey),
      hasSupabaseServiceRoleKey: Boolean(supabaseServiceRoleKey),
    });
    return;
  }

  if (!validateOrigin(req)) {
    logAuthOtpEvent("warn", "request_rejected_invalid_origin", {
      ...requestLogContext,
      allowedOrigins: getAllowedAuthOrigins(),
    });
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request origin",
    });
  }

  if (!validateCsrfToken(req)) {
    logAuthOtpEvent("warn", "request_rejected_invalid_csrf", requestLogContext);
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid CSRF token",
    });
  }

  if (!validateRequestSignature(req)) {
    logAuthOtpEvent("warn", "request_rejected_invalid_signature", {
      ...requestLogContext,
      hasSignatureHeader: Boolean(req.headers["x-request-signature"]),
      signatureSecretConfigured: Boolean(process.env.AUTH_REQUEST_SIGNATURE_SECRET),
    });
    return res.status(403).json({
      error: "forbidden",
      message: "Invalid request signature",
    });
  }

  const parsed = emailActionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    logAuthOtpEvent("warn", "request_rejected_validation_error", {
      ...requestLogContext,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message,
      })),
    });
    return sendValidationError(res, parsed.error);
  }

  const { returnTo } = parsed.data;
  const email = normalizeEmailForAuthAction(parsed.data.email);
  const logContext = buildAuthOtpLogContext(req, { email, returnTo: returnTo ?? null });
  const resendFailureMode = getResendFailureMode();
  const otpEmailSenderConfig = getOtpEmailSenderConfig();

  logAuthOtpEvent("info", "request_validated", {
    ...logContext,
    cooldownSeconds: authEmailSendCooldownSeconds,
    resendFailureMode,
    resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    otpFromAddressConfigured: otpEmailSenderConfig.configured,
    otpFromAddress: otpEmailSenderConfig.from,
    otpFromAddressSource: otpEmailSenderConfig.source,
    otpFromDomain: otpEmailSenderConfig.senderDomain,
    otpSubjectConfigured: Boolean(process.env.AUTH_OTP_EMAIL_SUBJECT?.trim()),
  });

  if (!isConfiguredOtpEmailSenderConfig(otpEmailSenderConfig) && resendFailureMode === "strict") {
    const message =
      "AUTH_OTP_FROM_ADDRESS, RESEND_FROM_ADDRESS, or NOTIFICATION_FROM_ADDRESS must be configured with a verified Resend sender";
    logAuthOtpEvent("error", "request_rejected_missing_otp_sender_config", {
      ...logContext,
      message,
      resendFailureMode,
    });

    await recordAuthEvent({
      action: authAuditActionNames.otpFailed,
      metadata: {
        email,
        request_id: logContext.requestId,
        stage: "sender_config",
        message,
        resend_failure_mode: resendFailureMode,
        fallback_blocked: true,
      },
    });

    return res.status(400).json({
      error: "delivery_failed",
      message: "Unable to send verification code. Please try again later.",
    });
  }

  // ✅ CRITICAL: Rate limit check BEFORE OTP generation to prevent brute-force OTP generation
  const recentSend = await findRecentAuthEmailSend({
    actions: passwordlessEmailActions,
    email,
  });

  if (recentSend) {
    logAuthOtpEvent("warn", "cooldown_hit_before_provider_call", {
      ...logContext,
      recentAuditEventId: recentSend.id,
      recentAuditAction: recentSend.action,
      recentAuditCreatedAt: recentSend.created_at,
    });
    return sendRecentAuthEmailResponse(
      res,
      "Passwordless sign-in email already requested recently. Please use the latest email before requesting another.",
    );
  }

  const redirectTo = buildAuthActionRedirectUrl(req, {
    intent: "otp",
    returnTo: returnTo ?? null,
  });

  logAuthOtpEvent("info", "redirect_resolved", {
    ...logContext,
    redirectHost: new URL(redirectTo).host,
    redirectPath: new URL(redirectTo).pathname,
  });

  let usedCustomOtpEmail = false;
  let fallbackSupabaseError: string | null = null;
  let resendMessageId: string | null = null;
  let generatedOtp = "";

  logAuthOtpEvent("info", "supabase_generate_link_start", {
    ...logContext,
    linkType: "magiclink",
  });

  try {
    const generated = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo,
      },
    });

    generatedOtp = generated.data.properties?.email_otp?.trim() ?? "";
    if (generated.error) {
      fallbackSupabaseError = generated.error.message ?? "supabase_generate_link_failed";
      logAuthOtpEvent("error", "supabase_generate_link_failed", {
        ...logContext,
        error: getErrorLogDetails(generated.error),
        hasEmailOtp: false,
      });
    } else {
      logAuthOtpEvent(generatedOtp ? "info" : "warn", "supabase_generate_link_completed", {
        ...logContext,
        hasEmailOtp: Boolean(generatedOtp),
        otpLength: generatedOtp.length || null,
      });
    }
  } catch (generateError) {
    fallbackSupabaseError =
      generateError instanceof Error ? generateError.message : "supabase_generate_link_threw";
    logAuthOtpEvent("error", "supabase_generate_link_threw", {
      ...logContext,
      error: getErrorLogDetails(generateError),
    });
  }

  if (generatedOtp) {
    try {
      const customOtpEmailResult = await sendCustomOtpEmail({
        email,
        otp: generatedOtp,
        logContext,
        ...(isConfiguredOtpEmailSenderConfig(otpEmailSenderConfig)
          ? { senderConfig: otpEmailSenderConfig }
          : {}),
      });
      usedCustomOtpEmail = true;
      resendMessageId = customOtpEmailResult.resendMessageId;
    } catch (customEmailError) {
      fallbackSupabaseError =
        customEmailError instanceof Error ? customEmailError.message : "custom_otp_email_failed";
      logAuthOtpEvent("error", "custom_otp_delivery_failed", {
        ...logContext,
        error: getErrorLogDetails(customEmailError),
        resendFailureMode,
      });
    }
  } else {
    fallbackSupabaseError = fallbackSupabaseError ?? "otp_generation_missing_email_otp";
    logAuthOtpEvent("warn", "custom_otp_delivery_skipped_no_code", {
      ...logContext,
      resendFailureMode,
      reason: fallbackSupabaseError,
    });
  }

  if (!usedCustomOtpEmail) {
    if (resendFailureMode === "strict") {
      logAuthOtpEvent("error", "strict_mode_blocks_supabase_fallback", {
        ...logContext,
        customOtpError: fallbackSupabaseError,
      });

      await recordAuthEvent({
        action: authAuditActionNames.otpFailed,
        metadata: {
          email,
          request_id: logContext.requestId,
          stage: "custom_otp_delivery",
          message: fallbackSupabaseError,
          custom_otp_error: fallbackSupabaseError,
          resend_failure_mode: resendFailureMode,
          fallback_blocked: true,
        },
      });

      return res.status(400).json({
        error: "delivery_failed",
        message: "Unable to send verification code. Please try again later.",
      });
    }

    logAuthOtpEvent("warn", "supabase_fallback_start", {
      ...logContext,
      customOtpError: fallbackSupabaseError,
      resendFailureMode,
    });

    let fallbackError: { message?: string } | null = null;
    try {
      const fallbackResult = await supabasePublic.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      fallbackError = fallbackResult.error;
    } catch (fallbackThrownError) {
      fallbackError = {
        message:
          fallbackThrownError instanceof Error
            ? fallbackThrownError.message
            : "supabase_fallback_threw",
      };
      logAuthOtpEvent("error", "supabase_fallback_threw", {
        ...logContext,
        error: getErrorLogDetails(fallbackThrownError),
      });
    }

    if (fallbackError) {
      logAuthOtpEvent("error", "supabase_fallback_failed", {
        ...logContext,
        error: getErrorLogDetails(fallbackError),
        customOtpError: fallbackSupabaseError,
      });

      await recordAuthEvent({
        action: authAuditActionNames.otpFailed,
        metadata: {
          email,
          request_id: logContext.requestId,
          message: fallbackError.message,
          stage: "otp_request",
          custom_otp_error: fallbackSupabaseError,
          resend_failure_mode: resendFailureMode,
        },
      });

      if (isSupabaseEmailRateLimitError(fallbackError.message)) {
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

    logAuthOtpEvent("warn", "supabase_fallback_succeeded", {
      ...logContext,
      customOtpError: fallbackSupabaseError,
      resendFailureMode,
    });
  }

  await recordAuthEvent({
    action: authAuditActionNames.otpRequested,
    metadata: {
      email,
      request_id: logContext.requestId,
      return_to: sanitizeReturnTo(returnTo),
      delivery: usedCustomOtpEmail ? "custom_email_otp" : "supabase_fallback",
      custom_otp_error: usedCustomOtpEmail ? null : fallbackSupabaseError,
      resend_message_id: resendMessageId,
    },
  });

  logAuthOtpEvent("info", "request_completed", {
    ...logContext,
    delivery: usedCustomOtpEmail ? "custom_email_otp" : "supabase_fallback",
    resendMessageId,
    otpLength: usedCustomOtpEmail ? generatedOtp.length : null,
  });

  return res.status(200).json({
    status: "ok",
    message: "Email code sent",
    otpLength: usedCustomOtpEmail ? generatedOtp.length : null,
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
