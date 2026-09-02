import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import {
  appAccountInactiveError,
  isActiveAppAccountStatus,
  missingAppProfileError,
  shouldAllowInactiveAccountRequest,
  shouldAllowMissingIdentityRequest,
  shouldFailClosedOnMissingIdentity,
} from "../auth/authPolicy";
import { getUserIdentityContextBySupabaseId, normalizeRuntimeRole } from "../services/userRoleService";
import { reportAuthIssue } from "../telemetry/authTelemetry";

const publicPaths = [
  "/health",
  "/docs",
  "/openapi.yaml",
  "/auth/login",
  "/auth/signup",
  "/auth/refresh",
  "/auth/magic-link",
  "/auth/otp/start",
  "/auth/otp/verify",
  "/auth/otp/phone/start",
  "/auth/otp/phone/verify",
  "/auth/resend-confirmation",
  "/auth/password/recovery",
];

const controllerVerifiedAuthPaths = [
  "/auth/password/reset",
  "/auth/session/sync",
];

const supabaseUrl = process.env.SUPABASE_URL ?? "";

const isPublicPath = (path: string) => {
  if (publicPaths.includes(path)) {
    return true;
  }

  return path.startsWith("/verify/") || path.startsWith("/invites/public/");
};

const getTokenFailureReason = (error: unknown) => {
  const name = error instanceof Error ? error.name : "";
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";

  if (/expired/i.test(name) || /expired/i.test(code)) {
    return "expired";
  }
  if (/signature|claim|jwt|jws|jwk|jose/i.test(`${name} ${code}`)) {
    return "invalid";
  }
  return "provider_failed";
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (controllerVerifiedAuthPaths.includes(req.path)) {
    return next();
  }

  const publicPath = isPublicPath(req.path);

  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    if (publicPath) {
      return next();
    }

    console.warn("Auth missing bearer token", { path: req.path });
    reportAuthIssue({
      area: "token",
      operation: "verify",
      reason: "missing",
      level: "info",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: 401,
    });
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid authorization header",
    });
  }

  const token = authHeader.replace("Bearer ", "").trim();
  const secret = process.env.SUPABASE_JWT_SECRET;
  const jwksUrlOverride = process.env.SUPABASE_JWKS_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  try {
    const header = decodeProtectedHeader(token);
    const tokenAlg = header.alg;
    const isHs256 = tokenAlg === "HS256";

    let decoded: JwtPayload;
    if (isHs256) {
      if (!secret) {
        console.error("SUPABASE_JWT_SECRET is not configured");
        reportAuthIssue({
          area: "token",
          operation: "verify",
          reason: "server_config_missing",
          level: "error",
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: 500,
          details: { algorithm: tokenAlg ?? "unknown" },
        });
        return res.status(500).json({
          error: "internal_error",
          message: "Auth configuration missing",
        });
      }

      decoded = jwt.verify(token, secret) as JwtPayload;
    } else {
      if (!supabaseUrl && !jwksUrlOverride) {
        console.error("SUPABASE_URL is not configured");
        reportAuthIssue({
          area: "token",
          operation: "verify",
          reason: "server_config_missing",
          level: "error",
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl,
          statusCode: 500,
          details: { algorithm: tokenAlg ?? "unknown" },
        });
        return res.status(500).json({
          error: "internal_error",
          message: "Auth configuration missing",
        });
      }

      const baseUrl = (jwksUrlOverride ?? supabaseUrl ?? "").replace(/\/+$/, "");
      const jwksUrl = jwksUrlOverride
        ? new URL(baseUrl)
        : new URL("/auth/v1/.well-known/jwks.json", baseUrl);

      const jwksOptions: { headers?: Record<string, string> } = {};
      if (supabaseAnonKey) {
        jwksOptions.headers = { apikey: supabaseAnonKey };
      }
      const jwks = createRemoteJWKSet(jwksUrl, jwksOptions);
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `${supabaseUrl}/auth/v1`,
        audience: "authenticated",
        algorithms: tokenAlg ? [tokenAlg] : ["ES256", "RS256"],
      });
      decoded = payload as JwtPayload;
    }
    const appMeta = decoded.app_metadata as Record<string, unknown> | undefined;
    const userMeta = decoded.user_metadata as Record<string, unknown> | undefined;
    const roleFromMeta =
      (appMeta?.role as string | undefined) ??
      (userMeta?.role as string | undefined);

    const user = {
      rawClaims: decoded as Record<string, unknown>,
    } as NonNullable<Request["user"]>;

    if (decoded.sub) {
      user.id = decoded.sub;
    }
    if (decoded.email) {
      user.email = decoded.email as string;
    }
    if (decoded.phone) {
      user.phone = decoded.phone as string;
    }
    const roleFromToken = (roleFromMeta ?? decoded.role) as string | undefined;
    if (roleFromToken) {
      user.role = roleFromToken === "service_role"
        ? "service_role"
        : normalizeRuntimeRole(roleFromToken);
    }

    if (user.id && user.role !== "service_role") {
      try {
        const dbIdentityContext = await getUserIdentityContextBySupabaseId(user.id);
        if (dbIdentityContext) {
          user.dbUserId = dbIdentityContext.id;
          if (!user.email && dbIdentityContext.email) {
            user.email = dbIdentityContext.email;
          }
          if (!user.phone && dbIdentityContext.phone) {
            user.phone = dbIdentityContext.phone;
          }
          user.role = dbIdentityContext.role;
          user.availableRoles = dbIdentityContext.availableRoles;
          user.status = dbIdentityContext.status;
        } else if (
          shouldFailClosedOnMissingIdentity() &&
          !shouldAllowMissingIdentityRequest(req.path)
        ) {
          console.warn("Auth DB identity missing", {
            path: req.path,
            supabaseUserId: user.id,
          });
          reportAuthIssue({
            area: "session",
            operation: "identity_lookup",
            reason: "profile_missing",
            level: "warning",
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: 403,
            identifier: user.id,
          });
          return res.status(403).json(missingAppProfileError);
        } else if (!user.role || user.role === "authenticated") {
          user.role = "member";
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown_error";
        const isVitestRuntime = process.env.VITEST === "true" || process.env.VITEST === "1";
        if (
          !isVitestRuntime &&
          !message.includes("invalid input syntax for type uuid") &&
          !message.includes("fetch failed")
        ) {
          reportAuthIssue({
            area: "session",
            operation: "identity_lookup",
            reason: "dependency_failed",
            level: "error",
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: 500,
            identifier: user.id,
            error,
            provider: "supabase",
          });
          throw error;
        }

        if (!user.role || user.role === "authenticated") {
          user.role = "member";
        }
      }
    } else if (!user.role || user.role === "authenticated") {
      user.role = "member";
    }

    if (
      user.role !== "service_role" &&
      !shouldAllowInactiveAccountRequest(req.path) &&
      !isActiveAppAccountStatus(user.status)
    ) {
      console.warn("Auth account is not active", {
        path: req.path,
        supabaseUserId: user.id,
        status: user.status,
      });
      reportAuthIssue({
        area: "session",
        operation: "authorize",
        reason: "account_inactive",
        level: "warning",
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: 403,
        identifier: user.id,
        details: { accountStatus: user.status ?? "unknown" },
      });
      return res.status(403).json(appAccountInactiveError);
    }

    req.user = user;
  } catch (error) {
    console.warn("Auth token verification failed", {
      path: req.path,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    reportAuthIssue({
      area: "token",
      operation: "verify",
      reason: getTokenFailureReason(error),
      level: "warning",
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: 401,
      error,
      provider: "supabase",
    });
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid or expired token",
    });
  }

  return next();
};
