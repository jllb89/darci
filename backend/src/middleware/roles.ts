import { NextFunction, Request, Response } from "express";
import { roleSatisfiesRequirement, type RequestRole } from "../services/userRoleService";

export const requireRole = (roles: RequestRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    const isAllowed = roles.some((requiredRole) => {
      return roleSatisfiesRequirement(role, requiredRole);
    });

    if (!role || !isAllowed) {
      console.warn("Access denied", { path: req.path, role });
      return res.status(403).json({
        error: "forbidden",
        message: "Insufficient permissions",
      });
    }

    return next();
  };
};
