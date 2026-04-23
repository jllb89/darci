import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  listUserRoleAssignmentsBySupabaseUserId,
  switchActiveRoleBySupabaseUserId,
  toUserResponse,
  upsertUserRoleAssignmentBySupabaseUserId,
  UserRoleServiceError,
} from "../services/userRoleService";
import { sendValidationError } from "../utils/validation";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

const updateUserRoleSchema = z.object({
  role: z.enum(["member", "pro", "notary", "admin"]),
});

const upsertUserRoleSchema = z.object({
  role: z.enum(["member", "pro", "notary", "admin"]),
  status: z.enum(["active", "suspended", "revoked"]).default("active"),
  makeActive: z.boolean().optional(),
  grantedReason: z.string().trim().min(1).max(500).optional(),
});

const parseSupabaseUserId = (req: Request, res: Response) => {
  if (typeof req.params.id !== "string") {
    res.status(400).json({
      error: "validation_error",
      message: "Supabase user id is required",
      details: [
        {
          path: "id",
          message: "Supabase user id is required",
        },
      ],
    });
    return null;
  }

  return req.params.id;
};

export const updateUserRole = async (req: Request, res: Response) => {
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "internal_error",
      message: "Supabase service role is not configured",
    });
  }

  const supabaseUserId = parseSupabaseUserId(req, res);
  if (!supabaseUserId) {
    return;
  }

  const parsed = updateUserRoleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const user = await upsertUserRoleAssignmentBySupabaseUserId({
      supabaseUserId,
      role: parsed.data.role,
      status: "active",
      makeActive: true,
      ...(req.user?.id ? { grantedBySupabaseUserId: req.user.id } : {}),
      grantedReason: "Updated via legacy admin role endpoint",
    });

    return res.status(200).json({ user: toUserResponse(user) });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to update user role",
    });
  }
};

export const listUserRoles = async (req: Request, res: Response) => {
  const supabaseUserId = parseSupabaseUserId(req, res);
  if (!supabaseUserId) {
    return;
  }

  try {
    const user = await listUserRoleAssignmentsBySupabaseUserId(supabaseUserId);
    return res.status(200).json({
      user: toUserResponse(user),
      roleAssignments: user.roleAssignments,
    });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to list user roles",
    });
  }
};

export const upsertUserRole = async (req: Request, res: Response) => {
  const supabaseUserId = parseSupabaseUserId(req, res);
  if (!supabaseUserId) {
    return;
  }

  const parsed = upsertUserRoleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const user = await upsertUserRoleAssignmentBySupabaseUserId({
      supabaseUserId,
      role: parsed.data.role,
      status: parsed.data.status,
      ...(parsed.data.makeActive !== undefined ? { makeActive: parsed.data.makeActive } : {}),
      ...(req.user?.id ? { grantedBySupabaseUserId: req.user.id } : {}),
      ...(parsed.data.grantedReason ? { grantedReason: parsed.data.grantedReason } : {}),
    });

    return res.status(200).json({
      user: toUserResponse(user),
      roleAssignments: user.roleAssignments,
    });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to upsert user role",
    });
  }
};

export const switchUserActiveRole = async (req: Request, res: Response) => {
  const supabaseUserId = parseSupabaseUserId(req, res);
  if (!supabaseUserId) {
    return;
  }

  const parsed = updateUserRoleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const user = await switchActiveRoleBySupabaseUserId({
      supabaseUserId,
      role: parsed.data.role,
    });

    return res.status(200).json({ user: toUserResponse(user) });
  } catch (error) {
    const statusCode = error instanceof UserRoleServiceError ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message: error instanceof Error ? error.message : "Failed to switch active role",
    });
  }
};
