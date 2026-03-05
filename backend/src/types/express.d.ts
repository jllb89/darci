import "express";

declare module "express" {
  interface Request {
    user?: {
      id?: string;
      email?: string;
      role?: "member" | "notary" | "admin" | "service_role" | string;
      rawClaims?: Record<string, unknown>;
    };
  }
}
