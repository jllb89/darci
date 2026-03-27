"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserRole = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const zod_1 = require("zod");
const validation_1 = require("../utils/validation");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const updateUserRoleSchema = zod_1.z.object({
    role: zod_1.z.enum(["member", "notary", "admin"]),
});
const normalizeRole = (role) => {
    if (role === "notary" || role === "admin") {
        return role;
    }
    return "member";
};
const updateUserRole = async (req, res) => {
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
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    const supabaseUserId = req.params.id;
    const nextRole = parsed.data.role;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUserId, {
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
exports.updateUserRole = updateUserRole;
//# sourceMappingURL=adminController.js.map