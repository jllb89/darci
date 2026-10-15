import type { Request, Response } from "express";
import { APP_REVIEW_EMAIL, getAppReviewConfig } from "../auth/appReviewAccess";

// Explicit temporary member-review scope. Notary fixtures/walkthrough follow
// separately; no real commission or completed notarization is simulated here.
export function enforceAppReviewScope(req: Request, res: Response): boolean {
  if (req.user?.email?.toLowerCase() !== APP_REVIEW_EMAIL
    && !(req.user?.rawClaims?.app_metadata as Record<string, unknown> | undefined)?.app_review) return false;
  const config = getAppReviewConfig();
  if (!config || req.user?.id !== config.authId || req.user.dbUserId !== config.userId) {
    res.status(403).json({ error: "review_access_unavailable", message: "App Review access is unavailable or expired." });
    return true;
  }
  const path = req.path.replace(/\/$/, "");
  const method = req.method;
  // These POSTs are read-only provider lookups, not rule/configuration writes.
  // Keep the exception exact: never allow arbitrary POST /rules operations.
  const isAddressLookup = method === "POST"
    && /^\/rules\/member-form\/(?:US-)?(?:CA|OH)\/address-(autocomplete|details)$/.test(path);
  if (path === "/notary/requests" && method === "GET" && req.user.role === "notary") {
    res.status(200).json({ requests: [], meetings: [],
      counts: { pending: 0, scheduled: 0, readyForInPerson: 0, completed: 0, total: 0 },
      realtimeQueueUserId: null });
    return true;
  }
  const allowed = (path === "/users/me" && ["GET", "DELETE"].includes(method))
    || (path === "/users/me/active-role" && method === "PATCH" && ["member", "notary"].includes(req.body?.role))
    || (path === "/users/me/notary-profile" && method === "GET")
    || (path === "/billing/member-membership" && method === "GET")
    || (path.startsWith("/auth/") && ["/auth/logout", "/auth/refresh"].includes(path))
    || (path.startsWith("/dashboard") && method === "GET")
    || ((path === "/rules" || path.startsWith("/rules/")) && method === "GET")
    || isAddressLookup
    || path.startsWith("/notifications/") || path === "/notifications"
    || ((path === "/documents" || path.startsWith("/documents/"))
      && !/\/(submit-notarization|append-acknowledgment|watermark|signature-reminders)(\/|$)/.test(path)
      && !(method === "PUT" && path.endsWith("/parties")))
    || ((path === "/requests" || path.startsWith("/requests/")) && method === "GET");
  if (!allowed) {
    res.status(403).json({ error: "review_scope_restricted",
      message: "This review account is limited to its own test documents. The notary walkthrough is not configured yet." });
    return true;
  }
  // Member ownership ACLs, never assigned-notary client ACLs, on these routes.
  if (!path.startsWith("/users/")) req.user.role = "member";
  return false;
}
