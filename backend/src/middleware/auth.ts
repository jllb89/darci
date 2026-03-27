import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";

const publicPaths = [
  "/health",
  "/docs",
  "/openapi.yaml",
  "/auth/login",
  "/auth/signup",
];

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const resolveRoleFromDb = async (supabaseUserId?: string) => {
  if (!supabaseAdmin || !supabaseUserId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("supabase_user_id", supabaseUserId)
    .limit(1)
    .maybeSingle();

  if (error || !data?.role) {
    return null;
  }

  return data.role as string;
};

const isPublicPath = (path: string) => {
  if (publicPaths.includes(path)) {
    return true;
  }

  return path.startsWith("/verify/");
};

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (isPublicPath(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    console.warn("Auth missing bearer token", { path: req.path });
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
        return res.status(500).json({
          error: "internal_error",
          message: "Auth configuration missing",
        });
      }

      decoded = jwt.verify(token, secret) as JwtPayload;
    } else {
      if (!supabaseUrl && !jwksUrlOverride) {
        console.error("SUPABASE_URL is not configured");
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
    const roleFromToken = (roleFromMeta ?? decoded.role) as string | undefined;
    if (roleFromToken) {
      user.role = roleFromToken;
    }

    if (!user.role || user.role === "authenticated") {
      const roleFromDb = await resolveRoleFromDb(user.id);
      if (roleFromDb) {
        user.role = roleFromDb;
      }
    }

    req.user = user;
  } catch (error) {
    console.warn("Auth token verification failed", {
      path: req.path,
      error: error instanceof Error ? error.message : "unknown_error",
    });
    return res.status(401).json({
      error: "unauthorized",
      message: "Invalid or expired token",
    });
  }

  return next();
};
