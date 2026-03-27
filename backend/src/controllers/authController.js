"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signup = exports.login = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const zod_1 = require("zod");
const validation_1 = require("../utils/validation");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabasePublic = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
const signupSchema = zod_1.z.object({
    firstName: zod_1.z.string().trim().min(1),
    lastName: zod_1.z.string().trim().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
const normalizeRole = (role) => {
    if (role === "notary" || role === "admin") {
        return role;
    }
    return "member";
};
const ensureConfigured = (res) => {
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
        res.status(500).json({
            error: "internal_error",
            message: "Supabase auth is not configured",
        });
        return false;
    }
    return true;
};
const upsertUserProfile = async (input) => {
    const payload = {
        supabase_user_id: input.supabaseUserId,
        email: input.email,
        role: normalizeRole(input.role),
        first_name: input.firstName ?? null,
        last_name: input.lastName ?? null,
    };
    const { data, error } = await supabaseAdmin
        .from("users")
        .upsert(payload, { onConflict: "supabase_user_id" })
        .select("id, email, role, status, first_name, last_name")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "Failed to sync user profile");
    }
    return data;
};
const login = async (req, res) => {
    if (!ensureConfigured(res)) {
        return;
    }
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
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
        const profile = await upsertUserProfile({
            supabaseUserId: data.user.id,
            email: data.user.email ?? parsed.data.email,
            role: data.user.app_metadata?.role ?? "member",
            firstName: data.user.user_metadata?.first_name ?? null,
            lastName: data.user.user_metadata?.last_name ?? null,
        });
        return res.status(200).json({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
            user: {
                id: profile.id,
                email: profile.email,
                role: normalizeRole(profile.role ?? undefined),
                status: profile.status ?? "active",
                firstName: profile.first_name,
                lastName: profile.last_name,
            },
        });
    }
    catch (syncError) {
        return res.status(500).json({
            error: "internal_error",
            message: syncError instanceof Error ? syncError.message : "Failed to sync user",
        });
    }
};
exports.login = login;
const signup = async (req, res) => {
    if (!ensureConfigured(res)) {
        return;
    }
    const parsed = signupSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    const { firstName, lastName, email, password } = parsed.data;
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
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
        const status = /already registered|already been registered|already exists/i.test(message)
            ? 409
            : 400;
        return res.status(status).json({
            error: status === 409 ? "conflict" : "validation_error",
            message,
        });
    }
    try {
        const profile = await upsertUserProfile({
            supabaseUserId: createdUser.user.id,
            email: createdUser.user.email ?? email,
            role: "member",
            firstName,
            lastName,
        });
        const { data: loginData, error: loginError } = await supabasePublic.auth.signInWithPassword({ email, password });
        if (loginError || !loginData.session) {
            return res.status(201).json({
                accessToken: null,
                refreshToken: null,
                user: {
                    id: profile.id,
                    email: profile.email,
                    role: normalizeRole(profile.role ?? undefined),
                    status: profile.status ?? "active",
                    firstName: profile.first_name,
                    lastName: profile.last_name,
                },
            });
        }
        return res.status(201).json({
            accessToken: loginData.session.access_token,
            refreshToken: loginData.session.refresh_token,
            user: {
                id: profile.id,
                email: profile.email,
                role: normalizeRole(profile.role ?? undefined),
                status: profile.status ?? "active",
                firstName: profile.first_name,
                lastName: profile.last_name,
            },
        });
    }
    catch (syncError) {
        return res.status(500).json({
            error: "internal_error",
            message: syncError instanceof Error ? syncError.message : "Failed to sync user",
        });
    }
};
exports.signup = signup;
//# sourceMappingURL=authController.js.map