import { Request, Response } from "express";
import { z } from "zod";
import {
  AdminProfileServiceError,
  assertAdminCapability,
  getAdminDashboard,
  getAdminProfileContext,
  grantAdminByEmail,
  listAdminActivity,
  listAdminTeam,
  listAdminUsers,
  revokeAdminByUserId,
  updateAdminUserStatus,
} from "../services/adminProfileService";
import { sendValidationError } from "../utils/validation";

const userStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

const grantAdminSchema = z.object({
  email: z.string().trim().email(),
  canManageAdmins: z.boolean().optional().default(false),
});

const handleAdminProfileError = (res: Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof AdminProfileServiceError) {
    return res.status(error.statusCode).json({
      error: error.statusCode >= 500 ? "internal_error" : "validation_error",
      message: error.message,
    });
  }

  return res.status(500).json({
    error: "internal_error",
    message: error instanceof Error ? error.message : fallbackMessage,
  });
};

const getContext = async (req: Request) => {
  return getAdminProfileContext({
    supabaseUserId: req.user?.id ?? null,
    role: req.user?.role ?? null,
  });
};

export const getAdminProfileMe = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    return res.status(200).json({
      admin: {
        userId: context.dbUserId,
        supabaseUserId: context.supabaseUserId,
        email: context.email,
        capabilities: context.capabilities,
      },
    });
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to load admin profile");
  }
};

export const getAdminProfileDashboard = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    const dashboard = await getAdminDashboard(context);
    return res.status(200).json(dashboard);
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to load admin dashboard");
  }
};

export const listAdminProfileUsers = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    assertAdminCapability(context, "canManageUsers");
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const users = await listAdminUsers({ search, limit: 100 });
    return res.status(200).json({ capabilities: context.capabilities, users });
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to load users");
  }
};

export const updateAdminProfileUserStatus = async (req: Request, res: Response) => {
  const parsed = userStatusSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const context = await getContext(req);
    assertAdminCapability(context, "canManageUsers");
    const user = await updateAdminUserStatus({
      userId: String(req.params.id),
      status: parsed.data.status,
      actor: context,
    });
    return res.status(200).json({ user });
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to update user status");
  }
};

export const listAdminProfileTeam = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    const team = await listAdminTeam();
    return res.status(200).json({ capabilities: context.capabilities, team });
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to load admin team");
  }
};

export const grantAdminProfileTeamMember = async (req: Request, res: Response) => {
  const parsed = grantAdminSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const context = await getContext(req);
    assertAdminCapability(context, "canManageAdmins");
    const team = await grantAdminByEmail({
      email: parsed.data.email,
      canManageAdmins: parsed.data.canManageAdmins,
      actor: context,
    });
    return res.status(200).json({ capabilities: context.capabilities, team });
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to add admin");
  }
};

export const revokeAdminProfileTeamMember = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    assertAdminCapability(context, "canManageAdmins");
    const team = await revokeAdminByUserId({ userId: String(req.params.id), actor: context });
    return res.status(200).json({ capabilities: context.capabilities, team });
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to remove admin");
  }
};

export const listAdminProfileActivity = async (req: Request, res: Response) => {
  try {
    const context = await getContext(req);
    assertAdminCapability(context, "canViewAudit");
    const activity = await listAdminActivity({});
    return res.status(200).json({ capabilities: context.capabilities, activity });
  } catch (error) {
    return handleAdminProfileError(res, error, "Failed to load admin activity");
  }
};