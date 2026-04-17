import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

type UserRecord = {
  id: string;
  supabase_user_id: string | null;
  email: string | null;
  role: string | null;
};

export type DocumentRecord = {
  id: string;
  owner_id: string;
  idn: string | null;
  status: string | null;
  document_type: string | null;
  jurisdiction: string | null;
  product_flow_mode: string | null;
  selected_families: string[] | null;
  output_bundle: Array<Record<string, unknown>>;
  intake_status: string | null;
  intake_schema_version: string | null;
  intake_last_saved_at: string | null;
  intake_submitted_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export type DocumentVersionRecord = {
  id: string;
  document_id: string;
  version: number;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  is_final: boolean | null;
  generation_run_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type TemplateRegistryRecord = {
  id: string;
  jurisdiction: string;
  output_key: string;
  document_key: string;
  template_key: string;
  template_version: string;
  template_hash: string;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  created_at: string;
};

export type TemplateArtifactRenderEngine =
  | "pdf_form"
  | "docx_template"
  | "html_pdf"
  | "other";

export type TemplateArtifactRecord = {
  id: string;
  template_key: string;
  template_version: string;
  template_hash: string;
  artifact_storage_path: string;
  artifact_mime_type: string;
  render_engine: TemplateArtifactRenderEngine;
  artifact_metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
};

export type GenerationRunStatus =
  | "queued"
  | "blocked"
  | "rendering"
  | "rendered"
  | "failed"
  | "canceled";

export type GenerationRunBlockingRequirement = {
  code: string;
  source?: string;
  field?: string;
  message: string;
  blocking: boolean;
};

export type DocumentGenerationRunRecord = {
  id: string;
  document_id: string;
  intake_revision: number;
  output_key: string;
  document_key: string;
  template_key: string;
  template_version: string;
  template_hash: string;
  template_artifact_id: string | null;
  payload_json: Record<string, unknown>;
  coverage_json: Record<string, unknown>;
  render_context_json: Record<string, unknown>;
  blocking_requirements_json: GenerationRunBlockingRequirement[];
  resolved_sources_json: Record<string, unknown>;
  status: GenerationRunStatus;
  renderer_job_id: string | null;
  document_version_id: string | null;
  blocked_at: string | null;
  started_at: string | null;
  rendered_at: string | null;
  failed_at: string | null;
  canceled_at: string | null;
  failure_code: string | null;
  failure_details_json: Record<string, unknown>;
  cancellation_reason: string | null;
  error_message: string | null;
  created_at: string;
};

export type DocumentIntakeDraftRecord = {
  document_id: string;
  owner_id: string;
  product_flow_mode: string;
  jurisdiction: string;
  current_step: string | null;
  rules_snapshot_version: string;
  answers_json: Record<string, unknown>;
  canonical_answers_json: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
};

type DocumentIntakeRevisionEvent = "autosave" | "submit" | "system_migration";

export type SignatureRecord = {
  id: string;
  document_id: string;
  generation_run_id: string | null;
  document_output_signer_id: string | null;
  signer_id: string | null;
  signature_type: string | null;
  storage_path: string | null;
  capture_method: string;
  typed_value: string | null;
  typed_kind: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  metadata: Record<string, unknown>;
  captured_at: string | null;
  created_at: string;
};

export type SignatureCaptureMethod = "upload" | "type" | "draw";

export type SignatureTypedKind = "name" | "initials";

type NotarizationRequestRecord = {
  id: string;
  document_id: string;
  assigned_notary_id: string | null;
  status: string | null;
  submitted_at: string | null;
  created_at: string;
};

type NotarizationCodeRecord = {
  id: string;
  request_id: string;
  code: string;
  status: string | null;
  expires_at: string | null;
  consumed_at: string | null;
  created_at: string;
};

export type DocumentPartyRole =
  | "principal"
  | "agent"
  | "successor_agent"
  | "grantor"
  | "trustee"
  | "successor_trustee";

export type DocumentPartyRecord = {
  id: string;
  document_id: string;
  party_role: DocumentPartyRole;
  full_name: string;
  email: string | null;
  phone_country_code: string;
  phone: string | null;
  is_signing_party: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DocumentPartyUpsertInput = {
  party_role: DocumentPartyRole;
  full_name: string;
  email: string | null;
  phone_country_code: string;
  phone: string | null;
  is_signing_party: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export type DocumentOutputObligationType =
  | "signer"
  | "acknowledger"
  | "witness"
  | "notary";

export type DocumentOutputResolutionSource =
  | "template"
  | "jurisdiction_rule"
  | "manual_override";

export type DocumentOutputSignerRecord = {
  id: string;
  document_id: string;
  generation_run_id: string;
  document_party_id: string | null;
  output_key: string;
  document_key: string;
  party_role: string;
  party_name: string;
  obligation_type: DocumentOutputObligationType;
  signing_group: string | null;
  is_required: boolean;
  resolution_source: DocumentOutputResolutionSource;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DocumentOutputSignerUpsertInput = {
  document_party_id?: string | null;
  output_key: string;
  document_key: string;
  party_role: string;
  party_name: string;
  obligation_type: DocumentOutputObligationType;
  signing_group?: string | null;
  is_required: boolean;
  resolution_source: DocumentOutputResolutionSource;
  sort_order: number;
  metadata: Record<string, unknown>;
};

export type DocumentSystemValueSource =
  | "document_idn"
  | "submission_timestamp"
  | "derived_url"
  | "static_template_text"
  | "template_profile"
  | "review_approval"
  | "signature_execution";

export type DocumentSystemValueRecord = {
  id: string;
  document_id: string;
  system_key: string;
  value_json: unknown;
  source: DocumentSystemValueSource;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DocumentSystemValueUpsertInput = {
  systemKey: string;
  value: unknown;
  source: DocumentSystemValueSource;
  metadata?: Record<string, unknown>;
};

const documentPartySelectColumns =
  "id, document_id, party_role, full_name, email, phone_country_code, phone, is_signing_party, sort_order, metadata, created_at, updated_at";

const documentOutputSignerSelectColumns =
  "id, document_id, generation_run_id, document_party_id, output_key, document_key, party_role, party_name, obligation_type, signing_group, is_required, resolution_source, sort_order, metadata, created_at";

const documentSystemValueSelectColumns =
  "id, document_id, system_key, value_json, source, metadata, created_at, updated_at";

const documentSelectColumns =
  "id, owner_id, idn, status, document_type, jurisdiction, product_flow_mode, selected_families, output_bundle, intake_status, intake_schema_version, intake_last_saved_at, intake_submitted_at, created_at, updated_at";

const documentIntakeDraftSelectColumns =
  "document_id, owner_id, product_flow_mode, jurisdiction, current_step, rules_snapshot_version, answers_json, canonical_answers_json, revision, created_at, updated_at";

const templateRegistrySelectColumns =
  "id, jurisdiction, output_key, document_key, template_key, template_version, template_hash, effective_from, effective_to, is_active, created_at";

const templateArtifactSelectColumns =
  "id, template_key, template_version, template_hash, artifact_storage_path, artifact_mime_type, render_engine, artifact_metadata, is_active, created_at";

const documentGenerationRunSelectColumns =
  "id, document_id, intake_revision, output_key, document_key, template_key, template_version, template_hash, template_artifact_id, payload_json, coverage_json, render_context_json, blocking_requirements_json, resolved_sources_json, status, renderer_job_id, document_version_id, blocked_at, started_at, rendered_at, failed_at, canceled_at, failure_code, failure_details_json, cancellation_reason, error_message, created_at";

const signatureSelectColumns =
  "id, document_id, generation_run_id, document_output_signer_id, signer_id, signature_type, storage_path, capture_method, typed_value, typed_kind, mime_type, size_bytes, status, metadata, captured_at, created_at";

export type SaveDocumentIntakeDraftInput = {
  documentId: string;
  ownerId: string;
  productFlowMode: string;
  jurisdiction: string;
  currentStep?: string | null;
  rulesSnapshotVersion: string;
  answers: Record<string, unknown>;
  canonicalAnswers?: Record<string, unknown>;
  expectedRevision?: number;
  createdBy?: string | null;
  eventType?: DocumentIntakeRevisionEvent;
  validationResult?: Record<string, unknown>;
};

export type BootstrapDocumentIntakeDraftInput = {
  ownerId: string;
  productFlowMode: string;
  jurisdiction: string;
  rulesSnapshotVersion: string;
  resumeLatestDraft?: boolean;
  selectedFamilies?: string[] | null;
  outputBundle?: Array<Record<string, unknown>>;
  createdBy?: string | null;
};

export type BootstrapDocumentIntakeDraftResult = {
  created: boolean;
  document: DocumentRecord;
  draft: DocumentIntakeDraftRecord;
};

export type SaveDocumentIntakeDraftResult =
  | {
      conflict: true;
      currentRevision: number;
    }
  | {
      conflict: false;
      draft: DocumentIntakeDraftRecord;
    };

export type CreateDocumentGenerationRunInput = {
  documentId: string;
  intakeRevision: number;
  outputKey: string;
  documentKey: string;
  templateKey: string;
  templateVersion: string;
  templateHash: string;
  templateArtifactId?: string | null;
  payload: Record<string, unknown>;
  coverage: Record<string, unknown>;
  renderContext?: Record<string, unknown>;
  blockingRequirements?: GenerationRunBlockingRequirement[];
  resolvedSources?: Record<string, unknown>;
  status: GenerationRunStatus;
  rendererJobId?: string | null;
  documentVersionId?: string | null;
  blockedAt?: string | null;
  startedAt?: string | null;
  renderedAt?: string | null;
  failedAt?: string | null;
  canceledAt?: string | null;
  failureCode?: string | null;
  failureDetails?: Record<string, unknown>;
  cancellationReason?: string | null;
  errorMessage?: string | null;
};

export type UpdateDocumentGenerationRunInput = Partial<
  Pick<
    DocumentGenerationRunRecord,
    | "template_artifact_id"
    | "payload_json"
    | "coverage_json"
    | "render_context_json"
    | "blocking_requirements_json"
    | "resolved_sources_json"
    | "status"
    | "renderer_job_id"
    | "document_version_id"
    | "blocked_at"
    | "started_at"
    | "rendered_at"
    | "failed_at"
    | "canceled_at"
    | "failure_code"
    | "failure_details_json"
    | "cancellation_reason"
    | "error_message"
  >
>;

export const isDocumentIntakeLocked = (document: {
  intake_status?: string | null;
}) => {
  const intakeStatus = document.intake_status?.trim().toLowerCase();

  return intakeStatus === "submitted" || intakeStatus === "locked";
};

const fetchUserBySupabaseId = async (supabaseUserId: string) => {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, supabase_user_id, email, role")
    .eq("supabase_user_id", supabaseUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserRecord | null;
};

export const getUserIdBySupabaseId = async (supabaseUserId: string) => {
  const user = await fetchUserBySupabaseId(supabaseUserId);
  return user?.id ?? null;
};

export const getOrCreateUserId = async (
  supabaseUserId: string,
  email?: string,
  role?: string
) => {
  const existing = await fetchUserBySupabaseId(supabaseUserId);
  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      supabase_user_id: supabaseUserId,
      email: email ?? null,
      role: role ?? "member",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? "Failed to create user record");
  }

  return data.id as string;
};

export const createDocumentWithVersion = async (input: {
  documentId: string;
  ownerId: string;
  documentType: string | null;
  jurisdiction: string | null;
  productFlowMode?: string | null;
  selectedFamilies?: string[] | null;
  outputBundle?: Array<Record<string, unknown>>;
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}) => {
  const { data: document, error: documentError } = await supabaseAdmin
    .from("documents")
    .insert({
      id: input.documentId,
      owner_id: input.ownerId,
      idn: null,
      status: "draft",
      document_type: input.documentType,
      jurisdiction: input.jurisdiction,
      product_flow_mode: input.productFlowMode ?? null,
      selected_families:
        input.selectedFamilies && input.selectedFamilies.length > 0
          ? input.selectedFamilies
          : null,
      output_bundle: input.outputBundle ?? [],
    })
    .select(documentSelectColumns)
    .single();

  if (documentError || !document) {
    throw new Error(documentError?.message ?? "Failed to create document");
  }

  const { data: version, error: versionError } = await supabaseAdmin
    .from("document_versions")
    .insert({
      document_id: document.id,
      version: 1,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.fileSize,
      is_final: false,
      created_by: input.ownerId,
    })
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, created_by, created_at"
    )
    .single();

  if (versionError || !version) {
    throw new Error(versionError?.message ?? "Failed to create document version");
  }

  return {
    document: document as DocumentRecord,
    version: version as DocumentVersionRecord,
  };
};

export const getDocumentById = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("documents")
    .select(documentSelectColumns)
    .eq("id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentRecord | null;
};

export const listDocuments = async (ownerId?: string) => {
  let query = supabaseAdmin
    .from("documents")
    .select(documentSelectColumns)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (ownerId) {
    query = query.eq("owner_id", ownerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentRecord[];
};

export const getDocumentVersionById = async (
  documentVersionId: string,
  documentId: string
) => {
  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, generation_run_id, created_by, created_at"
    )
    .eq("id", documentVersionId)
    .eq("document_id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentVersionRecord | null;
};

export const listDocumentVersions = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, generation_run_id, created_by, created_at"
    )
    .eq("document_id", documentId)
    .order("version", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentVersionRecord[];
};

export const createGeneratedDocumentVersion = async (input: {
  documentId: string;
  generationRunId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdBy?: string | null;
  isFinal?: boolean;
}) => {
  const { data: latestVersion, error: latestVersionError } = await supabaseAdmin
    .from("document_versions")
    .select("version")
    .eq("document_id", input.documentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestVersionError) {
    throw new Error(latestVersionError.message);
  }

  const nextVersion = ((latestVersion as { version: number } | null)?.version ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .insert({
      document_id: input.documentId,
      version: nextVersion,
      storage_path: input.storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      is_final: input.isFinal ?? false,
      generation_run_id: input.generationRunId,
      created_by: input.createdBy ?? null,
    })
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, generation_run_id, created_by, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create generated document version");
  }

  return data as DocumentVersionRecord;
};

export const updateDocumentVersion = async (
  documentVersionId: string,
  updates: Partial<
    Pick<
      DocumentVersionRecord,
      | "storage_path"
      | "file_name"
      | "mime_type"
      | "size_bytes"
      | "is_final"
      | "generation_run_id"
    >
  >
) => {
  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .update(updates)
    .eq("id", documentVersionId)
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, generation_run_id, created_by, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update document version");
  }

  return data as DocumentVersionRecord;
};

export const updateDocument = async (
  documentId: string,
  updates: Partial<
    Pick<
      DocumentRecord,
      | "idn"
      | "status"
      | "document_type"
      | "jurisdiction"
      | "product_flow_mode"
      | "selected_families"
      | "output_bundle"
      | "intake_status"
      | "intake_submitted_at"
    >
  >
) => {
  const updatesWithTimestamp = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("documents")
    .update(updatesWithTimestamp)
    .eq("id", documentId)
    .select(documentSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update document");
  }

  return data as DocumentRecord;
};

export const listDocumentParties = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_parties")
    .select(documentPartySelectColumns)
    .eq("document_id", documentId)
    .order("party_role", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentPartyRecord[];
};

export const getDocumentIntakeDraft = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_intake_drafts")
    .select(documentIntakeDraftSelectColumns)
    .eq("document_id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentIntakeDraftRecord | null;
};

export const getActiveTemplateRegistryForOutput = async (input: {
  jurisdiction: string;
  outputKey: string;
  asOf?: string;
}) => {
  const asOf = input.asOf ?? new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("template_registry")
    .select(templateRegistrySelectColumns)
    .eq("jurisdiction", input.jurisdiction)
    .eq("output_key", input.outputKey)
    .eq("is_active", true)
    .lte("effective_from", asOf)
    .order("effective_from", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as TemplateRegistryRecord[];
  const resolved = rows.find((row) => {
    if (!row.effective_to) {
      return true;
    }

    return row.effective_to > asOf;
  });

  return resolved ?? null;
};

export const getActiveTemplateArtifact = async (input: {
  templateKey: string;
  templateVersion: string;
  templateHash: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("template_artifacts")
    .select(templateArtifactSelectColumns)
    .eq("template_key", input.templateKey)
    .eq("template_version", input.templateVersion)
    .eq("template_hash", input.templateHash)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as TemplateArtifactRecord | null;
};

export const getTemplateArtifactById = async (artifactId: string) => {
  const { data, error } = await supabaseAdmin
    .from("template_artifacts")
    .select(templateArtifactSelectColumns)
    .eq("id", artifactId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as TemplateArtifactRecord | null;
};

export const listDocumentGenerationRuns = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_generation_runs")
    .select(documentGenerationRunSelectColumns)
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DocumentGenerationRunRecord[];
};

export const getDocumentGenerationRunById = async (input: {
  runId: string;
  documentId?: string;
}) => {
  let query = supabaseAdmin
    .from("document_generation_runs")
    .select(documentGenerationRunSelectColumns)
    .eq("id", input.runId)
    .limit(1);

  if (input.documentId) {
    query = query.eq("document_id", input.documentId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentGenerationRunRecord | null;
};

export const createDocumentGenerationRun = async (
  input: CreateDocumentGenerationRunInput,
) => {
  const { data, error } = await supabaseAdmin
    .from("document_generation_runs")
    .insert({
      document_id: input.documentId,
      intake_revision: input.intakeRevision,
      output_key: input.outputKey,
      document_key: input.documentKey,
      template_key: input.templateKey,
      template_version: input.templateVersion,
      template_hash: input.templateHash,
      template_artifact_id: input.templateArtifactId ?? null,
      payload_json: input.payload,
      coverage_json: input.coverage,
      render_context_json: input.renderContext ?? {},
      blocking_requirements_json: input.blockingRequirements ?? [],
      resolved_sources_json: input.resolvedSources ?? {},
      status: input.status,
      renderer_job_id: input.rendererJobId ?? null,
      document_version_id: input.documentVersionId ?? null,
      blocked_at: input.blockedAt ?? null,
      started_at: input.startedAt ?? null,
      rendered_at: input.renderedAt ?? null,
      failed_at: input.failedAt ?? null,
      canceled_at: input.canceledAt ?? null,
      failure_code: input.failureCode ?? null,
      failure_details_json: input.failureDetails ?? {},
      cancellation_reason: input.cancellationReason ?? null,
      error_message: input.errorMessage ?? null,
    })
    .select(documentGenerationRunSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create generation run");
  }

  return data as DocumentGenerationRunRecord;
};

export const updateDocumentGenerationRun = async (
  runId: string,
  updates: UpdateDocumentGenerationRunInput,
) => {
  const mappedUpdates: Record<string, unknown> = {};

  if ("template_artifact_id" in updates) {
    mappedUpdates.template_artifact_id = updates.template_artifact_id ?? null;
  }
  if ("payload_json" in updates) {
    mappedUpdates.payload_json = updates.payload_json ?? {};
  }
  if ("coverage_json" in updates) {
    mappedUpdates.coverage_json = updates.coverage_json ?? {};
  }
  if ("render_context_json" in updates) {
    mappedUpdates.render_context_json = updates.render_context_json ?? {};
  }
  if ("blocking_requirements_json" in updates) {
    mappedUpdates.blocking_requirements_json = updates.blocking_requirements_json ?? [];
  }
  if ("resolved_sources_json" in updates) {
    mappedUpdates.resolved_sources_json = updates.resolved_sources_json ?? {};
  }
  if ("status" in updates) {
    mappedUpdates.status = updates.status ?? null;
  }
  if ("renderer_job_id" in updates) {
    mappedUpdates.renderer_job_id = updates.renderer_job_id ?? null;
  }
  if ("document_version_id" in updates) {
    mappedUpdates.document_version_id = updates.document_version_id ?? null;
  }
  if ("blocked_at" in updates) {
    mappedUpdates.blocked_at = updates.blocked_at ?? null;
  }
  if ("started_at" in updates) {
    mappedUpdates.started_at = updates.started_at ?? null;
  }
  if ("rendered_at" in updates) {
    mappedUpdates.rendered_at = updates.rendered_at ?? null;
  }
  if ("failed_at" in updates) {
    mappedUpdates.failed_at = updates.failed_at ?? null;
  }
  if ("canceled_at" in updates) {
    mappedUpdates.canceled_at = updates.canceled_at ?? null;
  }
  if ("failure_code" in updates) {
    mappedUpdates.failure_code = updates.failure_code ?? null;
  }
  if ("failure_details_json" in updates) {
    mappedUpdates.failure_details_json = updates.failure_details_json ?? {};
  }
  if ("cancellation_reason" in updates) {
    mappedUpdates.cancellation_reason = updates.cancellation_reason ?? null;
  }
  if ("error_message" in updates) {
    mappedUpdates.error_message = updates.error_message ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("document_generation_runs")
    .update(mappedUpdates)
    .eq("id", runId)
    .select(documentGenerationRunSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update generation run");
  }

  return data as DocumentGenerationRunRecord;
};

export const claimNextQueuedDocumentGenerationRun = async (input: {
  rendererJobId: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("document_generation_runs")
    .select(documentGenerationRunSelectColumns)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const nextRun = ((data ?? []) as DocumentGenerationRunRecord[])[0] ?? null;
  if (!nextRun) {
    return null;
  }

  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("document_generation_runs")
    .update({
      status: "rendering",
      renderer_job_id: input.rendererJobId,
      started_at: startedAt,
      failed_at: null,
      canceled_at: null,
      error_message: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
    })
    .eq("id", nextRun.id)
    .eq("status", "queued")
    .select(documentGenerationRunSelectColumns)
    .maybeSingle();

  if (claimError) {
    throw new Error(claimError.message);
  }

  return (claimed as DocumentGenerationRunRecord | null) ?? null;
};

export const claimDocumentGenerationRunById = async (input: {
  runId: string;
  rendererJobId: string;
}) => {
  const startedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("document_generation_runs")
    .update({
      status: "rendering",
      renderer_job_id: input.rendererJobId,
      started_at: startedAt,
      failed_at: null,
      canceled_at: null,
      error_message: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
    })
    .eq("id", input.runId)
    .eq("status", "queued")
    .select(documentGenerationRunSelectColumns)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as DocumentGenerationRunRecord | null) ?? null;
};

const getLatestDocumentIntakeDraftByContext = async (input: {
  ownerId: string;
  productFlowMode: string;
  jurisdiction: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("document_intake_drafts")
    .select(documentIntakeDraftSelectColumns)
    .eq("owner_id", input.ownerId)
    .eq("product_flow_mode", input.productFlowMode)
    .eq("jurisdiction", input.jurisdiction)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentIntakeDraftRecord | null;
};

const createDocumentIntakeDraft = async (input: BootstrapDocumentIntakeDraftInput) => {
  const nowIso = new Date().toISOString();

  const { data: document, error: documentError } = await supabaseAdmin
    .from("documents")
    .insert({
      owner_id: input.ownerId,
      idn: null,
      status: "draft",
      document_type: "intake",
      jurisdiction: input.jurisdiction,
      product_flow_mode: input.productFlowMode,
      selected_families:
        input.selectedFamilies && input.selectedFamilies.length > 0
          ? input.selectedFamilies
          : null,
      output_bundle: input.outputBundle ?? [],
      intake_status: "draft",
      intake_schema_version: input.rulesSnapshotVersion,
      intake_last_saved_at: nowIso,
      intake_submitted_at: null,
    })
    .select(documentSelectColumns)
    .single();

  if (documentError || !document) {
    throw new Error(documentError?.message ?? "Failed to create intake document");
  }

  const { data: draft, error: draftError } = await supabaseAdmin
    .from("document_intake_drafts")
    .insert({
      document_id: document.id,
      owner_id: input.ownerId,
      product_flow_mode: input.productFlowMode,
      jurisdiction: input.jurisdiction,
      current_step: null,
      rules_snapshot_version: input.rulesSnapshotVersion,
      answers_json: {},
      canonical_answers_json: {},
      revision: 1,
    })
    .select(documentIntakeDraftSelectColumns)
    .single();

  if (draftError || !draft) {
    throw new Error(draftError?.message ?? "Failed to create intake draft");
  }

  const { error: revisionError } = await supabaseAdmin
    .from("document_intake_revisions")
    .insert({
      document_id: document.id,
      revision: 1,
      event_type: "autosave",
      payload_json: {
        currentStep: null,
        answers: {},
        canonicalAnswers: {},
      },
      validation_result: {},
      created_by: input.createdBy ?? null,
    });

  if (revisionError) {
    throw new Error(revisionError.message);
  }

  return {
    document: document as DocumentRecord,
    draft: draft as DocumentIntakeDraftRecord,
  };
};

export const bootstrapDocumentIntakeDraft = async (
  input: BootstrapDocumentIntakeDraftInput,
): Promise<BootstrapDocumentIntakeDraftResult> => {
  if (input.resumeLatestDraft) {
    const existingDraft = await getLatestDocumentIntakeDraftByContext({
      ownerId: input.ownerId,
      productFlowMode: input.productFlowMode,
      jurisdiction: input.jurisdiction,
    });

    if (existingDraft) {
      const existingDocument = await getDocumentById(existingDraft.document_id);

      if (
        existingDocument &&
        existingDocument.owner_id === input.ownerId &&
        !isDocumentIntakeLocked(existingDocument)
      ) {
        return {
          created: false,
          document: existingDocument,
          draft: existingDraft,
        };
      }
    }
  }

  const created = await createDocumentIntakeDraft(input);

  return {
    created: true,
    document: created.document,
    draft: created.draft,
  };
};

export const saveDocumentIntakeDraft = async (
  input: SaveDocumentIntakeDraftInput,
): Promise<SaveDocumentIntakeDraftResult> => {
  const eventType = input.eventType ?? "autosave";
  const existingDocument = await getDocumentById(input.documentId);

  const existing = await getDocumentIntakeDraft(input.documentId);
  if (existing && typeof input.expectedRevision === "number") {
    if (input.expectedRevision !== existing.revision) {
      return {
        conflict: true,
        currentRevision: existing.revision,
      };
    }
  }

  if (!existing && typeof input.expectedRevision === "number" && input.expectedRevision > 0) {
    return {
      conflict: true,
      currentRevision: 0,
    };
  }

  const nextRevision = existing ? existing.revision + 1 : 1;
  const nowIso = new Date().toISOString();
  const nextCurrentStep =
    input.currentStep === undefined ? (existing?.current_step ?? null) : input.currentStep;
  const nextCanonicalAnswers =
    input.canonicalAnswers ?? existing?.canonical_answers_json ?? {};

  const { data: draft, error: draftError } = await supabaseAdmin
    .from("document_intake_drafts")
    .upsert(
      {
        document_id: input.documentId,
        owner_id: input.ownerId,
        product_flow_mode: input.productFlowMode,
        jurisdiction: input.jurisdiction,
        current_step: nextCurrentStep,
        rules_snapshot_version: input.rulesSnapshotVersion,
        answers_json: input.answers,
        canonical_answers_json: nextCanonicalAnswers,
        revision: nextRevision,
      },
      {
        onConflict: "document_id",
      },
    )
    .select(documentIntakeDraftSelectColumns)
    .single();

  if (draftError || !draft) {
    throw new Error(draftError?.message ?? "Failed to persist intake draft");
  }

  const { error: revisionError } = await supabaseAdmin
    .from("document_intake_revisions")
    .insert({
      document_id: input.documentId,
      revision: nextRevision,
      event_type: eventType,
      payload_json: {
        currentStep: nextCurrentStep,
        answers: input.answers,
        canonicalAnswers: nextCanonicalAnswers,
      },
      validation_result: input.validationResult ?? {},
      created_by: input.createdBy ?? null,
    });

  if (revisionError) {
    throw new Error(revisionError.message);
  }

  const documentUpdatePayload: {
    intake_status: string;
    intake_schema_version: string;
    intake_last_saved_at: string;
    intake_submitted_at?: string;
  } = {
    intake_status:
      eventType === "submit"
        ? existingDocument?.intake_status?.trim().toLowerCase() === "locked"
          ? "locked"
          : "submitted"
        : isDocumentIntakeLocked(existingDocument ?? {})
          ? existingDocument?.intake_status?.trim().toLowerCase() === "locked"
            ? "locked"
            : "submitted"
          : "draft",
    intake_schema_version: input.rulesSnapshotVersion,
    intake_last_saved_at: nowIso,
  };

  if (eventType === "submit" || isDocumentIntakeLocked(existingDocument ?? {})) {
    documentUpdatePayload.intake_submitted_at = existingDocument?.intake_submitted_at ?? nowIso;
  }

  const { error: documentUpdateError } = await supabaseAdmin
    .from("documents")
    .update(documentUpdatePayload)
    .eq("id", input.documentId);

  if (documentUpdateError) {
    throw new Error(documentUpdateError.message);
  }

  return {
    conflict: false,
    draft: draft as DocumentIntakeDraftRecord,
  };
};

export const replaceDocumentParties = async (input: {
  documentId: string;
  parties: DocumentPartyUpsertInput[];
}) => {
  const { error: deleteError } = await supabaseAdmin
    .from("document_parties")
    .delete()
    .eq("document_id", input.documentId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (input.parties.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("document_parties")
      .insert(
        input.parties.map((party) => ({
          document_id: input.documentId,
          ...party,
        })),
      );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return listDocumentParties(input.documentId);
};

export const listDocumentOutputSigners = async (input: {
  documentId: string;
  generationRunId?: string;
}) => {
  let query = supabaseAdmin
    .from("document_output_signers")
    .select(documentOutputSignerSelectColumns)
    .eq("document_id", input.documentId)
    .order("generation_run_id", { ascending: false })
    .order("obligation_type", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (input.generationRunId) {
    query = query.eq("generation_run_id", input.generationRunId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as DocumentOutputSignerRecord[];
};

export const getDocumentOutputSignerById = async (input: {
  signerId: string;
  documentId: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("document_output_signers")
    .select(documentOutputSignerSelectColumns)
    .eq("id", input.signerId)
    .eq("document_id", input.documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as DocumentOutputSignerRecord | null) ?? null;
};

export const updateDocumentOutputSignerMetadata = async (input: {
  signerId: string;
  documentId: string;
  generationRunId: string;
  metadata: Record<string, unknown>;
}) => {
  const { data, error } = await supabaseAdmin
    .from("document_output_signers")
    .update({
      metadata: input.metadata,
    })
    .eq("id", input.signerId)
    .eq("document_id", input.documentId)
    .eq("generation_run_id", input.generationRunId)
    .select(documentOutputSignerSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update document output signer metadata");
  }

  return data as DocumentOutputSignerRecord;
};

export const replaceDocumentOutputSigners = async (input: {
  documentId: string;
  generationRunId: string;
  signers: DocumentOutputSignerUpsertInput[];
}) => {
  const { error: deleteError } = await supabaseAdmin
    .from("document_output_signers")
    .delete()
    .eq("document_id", input.documentId)
    .eq("generation_run_id", input.generationRunId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (input.signers.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from("document_output_signers")
      .insert(
        input.signers.map((signer) => ({
          document_id: input.documentId,
          generation_run_id: input.generationRunId,
          document_party_id: signer.document_party_id ?? null,
          output_key: signer.output_key,
          document_key: signer.document_key,
          party_role: signer.party_role,
          party_name: signer.party_name,
          obligation_type: signer.obligation_type,
          signing_group: signer.signing_group ?? null,
          is_required: signer.is_required,
          resolution_source: signer.resolution_source,
          sort_order: signer.sort_order,
          metadata: signer.metadata,
        }))
      );

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return listDocumentOutputSigners({
    documentId: input.documentId,
    generationRunId: input.generationRunId,
  });
};

export const listDocumentSystemValues = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_system_values")
    .select(documentSystemValueSelectColumns)
    .eq("document_id", documentId)
    .order("system_key", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as DocumentSystemValueRecord[];
};

export const upsertDocumentSystemValues = async (input: {
  documentId: string;
  values: DocumentSystemValueUpsertInput[];
}) => {
  if (input.values.length === 0) {
    return listDocumentSystemValues(input.documentId);
  }

  const { error } = await supabaseAdmin
    .from("document_system_values")
    .upsert(
      input.values.map((value) => ({
        document_id: input.documentId,
        system_key: value.systemKey,
        value_json: value.value ?? null,
        source: value.source,
        metadata: value.metadata ?? {},
      })),
      {
        onConflict: "document_id,system_key",
      },
    );

  if (error) {
    throw new Error(error.message);
  }

  return listDocumentSystemValues(input.documentId);
};

export const getActiveNotarizationRequest = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("notarization_requests")
    .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
    .eq("document_id", documentId)
    .in("status", ["pending", "in_review"])
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as NotarizationRequestRecord | null;
};

export const createNotarizationRequest = async (input: {
  documentId: string;
  submittedAt: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("notarization_requests")
    .insert({
      document_id: input.documentId,
      status: "pending",
      submitted_at: input.submittedAt,
    })
    .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create notarization request");
  }

  return data as NotarizationRequestRecord;
};

export const createNotarizationCode = async (input: {
  requestId: string;
  code: string;
  expiresAt: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_codes")
    .insert({
      request_id: input.requestId,
      code: input.code,
      status: "active",
      expires_at: input.expiresAt,
    })
    .select(
      "id, request_id, code, status, expires_at, consumed_at, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create notarization code");
  }

  return data as NotarizationCodeRecord;
};

export const getNotarizationCodeByValue = async (code: string) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_codes")
    .select(
      "id, request_id, code, status, expires_at, consumed_at, created_at"
    )
    .eq("code", code)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as NotarizationCodeRecord | null;
};

export const updateNotarizationCode = async (
  codeId: string,
  updates: Partial<Pick<NotarizationCodeRecord, "status" | "consumed_at">>
) => {
  const { data, error } = await supabaseAdmin
    .from("illuminotarization_codes")
    .update(updates)
    .eq("id", codeId)
    .select(
      "id, request_id, code, status, expires_at, consumed_at, created_at"
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update notarization code");
  }

  return data as NotarizationCodeRecord;
};

export const getNotarizationRequestById = async (requestId: string) => {
  const { data, error } = await supabaseAdmin
    .from("notarization_requests")
    .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
    .eq("id", requestId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as NotarizationRequestRecord | null;
};

export const updateNotarizationRequest = async (
  requestId: string,
  updates: Partial<Pick<NotarizationRequestRecord, "assigned_notary_id" | "status">>
) => {
  const { data, error } = await supabaseAdmin
    .from("notarization_requests")
    .update(updates)
    .eq("id", requestId)
    .select("id, document_id, assigned_notary_id, status, submitted_at, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update notarization request");
  }

  return data as NotarizationRequestRecord;
};

export const createSignatureRecord = async (input: {
  signatureId: string;
  documentId: string;
  generationRunId?: string | null;
  documentOutputSignerId?: string | null;
  signerId: string | null;
  storagePath?: string | null;
  captureMethod: SignatureCaptureMethod;
  typedValue?: string | null;
  typedKind?: SignatureTypedKind | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  status?: "upload_pending" | "captured";
  metadata?: Record<string, unknown>;
  capturedAt?: string | null;
}) => {
  const { data, error } = await supabaseAdmin
    .from("signatures")
    .insert({
      id: input.signatureId,
      document_id: input.documentId,
      generation_run_id: input.generationRunId ?? null,
      document_output_signer_id: input.documentOutputSignerId ?? null,
      signer_id: input.signerId,
      signature_type: "member",
      storage_path: input.storagePath ?? null,
      capture_method: input.captureMethod,
      typed_value: input.typedValue ?? null,
      typed_kind: input.typedKind ?? null,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      status: input.status ?? "upload_pending",
      metadata: input.metadata ?? {},
      captured_at: input.capturedAt ?? null,
    })
    .select(signatureSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create signature record");
  }

  return data as SignatureRecord;
};

export const getSignatureById = async (
  signatureId: string,
  documentId: string
) => {
  const { data, error } = await supabaseAdmin
    .from("signatures")
    .select(signatureSelectColumns)
    .eq("id", signatureId)
    .eq("document_id", documentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as SignatureRecord | null;
};

export const getSignatureRecordById = async (signatureId: string) => {
  const { data, error } = await supabaseAdmin
    .from("signatures")
    .select(signatureSelectColumns)
    .eq("id", signatureId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as SignatureRecord | null;
};

export const updateSignatureRecord = async (
  signatureId: string,
  documentId: string,
  updates: {
    storagePath?: string | null;
    typedValue?: string | null;
    typedKind?: SignatureTypedKind | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    status?: "upload_pending" | "captured";
    metadata?: Record<string, unknown>;
    capturedAt?: string | null;
  },
) => {
  const mappedUpdates: Record<string, unknown> = {};

  if ("storagePath" in updates) {
    mappedUpdates.storage_path = updates.storagePath ?? null;
  }
  if ("typedValue" in updates) {
    mappedUpdates.typed_value = updates.typedValue ?? null;
  }
  if ("typedKind" in updates) {
    mappedUpdates.typed_kind = updates.typedKind ?? null;
  }
  if ("mimeType" in updates) {
    mappedUpdates.mime_type = updates.mimeType ?? null;
  }
  if ("sizeBytes" in updates) {
    mappedUpdates.size_bytes = updates.sizeBytes ?? null;
  }
  if ("status" in updates) {
    mappedUpdates.status = updates.status ?? null;
  }
  if ("metadata" in updates) {
    mappedUpdates.metadata = updates.metadata ?? {};
  }
  if ("capturedAt" in updates) {
    mappedUpdates.captured_at = updates.capturedAt ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("signatures")
    .update(mappedUpdates)
    .eq("id", signatureId)
    .eq("document_id", documentId)
    .select(signatureSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update signature record");
  }

  return data as SignatureRecord;
};

export const listDocumentSignatures = async (input: {
  documentId: string;
  generationRunId?: string;
  documentOutputSignerId?: string;
}) => {
  let query = supabaseAdmin
    .from("signatures")
    .select(signatureSelectColumns)
    .eq("document_id", input.documentId)
    .order("created_at", { ascending: false });

  if (input.generationRunId) {
    query = query.eq("generation_run_id", input.generationRunId);
  }

  if (input.documentOutputSignerId) {
    query = query.eq("document_output_signer_id", input.documentOutputSignerId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SignatureRecord[];
};

export const listCapturedSignaturesForSigner = async (input: {
  signerId: string;
  limit?: number;
}) => {
  const { data, error } = await supabaseAdmin
    .from("signatures")
    .select(signatureSelectColumns)
    .eq("signer_id", input.signerId)
    .eq("status", "captured")
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 24);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as SignatureRecord[];
};

export const prepareDocumentForSigning = async (documentId: string) => {
  return { documentId, status: "pending_signature" };
};

export const appendAcknowledgmentPage = async (documentId: string) => {
  return { documentId, status: "acknowledgment_appended" };
};

export const watermarkWithNotice = async (documentId: string) => {
  return { documentId, status: "watermarked" };
};
