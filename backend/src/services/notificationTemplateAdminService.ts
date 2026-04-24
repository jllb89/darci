import { createClient } from "@supabase/supabase-js";

type JsonObject = Record<string, unknown>;

type NotificationTemplateRow = {
  id: string;
  template_key: string;
  template_version: string;
  locale: string;
  channel: "email" | "sms" | "in_app";
  template_kind: string;
  audience_scope: string;
  trigger_event: string | null;
  invite_kind: string | null;
  subject_template: string | null;
  body_template: string;
  body_format: "text" | "markdown" | "html";
  variables_schema: JsonObject;
  is_active: boolean;
  source_reference: string | null;
  metadata: JsonObject;
  created_at: string;
  updated_at: string;
};

export type NotificationTemplateAdminRecord = {
  id: string;
  templateKey: string;
  templateVersion: string;
  locale: string;
  channel: "email" | "sms" | "in_app";
  templateKind: string;
  audienceScope: string;
  triggerEvent: string | null;
  inviteKind: string | null;
  subjectTemplate: string | null;
  bodyTemplate: string;
  bodyFormat: "text" | "markdown" | "html";
  variablesSchema: JsonObject;
  isActive: boolean;
  sourceReference: string | null;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type ListNotificationTemplatesForAdminOptions = {
  channel?: "email" | "sms" | "in_app";
  locale?: string;
  templateKey?: string;
  includeInactive?: boolean;
};

export type UpdateNotificationTemplateInput = {
  subjectTemplate?: string | null;
  bodyTemplate?: string;
  bodyFormat?: "text" | "markdown" | "html";
  variablesSchema?: JsonObject;
  isActive?: boolean;
  sourceReference?: string | null;
  metadata?: JsonObject;
};

export type PreviewNotificationTemplateInput = {
  subjectTemplate?: string | null;
  bodyTemplate?: string;
  bodyFormat?: "text" | "markdown" | "html";
  payload: JsonObject;
  recipientEmail?: string | null;
  recipientDisplayName?: string | null;
};

export class NotificationTemplateAdminServiceError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "NotificationTemplateAdminServiceError";
    this.statusCode = statusCode;
  }
}

const NOTIFICATION_TEMPLATE_SELECT = [
  "id",
  "template_key",
  "template_version",
  "locale",
  "channel",
  "template_kind",
  "audience_scope",
  "trigger_event",
  "invite_kind",
  "subject_template",
  "body_template",
  "body_format",
  "variables_schema",
  "is_active",
  "source_reference",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new NotificationTemplateAdminServiceError(
      500,
      "SUPABASE_URL is required to manage notification templates",
    );
  }

  if (!supabaseKey) {
    throw new NotificationTemplateAdminServiceError(
      500,
      "SUPABASE_SERVICE_ROLE_KEY is required to manage notification templates",
    );
  }

  return createClient(supabaseUrl, supabaseKey);
};

const mapRowToRecord = (
  row: NotificationTemplateRow,
): NotificationTemplateAdminRecord => {
  return {
    id: row.id,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    locale: row.locale,
    channel: row.channel,
    templateKind: row.template_kind,
    audienceScope: row.audience_scope,
    triggerEvent: row.trigger_event,
    inviteKind: row.invite_kind,
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    bodyFormat: row.body_format,
    variablesSchema: row.variables_schema ?? {},
    isActive: row.is_active,
    sourceReference: row.source_reference,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

export const listNotificationTemplatesForAdmin = async (
  options: ListNotificationTemplatesForAdminOptions = {},
) => {
  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from("notification_templates")
    .select(NOTIFICATION_TEMPLATE_SELECT)
    .order("template_key", { ascending: true })
    .order("template_version", { ascending: false })
    .order("locale", { ascending: true });

  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }

  if (options.channel) {
    query = query.eq("channel", options.channel);
  }

  if (options.locale) {
    query = query.eq("locale", options.locale);
  }

  if (options.templateKey) {
    query = query.eq("template_key", options.templateKey);
  }

  const { data, error } = await query;

  if (error) {
    throw new NotificationTemplateAdminServiceError(500, error.message);
  }

  return ((data ?? []) as unknown as NotificationTemplateRow[]).map(mapRowToRecord);
};

export const getNotificationTemplateById = async (id: string) => {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select(NOTIFICATION_TEMPLATE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new NotificationTemplateAdminServiceError(500, error.message);
  }

  if (!data) {
    return null;
  }

  return mapRowToRecord(data as unknown as NotificationTemplateRow);
};

export const updateNotificationTemplate = async (
  id: string,
  input: UpdateNotificationTemplateInput,
) => {
  const supabaseAdmin = getSupabaseAdmin();
  const patch: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(input, "subjectTemplate")) {
    patch.subject_template = input.subjectTemplate ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "bodyTemplate")) {
    patch.body_template = input.bodyTemplate;
  }

  if (Object.prototype.hasOwnProperty.call(input, "bodyFormat")) {
    patch.body_format = input.bodyFormat;
  }

  if (Object.prototype.hasOwnProperty.call(input, "variablesSchema")) {
    patch.variables_schema = input.variablesSchema ?? {};
  }

  if (Object.prototype.hasOwnProperty.call(input, "isActive")) {
    patch.is_active = input.isActive;
  }

  if (Object.prototype.hasOwnProperty.call(input, "sourceReference")) {
    patch.source_reference = input.sourceReference ?? null;
  }

  if (Object.prototype.hasOwnProperty.call(input, "metadata")) {
    patch.metadata = input.metadata ?? {};
  }

  if (Object.keys(patch).length === 0) {
    throw new NotificationTemplateAdminServiceError(
      400,
      "At least one update field is required",
    );
  }

  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .update(patch)
    .eq("id", id)
    .select(NOTIFICATION_TEMPLATE_SELECT)
    .maybeSingle();

  if (error) {
    throw new NotificationTemplateAdminServiceError(500, error.message);
  }

  if (!data) {
    return null;
  }

  return mapRowToRecord(data as unknown as NotificationTemplateRow);
};

export const buildNotificationTemplatePreviewSource = (
  template: NotificationTemplateAdminRecord,
  input: PreviewNotificationTemplateInput,
) => {
  return {
    templateKey: template.templateKey,
    audienceScope: template.audienceScope,
    subjectTemplate:
      Object.prototype.hasOwnProperty.call(input, "subjectTemplate")
        ? (input.subjectTemplate ?? null)
        : template.subjectTemplate,
    bodyTemplate:
      Object.prototype.hasOwnProperty.call(input, "bodyTemplate")
        ? input.bodyTemplate ?? null
        : template.bodyTemplate,
    bodyFormat:
      Object.prototype.hasOwnProperty.call(input, "bodyFormat")
        ? input.bodyFormat ?? null
        : template.bodyFormat,
  };
};