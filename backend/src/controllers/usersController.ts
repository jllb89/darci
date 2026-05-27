import { Request, Response } from "express";
import { z } from "zod";
import {
  ensureUserIdentityFromAuth,
  switchActiveRoleBySupabaseUserId,
  toUserResponse,
  UserRoleServiceError,
} from "../services/userRoleService";
import { sendValidationError } from "../utils/validation";

const switchActiveRoleSchema = z.object({
  role: z.enum(["member", "pro", "notary", "admin"]),
});

const updateMyProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(40),
});

export const getMe = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  try {
    const profile = await ensureUserIdentityFromAuth({
      supabaseUserId: req.user.id,
      email: req.user.email ?? null,
      phone: req.user.phone ?? null,
      ...(req.user.role ? { role: req.user.role } : {}),
    });

    return res.status(200).json({ user: toUserResponse(profile) });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to load user",
    });
  }
};

export const updateMe = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const parsed = updateMyProfileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const email = parsed.data.email.toLowerCase();
  const sessionEmail = req.user.email?.trim().toLowerCase() ?? null;
  if (sessionEmail && email !== sessionEmail) {
    return res.status(400).json({
      error: "validation_error",
      message: "Email must match the verified sign-in email.",
    });
  }

  const phone = parsed.data.phone.trim();
  const sessionPhone = req.user.phone?.trim() ?? null;
  if (sessionPhone && phone !== sessionPhone) {
    return res.status(400).json({
      error: "validation_error",
      message: "Phone number must match the verified sign-in phone.",
    });
  }

  try {
    const profile = await ensureUserIdentityFromAuth({
      supabaseUserId: req.user.id,
      email,
      phone,
      ...(req.user.role ? { role: req.user.role } : {}),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    });

    return res.status(200).json({ user: toUserResponse(profile) });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to update user",
    });
  }
};

export const switchMyActiveRole = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const parsed = switchActiveRoleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const profile = await switchActiveRoleBySupabaseUserId({
      supabaseUserId: req.user.id,
      role: parsed.data.role,
    });

    return res.status(200).json({ user: toUserResponse(profile) });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to switch role",
    });
  }
};
