import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { hasRecentAdminMfa, requireAdminMutationStepUp } from "../../src/middleware/adminStepUp";

const now = 1_790_000_000_000;
const request = (claims: Record<string, unknown>, role = "admin") => ({
  user: { role, dbUserId: "operator", rawClaims: claims },
}) as unknown as Request;

describe("admin mutation step-up", () => {
  it("requires a current admin grant, AAL2 and recent signed TOTP", () => {
    const claims = { aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 - 10 }] };
    expect(hasRecentAdminMfa(request(claims), now)).toBe(true);
    expect(hasRecentAdminMfa(request(claims, "member"), now)).toBe(false);
    expect(hasRecentAdminMfa(request({ ...claims, aal: "aal1" }), now)).toBe(false);
  });
  it.each(["token_refresh", "password", "otp"])("does not count %s as MFA", method => {
    expect(hasRecentAdminMfa(request({ aal: "aal2", amr: [{ method, timestamp: now / 1000 }] }), now)).toBe(false);
  });
  it.each([-901, 1, NaN])("rejects stale, future and malformed time %s", offset => {
    expect(hasRecentAdminMfa(request({ aal: "aal2", amr: [{ method: "totp", timestamp: now / 1000 + offset }] }), now)).toBe(false);
  });
  it.each(["POST", "PATCH", "PUT", "DELETE"])("blocks %s across non-billing admin routes", method => {
    const next = vi.fn(), json = vi.fn(), status = vi.fn(() => ({ json }));
    requireAdminMutationStepUp({ ...request({}), method, path: "/profile/team" } as Request, { status } as unknown as Response, next);
    expect(status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
  });
  it("keeps admin read access and template preview available without MFA", () => {
    for (const [method, path] of [["GET", "/profile/team"], ["POST", "/notification-templates/abc/preview"]]) {
      const next = vi.fn();
      requireAdminMutationStepUp({ ...request({}), method, path } as Request, {} as Response, next);
      expect(next).toHaveBeenCalledOnce();
    }
  });
});
