import { randomUUID } from "crypto";
import path from "path";
import {
  PDFDocument as PdfLibDocument,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { createClient } from "@supabase/supabase-js";
import {
  type DocumentGenerationRunRecord,
  type DocumentOutputSignerRecord,
  type DocumentPartyRecord,
  type DocumentRecord,
  type DocumentVersionRecord,
  getActiveNotarizationRequest,
  getDocumentGenerationRunById,
  getDocumentById,
  getUserIdBySupabaseId,
  listDocumentOutputSigners,
  listDocumentParties,
  listDocumentVersions,
  updateDocument,
  updateNotarizationRequest,
} from "./documentService";
import { hashDocument } from "./hashingService";
import { transitionIlluminotarizationWorkflowStatus } from "./illuminotarizationWorkflowService";
import { anchorToLedger } from "./ledgerService";
import { getMeetingByRequestId } from "./meetingService";
import { isNotaryCommissionCurrent, type NotaryProfileRecord } from "./notaryProfileService";
import { downloadDocumentObject, uploadGeneratedDocument } from "./storageService";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export class DocumentFinalizationNotFoundError extends Error {}
export class DocumentFinalizationConflictError extends Error {}
export class DocumentFinalizationForbiddenError extends Error {}

export type AcknowledgmentPageRecord = {
  id: string;
  document_id: string;
  jurisdiction: string | null;
  content: string | null;
  created_at: string;
};

export type DocumentExecutionKind = "acknowledgment_append" | "watermark";
export type DocumentExecutionStatus = "pending" | "completed" | "failed";

export type DocumentExecutionRunRecord = {
  id: string;
  document_id: string;
  source_document_version_id: string;
  output_document_version_id: string | null;
  execution_kind: DocumentExecutionKind;
  status: DocumentExecutionStatus;
  template_id: string | null;
  template_version: string | null;
  watermark_text: string | null;
  initiated_by_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DocumentHashRecordStatus = "pending" | "completed" | "failed";

export type DocumentHashRecordRecord = {
  id: string;
  document_id: string;
  document_version_id: string;
  execution_run_id: string | null;
  algorithm: string;
  hash: string;
  status: DocumentHashRecordStatus;
  attempt_number: number;
  completed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type LedgerEntryRecord = {
  id: string;
  document_id: string;
  idn: string;
  hash: string;
  ledger_tx_id: string | null;
  anchored_at: string | null;
  created_at: string;
};

export type LedgerAnchorAttemptStatus = "pending" | "anchored" | "failed";

export type LedgerAnchorAttemptRecord = {
  id: string;
  document_id: string;
  document_hash_record_id: string;
  ledger_entry_id: string | null;
  status: LedgerAnchorAttemptStatus;
  attempt_number: number;
  requested_at: string;
  completed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  response_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PublicVerificationStatus = "verified" | "unverified" | "not_found";

export type PublicVerificationCheckRecord = {
  id: string;
  document_id: string | null;
  document_hash_record_id: string | null;
  ledger_entry_id: string | null;
  idn: string;
  result_status: PublicVerificationStatus;
  request_ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FinalizationStatus =
  | "acknowledgment_appended"
  | "watermark_applied"
  | "hash_recorded"
  | "ledger_anchored"
  | "verification_checked"
  | "failed";

export type FinalizationStatusHistoryRecord = {
  id: string;
  document_id: string;
  execution_run_id: string | null;
  document_hash_record_id: string | null;
  ledger_anchor_attempt_id: string | null;
  changed_by_user_id: string | null;
  status: FinalizationStatus;
  change_source: string;
  change_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type JurisdictionRuleRecord = {
  jurisdiction: string;
  acknowledgment_template: string | null;
  acknowledgment_template_version: string | null;
  watermark_text_template: string | null;
  venue_required: boolean | null;
  consent_required: boolean | null;
  retention_days: number | null;
};

type JurisdictionFinalizationConfig = {
  acknowledgmentTemplateId: string;
  acknowledgmentTemplateVersion: string;
  watermarkTextTemplate: string;
};

export type AcknowledgmentVenueInput = {
  state: string;
  county: string;
  city?: string | null | undefined;
  addressLine1?: string | null | undefined;
  locationLabel?: string | null | undefined;
  completedAt?: string | null | undefined;
};

export type AcknowledgmentNotaryProfileInput = Pick<
  NotaryProfileRecord,
  | "jurisdiction"
  | "serviceAreaKind"
  | "serviceAreaName"
  | "commissionNumber"
  | "commissionExpiresAt"
  | "signatureDataUrl"
  | "sealDataUrl"
> & {
  notaryName: string;
};

type AcknowledgmentDocumentFamily = "poa_general" | "trust_rrr" | "trust_certificate";

type AcknowledgmentRenderInput = {
  document: DocumentRecord;
  config: JurisdictionFinalizationConfig;
  venue: AcknowledgmentVenueInput;
  notaryProfile: AcknowledgmentNotaryProfileInput;
  documentFamily: AcknowledgmentDocumentFamily;
  acknowledgerNames: string[];
  meetingId?: string | null | undefined;
  identityMethodSummary?: string | null | undefined;
};

type AcknowledgmentRenderResult = {
  content: string;
  rendererKey: "us_ca_acknowledgment_v1" | "us_oh_acknowledgment_v1";
  rendererVersion: string;
  documentFamily: AcknowledgmentDocumentFamily;
  venue: {
    state: string;
    county: string;
    city: string | null;
    addressLine1: string | null;
    locationLabel: string | null;
    completedAt: string;
    formattedVenue: string;
  };
  acknowledgerNames: string[];
  notaryFacts: {
    notaryName: string;
    jurisdiction: string | null;
    serviceAreaKind: string | null;
    serviceAreaName: string | null;
    commissionNumber: string | null;
    commissionExpiresAt: string | null;
  };
};

type AuthorizedFinalizationContext = {
  actorUserId: string | null;
  document: DocumentRecord;
  request: NonNullable<Awaited<ReturnType<typeof getActiveNotarizationRequest>>>;
};

export type VerificationSnapshot = {
  document: DocumentRecord | null;
  hashRecord: DocumentHashRecordRecord | null;
  ledgerEntry: LedgerEntryRecord | null;
  ledgerAnchorAttempt: LedgerAnchorAttemptRecord | null;
};

export type PublicVerificationEvidence = {
  hashRecord: Pick<DocumentHashRecordRecord, "id" | "hash" | "status"> | null;
  ledgerEntry: Pick<LedgerEntryRecord, "id" | "hash" | "ledger_tx_id" | "anchored_at"> | null;
  ledgerAnchorAttempt: Pick<
    LedgerAnchorAttemptRecord,
    "document_hash_record_id" | "ledger_entry_id" | "status"
  > | null;
};

const acknowledgmentPageSelectColumns = [
  "id",
  "document_id",
  "jurisdiction",
  "content",
  "created_at",
].join(", ");

const documentExecutionSelectColumns = [
  "id",
  "document_id",
  "source_document_version_id",
  "output_document_version_id",
  "execution_kind",
  "status",
  "template_id",
  "template_version",
  "watermark_text",
  "initiated_by_user_id",
  "started_at",
  "completed_at",
  "failed_at",
  "error_message",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const documentHashSelectColumns = [
  "id",
  "document_id",
  "document_version_id",
  "execution_run_id",
  "algorithm",
  "hash",
  "status",
  "attempt_number",
  "completed_at",
  "failed_at",
  "error_message",
  "metadata",
  "created_at",
  "updated_at",
].join(", ");

const ledgerEntrySelectColumns = [
  "id",
  "document_id",
  "idn",
  "hash",
  "ledger_tx_id",
  "anchored_at",
  "created_at",
].join(", ");

const ledgerAnchorAttemptSelectColumns = [
  "id",
  "document_id",
  "document_hash_record_id",
  "ledger_entry_id",
  "status",
  "attempt_number",
  "requested_at",
  "completed_at",
  "failed_at",
  "error_message",
  "response_payload",
  "created_at",
  "updated_at",
].join(", ");

const publicVerificationSelectColumns = [
  "id",
  "document_id",
  "document_hash_record_id",
  "ledger_entry_id",
  "idn",
  "result_status",
  "request_ip",
  "user_agent",
  "metadata",
  "created_at",
].join(", ");

const finalizationStatusHistorySelectColumns = [
  "id",
  "document_id",
  "execution_run_id",
  "document_hash_record_id",
  "ledger_anchor_attempt_id",
  "changed_by_user_id",
  "status",
  "change_source",
  "change_reason",
  "metadata",
  "created_at",
].join(", ");

const FINAL_IDN_PATTERN = /^[A-Z0-9]{12}$/;
const DEFAULT_ACK_TEMPLATE_ID = "darci_acknowledgment_v1";
const DEFAULT_ACK_TEMPLATE_VERSION = "2026.04.20.v1";
const DEFAULT_PDF_PAGE_SIZE: [number, number] = [612, 792];
const ACKNOWLEDGMENT_PAGE_MARGIN = 48;
const ACKNOWLEDGMENT_TITLE_SIZE = 20;
const ACKNOWLEDGMENT_META_SIZE = 9;
const ACKNOWLEDGMENT_BODY_SIZE = 11;
const ACKNOWLEDGMENT_LINE_GAP = 4;
const WATERMARK_ROTATION_DEGREES = 32;
const WATERMARK_MIN_FONT_SIZE = 26;
const WATERMARK_MAX_FONT_SIZE = 54;
const WATERMARK_OPACITY = 0.18;
const ACKNOWLEDGMENT_ASSET_MAX_WIDTH = 132;
const ACKNOWLEDGMENT_SIGNATURE_MAX_HEIGHT = 42;
const ACKNOWLEDGMENT_SEAL_MAX_HEIGHT = 76;

const supportedAcknowledgmentFamilies = new Set<AcknowledgmentDocumentFamily>([
  "poa_general",
  "trust_rrr",
  "trust_certificate",
]);

const stateNameByJurisdiction: Record<string, string> = {
  "US-CA": "California",
  "US-OH": "Ohio",
};

const ensureFinalIdn = (idn: string | null) => {
  if (typeof idn !== "string" || !FINAL_IDN_PATTERN.test(idn.trim())) {
    throw new DocumentFinalizationConflictError(
      "Document must have a final IDN before finalization",
    );
  }

  return idn.trim();
};

const getLatestPdfVersion = (versions: DocumentVersionRecord[]) => {
  for (let index = versions.length - 1; index >= 0; index -= 1) {
    const version = versions[index];
    if (version?.mime_type === "application/pdf") {
      return version;
    }
  }

  return versions.length > 0 ? (versions[versions.length - 1] ?? null) : null;
};

const parseExecutionMetadataId = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const buildDerivedFileName = (
  sourceVersion: DocumentVersionRecord,
  suffix: "acknowledged" | "finalized",
  nextVersion: number,
) => {
  const fallbackName = sourceVersion.file_name ?? `${sourceVersion.document_id}.pdf`;
  const parsed = path.parse(fallbackName);
  const extension = parsed.ext || ".pdf";
  const baseName = parsed.name || sourceVersion.document_id;
  return `${baseName}-${suffix}-v${nextVersion}${extension}`;
};

const buildDerivedStoragePath = (document: DocumentRecord, stage: string, fileName: string) => {
  return `${document.owner_id}/${document.id}/finalization/${stage}/${randomUUID()}/${fileName}`;
};

const getNextDocumentVersionNumber = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_versions")
    .select("version")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return ((data as { version: number } | null)?.version ?? 0) + 1;
};

const createDerivedDocumentVersion = async (input: {
  documentId: string;
  sourceVersion: DocumentVersionRecord;
  storagePath: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  createdBy: string | null;
  isFinal?: boolean;
  versionNumber?: number;
}) => {
  const nextVersion = input.versionNumber ?? (await getNextDocumentVersionNumber(input.documentId));

  if (input.isFinal) {
    const { error: resetFinalError } = await supabaseAdmin
      .from("document_versions")
      .update({ is_final: false })
      .eq("document_id", input.documentId)
      .eq("is_final", true);

    if (resetFinalError) {
      throw new Error(resetFinalError.message);
    }
  }

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
      generation_run_id: input.sourceVersion.generation_run_id,
      created_by: input.createdBy,
    })
    .select(
      "id, document_id, version, storage_path, file_name, mime_type, size_bytes, is_final, generation_run_id, created_by, created_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create derived document version");
  }

  return data as DocumentVersionRecord;
};

const getJurisdictionRule = async (jurisdiction: string | null) => {
  if (!jurisdiction) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("jurisdiction_rules")
    .select(
      "jurisdiction, acknowledgment_template, acknowledgment_template_version, watermark_text_template, venue_required, consent_required, retention_days",
    )
    .eq("jurisdiction", jurisdiction)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as JurisdictionRuleRecord | null;
};

const resolveJurisdictionFinalizationConfig = (input: {
  jurisdiction: string | null;
  rule: JurisdictionRuleRecord | null;
}) => {
  const acknowledgmentTemplateId = input.rule?.acknowledgment_template?.trim() ?? "";
  const acknowledgmentTemplateVersion =
    input.rule?.acknowledgment_template_version?.trim() ?? "";
  const watermarkTextTemplate = input.rule?.watermark_text_template?.trim() ?? "";

  if (
    acknowledgmentTemplateId.length === 0
    || acknowledgmentTemplateVersion.length === 0
    || watermarkTextTemplate.length === 0
  ) {
    throw new DocumentFinalizationConflictError(
      `Finalization configuration is missing for ${input.jurisdiction ?? "the document jurisdiction"}`,
    );
  }

  return {
    acknowledgmentTemplateId,
    acknowledgmentTemplateVersion,
    watermarkTextTemplate,
  } satisfies JurisdictionFinalizationConfig;
};

const createAcknowledgmentPageRecord = async (input: {
  documentId: string;
  jurisdiction: string | null;
  content: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("acknowledgment_pages")
    .insert({
      document_id: input.documentId,
      jurisdiction: input.jurisdiction,
      content: input.content,
    })
    .select(acknowledgmentPageSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create acknowledgment page");
  }

  return data as unknown as AcknowledgmentPageRecord;
};

const getAcknowledgmentPageById = async (acknowledgmentPageId: string) => {
  const { data, error } = await supabaseAdmin
    .from("acknowledgment_pages")
    .select(acknowledgmentPageSelectColumns)
    .eq("id", acknowledgmentPageId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as AcknowledgmentPageRecord | null;
};

const createDocumentExecutionRun = async (input: {
  documentId: string;
  sourceDocumentVersionId: string;
  outputDocumentVersionId: string;
  executionKind: DocumentExecutionKind;
  initiatedByUserId: string | null;
  templateId?: string | null;
  templateVersion?: string | null;
  watermarkText?: string | null;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}) => {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("document_execution_runs")
    .insert({
      document_id: input.documentId,
      source_document_version_id: input.sourceDocumentVersionId,
      output_document_version_id: input.outputDocumentVersionId,
      execution_kind: input.executionKind,
      status: "completed",
      template_id: input.templateId ?? null,
      template_version: input.templateVersion ?? null,
      watermark_text: input.watermarkText ?? null,
      initiated_by_user_id: input.initiatedByUserId,
      started_at: completedAt,
      completed_at: completedAt,
      metadata: input.metadata ?? {},
    })
    .select(documentExecutionSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create document execution run");
  }

  return data as unknown as DocumentExecutionRunRecord;
};

const getLatestDocumentExecutionRun = async (input: {
  documentId: string;
  executionKind: DocumentExecutionKind;
}) => {
  const { data, error } = await supabaseAdmin
    .from("document_execution_runs")
    .select(documentExecutionSelectColumns)
    .eq("document_id", input.documentId)
    .eq("execution_kind", input.executionKind)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentExecutionRunRecord | null;
};

const getDocumentExecutionRunById = async (executionRunId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_execution_runs")
    .select(documentExecutionSelectColumns)
    .eq("id", executionRunId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentExecutionRunRecord | null;
};

const createDocumentHashRecord = async (input: {
  documentId: string;
  documentVersionId: string;
  executionRunId: string | null;
  algorithm: string;
  hash: string;
  metadata?: Record<string, unknown>;
}) => {
  const completedAt = new Date().toISOString();
  const { data: latestAttempt, error: latestAttemptError } = await supabaseAdmin
    .from("document_hash_records")
    .select("attempt_number")
    .eq("document_id", input.documentId)
    .eq("document_version_id", input.documentVersionId)
    .eq("algorithm", input.algorithm)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestAttemptError) {
    throw new Error(latestAttemptError.message);
  }

  const attemptNumber = ((latestAttempt as { attempt_number: number } | null)?.attempt_number ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("document_hash_records")
    .insert({
      document_id: input.documentId,
      document_version_id: input.documentVersionId,
      execution_run_id: input.executionRunId,
      algorithm: input.algorithm,
      hash: input.hash,
      status: "completed",
      attempt_number: attemptNumber,
      completed_at: completedAt,
      metadata: input.metadata ?? {},
    })
    .select(documentHashSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create document hash record");
  }

  return data as unknown as DocumentHashRecordRecord;
};

const getDocumentHashRecordById = async (documentHashRecordId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_hash_records")
    .select(documentHashSelectColumns)
    .eq("id", documentHashRecordId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentHashRecordRecord | null;
};

const getLatestDocumentHashRecord = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("document_hash_records")
    .select(documentHashSelectColumns)
    .eq("document_id", documentId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as DocumentHashRecordRecord | null;
};

export const getLatestPublicVerificationCheckByIdn = async (idn: string) => {
  const { data, error } = await supabaseAdmin
    .from("public_verification_checks")
    .select(publicVerificationSelectColumns)
    .eq("idn", idn)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as PublicVerificationCheckRecord | null) ?? null;
};

const createLedgerEntryRecord = async (input: {
  documentId: string;
  idn: string;
  hash: string;
  ledgerTxId: string | null;
  anchoredAt: string | null;
}) => {
  const { data, error } = await supabaseAdmin
    .from("ledger_entries")
    .insert({
      document_id: input.documentId,
      idn: input.idn,
      hash: input.hash,
      ledger_tx_id: input.ledgerTxId,
      anchored_at: input.anchoredAt,
    })
    .select(ledgerEntrySelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create ledger entry");
  }

  return data as unknown as LedgerEntryRecord;
};

const getLedgerEntryById = async (ledgerEntryId: string) => {
  const { data, error } = await supabaseAdmin
    .from("ledger_entries")
    .select(ledgerEntrySelectColumns)
    .eq("id", ledgerEntryId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as LedgerEntryRecord | null;
};

const getLatestLedgerEntryForHash = async (input: { documentId: string; hash: string }) => {
  const { data, error } = await supabaseAdmin
    .from("ledger_entries")
    .select(ledgerEntrySelectColumns)
    .eq("document_id", input.documentId)
    .eq("hash", input.hash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as LedgerEntryRecord | null;
};

const getLatestLedgerAnchorAttemptForHashRecord = async (documentHashRecordId: string) => {
  const { data: anchoredAttempt, error: anchoredAttemptError } = await supabaseAdmin
    .from("ledger_anchor_attempts")
    .select(ledgerAnchorAttemptSelectColumns)
    .eq("document_hash_record_id", documentHashRecordId)
    .eq("status", "anchored")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anchoredAttemptError) {
    throw new Error(anchoredAttemptError.message);
  }

  if (anchoredAttempt) {
    return anchoredAttempt as unknown as LedgerAnchorAttemptRecord;
  }

  const { data, error } = await supabaseAdmin
    .from("ledger_anchor_attempts")
    .select(ledgerAnchorAttemptSelectColumns)
    .eq("document_hash_record_id", documentHashRecordId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as LedgerAnchorAttemptRecord | null;
};

export const getVerificationSnapshotForDocument = async (document: DocumentRecord) => {
  const hashRecord = await getLatestDocumentHashRecord(document.id);
  const ledgerEntry = hashRecord
    ? await getLatestLedgerEntryForHash({
        documentId: document.id,
        hash: hashRecord.hash,
      })
    : null;

  return {
    document,
    hashRecord,
    ledgerEntry,
    ledgerAnchorAttempt: hashRecord
      ? await getLatestLedgerAnchorAttemptForHashRecord(hashRecord.id)
      : null,
  } satisfies VerificationSnapshot;
};

const createLedgerAnchorAttempt = async (input: {
  documentId: string;
  documentHashRecordId: string;
  ledgerEntryId?: string | null;
  status: LedgerAnchorAttemptStatus;
  requestedAt?: string;
  completedAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  responsePayload?: Record<string, unknown>;
}) => {
  const { data: latestAttempt, error: latestAttemptError } = await supabaseAdmin
    .from("ledger_anchor_attempts")
    .select("attempt_number")
    .eq("document_id", input.documentId)
    .eq("document_hash_record_id", input.documentHashRecordId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestAttemptError) {
    throw new Error(latestAttemptError.message);
  }

  const attemptNumber = ((latestAttempt as { attempt_number: number } | null)?.attempt_number ?? 0) + 1;
  const requestedAt = input.requestedAt ?? new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("ledger_anchor_attempts")
    .insert({
      document_id: input.documentId,
      document_hash_record_id: input.documentHashRecordId,
      ledger_entry_id: input.ledgerEntryId ?? null,
      status: input.status,
      attempt_number: attemptNumber,
      requested_at: requestedAt,
      completed_at: input.completedAt ?? null,
      failed_at: input.failedAt ?? null,
      error_message: input.errorMessage ?? null,
      response_payload: input.responsePayload ?? {},
    })
    .select(ledgerAnchorAttemptSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create ledger anchor attempt");
  }

  return data as unknown as LedgerAnchorAttemptRecord;
};

const getLedgerAnchorAttemptById = async (ledgerAnchorAttemptId: string) => {
  const { data, error } = await supabaseAdmin
    .from("ledger_anchor_attempts")
    .select(ledgerAnchorAttemptSelectColumns)
    .eq("id", ledgerAnchorAttemptId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as LedgerAnchorAttemptRecord | null;
};

export const listFinalizationStatusHistory = async (documentId: string) => {
  const { data, error } = await supabaseAdmin
    .from("finalization_status_history")
    .select(finalizationStatusHistorySelectColumns)
    .eq("document_id", documentId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as FinalizationStatusHistoryRecord[]);
};

const createFinalizationStatusHistoryEntry = async (input: {
  documentId: string;
  changedByUserId: string | null;
  status: FinalizationStatus;
  changeSource: string;
  changeReason?: string | null;
  executionRunId?: string | null;
  documentHashRecordId?: string | null;
  ledgerAnchorAttemptId?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  const { data, error } = await supabaseAdmin
    .from("finalization_status_history")
    .insert({
      document_id: input.documentId,
      execution_run_id: input.executionRunId ?? null,
      document_hash_record_id: input.documentHashRecordId ?? null,
      ledger_anchor_attempt_id: input.ledgerAnchorAttemptId ?? null,
      changed_by_user_id: input.changedByUserId,
      status: input.status,
      change_source: input.changeSource,
      change_reason: input.changeReason ?? null,
      metadata: input.metadata ?? {},
    })
    .select(finalizationStatusHistorySelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create finalization status history entry");
  }

  return data as unknown as FinalizationStatusHistoryRecord;
};

const createPublicVerificationCheck = async (input: {
  documentId?: string | null;
  documentHashRecordId?: string | null;
  ledgerEntryId?: string | null;
  idn: string;
  resultStatus: PublicVerificationStatus;
  requestIp?: string | null | undefined;
  userAgent?: string | null | undefined;
  metadata?: Record<string, unknown>;
}) => {
  const { data, error } = await supabaseAdmin
    .from("public_verification_checks")
    .insert({
      document_id: input.documentId ?? null,
      document_hash_record_id: input.documentHashRecordId ?? null,
      ledger_entry_id: input.ledgerEntryId ?? null,
      idn: input.idn,
      result_status: input.resultStatus,
      request_ip: input.requestIp ?? null,
      user_agent: input.userAgent ?? null,
      metadata: input.metadata ?? {},
    })
    .select(publicVerificationSelectColumns)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create public verification check");
  }

  return data as unknown as PublicVerificationCheckRecord;
};

const resolveAuthorizedFinalizationContext = async (input: {
  documentId: string;
  actorSupabaseId?: string | undefined;
  actorRole?: string | null;
}) => {
  const document = await getDocumentById(input.documentId);
  if (!document) {
    throw new DocumentFinalizationNotFoundError("Document not found");
  }

  const request = await getActiveNotarizationRequest(input.documentId);
  if (!request) {
    throw new DocumentFinalizationConflictError(
      "Document must have an active notarization request before finalization",
    );
  }

  let actorUserId: string | null = null;
  if (input.actorSupabaseId) {
    actorUserId = await getUserIdBySupabaseId(input.actorSupabaseId);
  }

  if (input.actorRole === "notary") {
    if (!actorUserId) {
      throw new DocumentFinalizationForbiddenError("Notary user is not registered");
    }

    if (!request.assigned_notary_id) {
      throw new DocumentFinalizationConflictError(
        "Request must be assigned to an illuminotary before finalization",
      );
    }

    if (request.assigned_notary_id !== actorUserId) {
      throw new DocumentFinalizationForbiddenError(
        "Request is assigned to a different illuminotary",
      );
    }
  }

  return {
    actorUserId,
    document,
    request,
  } satisfies AuthorizedFinalizationContext;
};

const asTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const normalizeAcknowledgmentFamily = (
  value: string | null | undefined,
): AcknowledgmentDocumentFamily | null => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (supportedAcknowledgmentFamilies.has(normalized as AcknowledgmentDocumentFamily)) {
    return normalized as AcknowledgmentDocumentFamily;
  }

  if (normalized.includes("poa") || normalized.includes("ddpoa")) {
    return "poa_general";
  }
  if (normalized.includes("trust_certificate") || normalized.includes("certificate")) {
    return "trust_certificate";
  }
  if (
    normalized.includes("trust_rrr") ||
    normalized.includes("registration") ||
    normalized.includes("amendment")
  ) {
    return "trust_rrr";
  }

  return null;
};

const resolveFamilyFromOutputBundle = (document: DocumentRecord) => {
  for (const output of document.output_bundle ?? []) {
    const candidates = [
      output.documentKey,
      output.document_key,
      output.outputKey,
      output.output_key,
      output.templateKey,
      output.template_key,
      output.label,
    ];
    for (const candidate of candidates) {
      const family = normalizeAcknowledgmentFamily(asTrimmedString(candidate));
      if (family) {
        return family;
      }
    }
  }

  return null;
};

const resolveAcknowledgmentFamily = async (input: {
  document: DocumentRecord;
  sourceVersion: DocumentVersionRecord;
}) => {
  let generationRun: DocumentGenerationRunRecord | null = null;
  if (input.sourceVersion.generation_run_id) {
    generationRun = await getDocumentGenerationRunById({
      documentId: input.document.id,
      runId: input.sourceVersion.generation_run_id,
    });
  }

  const candidates = [
    generationRun?.document_key,
    generationRun?.output_key,
    generationRun?.template_key,
    input.document.document_type,
    input.document.product_flow_mode,
    ...(input.document.selected_families ?? []),
  ];

  for (const candidate of candidates) {
    const family = normalizeAcknowledgmentFamily(candidate);
    if (family) {
      return { family, generationRun };
    }
  }

  const bundleFamily = resolveFamilyFromOutputBundle(input.document);
  if (bundleFamily) {
    return { family: bundleFamily, generationRun };
  }

  throw new DocumentFinalizationConflictError(
    "Unable to resolve the acknowledgment document family for this finalization",
  );
};

const uniqueNonEmptyStrings = (values: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length === 0 || seen.has(normalized.toLowerCase())) {
      continue;
    }
    seen.add(normalized.toLowerCase());
    unique.push(normalized);
  }

  return unique;
};

const getFallbackAcknowledgersFromParties = (
  parties: DocumentPartyRecord[],
  family: AcknowledgmentDocumentFamily,
) => {
  const rolesByFamily: Record<AcknowledgmentDocumentFamily, string[]> = {
    poa_general: ["principal"],
    trust_rrr: ["grantor"],
    trust_certificate: ["trustee"],
  };
  const roles = new Set(rolesByFamily[family]);
  return uniqueNonEmptyStrings(
    parties
      .filter((party) => roles.has(party.party_role))
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((party) => party.full_name),
  );
};

const resolveAcknowledgers = async (input: {
  documentId: string;
  family: AcknowledgmentDocumentFamily;
  generationRunId?: string | null;
}) => {
  const signerQueries = [
    listDocumentOutputSigners({
      documentId: input.documentId,
      ...(input.generationRunId ? { generationRunId: input.generationRunId } : {}),
    }),
    input.generationRunId
      ? listDocumentOutputSigners({ documentId: input.documentId })
      : Promise.resolve([] as DocumentOutputSignerRecord[]),
  ];
  const [primarySigners, fallbackSigners] = await Promise.all(signerQueries);
  const signerNames = uniqueNonEmptyStrings(
    [...(primarySigners ?? []), ...(fallbackSigners ?? [])]
      .filter(
        (signer) =>
          signer.document_key === input.family && signer.obligation_type === "acknowledger",
      )
      .sort((left, right) => left.sort_order - right.sort_order)
      .map((signer) => signer.party_name),
  );

  if (signerNames.length > 0) {
    return signerNames;
  }

  const parties = await listDocumentParties(input.documentId);
  const partyNames = getFallbackAcknowledgersFromParties(parties, input.family);
  if (partyNames.length > 0) {
    return partyNames;
  }

  throw new DocumentFinalizationConflictError(
    "Unable to resolve signer names for the acknowledgment certificate",
  );
};

const resolveRendererKey = (config: JurisdictionFinalizationConfig) => {
  const rendererKey = config.acknowledgmentTemplateId.trim();
  if (rendererKey === "us_ca_acknowledgment_v1" || rendererKey === "us_oh_acknowledgment_v1") {
    return rendererKey;
  }

  throw new DocumentFinalizationConflictError(
    `Unsupported acknowledgment renderer ${rendererKey || "<missing>"}`,
  );
};

const formatDisplayDate = (value: string | null | undefined) => {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

const formatCommissionExpirationForCertificate = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "Not provided";
  }

  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T12:00:00.000Z` : trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
};

const getDateParts = (value: string | null | undefined) => {
  const parsed = value ? new Date(value) : new Date();
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return {
    day: new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(date),
    month: new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date),
    year: new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(date),
  };
};

const normalizeVenue = (venue: AcknowledgmentVenueInput, jurisdiction: string | null) => {
  const state = venue.state.trim() || stateNameByJurisdiction[jurisdiction ?? ""] || "";
  const county = venue.county.trim();
  const city = venue.city?.trim() || null;
  const addressLine1 = venue.addressLine1?.trim() || null;
  const locationLabel = venue.locationLabel?.trim() || null;
  const completedAt = venue.completedAt?.trim() || new Date().toISOString();
  const formattedVenue = [
    locationLabel,
    addressLine1,
    city,
    county ? `${county} County` : null,
    state,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");

  if (!county || !state || !formattedVenue) {
    throw new DocumentFinalizationConflictError(
      "Acknowledgment venue requires state and county before append",
    );
  }

  return {
    state,
    county,
    city,
    addressLine1,
    locationLabel,
    completedAt,
    formattedVenue,
  };
};

const buildCaliforniaAcknowledgmentContent = (input: {
  document: DocumentRecord;
  venue: ReturnType<typeof normalizeVenue>;
  notaryProfile: AcknowledgmentNotaryProfileInput;
  acknowledgerNames: string[];
  identityMethodSummary?: string | null | undefined;
}) => {
  const dateParts = getDateParts(input.venue.completedAt);
  const acknowledgers = input.acknowledgerNames.join(", ");
  const commissionExpiresAt = formatCommissionExpirationForCertificate(input.notaryProfile.commissionExpiresAt);
  return [
    "Notarial Acknowledgement",
    `Document ID: ${input.document.id}`,
    input.document.idn ? `IDN: ${input.document.idn}` : null,
    `Notarial venue: ${input.venue.formattedVenue}`,
    input.identityMethodSummary ? `Identity method: ${input.identityMethodSummary}` : null,
    "",
    "A notary public or other officer completing this certificate verifies only the identity of the individual who signed the document to which this certificate is attached, and not the truthfulness, accuracy, or validity of that document.",
    "",
    "State of California",
    `County of ${input.venue.county}`,
    "",
    `On this ${dateParts.day} day of ${dateParts.month} ${dateParts.year}, before me, ${input.notaryProfile.notaryName}, a notary public, personally appeared ${acknowledgers}, who proved to me on the basis of satisfactory evidence to be the person(s) whose name(s) is/are subscribed to the within instrument and acknowledged to me that he/she/they executed the same in his/her/their authorized capacity(ies), and that by his/her/their signature(s) on the instrument the person(s), or the entity upon behalf of which the person(s) acted, executed the instrument.`,
    "",
    "I certify under penalty of perjury under the laws of the State of California that the foregoing paragraph is true and correct.",
    "",
    "Witness my hand and official seal.",
    "",
    `Commission number: ${input.notaryProfile.commissionNumber ?? "Not provided"}`,
    `Commission expires: ${commissionExpiresAt}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
};

const buildOhioAcknowledgmentContent = (input: {
  document: DocumentRecord;
  venue: ReturnType<typeof normalizeVenue>;
  notaryProfile: AcknowledgmentNotaryProfileInput;
  acknowledgerNames: string[];
  identityMethodSummary?: string | null | undefined;
}) => {
  const acknowledgers = input.acknowledgerNames.join(", ");
  const commissionExpiresAt = formatCommissionExpirationForCertificate(input.notaryProfile.commissionExpiresAt);
  return [
    "ACKNOWLEDGMENT CERTIFICATE",
    `Document ID: ${input.document.id}`,
    input.document.idn ? `IDN: ${input.document.idn}` : null,
    `Notarial venue: ${input.venue.formattedVenue}`,
    input.identityMethodSummary ? `Identity method: ${input.identityMethodSummary}` : null,
    "",
    `Signed: ${acknowledgers}`,
    "",
    "State of Ohio",
    `County of ${input.venue.county}`,
    "",
    `The foregoing instrument was acknowledged before me on this ${formatDisplayDate(input.venue.completedAt)} by ${acknowledgers}.`,
    "",
    "(Notary Seal)",
    `Signature of Notary Public - State of Ohio: ${input.notaryProfile.notaryName}`,
    `Commission number: ${input.notaryProfile.commissionNumber ?? "Not provided"}`,
    `My commission expires: ${commissionExpiresAt}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
};

export const renderAcknowledgmentContent = (
  input: AcknowledgmentRenderInput,
): AcknowledgmentRenderResult => {
  const rendererKey = resolveRendererKey(input.config);
  const venue = normalizeVenue(input.venue, input.document.jurisdiction);
  const content =
    rendererKey === "us_ca_acknowledgment_v1"
      ? buildCaliforniaAcknowledgmentContent({
          document: input.document,
          venue,
          notaryProfile: input.notaryProfile,
          acknowledgerNames: input.acknowledgerNames,
          identityMethodSummary: input.identityMethodSummary,
        })
      : buildOhioAcknowledgmentContent({
          document: input.document,
          venue,
          notaryProfile: input.notaryProfile,
          acknowledgerNames: input.acknowledgerNames,
          identityMethodSummary: input.identityMethodSummary,
        });

  return {
    content,
    rendererKey,
    rendererVersion: input.config.acknowledgmentTemplateVersion,
    documentFamily: input.documentFamily,
    venue,
    acknowledgerNames: input.acknowledgerNames,
    notaryFacts: {
      notaryName: input.notaryProfile.notaryName,
      jurisdiction: input.notaryProfile.jurisdiction,
      serviceAreaKind: input.notaryProfile.serviceAreaKind,
      serviceAreaName: input.notaryProfile.serviceAreaName,
      commissionNumber: input.notaryProfile.commissionNumber,
      commissionExpiresAt: input.notaryProfile.commissionExpiresAt,
    },
  };
};

export const renderWatermarkTextTemplate = (template: string, idn: string) => {
  return template.replace(/\{\{\s*idn\s*\}\}/gi, idn).trim();
};

const buildWatermarkText = (input: {
  document: DocumentRecord;
  watermarkTextTemplate: string;
}) => {
  const idn = ensureFinalIdn(input.document.idn);
  return renderWatermarkTextTemplate(input.watermarkTextTemplate, idn);
};

const buildWatermarkTextOrThrow = (input: {
  document: DocumentRecord;
  watermarkTextTemplate: string;
}) => {
  const idn = ensureFinalIdn(input.document.idn);
  const watermarkText = renderWatermarkTextTemplate(input.watermarkTextTemplate, idn);
  if (watermarkText.length === 0) {
    throw new DocumentFinalizationConflictError(
      "Finalization watermark text template resolved to an empty value",
    );
  }

  return watermarkText;
};

const fitPdfTextToWidth = (input: {
  text: string;
  font: PDFFont;
  maxWidth: number;
  initialSize: number;
  minSize?: number;
}) => {
  const minSize = input.minSize ?? 10;
  let size = input.initialSize;

  while (size > minSize && input.font.widthOfTextAtSize(input.text, size) > input.maxWidth) {
    size -= 1;
  }

  return Math.max(size, minSize);
};

const wrapPdfText = (input: {
  text: string;
  font: PDFFont;
  fontSize: number;
  maxWidth: number;
}) => {
  const wrappedLines: string[] = [];

  for (const rawLine of input.text.split(/\r?\n/)) {
    const normalizedLine = rawLine.trim();
    if (normalizedLine.length === 0) {
      wrappedLines.push("");
      continue;
    }

    const words = normalizedLine.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`;
      if (input.font.widthOfTextAtSize(candidate, input.fontSize) <= input.maxWidth) {
        currentLine = candidate;
        continue;
      }

      if (currentLine.length > 0) {
        wrappedLines.push(currentLine);
      }
      currentLine = word;
    }

    if (currentLine.length > 0) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines;
};

const decodeImageDataUrl = (
  dataUrl: string | null | undefined,
  assetLabel: string,
) => {
  if (!dataUrl) {
    return null;
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new DocumentFinalizationConflictError(`${assetLabel} must be a PNG or JPEG data URL`);
  }

  const mimeType = match[1];
  const base64Payload = match[2];
  if (!mimeType || !base64Payload) {
    throw new DocumentFinalizationConflictError(`${assetLabel} is missing image data`);
  }

  const bytes = Buffer.from(base64Payload.replace(/\s+/g, ""), "base64");
  if (bytes.byteLength === 0) {
    throw new DocumentFinalizationConflictError(`${assetLabel} is missing image data`);
  }

  return {
    mimeType: mimeType.toLowerCase(),
    bytes,
  };
};

const embedImageDataUrl = async (
  pdf: PdfLibDocument,
  dataUrl: string | null | undefined,
  assetLabel: string,
) => {
  const decoded = decodeImageDataUrl(dataUrl, assetLabel);
  if (!decoded) {
    return null;
  }

  try {
    return decoded.mimeType === "image/png"
      ? await pdf.embedPng(decoded.bytes)
      : await pdf.embedJpg(decoded.bytes);
  } catch {
    throw new DocumentFinalizationConflictError(
      `${assetLabel} could not be embedded as a PNG or JPEG image`,
    );
  }
};

const fitImageDimensions = (input: {
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}) => {
  const ratio = Math.min(input.maxWidth / input.width, input.maxHeight / input.height, 1);
  return {
    width: input.width * ratio,
    height: input.height * ratio,
  };
};

const drawAcknowledgmentBody = async (input: {
  pdf: PdfLibDocument;
  page: PDFPage;
  bodyText: string;
  pageSize: [number, number];
  signatureImageDataUrl?: string | null | undefined;
  sealImageDataUrl?: string | null | undefined;
}) => {
  const titleFont = await input.pdf.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await input.pdf.embedFont(StandardFonts.Helvetica);
  const nonEmptyLines = input.bodyText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const title = nonEmptyLines[0] ?? "DARCi Notarial Acknowledgment";
  const detailBody = nonEmptyLines.slice(1).join("\n");
  const maxWidth = input.pageSize[0] - ACKNOWLEDGMENT_PAGE_MARGIN * 2;
  const titleSize = fitPdfTextToWidth({
    text: title,
    font: titleFont,
    maxWidth,
    initialSize: ACKNOWLEDGMENT_TITLE_SIZE,
    minSize: 16,
  });

  let currentPage = input.page;
  let currentY = input.pageSize[1] - ACKNOWLEDGMENT_PAGE_MARGIN;

  const createContinuationPage = () => {
    currentPage = input.pdf.addPage(input.pageSize);
    currentY = input.pageSize[1] - ACKNOWLEDGMENT_PAGE_MARGIN;
  };

  currentPage.drawText(title, {
    x: ACKNOWLEDGMENT_PAGE_MARGIN,
    y: currentY,
    size: titleSize,
    font: titleFont,
    color: rgb(0.12, 0.12, 0.12),
  });
  currentY -= titleSize + 10;

  currentPage.drawLine({
    start: { x: ACKNOWLEDGMENT_PAGE_MARGIN, y: currentY },
    end: { x: input.pageSize[0] - ACKNOWLEDGMENT_PAGE_MARGIN, y: currentY },
    thickness: 1,
    color: rgb(0.82, 0.82, 0.82),
  });
  currentY -= 22;

  currentPage.drawText(
    `Generated: ${new Date().toISOString().replace("T", " ").replace("Z", " UTC")}`,
    {
      x: ACKNOWLEDGMENT_PAGE_MARGIN,
      y: currentY,
      size: ACKNOWLEDGMENT_META_SIZE,
      font: bodyFont,
      color: rgb(0.42, 0.42, 0.42),
    },
  );
  currentY -= ACKNOWLEDGMENT_META_SIZE + 16;

  const wrappedLines = wrapPdfText({
    text: detailBody,
    font: bodyFont,
    fontSize: ACKNOWLEDGMENT_BODY_SIZE,
    maxWidth,
  });

  for (const line of wrappedLines) {
    if (currentY <= ACKNOWLEDGMENT_PAGE_MARGIN + ACKNOWLEDGMENT_BODY_SIZE) {
      createContinuationPage();
    }

    if (line.length === 0) {
      currentY -= ACKNOWLEDGMENT_BODY_SIZE + ACKNOWLEDGMENT_LINE_GAP;
      continue;
    }

    currentPage.drawText(line, {
      x: ACKNOWLEDGMENT_PAGE_MARGIN,
      y: currentY,
      size: ACKNOWLEDGMENT_BODY_SIZE,
      font: bodyFont,
      color: rgb(0.18, 0.18, 0.18),
    });
    currentY -= ACKNOWLEDGMENT_BODY_SIZE + ACKNOWLEDGMENT_LINE_GAP;
  }

  const [signatureImage, sealImage] = await Promise.all([
    embedImageDataUrl(input.pdf, input.signatureImageDataUrl, "Notary signature image"),
    embedImageDataUrl(input.pdf, input.sealImageDataUrl, "Notary seal image"),
  ]);

  if (signatureImage || sealImage) {
    if (currentY <= ACKNOWLEDGMENT_PAGE_MARGIN + ACKNOWLEDGMENT_SEAL_MAX_HEIGHT + 20) {
      createContinuationPage();
    }

    currentY -= 12;
    currentPage.drawText("Notary signature and seal", {
      x: ACKNOWLEDGMENT_PAGE_MARGIN,
      y: currentY,
      size: ACKNOWLEDGMENT_META_SIZE,
      font: titleFont,
      color: rgb(0.24, 0.24, 0.24),
    });
    currentY -= ACKNOWLEDGMENT_META_SIZE + 8;

    if (signatureImage) {
      const dimensions = fitImageDimensions({
        width: signatureImage.width,
        height: signatureImage.height,
        maxWidth: ACKNOWLEDGMENT_ASSET_MAX_WIDTH,
        maxHeight: ACKNOWLEDGMENT_SIGNATURE_MAX_HEIGHT,
      });
      currentPage.drawImage(signatureImage, {
        x: ACKNOWLEDGMENT_PAGE_MARGIN,
        y: currentY - dimensions.height,
        width: dimensions.width,
        height: dimensions.height,
      });
    }

    if (sealImage) {
      const dimensions = fitImageDimensions({
        width: sealImage.width,
        height: sealImage.height,
        maxWidth: ACKNOWLEDGMENT_ASSET_MAX_WIDTH,
        maxHeight: ACKNOWLEDGMENT_SEAL_MAX_HEIGHT,
      });
      currentPage.drawImage(sealImage, {
        x: input.pageSize[0] - ACKNOWLEDGMENT_PAGE_MARGIN - dimensions.width,
        y: currentY - dimensions.height,
        width: dimensions.width,
        height: dimensions.height,
      });
    }
  }
};

const drawWatermarkOnPage = async (input: {
  page: PDFPage;
  pdf: PdfLibDocument;
  watermarkText: string;
}) => {
  const watermarkFont = await input.pdf.embedFont(StandardFonts.HelveticaBold);
  const footerFont = await input.pdf.embedFont(StandardFonts.Helvetica);
  const pageWidth = input.page.getWidth();
  const pageHeight = input.page.getHeight();
  const maxWidth = pageWidth * 0.76;
  const initialSize = Math.min(
    Math.round(Math.min(pageWidth, pageHeight) * 0.11),
    WATERMARK_MAX_FONT_SIZE,
  );
  const fontSize = fitPdfTextToWidth({
    text: input.watermarkText,
    font: watermarkFont,
    maxWidth,
    initialSize,
    minSize: WATERMARK_MIN_FONT_SIZE,
  });

  input.page.drawText(input.watermarkText, {
    x: pageWidth * 0.16,
    y: pageHeight * 0.34,
    size: fontSize,
    font: watermarkFont,
    color: rgb(0.78, 0.78, 0.78),
    rotate: degrees(WATERMARK_ROTATION_DEGREES),
    opacity: WATERMARK_OPACITY,
  });

  input.page.drawText(input.watermarkText, {
    x: 28,
    y: 18,
    size: 9,
    font: footerFont,
    color: rgb(0.55, 0.55, 0.55),
    opacity: 0.8,
  });
};

export const appendAcknowledgmentPageToPdf = async (input: {
  sourcePdfBytes: Buffer;
  acknowledgmentContent: string;
  signatureImageDataUrl?: string | null | undefined;
  sealImageDataUrl?: string | null | undefined;
}) => {
  const pdf = await PdfLibDocument.load(input.sourcePdfBytes);
  const pages = pdf.getPages();
  const referencePage = pages[pages.length - 1];
  const pageSize: [number, number] = referencePage
    ? [referencePage.getWidth(), referencePage.getHeight()]
    : DEFAULT_PDF_PAGE_SIZE;

  const acknowledgmentPage = pdf.addPage(pageSize);
  await drawAcknowledgmentBody({
    pdf,
    page: acknowledgmentPage,
    bodyText: input.acknowledgmentContent,
    pageSize,
    signatureImageDataUrl: input.signatureImageDataUrl,
    sealImageDataUrl: input.sealImageDataUrl,
  });

  return Buffer.from(await pdf.save());
};

export const applyFinalizationWatermarkToPdf = async (input: {
  sourcePdfBytes: Buffer;
  watermarkText: string;
}) => {
  const pdf = await PdfLibDocument.load(input.sourcePdfBytes);

  for (const page of pdf.getPages()) {
    await drawWatermarkOnPage({
      page,
      pdf,
      watermarkText: input.watermarkText,
    });
  }

  return Buffer.from(await pdf.save());
};

export const resolvePublicVerificationStatus = (
  evidence: PublicVerificationEvidence,
): PublicVerificationStatus => {
  if (!evidence.hashRecord || evidence.hashRecord.status !== "completed") {
    return "unverified";
  }

  if (
    !evidence.ledgerEntry ||
    evidence.ledgerEntry.hash !== evidence.hashRecord.hash ||
    !evidence.ledgerEntry.ledger_tx_id ||
    !evidence.ledgerEntry.anchored_at
  ) {
    return "unverified";
  }

  if (!evidence.ledgerAnchorAttempt) {
    return "unverified";
  }

  return evidence.ledgerAnchorAttempt.status === "anchored" &&
      evidence.ledgerAnchorAttempt.document_hash_record_id === evidence.hashRecord.id &&
      evidence.ledgerAnchorAttempt.ledger_entry_id === evidence.ledgerEntry.id
    ? "verified"
    : "unverified";
};

const loadExistingAcknowledgmentResult = async (input: {
  document: DocumentRecord;
  request: AuthorizedFinalizationContext["request"];
  execution: DocumentExecutionRunRecord;
}) => {
  const versionId = input.execution.output_document_version_id;
  if (!versionId) {
    throw new Error("Acknowledgment execution is missing an output document version");
  }

  const versions = await listDocumentVersions(input.document.id);
  const version = versions.find((candidate) => candidate.id === versionId);
  if (!version) {
    throw new Error("Acknowledgment execution output document version not found");
  }

  const acknowledgmentPageId = parseExecutionMetadataId(
    input.execution.metadata,
    "acknowledgmentPageId",
  );
  if (!acknowledgmentPageId) {
    throw new Error("Acknowledgment execution is missing its acknowledgment page id");
  }

  const acknowledgmentPage = await getAcknowledgmentPageById(acknowledgmentPageId);
  if (!acknowledgmentPage) {
    throw new Error("Acknowledgment page not found");
  }

  return {
    document: input.document,
    request: input.request,
    actorUserId: input.execution.initiated_by_user_id,
    acknowledgmentPage,
    execution: input.execution,
    version,
  };
};

const loadExistingWatermarkResult = async (input: {
  document: DocumentRecord;
  request: AuthorizedFinalizationContext["request"];
  execution: DocumentExecutionRunRecord;
}) => {
  const versionId = input.execution.output_document_version_id;
  if (!versionId) {
    throw new Error("Watermark execution is missing an output document version");
  }

  const versions = await listDocumentVersions(input.document.id);
  const version = versions.find((candidate) => candidate.id === versionId);
  if (!version) {
    throw new Error("Watermark execution output document version not found");
  }

  const documentHashRecordId = parseExecutionMetadataId(
    input.execution.metadata,
    "documentHashRecordId",
  );
  const ledgerEntryId = parseExecutionMetadataId(input.execution.metadata, "ledgerEntryId");
  const ledgerAnchorAttemptId = parseExecutionMetadataId(
    input.execution.metadata,
    "ledgerAnchorAttemptId",
  );

  const hashRecord = documentHashRecordId
    ? await getDocumentHashRecordById(documentHashRecordId)
    : await getLatestDocumentHashRecord(input.document.id);
  const ledgerEntry = ledgerEntryId
    ? await getLedgerEntryById(ledgerEntryId)
    : hashRecord
      ? await getLatestLedgerEntryForHash({
          documentId: input.document.id,
          hash: hashRecord.hash,
        })
      : null;
  const ledgerAnchorAttempt = ledgerAnchorAttemptId
    ? await getLedgerAnchorAttemptById(ledgerAnchorAttemptId)
    : hashRecord
      ? await getLatestLedgerAnchorAttemptForHashRecord(hashRecord.id)
      : null;

  if (!hashRecord || !ledgerEntry) {
    throw new Error("Watermark execution is missing its hash or ledger state");
  }

  return {
    document: input.document,
    request: input.request,
    actorUserId: input.execution.initiated_by_user_id,
    execution: input.execution,
    version,
    hashRecord,
    ledgerEntry,
    ledgerAnchorAttempt,
  };
};

export const getVerificationSnapshotByIdn = async (idn: string) => {
  const { data: document, error: documentError } = await supabaseAdmin
    .from("documents")
    .select(
      "id, owner_id, idn, status, document_type, jurisdiction, product_flow_mode, selected_families, output_bundle, intake_status, intake_schema_version, intake_last_saved_at, intake_submitted_at, created_at, updated_at",
    )
    .eq("idn", idn)
    .limit(1)
    .maybeSingle();

  if (documentError) {
    throw new Error(documentError.message);
  }

  if (!document) {
    return {
      document: null,
      hashRecord: null,
      ledgerEntry: null,
      ledgerAnchorAttempt: null,
    } satisfies VerificationSnapshot;
  }

  return getVerificationSnapshotForDocument(document as DocumentRecord);
};

export const appendAcknowledgmentPage = async (input: {
  documentId: string;
  actorSupabaseId?: string | undefined;
  actorRole?: string | null;
  venue: AcknowledgmentVenueInput;
  notaryProfile: AcknowledgmentNotaryProfileInput;
  meetingId?: string | null | undefined;
  identityMethodSummary?: string | null | undefined;
}) => {
  const context = await resolveAuthorizedFinalizationContext(input);
  const latestWatermark = await getLatestDocumentExecutionRun({
    documentId: context.document.id,
    executionKind: "watermark",
  });

  if (latestWatermark) {
    throw new DocumentFinalizationConflictError(
      "Document is already finalized and cannot accept a new acknowledgment append",
    );
  }

  const existingAcknowledgment = await getLatestDocumentExecutionRun({
    documentId: context.document.id,
    executionKind: "acknowledgment_append",
  });

  if (existingAcknowledgment) {
    return loadExistingAcknowledgmentResult({
      document: context.document,
      request: context.request,
      execution: existingAcknowledgment,
    });
  }

  const versions = await listDocumentVersions(context.document.id);
  const sourceVersion = getLatestPdfVersion(versions);
  if (!sourceVersion?.storage_path) {
    throw new DocumentFinalizationConflictError(
      "Document must have a stored PDF version before acknowledgment can be appended",
    );
  }

  const profileJurisdiction = input.notaryProfile.jurisdiction?.trim() ?? "";
  if (!profileJurisdiction || profileJurisdiction !== context.document.jurisdiction) {
    throw new DocumentFinalizationConflictError(
      "Assigned illuminotary profile jurisdiction must match the document jurisdiction",
    );
  }

  if (
    !input.notaryProfile.notaryName.trim() ||
    !input.notaryProfile.serviceAreaName?.trim() ||
    !input.notaryProfile.commissionNumber?.trim() ||
    !input.notaryProfile.commissionExpiresAt?.trim() ||
    !input.notaryProfile.signatureDataUrl ||
    !input.notaryProfile.sealDataUrl
  ) {
    throw new DocumentFinalizationConflictError(
      "Assigned illuminotary profile must include jurisdiction, service area, commission details, signature, and seal before acknowledgment append",
    );
  }

  if (!isNotaryCommissionCurrent(input.notaryProfile.commissionExpiresAt)) {
    throw new DocumentFinalizationConflictError(
      "Assigned illuminotary commission must be current before acknowledgment append",
    );
  }

  const rule = await getJurisdictionRule(context.document.jurisdiction);
  const finalizationConfig = resolveJurisdictionFinalizationConfig({
    jurisdiction: context.document.jurisdiction,
    rule,
  });
  const { family: documentFamily, generationRun } = await resolveAcknowledgmentFamily({
    document: context.document,
    sourceVersion,
  });
  const acknowledgerNames = await resolveAcknowledgers({
    documentId: context.document.id,
    family: documentFamily,
    generationRunId: generationRun?.id ?? sourceVersion.generation_run_id,
  });
  const acknowledgmentRender = renderAcknowledgmentContent({
    document: context.document,
    config: finalizationConfig,
    venue: input.venue,
    notaryProfile: input.notaryProfile,
    documentFamily,
    acknowledgerNames,
    meetingId: input.meetingId,
    identityMethodSummary: input.identityMethodSummary,
  });
  const acknowledgmentPage = await createAcknowledgmentPageRecord({
    documentId: context.document.id,
    jurisdiction: context.document.jurisdiction,
    content: acknowledgmentRender.content,
  });

  let sourceContent: Buffer;
  try {
    sourceContent = await downloadDocumentObject(sourceVersion.storage_path);
  } catch (error) {
    throw new DocumentFinalizationConflictError(
      error instanceof Error ? error.message : "Failed to load source document for acknowledgment",
    );
  }

  const nextVersionNumber = await getNextDocumentVersionNumber(context.document.id);
  const fileName = buildDerivedFileName(sourceVersion, "acknowledged", nextVersionNumber);
  const storagePath = buildDerivedStoragePath(context.document, "acknowledgment", fileName);

  let transformedContent: Buffer;
  try {
    transformedContent = await appendAcknowledgmentPageToPdf({
      sourcePdfBytes: sourceContent,
      acknowledgmentContent: acknowledgmentRender.content,
      signatureImageDataUrl: input.notaryProfile.signatureDataUrl,
      sealImageDataUrl: input.notaryProfile.sealDataUrl,
    });
  } catch (error) {
    throw new DocumentFinalizationConflictError(
      error instanceof Error
        ? error.message
        : "Failed to append the acknowledgment page to the PDF",
    );
  }

  await uploadGeneratedDocument({
    storagePath,
    content: transformedContent,
    contentType: "application/pdf",
  });

  const version = await createDerivedDocumentVersion({
    documentId: context.document.id,
    sourceVersion,
    storagePath,
    fileName,
    sizeBytes: transformedContent.byteLength,
    mimeType: "application/pdf",
    createdBy: context.actorUserId,
    isFinal: false,
    versionNumber: nextVersionNumber,
  });

  const execution = await createDocumentExecutionRun({
    documentId: context.document.id,
    sourceDocumentVersionId: sourceVersion.id,
    outputDocumentVersionId: version.id,
    executionKind: "acknowledgment_append",
    initiatedByUserId: context.actorUserId,
    templateId: finalizationConfig.acknowledgmentTemplateId,
    templateVersion: finalizationConfig.acknowledgmentTemplateVersion,
    metadata: {
      acknowledgmentPageId: acknowledgmentPage.id,
      sourceVersionId: sourceVersion.id,
      outputVersionId: version.id,
      acknowledgmentRender: {
        rendererKey: acknowledgmentRender.rendererKey,
        rendererVersion: acknowledgmentRender.rendererVersion,
        documentFamily: acknowledgmentRender.documentFamily,
        venue: acknowledgmentRender.venue,
        acknowledgerNames: acknowledgmentRender.acknowledgerNames,
        notaryFacts: acknowledgmentRender.notaryFacts,
        meetingId: input.meetingId ?? null,
        identityMethodSummary: input.identityMethodSummary ?? null,
        assets: {
          signatureEmbedded: Boolean(input.notaryProfile.signatureDataUrl),
          sealEmbedded: Boolean(input.notaryProfile.sealDataUrl),
        },
      },
    },
  });

  await createFinalizationStatusHistoryEntry({
    documentId: context.document.id,
    changedByUserId: context.actorUserId,
    status: "acknowledgment_appended",
    changeSource: "documents.append-acknowledgment",
    changeReason: "Acknowledgment page appended to document version chain",
    executionRunId: execution.id,
    metadata: {
      acknowledgmentPageId: acknowledgmentPage.id,
      sourceVersionId: sourceVersion.id,
      outputVersionId: version.id,
      rendererKey: acknowledgmentRender.rendererKey,
      documentFamily: acknowledgmentRender.documentFamily,
      venue: acknowledgmentRender.venue,
      acknowledgerNames: acknowledgmentRender.acknowledgerNames,
    },
  });

  return {
    document: context.document,
    request: context.request,
    actorUserId: context.actorUserId,
    acknowledgmentPage,
    execution,
    version,
  };
};

export const watermarkWithNotice = async (input: {
  documentId: string;
  actorSupabaseId?: string | undefined;
  actorRole?: string | null;
}) => {
  const context = await resolveAuthorizedFinalizationContext(input);
  const rule = await getJurisdictionRule(context.document.jurisdiction);
  const finalizationConfig = resolveJurisdictionFinalizationConfig({
    jurisdiction: context.document.jurisdiction,
    rule,
  });

  const meeting = await getMeetingByRequestId(context.request.id);
  if (!meeting || meeting.status !== "completed") {
    throw new DocumentFinalizationConflictError(
      "Meeting must be completed before the document can be finalized",
    );
  }

  const latestWatermark = await getLatestDocumentExecutionRun({
    documentId: context.document.id,
    executionKind: "watermark",
  });

  if (latestWatermark) {
    return loadExistingWatermarkResult({
      document: context.document,
      request: context.request,
      execution: latestWatermark,
    });
  }

  const latestAcknowledgment = await getLatestDocumentExecutionRun({
    documentId: context.document.id,
    executionKind: "acknowledgment_append",
  });
  if (!latestAcknowledgment?.output_document_version_id) {
    throw new DocumentFinalizationConflictError(
      "Acknowledgment must be appended before the document can be watermarked",
    );
  }

  const versions = await listDocumentVersions(context.document.id);
  const sourceVersion = versions.find(
    (version) => version.id === latestAcknowledgment.output_document_version_id,
  );
  if (!sourceVersion?.storage_path) {
    throw new DocumentFinalizationConflictError(
      "Acknowledgment output version is missing its stored PDF asset",
    );
  }

  const idn = ensureFinalIdn(context.document.idn);
  const watermarkText = buildWatermarkTextOrThrow({
    document: context.document,
    watermarkTextTemplate: finalizationConfig.watermarkTextTemplate,
  });

  let sourceContent: Buffer;
  try {
    sourceContent = await downloadDocumentObject(sourceVersion.storage_path);
  } catch (error) {
    throw new DocumentFinalizationConflictError(
      error instanceof Error ? error.message : "Failed to load source document for watermark",
    );
  }

  const nextVersionNumber = await getNextDocumentVersionNumber(context.document.id);
  const fileName = buildDerivedFileName(sourceVersion, "finalized", nextVersionNumber);
  const storagePath = buildDerivedStoragePath(context.document, "watermark", fileName);

  let transformedContent: Buffer;
  try {
    transformedContent = await applyFinalizationWatermarkToPdf({
      sourcePdfBytes: sourceContent,
      watermarkText,
    });
  } catch (error) {
    throw new DocumentFinalizationConflictError(
      error instanceof Error ? error.message : "Failed to apply the finalization watermark",
    );
  }

  await uploadGeneratedDocument({
    storagePath,
    content: transformedContent,
    contentType: "application/pdf",
  });

  const version = await createDerivedDocumentVersion({
    documentId: context.document.id,
    sourceVersion,
    storagePath,
    fileName,
    sizeBytes: transformedContent.byteLength,
    mimeType: "application/pdf",
    createdBy: context.actorUserId,
    isFinal: true,
    versionNumber: nextVersionNumber,
  });

  const execution = await createDocumentExecutionRun({
    documentId: context.document.id,
    sourceDocumentVersionId: sourceVersion.id,
    outputDocumentVersionId: version.id,
    executionKind: "watermark",
    initiatedByUserId: context.actorUserId,
    watermarkText,
    metadata: {
      sourceVersionId: sourceVersion.id,
      outputVersionId: version.id,
    },
  });

  const hashResult = await hashDocument(context.document.id, transformedContent);
  const hashRecord = await createDocumentHashRecord({
    documentId: context.document.id,
    documentVersionId: version.id,
    executionRunId: execution.id,
    algorithm: "sha256",
    hash: hashResult.hash,
    metadata: {
      sourceVersionId: sourceVersion.id,
      outputVersionId: version.id,
    },
  });

  const ledgerResult = await anchorToLedger(idn, hashRecord.hash);
  const ledgerEntry = await createLedgerEntryRecord({
    documentId: context.document.id,
    idn,
    hash: hashRecord.hash,
    ledgerTxId: ledgerResult.ledgerTxId,
    anchoredAt: ledgerResult.anchoredAt,
  });
  const ledgerAnchorAttempt = await createLedgerAnchorAttempt({
    documentId: context.document.id,
    documentHashRecordId: hashRecord.id,
    ledgerEntryId: ledgerEntry.id,
    status: ledgerResult.status === "anchored" ? "anchored" : "failed",
    completedAt: ledgerResult.status === "anchored" ? ledgerEntry.anchored_at : null,
    failedAt: ledgerResult.status === "failed" ? new Date().toISOString() : null,
    errorMessage: ledgerResult.errorMessage,
    responsePayload: {
      idn: ledgerResult.idn,
      hash: ledgerResult.hash,
      ledgerTxId: ledgerResult.ledgerTxId,
      status: ledgerResult.status,
      anchoredAt: ledgerResult.anchoredAt ?? ledgerEntry.anchored_at,
      errorMessage: ledgerResult.errorMessage,
      provider: ledgerResult.provider,
    },
  });

  const executionMetadata = {
    ...execution.metadata,
    documentHashRecordId: hashRecord.id,
    ledgerEntryId: ledgerEntry.id,
    ledgerAnchorAttemptId: ledgerAnchorAttempt.id,
  };
  const { data: updatedExecution, error: updatedExecutionError } = await supabaseAdmin
    .from("document_execution_runs")
    .update({ metadata: executionMetadata })
    .eq("id", execution.id)
    .select(documentExecutionSelectColumns)
    .single();

  if (updatedExecutionError || !updatedExecution) {
    throw new Error(updatedExecutionError?.message ?? "Failed to update watermark execution metadata");
  }

  await createFinalizationStatusHistoryEntry({
    documentId: context.document.id,
    changedByUserId: context.actorUserId,
    status: "watermark_applied",
    changeSource: "documents.watermark",
    changeReason: "Digital-original watermark execution completed",
    executionRunId: execution.id,
    metadata: {
      sourceVersionId: sourceVersion.id,
      outputVersionId: version.id,
      watermarkText,
    },
  });
  await createFinalizationStatusHistoryEntry({
    documentId: context.document.id,
    changedByUserId: context.actorUserId,
    status: "hash_recorded",
    changeSource: "documents.watermark",
    changeReason: "Final document hash recorded",
    executionRunId: execution.id,
    documentHashRecordId: hashRecord.id,
    metadata: {
      hash: hashRecord.hash,
      algorithm: hashRecord.algorithm,
      documentVersionId: version.id,
    },
  });
  await createFinalizationStatusHistoryEntry({
    documentId: context.document.id,
    changedByUserId: context.actorUserId,
    status: ledgerAnchorAttempt.status === "anchored" ? "ledger_anchored" : "failed",
    changeSource: "documents.watermark",
    changeReason:
      ledgerAnchorAttempt.status === "anchored"
        ? "Ledger anchoring completed"
        : "Ledger anchoring failed",
    executionRunId: execution.id,
    documentHashRecordId: hashRecord.id,
    ledgerAnchorAttemptId: ledgerAnchorAttempt.id,
    metadata: {
      ledgerEntryId: ledgerEntry.id,
      ledgerTxId: ledgerEntry.ledger_tx_id,
      hash: hashRecord.hash,
      errorMessage: ledgerResult.errorMessage,
    },
  });

  const updatedDocument = await updateDocument(context.document.id, {
    status: ledgerAnchorAttempt.status === "anchored" ? "completed" : "pending_notary",
  });
  const updatedRequest = await updateNotarizationRequest(context.request.id, {
    status: ledgerAnchorAttempt.status === "anchored" ? "completed" : context.request.status,
  });

  if (ledgerAnchorAttempt.status === "anchored" && context.request.workflow_id) {
    await transitionIlluminotarizationWorkflowStatus({
      workflowId: context.request.workflow_id,
      nextStatus: "completed",
      changedByUserId: context.actorUserId ?? context.request.assigned_notary_id ?? undefined,
      changeSource: "system",
      changeReason: "Document watermark, hash, and ledger anchoring completed",
      legacyRequestId: context.request.id,
      metadata: {
        documentId: context.document.id,
        documentVersionId: version.id,
        hashRecordId: hashRecord.id,
        ledgerEntryId: ledgerEntry.id,
      },
    });
  }

  return {
    document: updatedDocument,
    request: updatedRequest,
    actorUserId: context.actorUserId,
    execution: updatedExecution as unknown as DocumentExecutionRunRecord,
    version,
    hashRecord,
    ledgerEntry,
    ledgerAnchorAttempt,
  };
};

export const verifyDocumentByIdn = async (input: {
  idn: string;
  requestIp?: string | null | undefined;
  userAgent?: string | null | undefined;
}) => {
  const normalizedIdn = input.idn.trim();
  const snapshot = await getVerificationSnapshotByIdn(normalizedIdn);

  if (!snapshot.document) {
    const verificationCheck = await createPublicVerificationCheck({
      idn: normalizedIdn,
      resultStatus: "not_found",
      requestIp: input.requestIp,
      userAgent: input.userAgent,
    });

    return {
      verificationCheck,
      result: null,
    };
  }

  const status = resolvePublicVerificationStatus(snapshot);
  const verificationCheck = await createPublicVerificationCheck({
    documentId: snapshot.document.id,
    documentHashRecordId: snapshot.hashRecord?.id ?? null,
    ledgerEntryId: snapshot.ledgerEntry?.id ?? null,
    idn: normalizedIdn,
    resultStatus: status,
    requestIp: input.requestIp,
    userAgent: input.userAgent,
    metadata: {
      documentStatus: snapshot.document.status,
    },
  });

  await createFinalizationStatusHistoryEntry({
    documentId: snapshot.document.id,
    changedByUserId: null,
    status: "verification_checked",
    changeSource: "verify.public",
    changeReason: "Public verification endpoint returned a result",
    documentHashRecordId: snapshot.hashRecord?.id ?? null,
    metadata: {
      verificationCheckId: verificationCheck.id,
      resultStatus: status,
      requestIp: input.requestIp ?? null,
      userAgent: input.userAgent ?? null,
    },
  });

  return {
    verificationCheck,
    result: {
      idn: normalizedIdn,
      hash: snapshot.hashRecord?.hash ?? null,
      ledgerTxId: snapshot.ledgerEntry?.ledger_tx_id ?? null,
      anchoredAt: snapshot.ledgerEntry?.anchored_at ?? null,
      status,
    },
  };
};