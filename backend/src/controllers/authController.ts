import { Request, Response } from "express";

export const login = async (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "TODO: implement Supabase Auth login",
  });
};
