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
import { isAuthSessionActive } from "../services/authSessionService";
import { AuthDependencyError } from "../auth/readAuthDependency";

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

      decoded = jwt.verify(token, secret, { algorithms: ["HS256"] }) as JwtPayload;
    } else {
      if (tokenAlg !== "ES256" && tokenAlg !== "RS256") {
        throw new jwt.JsonWebTokenError("Unsupported token algorithm");
      }
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
        algorithms: ["ES256", "RS256"],
      });
      decoded = payload as JwtPayload;
    }
    const isServiceCredential = decoded.role === "service_role";
    if (!isServiceCredential && (decoded.role === "anon" || typeof decoded.sub !== "string" || !decoded.sub.trim())) {
      throw new jwt.JsonWebTokenError("An authenticated user subject is required");
    }
    if (shouldFailClosedOnMissingIdentity()) {
      if (!Number.isFinite(decoded.exp)) throw new jwt.JsonWebTokenError("Token expiry is required");
      if (!isServiceCredential) {
        const expectedIssuer = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
        const audiences = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
        if (!supabaseUrl || decoded.iss !== expectedIssuer || !audiences.includes("authenticated")) {
          throw new jwt.JsonWebTokenError("Invalid token issuer or audience");
        }
      }
    }
    const appMeta = decoded.app_metadata as Record<string, unknown> | undefined;
    // user_metadata is user-editable and must never grant a privileged role.
    const roleFromMeta = appMeta?.role as string | undefined;

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
      // Only the signed top-level service credential may bypass app identity
      // lookup. A profile metadata value is not a service credential.
      user.role = decoded.role === "service_role"
        ? "service_role"
        : normalizeRuntimeRole(roleFromToken);
    }

    if (user.id && user.role !== "service_role") {
      try {
        if (shouldFailClosedOnMissingIdentity() && !shouldAllowInactiveAccountRequest(req.path)) {
          if (!await isAuthSessionActive(user.id, decoded.session_id)) {
            reportAuthIssue({ area: "session", operation: "authorize", reason: "session_revoked",
              requestId: req.requestId, path: req.originalUrl, method: req.method, statusCode: 401 });
            return res.status(401).json({ error: "session_expired", message: "Your session is no longer active. Please sign in again." });
          }
        }
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
          if (!dbIdentityContext.availableRoles.length && !shouldAllowInactiveAccountRequest(req.path)) {
            reportAuthIssue({ area: "session", operation: "authorize", reason: "profile_unavailable",
              requestId: req.requestId, path: req.originalUrl, method: req.method, statusCode: 403 });
            return res.status(403).json({ error: "active_profile_unavailable", message: "This account has no active role. Contact support." });
          }
          // Active profile is shared in the database across web/mobile. A client
          // may select an assigned profile for this request without changing it
          // on another device. Never trust a role that isn't currently granted.
          const requestedProfile = req.get("X-DARCi-Profile");
          if (requestedProfile && !shouldAllowInactiveAccountRequest(req.path)) {
            const effectiveProfile = requestedProfile === "member" && dbIdentityContext.availableRoles.includes("pro")
              && !dbIdentityContext.availableRoles.includes("member") ? "pro" : requestedProfile;
            const assignedProfile = dbIdentityContext.availableRoles.find(role => role === effectiveProfile);
            if (!assignedProfile || !["member", "pro", "notary"].includes(assignedProfile)) {
              reportAuthIssue({ area: "session", operation: "authorize", reason: "profile_unavailable",
                requestId: req.requestId, path: req.originalUrl, method: req.method, statusCode: 403 });
              return res.status(403).json({ error: "active_profile_unavailable", message: "This profile is no longer available. Switch profiles or sign in again." });
            }
            user.role = assignedProfile;
          }
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
        const isVitestRuntime = process.env.NODE_ENV === "test" && !shouldFailClosedOnMissingIdentity()
          && (process.env.VITEST === "true" || process.env.VITEST === "1");
        if (!isVitestRuntime) {
          const diagnostic = error instanceof AuthDependencyError ? {
            dependencyOperation: error.operation,
            dependencyFailure: error.code,
            attempts: error.attempts,
            elapsedMs: error.elapsedMs,
            retryable: error.retryable,
            providerStatus: error.providerStatus,
          } : { dependencyOperation: "identity_lookup", dependencyFailure: "AUTH_READ_UNKNOWN" };
          if (process.env.NODE_ENV !== "test") {
            // Safe structured diagnostics remain available even when Sentry is disabled.
            console.error(JSON.stringify({ kind: "auth_dependency_failed", requestId: req.requestId, ...diagnostic }));
          }
          reportAuthIssue({
            area: "session",
            operation: diagnostic.dependencyOperation,
            reason: "dependency_failed",
            level: "error",
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: 503,
            identifier: user.id,
            error,
            provider: "supabase",
            details: diagnostic,
          });
          return res.status(503).json({ error: "identity_unavailable", message: "Your account could not be checked. Please try again." });
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
