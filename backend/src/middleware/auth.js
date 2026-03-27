"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jose_1 = require("jose");
const supabase_js_1 = require("@supabase/supabase-js");
const publicPaths = [
    "/health",
    "/docs",
    "/openapi.yaml",
    "/auth/login",
    "/auth/signup",
];
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
    ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey)
    : null;
const resolveRoleFromDb = async (supabaseUserId) => {
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
    return data.role;
};
const isPublicPath = (path) => {
    if (publicPaths.includes(path)) {
        return true;
    }
    return path.startsWith("/verify/");
};
const requireAuth = async (req, res, next) => {
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
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
        const header = (0, jose_1.decodeProtectedHeader)(token);
        const tokenAlg = header.alg;
        const isHs256 = tokenAlg === "HS256";
        let decoded;
        if (isHs256) {
            if (!secret) {
                console.error("SUPABASE_JWT_SECRET is not configured");
                return res.status(500).json({
                    error: "internal_error",
                    message: "Auth configuration missing",
                });
            }
            decoded = jsonwebtoken_1.default.verify(token, secret);
        }
        else {
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
            const jwksOptions = {};
            if (supabaseAnonKey) {
                jwksOptions.headers = { apikey: supabaseAnonKey };
            }
            const jwks = (0, jose_1.createRemoteJWKSet)(jwksUrl, jwksOptions);
            const { payload } = await (0, jose_1.jwtVerify)(token, jwks, {
                issuer: `${supabaseUrl}/auth/v1`,
                audience: "authenticated",
                algorithms: tokenAlg ? [tokenAlg] : ["ES256", "RS256"],
            });
            decoded = payload;
        }
        const appMeta = decoded.app_metadata;
        const userMeta = decoded.user_metadata;
        const roleFromMeta = appMeta?.role ??
            userMeta?.role;
        const user = {
            rawClaims: decoded,
        };
        if (decoded.sub) {
            user.id = decoded.sub;
        }
        if (decoded.email) {
            user.email = decoded.email;
        }
        const roleFromToken = (roleFromMeta ?? decoded.role);
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
    }
    catch (error) {
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
exports.requireAuth = requireAuth;
//# sourceMappingURL=auth.js.map