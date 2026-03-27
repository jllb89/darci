"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const normalizeRole = (role) => {
    if (role === "notary" || role === "admin") {
        return role;
    }
    return "member";
};
const getMe = async (req, res) => {
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
        .select("id, supabase_user_id, email, role, status, first_name, last_name")
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
                firstName: data.first_name,
                lastName: data.last_name,
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
        .select("id, supabase_user_id, email, role, status, first_name, last_name")
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
            firstName: inserted.first_name,
            lastName: inserted.last_name,
        },
    });
};
exports.getMe = getMe;
//# sourceMappingURL=usersController.js.map