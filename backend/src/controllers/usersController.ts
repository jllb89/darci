import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

const normalizeRole = (role?: string) => {
  if (role === "notary" || role === "admin") {
    return role;
  }
  return "member";
};

export const getMe = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      error: "internal_error",
      message: "Supabase service role is not configured",
    });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email, role, status")
    .eq("supabase_user_id", req.user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    return res.status(500).json({
      error: "internal_error",
      message: error.message,
    });
  }

  if (data) {
    return res.status(200).json({
      user: {
        id: data.id,
        email: data.email,
        role: normalizeRole(data.role),
        status: data.status ?? "active",
      },
    });
  }

  const fallbackRole = normalizeRole(req.user.role);
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("users")
    .insert({
      supabase_user_id: req.user.id,
      email: req.user.email ?? null,
      role: fallbackRole,
    })
    .select("id, supabase_user_id, email, role, status")
    .single();

  if (insertError || !inserted) {
    return res.status(500).json({
      error: "internal_error",
      message: insertError?.message ?? "Failed to create user record",
    });
  }

  res.status(200).json({
    user: {
      id: inserted.id,
      email: inserted.email,
      role: normalizeRole(inserted.role),
      status: inserted.status ?? "active",
    },
  });
};
