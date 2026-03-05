import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendValidationError } from "../utils/validation";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

const updateUserRoleSchema = z.object({
  role: z.enum(["member", "notary", "admin"]),
});

const normalizeRole = (role?: string) => {
  if (role === "notary" || role === "admin") {
    return role;
  }
  return "member";
};

export const updateUserRole = async (req: Request, res: Response) => {
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "internal_error",
      message: "Supabase service role is not configured",
    });
  }

  if (typeof req.params.id !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Supabase user id is required",
      details: [
        {
          path: "id",
          message: "Supabase user id is required",
        },
      ],
    });
  }

  const parsed = updateUserRoleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const supabaseUserId = req.params.id;
  const nextRole = parsed.data.role;

  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
      app_metadata: { role: nextRole },
    });

  if (authError) {
    return res.status(500).json({
      error: "internal_error",
      message: authError.message,
    });
  }

  const { data: userRow, error: userError } = await supabaseAdmin
    .from("users")
    .update({ role: nextRole })
    .eq("supabase_user_id", supabaseUserId)
    .select("id, supabase_user_id, email, role, status, created_at")
    .maybeSingle();

  if (userError) {
    return res.status(500).json({
      error: "internal_error",
      message: userError.message,
    });
  }

  let user = userRow;
  if (!user) {
    const { data: insertedUser, error: insertError } = await supabaseAdmin
      .from("users")
      .insert({
        supabase_user_id: supabaseUserId,
        email: authData?.user?.email ?? null,
        role: nextRole,
      })
      .select("id, supabase_user_id, email, role, status, created_at")
      .single();

    if (insertError || !insertedUser) {
      return res.status(500).json({
        error: "internal_error",
        message: insertError?.message ?? "Failed to create user record",
      });
    }

    user = insertedUser;
  }

  res.status(200).json({
    user: {
      id: user.id,
      email: user.email,
      role: normalizeRole(user.role),
      status: user.status ?? "active",
    },
  });
};
