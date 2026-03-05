import { NextFunction, Request, Response } from "express";

type Role = "member" | "notary" | "admin" | "service_role";

export const requireRole = (roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role as Role)) {
      console.warn("Access denied", { path: req.path, role });
      return res.status(403).json({
        error: "forbidden",
        message: "Insufficient permissions",
      });
    }

    return next();
  };
};
