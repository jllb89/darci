import "express";

declare module "express" {
  interface Request {
    requestId?: string;
    authOtpRequestId?: string;
    user?: {
      id?: string;
      dbUserId?: string;
      email?: string;
      phone?: string;
      role?: "member" | "pro" | "notary" | "admin" | "service_role" | string;
      availableRoles?: Array<"member" | "pro" | "notary" | "admin">;
      status?: string;
      rawClaims?: Record<string, unknown>;
    };
  }
}
