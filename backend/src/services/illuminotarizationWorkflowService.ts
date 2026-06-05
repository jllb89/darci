import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type IlluminotarizationWorkflowStatus =
  | "draft"
  | "submitted"
  | "code_delivered"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "completed"
  | "canceled"
  | "expired";

export type IlluminotarizationWorkflowKind = "single_document" | "document_bundle";

export type IlluminotarizationWorkflowAssignmentKind =
  | "selected_notary"
  | "assigned_notary"
  | "review_delegate";

export type IlluminotarizationWorkflowAssignmentStatus =
  | "active"
  | "released"
  | "completed"
  | "canceled";

export type IlluminotarizationWorkflowAssignmentSource =
  | "member_selection"
  | "code_resolution"
  | "admin_override"
  | "migration"
  | "system";

export type IlluminotarizationWorkflowStatusChangeSource =
  | "workflow_create"
  | "submit_notarization"
  | "code_delivery"
  | "code_resolution"
  | "review_decision"
  | "admin_override"
  | "migration"
  | "system";

export type CodeDeliveryChannel = "email" | "sms" | "in_app" | "manual";

export type CodeDeliveryMethod =
  | "notification_outbox"
  | "manual_copy"
  | "legacy_backfill";

export type CodeDeliveryReason =
  | "initial_submit"
  | "resent"
  | "regenerated"
  | "manual_copy";

export type CodeDeliveryStatus =
  | "queued"
  | "delivered"
  | "consumed"
  | "expired"
  | "revoked"
  | "failed";

export type AccessCodeAttemptKind = "resolve";

export type AccessCodeAttemptResult =
  | "matched"
  | "not_found"
  | "expired"
  | "already_consumed"
  | "already_assigned"
  | "request_ineligible"
  | "notary_mismatch"
  | "request_missing";

export type IlluminotaryReviewDecision =
  | "approved"
  | "rejected"
  | "changes_requested";

