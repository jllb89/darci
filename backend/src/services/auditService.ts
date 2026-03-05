import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

type AuditEventInput = {
  actorSupabaseId?: string;
  actorRole?: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
};

const resolveActorId = async (actorSupabaseId?: string) => {
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

  return data.id as string;
};

export const recordAuditEvent = async (input: AuditEventInput) => {
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
