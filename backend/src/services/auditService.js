"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRecentAuditEventsForDocumentIds = exports.recordAuditEvent = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const resolveActorId = async (actorSupabaseId) => {
    if (!actorSupabaseId) {
        return null;
    }
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("supabase_user_id", actorSupabaseId)
        .limit(1)
        .maybeSingle();
    if (error || !data?.id) {
        return null;
    }
    return data.id;
};
const recordAuditEvent = async (input) => {
    const actorId = await resolveActorId(input.actorSupabaseId);
    const metadata = {
        ...input.metadata,
        actor_supabase_id: input.actorSupabaseId ?? null,
        actor_role: input.actorRole ?? null,
    };
    const { error } = await supabaseAdmin.from("audit_events").insert({
        actor_id: actorId,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        action: input.action,
        metadata,
    });
    if (error) {
        console.warn("Audit event insert failed", {
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId ?? null,
            error: error.message,
        });
    }
};
exports.recordAuditEvent = recordAuditEvent;
const buildAuditEventFilter = (documentIds, actorId) => {
    const ids = documentIds
        .map((id) => id.replace(/"/g, ""))
        .map((id) => `"${id}"`)
        .join(",");
    const filters = [
        `entity_id.in.(${ids})`,
        `metadata->>document_id.in.(${ids})`,
    ];
    if (actorId) {
        const sanitizedActorId = actorId.replace(/"/g, "");
        filters.push(`actor_id.eq.\"${sanitizedActorId}\"`);
    }
    return filters.join(",");
};
const listRecentAuditEventsForDocumentIds = async (documentIds, limit = 20, actorId) => {
    if (!documentIds.length) {
        return [];
    }
    const { data, error } = await supabaseAdmin
        .from("audit_events")
        .select("id, actor_id, entity_type, entity_id, action, metadata, created_at")
        .or(buildAuditEventFilter(documentIds, actorId))
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) {
        throw new Error(error.message);
    }
    return (data ?? []);
};
exports.listRecentAuditEventsForDocumentIds = listRecentAuditEventsForDocumentIds;
//# sourceMappingURL=auditService.js.map