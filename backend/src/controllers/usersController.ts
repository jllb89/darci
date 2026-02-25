import { Request, Response } from "express";

export const getMe = async (_req: Request, res: Response) => {
  res.status(200).json({
    user: {
      id: "TODO_USER_ID",
      email: "user@example.com",
      role: "member",
      status: "active",
    },
  });
};
