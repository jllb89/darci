import { NextFunction, Request, Response } from "express";
type Role = "member" | "notary" | "admin" | "service_role";
export declare const requireRole: (roles: Role[]) => (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export {};
//# sourceMappingURL=roles.d.ts.map