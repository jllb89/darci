import { Request, Response } from "express";

export const getMe = async (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "TODO: return current user profile",
  });
};
