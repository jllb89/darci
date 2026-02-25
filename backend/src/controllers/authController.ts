import { Request, Response } from "express";
import { z } from "zod";
import { sendValidationError } from "../utils/validation";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const login = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  res.status(200).json({
    accessToken: "TODO_ACCESS_TOKEN",
    refreshToken: "TODO_REFRESH_TOKEN",
    user: {
      id: "TODO_USER_ID",
      email: "user@example.com",
      role: "member",
      status: "active",
    },
  });
};