export type IlluminotarizationWorkflowRecord = {
  id: string;
  owner_user_id: string;
  created_by_user_id: string | null;
  primary_document_id: string | null;
  workflow_kind: IlluminotarizationWorkflowKind;
  status: IlluminotarizationWorkflowStatus;
  selected_notary_user_id: string | null;
  assigned_notary_user_id: string | null;
  current_legacy_request_id: string | null;
  submitted_at: string | null;
  last_code_generated_at: string | null;
  review_started_at: string | null;
  closed_at: string | null;
  context_json: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type IlluminotarizationWorkflowDocumentRecord = {
  id: string;
  workflow_id: string;
  document_id: string;
  document_version_id: string | null;
  notarization_request_id: string | null;
  bundle_role: string;
  is_primary: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  included_at: string;
  created_at: string;
  updated_at: string;
};

export type IlluminotarizationWorkflowAssignmentRecord = {
  id: string;
  workflow_id: string;
  assignment_kind: IlluminotarizationWorkflowAssignmentKind;
  user_id: string;
  assigned_by_user_id: string | null;
  assignment_source: IlluminotarizationWorkflowAssignmentSource;
  status: IlluminotarizationWorkflowAssignmentStatus;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type IlluminotarizationWorkflowStatusHistoryRecord = {
  id: string;
  workflow_id: string;
  legacy_request_id: string | null;
  previous_status: IlluminotarizationWorkflowStatus | null;
  next_status: IlluminotarizationWorkflowStatus;
  changed_by_user_id: string | null;
  change_source: IlluminotarizationWorkflowStatusChangeSource;
  change_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CodeDeliveryRecord = {
  id: string;
  workflow_id: string;
  legacy_request_id: string | null;
  illuminotarization_code_id: string | null;
  notification_job_id: string | null;
  previous_code_delivery_id: string | null;
  recipient_user_id: string | null;
  channel: CodeDeliveryChannel;
  delivery_method: CodeDeliveryMethod;
  delivery_reason: CodeDeliveryReason;
  status: CodeDeliveryStatus;
  recipient_address: string | null;
  code_value_snapshot: string;
  expires_at: string | null;
  delivered_at: string | null;
  consumed_at: string | null;
  invalidated_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AccessCodeAttemptRecord = {
  id: string;
  workflow_id: string | null;
  legacy_request_id: string | null;
  illuminotarization_code_id: string | null;
  matched_code_delivery_id: string | null;
  attempted_by_user_id: string | null;
  attempt_kind: AccessCodeAttemptKind;
  attempted_code_value: string;
  result: AccessCodeAttemptResult;
  result_message: string | null;
  attempted_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type IlluminotaryReviewDecisionRecord = {
  id: string;
  workflow_id: string;
  legacy_request_id: string | null;
  decided_by_user_id: string;
  decision: IlluminotaryReviewDecision;
  summary: string | null;
  decision_notes: string | null;
  decided_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const workflowSelectColumns = `
  id,
  owner_user_id,
  created_by_user_id,
  primary_document_id,
  workflow_kind,
  status,
  selected_notary_user_id,
  assigned_notary_user_id,
  current_legacy_request_id,
  submitted_at,
  last_code_generated_at,
  review_started_at,
  closed_at,
  context_json,
  metadata,
  created_at,
  updated_at
`;

const workflowDocumentSelectColumns = `
  id,
  workflow_id,
  document_id,
  document_version_id,
  notarization_request_id,
  bundle_role,
  is_primary,
  sort_order,
  metadata,
  included_at,
  created_at,
  updated_at
`;

const workflowAssignmentSelectColumns = `
  id,
  workflow_id,
  assignment_kind,
  user_id,
  assigned_by_user_id,
  assignment_source,
  status,
  started_at,
  ended_at,
  metadata,
  created_at,
  updated_at
`;

const workflowStatusHistorySelectColumns = `
  id,
  workflow_id,
  legacy_request_id,
  previous_status,
  next_status,
  changed_by_user_id,
  change_source,
  change_reason,
  metadata,
  created_at
`;

const codeDeliverySelectColumns = `
  id,
  workflow_id,
  legacy_request_id,
  illuminotarization_code_id,
  notification_job_id,
  previous_code_delivery_id,
  recipient_user_id,
  channel,
  delivery_method,
  delivery_reason,
  status,
  recipient_address,
  code_value_snapshot,
  expires_at,
  delivered_at,
  consumed_at,
  invalidated_at,
  metadata,
  created_at,
  updated_at
`;

const accessCodeAttemptSelectColumns = `
  id,
  workflow_id,
  legacy_request_id,
  illuminotarization_code_id,
  matched_code_delivery_id,
  attempted_by_user_id,
  attempt_kind,
  attempted_code_value,
  result,
  result_message,
  attempted_at,
  metadata,
  created_at
`;

const reviewDecisionSelectColumns = `
  id,
  workflow_id,
  legacy_request_id,
  decided_by_user_id,
  decision,
  summary,
  decision_notes,
  decided_at,
  metadata,
  created_at
`;

type WorkflowUpdateInput = {
  status?: IlluminotarizationWorkflowStatus | null | undefined;
  selectedNotaryUserId?: string | null | undefined;
  assignedNotaryUserId?: string | null | undefined;
  currentLegacyRequestId?: string | null | undefined;
  submittedAt?: string | null | undefined;
  lastCodeGeneratedAt?: string | null | undefined;
  reviewStartedAt?: string | null | undefined;
  closedAt?: string | null | undefined;
  contextJson?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
};

const mapWorkflowUpdates = (updates: WorkflowUpdateInput) => {
  const mappedUpdates: Record<string, unknown> = {};

  if ("status" in updates) {
    mappedUpdates.status = updates.status ?? null;
  }
  if ("selectedNotaryUserId" in updates) {
    mappedUpdates.selected_notary_user_id = updates.selectedNotaryUserId ?? null;
  }
  if ("assignedNotaryUserId" in updates) {
    mappedUpdates.assigned_notary_user_id = updates.assignedNotaryUserId ?? null;
  }
  if ("currentLegacyRequestId" in updates) {
    mappedUpdates.current_legacy_request_id = updates.currentLegacyRequestId ?? null;
  }
  if ("submittedAt" in updates) {
    mappedUpdates.submitted_at = updates.submittedAt ?? null;
  }
  if ("lastCodeGeneratedAt" in updates) {
    mappedUpdates.last_code_generated_at = updates.lastCodeGeneratedAt ?? null;
  }
  if ("reviewStartedAt" in updates) {
    mappedUpdates.review_started_at = updates.reviewStartedAt ?? null;
  }
  if ("closedAt" in updates) {
    mappedUpdates.closed_at = updates.closedAt ?? null;
  }
  if ("contextJson" in updates) {
    mappedUpdates.context_json = updates.contextJson ?? {};
  }
  if ("metadata" in updates) {
    mappedUpdates.metadata = updates.metadata ?? {};
  }

  return mappedUpdates;
};

export const getIlluminotarizationWorkflowById = async (workflowId: string) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_workflows")
    .select(workflowSelectColumns)
    .eq("id", workflowId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as IlluminotarizationWorkflowRecord | null) ?? null;
};

export const getIlluminotarizationWorkflowByLegacyRequestId = async (
  legacyRequestId: string,
) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_workflows")
    .select(workflowSelectColumns)
    .eq("current_legacy_request_id", legacyRequestId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as IlluminotarizationWorkflowRecord | null) ?? null;
};

export const createIlluminotarizationWorkflow = async (input: {
  ownerUserId: string;
  primaryDocumentId: string;
  createdByUserId?: string | null | undefined;
  workflowKind?: IlluminotarizationWorkflowKind | undefined;
  status?: IlluminotarizationWorkflowStatus | undefined;
  selectedNotaryUserId?: string | null | undefined;
  assignedNotaryUserId?: string | null | undefined;
  submittedAt?: string | null | undefined;
  contextJson?: Record<string, unknown> | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_workflows")
    .insert({
      owner_user_id: input.ownerUserId,
      created_by_user_id: input.createdByUserId ?? null,
      primary_document_id: input.primaryDocumentId,
      workflow_kind: input.workflowKind ?? "single_document",
      status: input.status ?? "submitted",
      selected_notary_user_id: input.selectedNotaryUserId ?? null,
      assigned_notary_user_id: input.assignedNotaryUserId ?? null,
      submitted_at: input.submittedAt ?? null,
      context_json: input.contextJson ?? {},
      metadata: input.metadata ?? {},
    })
    .select(workflowSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create illuminotarization workflow");
  }

  return data as IlluminotarizationWorkflowRecord;
};

export const updateIlluminotarizationWorkflow = async (
  workflowId: string,
  updates: WorkflowUpdateInput,
) => {
  const mappedUpdates = mapWorkflowUpdates(updates);
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_workflows")
    .update(mappedUpdates)
    .eq("id", workflowId)
    .select(workflowSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update illuminotarization workflow");
  }

  return data as IlluminotarizationWorkflowRecord;
};

export const createIlluminotarizationWorkflowDocument = async (input: {
  workflowId: string;
  documentId: string;
  documentVersionId?: string | null | undefined;
  notarizationRequestId?: string | null | undefined;
  bundleRole?: string | undefined;
  isPrimary?: boolean | undefined;
  sortOrder?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_workflow_documents")
    .insert({
      workflow_id: input.workflowId,
      document_id: input.documentId,
      document_version_id: input.documentVersionId ?? null,
      notarization_request_id: input.notarizationRequestId ?? null,
      bundle_role: input.bundleRole ?? "primary",
      is_primary: input.isPrimary ?? true,
      sort_order: input.sortOrder ?? 0,
      metadata: input.metadata ?? {},
    })
    .select(workflowDocumentSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to create illuminotarization workflow document",
    );
  }

  return data as IlluminotarizationWorkflowDocumentRecord;
};

export const createIlluminotarizationWorkflowStatusHistoryEntry = async (input: {
  workflowId: string;
  previousStatus?: IlluminotarizationWorkflowStatus | null | undefined;
  nextStatus: IlluminotarizationWorkflowStatus;
  changedByUserId?: string | null | undefined;
  changeSource: IlluminotarizationWorkflowStatusChangeSource;
  changeReason?: string | null | undefined;
  legacyRequestId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("workflow_status_history")
    .insert({
      workflow_id: input.workflowId,
      legacy_request_id: input.legacyRequestId ?? null,
      previous_status: input.previousStatus ?? null,
      next_status: input.nextStatus,
      changed_by_user_id: input.changedByUserId ?? null,
      change_source: input.changeSource,
      change_reason: input.changeReason ?? null,
      metadata: input.metadata ?? {},
    })
    .select(workflowStatusHistorySelectColumns)
    .single();

  if (error || !data) {
    throw new Error(
      error?.message ?? "Failed to create illuminotarization workflow status history entry",
    );
  }

  return data as IlluminotarizationWorkflowStatusHistoryRecord;
};

export const listWorkflowStatusHistory = async (workflowId: string) => {
  const { data, error } = await supabaseAdmin
    .from("workflow_status_history")
    .select(workflowStatusHistorySelectColumns)
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as IlluminotarizationWorkflowStatusHistoryRecord[]);
};

export const transitionIlluminotarizationWorkflowStatus = async (input: {
  workflowId: string;
  nextStatus: IlluminotarizationWorkflowStatus;
  changedByUserId?: string | null | undefined;
  changeSource: IlluminotarizationWorkflowStatusChangeSource;
  changeReason?: string | null | undefined;
  legacyRequestId?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  workflowUpdates?: WorkflowUpdateInput | undefined;
}) => {
  const workflow = await getIlluminotarizationWorkflowById(input.workflowId);
  if (!workflow) {
    throw new Error("Illuminotarization workflow not found");
  }

  const nextUpdates: WorkflowUpdateInput = {
    ...(input.workflowUpdates ?? {}),
    status: input.nextStatus,
  };

  if (input.nextStatus === "in_review" && !workflow.review_started_at) {
    nextUpdates.reviewStartedAt = new Date().toISOString();
  }

  if (
    ["rejected", "completed", "canceled", "expired"].includes(
      input.nextStatus,
    ) &&
    !workflow.closed_at
  ) {
    nextUpdates.closedAt = new Date().toISOString();
  }

  const updatedWorkflow = await updateIlluminotarizationWorkflow(
    input.workflowId,
    nextUpdates,
  );

  if (workflow.status !== input.nextStatus) {
    await createIlluminotarizationWorkflowStatusHistoryEntry({
      workflowId: input.workflowId,
      previousStatus: workflow.status,
      nextStatus: input.nextStatus,
      changedByUserId: input.changedByUserId,
      changeSource: input.changeSource,
      changeReason: input.changeReason,
      legacyRequestId: input.legacyRequestId,
      metadata: input.metadata,
    });
  }

  return updatedWorkflow;
};

export const upsertIlluminotarizationWorkflowAssignment = async (input: {
  workflowId: string;
  assignmentKind: IlluminotarizationWorkflowAssignmentKind;
  userId: string;
  assignedByUserId?: string | null | undefined;
  assignmentSource: IlluminotarizationWorkflowAssignmentSource;
  status?: IlluminotarizationWorkflowAssignmentStatus | undefined;
  startedAt?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const selectActiveAssignment = async () => {
    const result = await supabaseAdmin
      .from("workflow_assignments")
      .select(workflowAssignmentSelectColumns)
      .eq("workflow_id", input.workflowId)
      .eq("assignment_kind", input.assignmentKind)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      throw new Error(result.error.message);
    }

    return (result.data as IlluminotarizationWorkflowAssignmentRecord | null) ?? null;
  };

  const activeAssignmentsResult = await supabaseAdmin
    .from("workflow_assignments")
    .select(workflowAssignmentSelectColumns)
    .eq("workflow_id", input.workflowId)
    .eq("assignment_kind", input.assignmentKind)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (activeAssignmentsResult.error) {
    throw new Error(activeAssignmentsResult.error.message);
  }

  const activeAssignments =
    (activeAssignmentsResult.data as
      | IlluminotarizationWorkflowAssignmentRecord[]
      | null) ?? [];
  const matchingActiveAssignment = activeAssignments.find(
    (assignment) => assignment.user_id === input.userId,
  );

  if (matchingActiveAssignment) {
    return matchingActiveAssignment;
  }

  const releasedAt = new Date().toISOString();
  for (const activeAssignment of activeAssignments) {
    const { error: releaseError } = await supabaseAdmin
      .from("workflow_assignments")
      .update({
        status: "released",
        ended_at: releasedAt,
      })
      .eq("id", activeAssignment.id);

    if (releaseError) {
      throw new Error(releaseError.message);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("workflow_assignments")
    .insert({
      workflow_id: input.workflowId,
      assignment_kind: input.assignmentKind,
      user_id: input.userId,
      assigned_by_user_id: input.assignedByUserId ?? null,
      assignment_source: input.assignmentSource,
      status: input.status ?? "active",
      started_at: input.startedAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
    })
    .select(workflowAssignmentSelectColumns)
    .single();

  if (error) {
    const isActiveAssignmentConflict =
      error.code === "23505" &&
      (error.message ?? "").includes("ux_workflow_assignments_active_kind");

    if (isActiveAssignmentConflict) {
      const currentActiveAssignment = await selectActiveAssignment();
      if (currentActiveAssignment && currentActiveAssignment.user_id === input.userId) {
        return currentActiveAssignment;
      }

      if (currentActiveAssignment) {
        throw new Error(
          `Workflow assignment is already active for another user (${currentActiveAssignment.user_id})`,
        );
      }
    }

    throw new Error(
      error?.message ?? "Failed to upsert illuminotarization workflow assignment",
    );
  }

  if (!data) {
    throw new Error("Failed to upsert illuminotarization workflow assignment");
  }

  return data as IlluminotarizationWorkflowAssignmentRecord;
};

export const createCodeDeliveryRecord = async (input: {
  workflowId: string;
  legacyRequestId?: string | null | undefined;
  illuminotarizationCodeId?: string | null | undefined;
  notificationJobId?: string | null | undefined;
  previousCodeDeliveryId?: string | null | undefined;
  recipientUserId?: string | null | undefined;
  channel?: CodeDeliveryChannel | undefined;
  deliveryMethod?: CodeDeliveryMethod | undefined;
  deliveryReason?: CodeDeliveryReason | undefined;
  status?: CodeDeliveryStatus | undefined;
  recipientAddress?: string | null | undefined;
  codeValueSnapshot: string;
  expiresAt?: string | null | undefined;
  deliveredAt?: string | null | undefined;
  consumedAt?: string | null | undefined;
  invalidatedAt?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("code_deliveries")
    .insert({
      workflow_id: input.workflowId,
      legacy_request_id: input.legacyRequestId ?? null,
      illuminotarization_code_id: input.illuminotarizationCodeId ?? null,
      notification_job_id: input.notificationJobId ?? null,
      previous_code_delivery_id: input.previousCodeDeliveryId ?? null,
      recipient_user_id: input.recipientUserId ?? null,
      channel: input.channel ?? "email",
      delivery_method: input.deliveryMethod ?? "notification_outbox",
      delivery_reason: input.deliveryReason ?? "initial_submit",
      status: input.status ?? "delivered",
      recipient_address: input.recipientAddress ?? null,
      code_value_snapshot: input.codeValueSnapshot,
      expires_at: input.expiresAt ?? null,
      delivered_at: input.deliveredAt ?? null,
      consumed_at: input.consumedAt ?? null,
      invalidated_at: input.invalidatedAt ?? null,
      metadata: input.metadata ?? {},
    })
    .select(codeDeliverySelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create code delivery record");
  }

  return data as CodeDeliveryRecord;
};

export const getLatestCodeDeliveryForRequest = async (legacyRequestId: string) => {
  const { data, error } = await supabaseAdmin
    .from("code_deliveries")
    .select(codeDeliverySelectColumns)
    .eq("legacy_request_id", legacyRequestId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CodeDeliveryRecord | null) ?? null;
};

export const getLatestCodeDeliveryForCode = async (illuminotarizationCodeId: string) => {
  const { data, error } = await supabaseAdmin
    .from("code_deliveries")
    .select(codeDeliverySelectColumns)
    .eq("illuminotarization_code_id", illuminotarizationCodeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CodeDeliveryRecord | null) ?? null;
};

export const invalidateOpenCodeDeliveriesForRequest = async (input: {
  legacyRequestId: string;
  invalidatedAt: string;
  status: Extract<CodeDeliveryStatus, "expired" | "revoked">;
  excludeCodeId?: string | null | undefined;
}) => {
  let query = supabaseAdmin
    .from("code_deliveries")
    .update({
      status: input.status,
      invalidated_at: input.invalidatedAt,
    })
    .eq("legacy_request_id", input.legacyRequestId)
    .in("status", ["queued", "delivered"]);

  if (input.excludeCodeId) {
    query = query.neq("illuminotarization_code_id", input.excludeCodeId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
};

export const markCodeDeliveriesConsumed = async (input: {
  illuminotarizationCodeId: string;
  consumedAt: string;
}) => {
  const { error } = await supabaseAdmin
    .from("code_deliveries")
    .update({
      status: "consumed",
      consumed_at: input.consumedAt,
    })
    .eq("illuminotarization_code_id", input.illuminotarizationCodeId)
    .in("status", ["queued", "delivered"]);

  if (error) {
    throw new Error(error.message);
  }
};

export const recordAccessCodeAttempt = async (input: {
  workflowId?: string | null | undefined;
  legacyRequestId?: string | null | undefined;
  illuminotarizationCodeId?: string | null | undefined;
  matchedCodeDeliveryId?: string | null | undefined;
  attemptedByUserId?: string | null | undefined;
  attemptKind?: AccessCodeAttemptKind | undefined;
  attemptedCodeValue: string;
  result: AccessCodeAttemptResult;
  resultMessage?: string | null | undefined;
  attemptedAt?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("access_code_attempts")
    .insert({
      workflow_id: input.workflowId ?? null,
      legacy_request_id: input.legacyRequestId ?? null,
      illuminotarization_code_id: input.illuminotarizationCodeId ?? null,
      matched_code_delivery_id: input.matchedCodeDeliveryId ?? null,
      attempted_by_user_id: input.attemptedByUserId ?? null,
      attempt_kind: input.attemptKind ?? "resolve",
      attempted_code_value: input.attemptedCodeValue,
      result: input.result,
      result_message: input.resultMessage ?? null,
      attempted_at: input.attemptedAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
    })
    .select(accessCodeAttemptSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to record access code attempt");
  }

  return data as AccessCodeAttemptRecord;
};

export const createIlluminotaryReviewDecisionRecord = async (input: {
  workflowId: string;
  legacyRequestId?: string | null | undefined;
  decidedByUserId: string;
  decision: IlluminotaryReviewDecision;
  summary?: string | null | undefined;
  decisionNotes?: string | null | undefined;
  decidedAt?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotary_review_decisions")
    .insert({
      workflow_id: input.workflowId,
      legacy_request_id: input.legacyRequestId ?? null,
      decided_by_user_id: input.decidedByUserId,
      decision: input.decision,
      summary: input.summary ?? null,
      decision_notes: input.decisionNotes ?? null,
      decided_at: input.decidedAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
    })
    .select(reviewDecisionSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create illuminotary review decision");
  }

  return data as IlluminotaryReviewDecisionRecord;
};