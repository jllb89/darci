import type { Request, Response, NextFunction } from "express";
import { sensitiveActionPolicy } from "../auth/authPolicy";

// Claims come only from requireAuth's verified token, never from request input.
export const hasRecentAdminMfa = (req: Request, now = Date.now()) => {
  if (req.user?.role === "service_role") return true;
  if (req.user?.role !== "admin" || !req.user.dbUserId) return false;
  const claims = req.user.rawClaims;
  if (claims?.aal !== "aal2" || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (method !== "totp" || typeof timestamp !== "number" || !Number.isFinite(timestamp)) return false;
    const elapsed = now / 1000 - timestamp;
    return elapsed >= 0 && elapsed <= sensitiveActionPolicy.recentReauthWindowSeconds;
  });
};

export const requireAdminMutationStepUp = (req: Request, res: Response, next: NextFunction) => {
  // Read-only template preview uses POST but cannot change templates or send mail.
  const readOnly = ["GET", "HEAD", "OPTIONS"].includes(req.method)
    || (req.method === "POST" && /^\/notification-templates\/[^/]+\/preview\/?$/.test(req.path));
  if (readOnly || hasRecentAdminMfa(req)) return next();
  return res.status(403).json({
    error: "recent_reauthentication_required",
    message: "Verify your authenticator code in Admin security before changing administrative settings.",
  });
};
