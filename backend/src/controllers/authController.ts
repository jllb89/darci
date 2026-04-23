import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ensureUserIdentityFromAuth,
  toUserResponse,
} from "../services/userRoleService";
import { sendValidationError } from "../utils/validation";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const signupSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const ensureConfigured = (res: Response) => {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    res.status(500).json({
      error: "internal_error",
      message: "Supabase auth is not configured",
    });
    return false;
  }

  return true;
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.authorization ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "").trim() || null;
};

const createSupabaseSessionClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};

export const login = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = loginSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { data, error } = await supabasePublic.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.session || !data.user) {
    return res.status(401).json({
      error: "unauthorized",
      message: error?.message ?? "Invalid email or password",
    });
  }

  try {
    const profile = await ensureUserIdentityFromAuth({
      supabaseUserId: data.user.id,
      email: data.user.email ?? parsed.data.email,
      role: (data.user.app_metadata?.role as string | undefined) ?? "member",
      firstName: (data.user.user_metadata?.first_name as string | undefined) ?? null,
      lastName: (data.user.user_metadata?.last_name as string | undefined) ?? null,
    });

    return res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: statusCode >= 500 ? "internal_error" : "validation_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};

export const logout = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const parsed = logoutSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing or invalid authorization header",
    });
  }

  const supabaseSessionClient = createSupabaseSessionClient();
  const { error: sessionError } = await supabaseSessionClient.auth.setSession({
    access_token: accessToken,
    refresh_token: parsed.data.refreshToken,
  });

  if (sessionError) {
    return res.status(401).json({
      error: "unauthorized",
      message: sessionError.message,
    });
  }

  const { error: signOutError } = await supabaseSessionClient.auth.signOut({
    scope: "global",
  });

  if (signOutError) {
    return res.status(500).json({
      error: "internal_error",
      message: signOutError.message,
    });
  }

  return res.status(200).json({
    status: "ok",
    message: "Signed out",
  });
};

export const refresh = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = refreshSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const supabaseSessionClient = createSupabaseSessionClient();
  const { data, error } = await supabaseSessionClient.auth.refreshSession({
    refresh_token: parsed.data.refreshToken,
  });

  if (error || !data.session || !data.user) {
    return res.status(401).json({
      error: "unauthorized",
      message: error?.message ?? "Invalid refresh token",
    });
  }

  try {
    const profile = await ensureUserIdentityFromAuth({
      supabaseUserId: data.user.id,
      email: data.user.email ?? null,
      role: (data.user.app_metadata?.role as string | undefined) ?? "member",
      firstName: (data.user.user_metadata?.first_name as string | undefined) ?? null,
      lastName: (data.user.user_metadata?.last_name as string | undefined) ?? null,
    });

    return res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: "internal_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};

export const signup = async (req: Request, res: Response) => {
  if (!ensureConfigured(res)) {
    return;
  }

  const parsed = signupSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { firstName, lastName, email, password } = parsed.data;

  const { data: createdUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "member" },
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });

  if (createError || !createdUser.user) {
    const message = createError?.message ?? "Unable to create account";
    const status = /already registered|already been registered|already exists/i.test(
      message
    )
      ? 409
      : 400;

    return res.status(status).json({
      error: status === 409 ? "conflict" : "validation_error",
      message,
    });
  }

  try {
    const profile = await ensureUserIdentityFromAuth({
      supabaseUserId: createdUser.user.id,
      email: createdUser.user.email ?? email,
      role: "member",
      firstName,
      lastName,
    });

    const { data: loginData, error: loginError } =
      await supabasePublic.auth.signInWithPassword({ email, password });

    if (loginError || !loginData.session) {
      return res.status(201).json({
        accessToken: null,
        refreshToken: null,
        user: toUserResponse(profile),
      });
    }

    return res.status(201).json({
      accessToken: loginData.session.access_token,
      refreshToken: loginData.session.refresh_token,
      user: toUserResponse(profile),
    });
  } catch (syncError) {
    const statusCode = syncError instanceof Error && "statusCode" in syncError
      ? Number((syncError as { statusCode?: number }).statusCode) || 500
      : 500;

    return res.status(statusCode).json({
      error: "internal_error",
      message:
        syncError instanceof Error ? syncError.message : "Failed to sync user",
    });
  }
};
