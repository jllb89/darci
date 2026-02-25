import { NextFunction, Request, Response } from "express";

const publicPaths = ["/health", "/docs", "/openapi.yaml", "/auth/login"];

const isPublicPath = (path: string) => {
  if (publicPaths.includes(path)) {
    return true;
  }

  return path.startsWith("/verify/");
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (isPublicPath(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid authorization header",
    });
  }

  return next();
};
