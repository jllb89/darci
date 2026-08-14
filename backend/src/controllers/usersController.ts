import { Request, Response } from "express";
import { z } from "zod";
import {
  closeUserAccountBySupabaseUserId,
  ensureUserIdentityFromAuth,
  switchActiveRoleBySupabaseUserId,
  toUserResponse,
  UserRoleServiceError,
} from "../services/userRoleService";
import { recordAuditEvent } from "../services/auditService";
import { sendValidationError } from "../utils/validation";
import {
  duplicatePhoneMessage,
  isDuplicatePhoneUniqueConstraintError,
  normalizePhoneForStorage,
} from "../utils/phone";

const switchActiveRoleSchema = z.object({
  role: z.enum(["member", "pro", "notary", "admin"]),
});

const updateMyProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(40),
  address: z.string().trim().max(500).nullable().optional(),
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

  const phone = normalizePhoneForStorage(parsed.data.phone);
  if (!phone) {
    return res.status(400).json({
      error: "validation_error",
      message: "Enter a valid US phone number.",
    });
  }

  const sessionPhone = normalizePhoneForStorage(req.user.phone) ?? null;
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
      address: parsed.data.address?.trim() || null,
      ...(req.user.role ? { role: req.user.role } : {}),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    });

    return res.status(200).json({ user: toUserResponse(profile) });
  } catch (error) {
    if (isDuplicatePhoneUniqueConstraintError(error)) {
      return res.status(400).json({
        error: "validation_error",
        message: duplicatePhoneMessage,
      });
    }

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

export const deleteMe = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  try {
    const result = await closeUserAccountBySupabaseUserId({
      supabaseUserId: req.user.id,
    });

    await recordAuditEvent({
      actorSupabaseId: req.user.id,
      entityType: "user",
      entityId: result.userId,
      action: "user.account_deleted",
      ...(req.user.role ? { actorRole: req.user.role } : {}),
      metadata: {
        supabase_user_deleted: result.supabaseUserDeleted,
      },
    });

    return res.status(200).json({
      status: "deleted",
      message: "Account deletion completed.",
    });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to delete user account",
    });
  }
};
