import { Request, Response } from "express";
import { randomBytes, randomUUID } from "crypto";
import { z } from "zod";
import { enqueueDocumentGenerationRun, enqueueWebhook } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";
import { recordAuditEvent } from "../services/auditService";
import {
  queueDocumentReadyForReviewNotification,
  queueDocumentSigningPreparedNotification,
  queueMemberSignaturesRecordedNotification,
  queueNotarizationSubmissionConfirmationNotification,
  queueNotaryNextStepNotification,
} from "../services/notificationService";
import {
  bootstrapDocumentIntakeDraft as bootstrapDocumentIntakeDraftFromDb,
  claimNextQueuedDocumentGenerationRun,
  createDocumentGenerationRun,
  type DocumentRecord,
  type DocumentGenerationRunRecord,
  type DocumentVersionRecord,
  type GenerationRunBlockingRequirement,
  type GenerationRunStatus,
  type DocumentOutputSignerUpsertInput,
  getActiveTemplateArtifact,
  isDocumentIntakeLocked,
  getActiveTemplateRegistryForOutput,
  getDocumentGenerationRunById,
  type SaveDocumentIntakeDraftInput,
  getTemplateArtifactById,
  type TemplateArtifactRecord,
  type DocumentOutputSignerRecord,
  createDocumentWithVersion,
  type DocumentIntakeDraftRecord,
  type DocumentPartyRecord,
  type DocumentPartyRole,
  createSignatureRecord,
  createNotarizationCode,
  createNotarizationRequest,
  getDocumentById,
  getDocumentIntakeDraft as getDocumentIntakeDraftFromDb,
  getDocumentOutputSignerById,
  getDocumentVersionById,
  getActiveNotarizationRequest,
  listDocumentGenerationRuns as listDocumentGenerationRunsFromDb,
  listCapturedSignaturesForSigner,
  listDocumentSystemValues,
  getSignatureById,
  getSignatureRecordById,
  getOrCreateUserId,
  getUserIdBySupabaseId,
  listDocumentParties as listDocumentPartiesFromDb,
  listDocuments as listDocumentsFromDb,
  listDocumentOutputSigners,
  listDocumentSignatures,
  listDocumentVersions as listDocumentVersionsFromDb,
  replaceDocumentOutputSigners,
  replaceDocumentParties,
  saveDocumentIntakeDraft as saveDocumentIntakeDraftToDb,
  type SignatureCaptureMethod,
  type SignatureRecord,
  type SignatureTypedKind,
  upsertDocumentSystemValues,
  updateDocumentGenerationRun,
  updateSignatureRecord,
  updateDocument,
  updateDocumentVersion,
} from "../services/documentService";
import {
  createCodeDeliveryRecord,
  createIlluminotarizationWorkflow,
  createIlluminotarizationWorkflowDocument,
  createIlluminotarizationWorkflowStatusHistoryEntry,
  listWorkflowStatusHistory,
  transitionIlluminotarizationWorkflowStatus,
  upsertIlluminotarizationWorkflowAssignment,
  type IlluminotarizationWorkflowRecord,
} from "../services/illuminotarizationWorkflowService";
import {
  mapDocumentOutputSignerResponse,
  prepareGenerationRun,
  syncDocumentPartiesFromCanonicalAnswers,
} from "../services/documentGenerationService";
import {
  applySignatureCaptureToDocumentOutput,
  processDocumentGenerationRun,
  type SignatureFieldPlacement,
} from "../services/documentGenerationRenderService";
import {
  deriveMemberFormRulesByJurisdiction,
  type MemberFormRulesContract,
  type MemberFormSelection,
} from "../services/memberFormRulesService";
import { buildMemberFormDocumentExtractionPayload } from "../services/memberFormDocumentExtractionService";
import {
  validateMemberFormSubmission,
  type MemberFormSubmissionValue,
} from "../services/memberFormValidationService";
import {
  createDocumentDownloadUrl,
  createDocumentUploadUrl,
  downloadDocumentObject,
  createSignatureDownloadUrl,
  createSignatureUploadUrl,
  getDocumentObjectMetadata,
  getSignatureObjectMetadata,
  uploadSignatureAsset,
} from "../services/storageService";
import {
  buildSelectionForMode,
  productFlowModeKeys,
  resolveExpectedOutputsForMode,
} from "../services/productFlowModeService";
import {
  buildDocumentWorkspaceSummaries,
  buildDocumentWorkspaceSummary,
} from "../services/documentWorkspaceReadModelService";
import {
  queueRemainingSignerInvitesAfterCreatorSignature,
  type RemainingSignerInviteDispatchResult,
} from "../services/signerInvitationDispatchService";
import { completeSigningWorkflowAfterSignatureCapture } from "../services/signingCompletionService";
import {
  resolveClaimedSignerInviteAccess,
  type ClaimedSignerInviteAccess,
} from "../services/signerInviteAccessService";
import {
  getVisibleDocumentIdn,
  shouldExposeDocumentReviewOutput,
} from "../services/documentVisibilityService";
import {
  appendAcknowledgmentPage as appendAcknowledgmentPageToDocument,
  DocumentFinalizationConflictError,
  DocumentFinalizationForbiddenError,
  DocumentFinalizationNotFoundError,
  listFinalizationStatusHistory,
  watermarkWithNotice as finalizeDocumentWithWatermark,
} from "../services/documentFinalizationService";
import { buildDocumentTimeline } from "../services/documentTimelineService";
import { getUserIdentityContextByUserId } from "../services/userRoleService";
import { logDocumentTrace } from "../utils/documentTrace";
import { captureException, captureMessage } from "../utils/sentry";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SIGNATURE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
]);
const SIGNATURE_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};
const DEFAULT_PHONE_COUNTRY_CODE = "+1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneCountryCodePattern = /^\+\d{1,4}$/;
const FINAL_IDN_LENGTH = 12;
const FINAL_IDN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const UPLOADED_DOCUMENT_OUTPUT_KEY = "uploaded_document";
const UPLOADED_DOCUMENT_DOCUMENT_KEY = "uploaded_document";
const UPLOADED_DOCUMENT_TEMPLATE_KEY = "uploaded_pdf";
const UPLOADED_DOCUMENT_TEMPLATE_VERSION = "uploaded_pdf";
const UPLOADED_DOCUMENT_TEMPLATE_HASH = "uploaded_pdf";
const RENDERING_RUN_STALE_AFTER_MS = 5 * 60 * 1000;

const summarizeGenerationBlockersForTelemetry = (
  blockers: GenerationRunBlockingRequirement[],
) =>
  blockers.map((blocker) => ({
    code: blocker.code,
    source: blocker.source,
    field: blocker.field,
    blocking: blocker.blocking,
    message: blocker.message,
  }));

const captureGenerationRunBlocked = (input: {
  document: DocumentRecord;
  draft: DocumentIntakeDraftRecord;
  run: DocumentGenerationRunRecord;
  blockers: GenerationRunBlockingRequirement[];
  placeholderKeys: string[];
  signerObligations: Array<{
    party_role: string | null;
    obligation_type: string;
    is_required: boolean;
    resolution_source: string | null;
  }>;
}) => {
  const blockingBlockers = input.blockers.filter((blocker) => blocker.blocking);

  captureMessage("Document generation run blocked", {
    level: "warning",
    tags: {
      feature: "document_generation",
      document_id: input.document.id,
      generation_run_id: input.run.id,
      output_key: input.run.output_key,
      document_key: input.run.document_key,
      jurisdiction: input.draft.jurisdiction,
      product_flow_mode: input.draft.product_flow_mode,
    },
    contexts: {
      generation_run: {
        documentId: input.document.id,
        generationRunId: input.run.id,
        intakeRevision: input.run.intake_revision,
        status: input.run.status,
        outputKey: input.run.output_key,
        documentKey: input.run.document_key,
        templateKey: input.run.template_key,
        templateVersion: input.run.template_version,
        templateArtifactId: input.run.template_artifact_id,
        blockerCount: input.blockers.length,
        blockingBlockerCount: blockingBlockers.length,
        blockers: summarizeGenerationBlockersForTelemetry(input.blockers),
        placeholderKeys: input.placeholderKeys,
        signerObligations: input.signerObligations,
      },
    },
    fingerprint: [
      "document_generation_blocked",
      input.run.output_key,
      ...blockingBlockers.map((blocker) => blocker.code).sort(),
    ],
  });
};

const captureDocumentUploadIssue = (input: {
  level?: "warning" | "error";
  message: string;
  documentId: string;
  versionId?: string | null;
  storagePath?: string | null;
  metadata?: Record<string, unknown>;
}) => {
  captureMessage(input.message, {
    level: input.level ?? "warning",
    tags: {
      feature: "document_upload",
      document_id: input.documentId,
      document_version_id: input.versionId,
    },
    contexts: {
      document_upload: {
        documentId: input.documentId,
        documentVersionId: input.versionId ?? null,
        storagePath: input.storagePath ?? null,
        metadata: input.metadata ?? {},
      },
    },
    fingerprint: ["document_upload", input.message],
  });
};

const hasPdfMagicBytes = (content: Buffer) => {
  return content.subarray(0, 5).toString("utf8") === "%PDF-";
};

const postSigningReadableStatuses = new Set(["pending_notary", "completed"]);

const captureSigningReadinessIssue = (input: {
  document: { id?: string | null; status: string | null; idn: string | null };
  message: string;
  reason: string;
  statusCode: number;
}) => {
  console.warn("Document signing request rejected", {
    documentId: input.document.id ?? null,
    status: input.document.status,
    idnPrepared: isFinalIdn(input.document.idn),
    reason: input.reason,
    statusCode: input.statusCode,
    message: input.message,
  });

  captureMessage("Document signing request rejected", {
    level: "warning",
    tags: {
      feature: "document_signing",
      document_id: input.document.id ?? undefined,
      document_status: input.document.status ?? undefined,
      reason: input.reason,
      status_code: input.statusCode,
    },
    contexts: {
      document_signing: {
        documentId: input.document.id ?? null,
        status: input.document.status,
        idnPrepared: isFinalIdn(input.document.idn),
        reason: input.reason,
        statusCode: input.statusCode,
        message: input.message,
      },
    },
    fingerprint: ["document_signing", "readiness_rejected", input.reason],
  });
};

const createSignatureAssetDownloadUrl = async (input: {
  signature: SignatureRecord;
  feature: string;
}) => {
  if (!input.signature.storage_path) {
    return null;
  }

  try {
    return (await createSignatureDownloadUrl(input.signature.storage_path)).signedUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("Signature asset signed URL creation failed", {
      feature: input.feature,
      documentId: input.signature.document_id,
      signatureId: input.signature.id,
      storagePath: input.signature.storage_path,
      captureMethod: input.signature.capture_method,
      error: errorMessage,
    });

    captureException(error, {
      level: "warning",
      tags: {
        feature: input.feature,
        document_id: input.signature.document_id,
        signature_id: input.signature.id,
        capture_method: input.signature.capture_method,
      },
      contexts: {
        signature_asset: {
          documentId: input.signature.document_id,
          generationRunId: input.signature.generation_run_id,
          outputSignerId: input.signature.document_output_signer_id,
          signerId: input.signature.signer_id,
          signatureId: input.signature.id,
          storagePath: input.signature.storage_path,
          captureMethod: input.signature.capture_method,
          mimeType: input.signature.mime_type,
          sizeBytes: input.signature.size_bytes,
          error: errorMessage,
        },
      },
      fingerprint: ["signature_asset_download_url_failed", input.feature],
    });

    return null;
  }
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const sendSigningEndpointFailure = (
  res: Response,
  error: unknown,
  input: {
    route: string;
    documentId?: string | null;
    actorSupabaseId?: string | null;
    actorRole?: string | null;
    signerUserId?: string | null;
  },
) => {
  const message = getErrorMessage(error);
  console.error("Document signing endpoint failed", {
    route: input.route,
    documentId: input.documentId ?? null,
    actorSupabaseId: input.actorSupabaseId ?? null,
    actorRole: input.actorRole ?? null,
    signerUserId: input.signerUserId ?? null,
    error: message,
  });

  captureException(error, {
    level: "error",
    tags: {
      feature: "document_signing",
      route: input.route,
      document_id: input.documentId ?? undefined,
      actor_role: input.actorRole ?? undefined,
    },
    contexts: {
      document_signing: {
        route: input.route,
        documentId: input.documentId ?? null,
        actorSupabaseId: input.actorSupabaseId ?? null,
        actorRole: input.actorRole ?? null,
        signerUserId: input.signerUserId ?? null,
        error: message,
      },
    },
    fingerprint: ["document_signing", input.route, "endpoint_failed"],
  });

  return res.status(500).json({ error: "internal_error", message });
};

const documentPartyRoles = [
  "principal",
  "agent",
  "successor_agent",
  "grantor",
  "trustee",
  "successor_trustee",
] as const;

const documentFlowFamilies = ["poa", "trust", "idn"] as const;

type ParsedOutputBundleEntry = {
  outputKey: string;
  outputLabel: string;
  isRequired: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
};

type ReviewApprovalValue = {
  approvedAt: string | null;
  reviewSource: string | null;
  latestVersionId: string | null;
  latestRenderedRunId: string | null;
  approvedOutputKeys: string[];
  approvedVersionIds: string[];
};

type ReviewOutputResponse = {
  outputKey: string;
  outputLabel: string;
  versionId: string;
  generationRunId: string | null;
  version: number;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  downloadUrl: string;
  isFinal: boolean;
};

type ReadyReviewOutput = Omit<ReviewOutputResponse, "downloadUrl"> & {
  storagePath: string;
};

type PendingReviewOutputResponse = {
  outputKey: string;
  outputLabel: string;
  status: string;
  errorMessage: string | null;
  versionId: string | null;
  mimeType: string | null;
  blockers: Array<{
    code: string;
    source: string | null;
    field: string | null;
    message: string;
    blocking: boolean;
  }>;
};

type DocumentReviewState = {
  reviewApproval: ReviewApprovalValue | null;
  outputs: ReviewOutputResponse[];
  pendingOutputs: PendingReviewOutputResponse[];
  missingOutputKeys: string[];
  requiresGeneration: boolean;
  allVisibleOutputsReady: boolean;
  canApprove: boolean;
  state: "approved" | "ready" | "generating" | "empty";
};

type SigningExecutionValue = {
  confirmedAt: string | null;
  confirmedBySupabaseId: string | null;
  confirmedByRole: string | null;
  generationRunIds: string[];
  completedOutputSignerIds: string[];
  completedSignatureIds: string[];
};

type SigningGroupResponse = {
  generationRunId: string;
  outputKey: string;
  outputLabel: string;
  signingGroup: string;
  label: string;
  minimumRequired: number;
  capturedCount: number;
  totalCount: number;
  isSatisfied: boolean;
};

type SigningSignatureResponse = {
  outputSignerId: string;
  generationRunId: string;
  outputKey: string;
  outputLabel: string;
  documentKey: string;
  partyName: string;
  partyRole: string;
  signingGroup: string | null;
  isRequired: boolean;
  status: "pending" | "captured";
  captureMethod: SignatureCaptureMethod | null;
  typedValue: string | null;
  typedKind: SignatureTypedKind | null;
  signatureId: string | null;
  storagePath: string | null;
  assetDownloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  groupMinimumRequired: number | null;
  groupSatisfied: boolean;
};

type SigningCompletionSummary = {
  requiredSignatureCount: number;
  capturedRequiredSignatureCount: number;
  allRequiredSignaturesComplete: boolean;
  canConfirm: boolean;
};

type SavedSignatureResponse = {
  id: string;
  captureMethod: SignatureCaptureMethod;
  typedValue: string | null;
  typedKind: SignatureTypedKind | null;
  assetDownloadUrl: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  capturedAt: string | null;
  createdAt: string;
};

type DocumentSigningState = {
  reviewApproval: ReviewApprovalValue | null;
  signingExecution: SigningExecutionValue | null;
  approvedOutputKeys: string[];
  outputs: ReviewOutputResponse[];
  pendingOutputs: PendingReviewOutputResponse[];
  missingOutputKeys: string[];
  requiresGeneration: boolean;
  allOutputsReady: boolean;
  signatures: SigningSignatureResponse[];
  groups: SigningGroupResponse[];
  completion: SigningCompletionSummary;
  state: "not_ready" | "preparing" | "ready" | "confirmed";
};

type DocumentSigningAccessKind = "owner" | "admin" | "service_role" | "invited_signer";

type DocumentSigningAccessContext = {
  document: DocumentRecord;
  kind: DocumentSigningAccessKind;
  actorUserId: string | null;
  actorEmail: string | null;
  signerUserId: string;
  inviteAccess: ClaimedSignerInviteAccess | null;
};

const normalizePhoneDigits = (value: string) => value.replace(/\D/g, "");

const normalizeSelectedFamilies = (
  families: readonly (typeof documentFlowFamilies)[number][],
) => {
  const requested = new Set(families);

  return documentFlowFamilies.filter((family) => requested.has(family));
};

const mapDocumentResponse = (document: {
  id: string;
  idn: string | null;
  status: string | null;
  document_type: string | null;
  jurisdiction: string | null;
  product_flow_mode?: string | null;
  selected_families?: string[] | null;
  output_bundle?: Array<Record<string, unknown>> | null;
  created_at: string;
}, viewerRole?: string | null) => {
  const response: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
    productFlowMode?: string;
    selectedFamilies?: string[];
    outputBundle?: Array<Record<string, unknown>>;
  } = {
    id: document.id,
    idn: getVisibleDocumentIdn({
      idn: document.idn,
      status: document.status,
      viewerRole,
    }),
    status: document.status,
    documentType: document.document_type,
    jurisdiction: document.jurisdiction,
    createdAt: document.created_at,
  };

  if (typeof document.product_flow_mode === "string" && document.product_flow_mode) {
    response.productFlowMode = document.product_flow_mode;
  }

  if (Array.isArray(document.selected_families) && document.selected_families.length > 0) {
    response.selectedFamilies = document.selected_families;
  }

  if (Array.isArray(document.output_bundle) && document.output_bundle.length > 0) {
    response.outputBundle = document.output_bundle;
  }

  return response;
};

const sendJurisdictionAvailabilityConflict = (
  res: Response,
  conflict: NonNullable<
    Awaited<ReturnType<typeof deriveMemberFormRulesByJurisdiction>>["availabilityConflict"]
  >,
) => {
  return res.status(409).json({
    error: "conflict",
    message:
      conflict.message ??
      `Jurisdiction ${conflict.jurisdiction} is unavailable for the selected product flow.`,
    jurisdiction: conflict.jurisdiction,
    reason: conflict.reason,
    unavailableRequirements: conflict.unavailableRequirements.map((requirement) => ({
      family: requirement.family,
      documentType: requirement.documentType,
      reason: requirement.reason,
    })),
  });
};

const createDocumentSchema = z
  .object({
    title: z.string().optional(),
    templateId: z.string().optional(),
    documentType: z.string().optional(),
    jurisdiction: z.string().optional(),
    productFlowMode: z.enum(productFlowModeKeys).optional(),
    selectedFamilies: z.array(z.enum(documentFlowFamilies)).optional(),
    fileName: z.string().min(1),
    fileSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    mimeType: z.string().min(1),
  })
  .refine(
    (data) => data.mimeType.toLowerCase() === "application/pdf",
    {
      path: ["mimeType"],
      message: "Only application/pdf is supported",
    }
  )
  .passthrough();

const bootstrapDocumentIntakeDraftSchema = z
  .object({
    productFlowMode: z.enum(productFlowModeKeys),
    jurisdiction: z.string().trim().min(1),
    rulesSnapshotVersion: z.string().trim().min(1).optional(),
    resumeLatestDraft: z.boolean().optional(),
  })
  .passthrough();

const finalizeUploadSchema = z
  .object({
    documentVersionId: z.string().min(1),
  })
  .passthrough();

const submitNotarizationSchema = z.object({
  webhookUrl: z.string().url().optional(),
  selectedNotaryUserId: z.string().min(1).optional(),
}).passthrough();

const reviewApprovalSchema = z
  .object({
    agreed: z.literal(true),
  })
  .passthrough();

const signatureTargetSchema = z.object({
  generationRunId: z.string().trim().min(1),
  outputSignerId: z.string().trim().min(1),
});

const signatureRequestSchema = signatureTargetSchema
  .extend({
    fileName: z.string().optional(),
    fileSize: z.number().int().positive().max(MAX_SIGNATURE_BYTES),
    mimeType: z.string().min(1),
  })
  .refine((data) => ALLOWED_SIGNATURE_MIME_TYPES.has(data.mimeType.toLowerCase()), {
    path: ["mimeType"],
    message: "Unsupported signature file type",
  })
  .passthrough();

const signatureCaptureSchema = signatureTargetSchema
  .extend({
    captureMethod: z.enum(["type", "draw", "saved"]),
    typedValue: z.string().trim().max(200).optional(),
    typedKind: z.enum(["name", "initials"]).optional(),
    imageDataUrl: z.string().min(1).optional(),
    savedSignatureId: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.captureMethod === "type") {
      if (!data.typedValue || data.typedValue.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["typedValue"],
          message: "Typed signature text is required",
        });
      }

      return;
    }

    if (data.captureMethod === "saved") {
      if (!data.savedSignatureId || data.savedSignatureId.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["savedSignatureId"],
          message: "Saved signature id is required",
        });
      }

      return;
    }

    if (!data.imageDataUrl || data.imageDataUrl.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["imageDataUrl"],
        message: "Drawn signature image data is required",
      });
    }
  })
  .passthrough();

const signatureFinalizeSchema = signatureTargetSchema
  .extend({
    signatureId: z.string().min(1),
  })
  .passthrough();

const signDocumentSchema = z
  .object({
    confirmed: z.literal(true).optional(),
  })
  .passthrough();

const documentPartiesUpdateSchema = z.object({
  parties: z.array(
    z.object({
      partyRole: z.enum(documentPartyRoles),
      fullName: z.string().trim().min(1).max(200),
      email: z
        .string()
        .trim()
        .optional()
        .refine(
          (value) => value === undefined || value.length === 0 || emailPattern.test(value),
          "Invalid email format",
        ),
      phoneCountryCode: z
        .string()
        .trim()
        .optional()
        .refine(
          (value) =>
            value === undefined ||
            value.length === 0 ||
            phoneCountryCodePattern.test(value),
          "Invalid phone country code",
        ),
      phone: z
        .string()
        .trim()
        .optional()
        .refine((value) => {
          if (value === undefined || value.length === 0) {
            return true;
          }

          const digits = normalizePhoneDigits(value);
          return digits.length >= 7 && digits.length <= 15;
        }, "Invalid phone format"),
      isSigningParty: z.boolean().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

const documentIntakeDraftUpsertSchema = z
  .object({
    currentStep: z.union([z.string().trim().min(1), z.null()]).optional(),
    rulesSnapshotVersion: z.string().trim().min(1).optional(),
    answers: z.record(z.string(), z.unknown()),
    canonicalAnswers: z.record(z.string(), z.unknown()).optional(),
    expectedRevision: z.number().int().min(0).optional(),
  })
  .passthrough();

const documentIntakeSubmitSchema = z
  .object({
    currentStep: z.union([z.string().trim().min(1), z.null()]).optional(),
    rulesSnapshotVersion: z.string().trim().min(1).optional(),
    answers: z.record(z.string(), z.unknown()),
    expectedRevision: z.number().int().min(0).optional(),
  })
  .passthrough();

const generationRunOutputKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9_]+$/);

const createDocumentGenerationRunsSchema = z
  .object({
    outputKeys: z.array(generationRunOutputKeySchema).min(1).optional(),
  })
  .passthrough();

const generationRunCancelSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .passthrough();

const generationRunClaimSchema = z
  .object({
    workerId: z.string().trim().min(1).max(200),
  })
  .passthrough();

const generationRunCompleteSchema = z
  .object({
    documentVersionId: z.string().trim().min(1),
  })
  .passthrough();

const generationRunFailSchema = z
  .object({
    failureCode: z.string().trim().min(1).max(200).optional(),
    message: z.string().trim().min(1).max(1000).optional(),
    failureDetails: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) =>
      typeof data.failureCode === "string" || typeof data.message === "string",
    {
      message: "Either failureCode or message is required",
      path: ["failureCode"],
    },
  )
  .passthrough();

const mapDocumentPartyResponse = (party: DocumentPartyRecord) => {
  return {
    id: party.id,
    partyRole: party.party_role,
    fullName: party.full_name,
    email: party.email,
    phoneCountryCode: party.phone_country_code,
    phone: party.phone,
    isSigningParty: party.is_signing_party,
    sortOrder: party.sort_order,
    metadata: party.metadata ?? {},
    createdAt: party.created_at,
    updatedAt: party.updated_at,
  };
};

const mapDocumentIntakeDraftResponse = (draft: DocumentIntakeDraftRecord) => {
  return {
    documentId: draft.document_id,
    ownerId: draft.owner_id,
    productFlowMode: draft.product_flow_mode,
    jurisdiction: draft.jurisdiction,
    currentStep: draft.current_step,
    rulesSnapshotVersion: draft.rules_snapshot_version,
    answers: draft.answers_json,
    canonicalAnswers: draft.canonical_answers_json,
    revision: draft.revision,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
};

const mapDocumentGenerationRunResponse = (run: DocumentGenerationRunRecord) => {
  return {
    id: run.id,
    documentId: run.document_id,
    intakeRevision: run.intake_revision,
    outputKey: run.output_key,
    documentKey: run.document_key,
    templateKey: run.template_key,
    templateVersion: run.template_version,
    templateHash: run.template_hash,
    payload: run.payload_json,
    coverage: run.coverage_json,
    documentVersionId: run.document_version_id,
    blockedCount: Array.isArray(run.blocking_requirements_json)
      ? run.blocking_requirements_json.length
      : 0,
    status: run.status,
    errorMessage: run.error_message,
    blockedAt: run.blocked_at,
    startedAt: run.started_at,
    renderedAt: run.rendered_at,
    failedAt: run.failed_at,
    canceledAt: run.canceled_at,
    createdAt: run.created_at,
  };
};

const mapTemplateArtifactResponse = (artifact: TemplateArtifactRecord) => {
  return {
    id: artifact.id,
    storagePath: artifact.artifact_storage_path,
    mimeType: artifact.artifact_mime_type,
    renderEngine: artifact.render_engine,
  };
};

const mapDocumentGenerationRunDetailResponse = (
  run: DocumentGenerationRunRecord,
  templateArtifact: TemplateArtifactRecord | null,
  signerObligations: DocumentOutputSignerRecord[],
  includeDebug: boolean,
) => {
  return {
    run: {
      id: run.id,
      documentId: run.document_id,
      intakeRevision: run.intake_revision,
      outputKey: run.output_key,
      documentKey: run.document_key,
      templateKey: run.template_key,
      templateVersion: run.template_version,
      templateHash: run.template_hash,
      templateArtifact: templateArtifact
        ? mapTemplateArtifactResponse(templateArtifact)
        : null,
      status: run.status,
      payload: run.payload_json,
      coverage: run.coverage_json,
      blockingRequirements: run.blocking_requirements_json ?? [],
      signerObligations: signerObligations.map(mapDocumentOutputSignerResponse),
      rendererJobId: run.renderer_job_id,
      documentVersionId: run.document_version_id,
      failureCode: run.failure_code,
      failureDetails: run.failure_details_json ?? {},
      cancellationReason: run.cancellation_reason,
      errorMessage: run.error_message,
      createdAt: run.created_at,
      blockedAt: run.blocked_at,
      startedAt: run.started_at,
      renderedAt: run.rendered_at,
      failedAt: run.failed_at,
      canceledAt: run.canceled_at,
      ...(includeDebug
        ? {
            renderContext: run.render_context_json,
            resolvedSources: run.resolved_sources_json,
          }
        : {}),
    },
  };
};

const transitionAllowed = (
  currentStatus: GenerationRunStatus,
  nextStatus: GenerationRunStatus,
) => {
  const allowedTransitions: Record<GenerationRunStatus, GenerationRunStatus[]> = {
    queued: ["blocked", "rendering", "canceled"],
    blocked: ["queued", "canceled"],
    rendering: ["rendered", "failed", "canceled"],
    rendered: [],
    failed: [],
    canceled: [],
  };

  return allowedTransitions[currentStatus].includes(nextStatus);
};

const buildAuditActorContext = (req: Request) => {
  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};

  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }

  return actorContext;
};

const resolveRequestActorUserId = async (req: Request) => {
  if (req.user?.dbUserId) {
    return req.user.dbUserId;
  }

  if (!req.user?.id) {
    return null;
  }

  return getOrCreateUserId(req.user.id, req.user.email, req.user.role, req.user.phone);
};

const shouldExposeRemainingSignerInviteDispatch = (
  result: RemainingSignerInviteDispatchResult | null,
) => {
  return Boolean(
    result &&
      (result.resolution.trigger.shouldQueueInvites ||
        result.invited.length > 0 ||
        result.failures.length > 0),
  );
};

const mapRemainingSignerInviteDispatchResponse = (
  result: RemainingSignerInviteDispatchResult | null,
) => {
  if (!shouldExposeRemainingSignerInviteDispatch(result) || !result) {
    return null;
  }

  return {
    triggeredAt: result.triggeredAt,
    trigger: result.resolution.trigger,
    invited: result.invited,
    skipped: result.resolution.skipped,
    failures: result.failures,
  };
};

const buildIlluminotarizationWorkflowResponse = (
  workflow: IlluminotarizationWorkflowRecord | null,
) => {
  if (!workflow) {
    return null;
  }

  return {
    id: workflow.id,
    status: workflow.status,
    workflowKind: workflow.workflow_kind,
    selectedNotaryUserId: workflow.selected_notary_user_id,
    assignedNotaryUserId: workflow.assigned_notary_user_id,
    currentLegacyRequestId: workflow.current_legacy_request_id,
  };
};

const isFinalIdn = (value: string | null) => {
  return typeof value === "string" && /^[A-Z0-9]{12}$/.test(value.trim());
};

const generateFinalIdn = () => {
  let value = "";

  while (value.length < FINAL_IDN_LENGTH) {
    const bytes = randomBytes(FINAL_IDN_LENGTH);
    for (const byte of bytes) {
      value += FINAL_IDN_ALPHABET[byte % FINAL_IDN_ALPHABET.length] ?? "";
      if (value.length === FINAL_IDN_LENGTH) {
        break;
      }
    }
  }

  return value;
};

const resolveReviewApprovalIdn = (document: { idn: string | null; status: string | null }) => {
  if (document.status === "pending_signature" && isFinalIdn(document.idn)) {
    return document.idn!.trim();
  }

  return generateFinalIdn();
};

const getVerificationBaseUrl = () => {
  return (process.env.PUBLIC_VERIFICATION_BASE_URL?.trim() || "https://www.darciregistry.dev").replace(
    /\/+$/,
    "",
  );
};

const buildVerificationUrl = (idn: string) => {
  return `${getVerificationBaseUrl()}/verify/${encodeURIComponent(idn)}`;
};

const mapDocumentVersionSummary = (version: DocumentVersionRecord) => {
  return {
    id: version.id,
    version: version.version,
    storagePath: version.storage_path,
    fileName: version.file_name,
    mimeType: version.mime_type,
    sizeBytes: version.size_bytes,
    isFinal: version.is_final,
    createdAt: version.created_at,
  };
};

const mapDocumentFinalizationExecutionSummary = (execution: {
  id: string;
  execution_kind: string;
  status: string;
  source_document_version_id: string;
  output_document_version_id: string | null;
  template_id: string | null;
  template_version: string | null;
  watermark_text: string | null;
  completed_at: string | null;
}) => {
  return {
    id: execution.id,
    kind: execution.execution_kind,
    status: execution.status,
    sourceVersionId: execution.source_document_version_id,
    outputVersionId: execution.output_document_version_id,
    templateId: execution.template_id,
    templateVersion: execution.template_version,
    watermarkText: execution.watermark_text,
    completedAt: execution.completed_at,
  };
};

const sendDocumentFinalizationError = (res: Response, error: unknown) => {
  if (error instanceof DocumentFinalizationNotFoundError) {
    return res.status(404).json({
      error: "not_found",
      message: error.message,
    });
  }

  if (error instanceof DocumentFinalizationForbiddenError) {
    return res.status(403).json({
      error: "forbidden",
      message: error.message,
    });
  }

  if (error instanceof DocumentFinalizationConflictError) {
    return res.status(409).json({
      error: "conflict",
      message: error.message,
    });
  }

  throw error;
};

const resolveIdnTitle = (
  document: {
    document_type: string | null;
    product_flow_mode?: string | null;
    output_bundle?: Array<Record<string, unknown>> | null;
  },
  latestRenderedOutputKey: string | null,
) => {
  const outputBundle = parseOutputBundle(document.output_bundle);
  const matchedOutput = latestRenderedOutputKey
    ? outputBundle.find((output) => output.outputKey === latestRenderedOutputKey)
    : null;

  if (matchedOutput?.outputLabel) {
    return matchedOutput.outputLabel;
  }

  if (outputBundle.length === 1) {
    return outputBundle[0]?.outputLabel ?? "Document";
  }

  if (typeof document.document_type === "string" && document.document_type.trim()) {
    return document.document_type.trim();
  }

  if (typeof document.product_flow_mode === "string" && document.product_flow_mode.trim()) {
    return document.product_flow_mode.trim();
  }

  return "Document";
};

const parseReviewApprovalValue = (value: unknown): ReviewApprovalValue | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const asRecord = value as Record<string, unknown>;
  const approvedOutputKeys = Array.isArray(asRecord.approvedOutputKeys)
    ? asRecord.approvedOutputKeys.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];
  const approvedVersionIds = Array.isArray(asRecord.approvedVersionIds)
    ? asRecord.approvedVersionIds.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
      )
    : [];

  return {
    approvedAt: typeof asRecord.approvedAt === "string" ? asRecord.approvedAt : null,
    reviewSource: typeof asRecord.reviewSource === "string" ? asRecord.reviewSource : null,
    latestVersionId:
      typeof asRecord.latestVersionId === "string" ? asRecord.latestVersionId : null,
    latestRenderedRunId:
      typeof asRecord.latestRenderedRunId === "string"
        ? asRecord.latestRenderedRunId
        : null,
    approvedOutputKeys,
    approvedVersionIds,
  };
};

const getLatestVersionForRun = (
  versions: DocumentVersionRecord[],
  generationRunId: string,
) => {
  let latestVersion: DocumentVersionRecord | null = null;

  for (const version of versions) {
    if (version.generation_run_id !== generationRunId) {
      continue;
    }

    latestVersion = version;
  }

  return latestVersion;
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

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const parseSignatureFieldPlacement = (value: unknown): SignatureFieldPlacement | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const asRecord = value as Record<string, unknown>;
  const signatureRect = asRecord.signatureRect;
  const dateRect = asRecord.dateRect;

  if (
    typeof asRecord.pageNumber !== "number" ||
    typeof asRecord.label !== "string" ||
    typeof asRecord.includeDate !== "boolean" ||
    !signatureRect ||
    typeof signatureRect !== "object" ||
    Array.isArray(signatureRect)
  ) {
    return null;
  }

  const normalizedSignatureRect = signatureRect as Record<string, unknown>;
  const normalizedDateRect =
    dateRect && typeof dateRect === "object" && !Array.isArray(dateRect)
      ? (dateRect as Record<string, unknown>)
      : null;

  if (
    typeof normalizedSignatureRect.x !== "number" ||
    typeof normalizedSignatureRect.y !== "number" ||
    typeof normalizedSignatureRect.width !== "number" ||
    typeof normalizedSignatureRect.height !== "number"
  ) {
    return null;
  }

  if (
    asRecord.includeDate === true &&
    (!normalizedDateRect ||
      typeof normalizedDateRect.x !== "number" ||
      typeof normalizedDateRect.y !== "number" ||
      typeof normalizedDateRect.width !== "number" ||
      typeof normalizedDateRect.height !== "number")
  ) {
    return null;
  }

  return {
    pageNumber: asRecord.pageNumber,
    label: asRecord.label,
    includeDate: asRecord.includeDate,
    signatureRect: {
      x: normalizedSignatureRect.x,
      y: normalizedSignatureRect.y,
      width: normalizedSignatureRect.width,
      height: normalizedSignatureRect.height,
    },
    dateRect: normalizedDateRect
      ? {
          x: normalizedDateRect.x as number,
          y: normalizedDateRect.y as number,
          width: normalizedDateRect.width as number,
          height: normalizedDateRect.height as number,
        }
      : null,
  };
};

const buildUploadedDocumentOutputEntry = (input: {
  outputLabel: string;
}): ParsedOutputBundleEntry => {
  return {
    outputKey: UPLOADED_DOCUMENT_OUTPUT_KEY,
    outputLabel: input.outputLabel,
    isRequired: true,
    sortOrder: 0,
    metadata: {
      source: "uploaded_pdf",
      synthetic: true,
    },
  };
};

const buildDefaultUploadedSignatureFieldPlacement = (input: {
  index: number;
  label: string;
}): SignatureFieldPlacement => {
  return {
    pageNumber: 1,
    label: input.label,
    includeDate: false,
    signatureRect: {
      x: 72,
      y: 160 + input.index * 56,
      width: 240,
      height: 40,
    },
    dateRect: null,
  };
};

const buildUploadedDocumentSignerInputs = (input: {
  parties: DocumentPartyRecord[];
  outputLabel: string;
}): DocumentOutputSignerUpsertInput[] => {
  return input.parties
    .filter((party) => party.is_signing_party)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((party, index) => ({
      document_party_id: party.id,
      output_key: UPLOADED_DOCUMENT_OUTPUT_KEY,
      document_key: UPLOADED_DOCUMENT_DOCUMENT_KEY,
      party_role: party.party_role,
      party_name: party.full_name,
      obligation_type: "signer",
      is_required: true,
      resolution_source: "manual_override",
      sort_order: index,
      metadata: {
        source: "uploaded_pdf",
        outputLabel: input.outputLabel,
        signatureField: buildDefaultUploadedSignatureFieldPlacement({
          index,
          label: party.full_name,
        }),
      },
    }));
};

type UploadedDocumentSigningPreparationResult = {
  document: DocumentRecord;
  ready: boolean;
  error: Record<string, unknown> | null;
};

const ensureUploadedDocumentSigningPreparation = async (input: {
  document: DocumentRecord;
  reviewApproval: ReviewApprovalValue;
}) : Promise<UploadedDocumentSigningPreparationResult> => {
  let document = input.document;
  const parsedOutputBundle = parseOutputBundle(document.output_bundle);
  const outputLabel =
    parsedOutputBundle.find((output) => output.outputKey === UPLOADED_DOCUMENT_OUTPUT_KEY)
      ?.outputLabel ?? resolveIdnTitle(document, null);

  if (!parsedOutputBundle.some((output) => output.outputKey === UPLOADED_DOCUMENT_OUTPUT_KEY)) {
    document = await updateDocument(document.id, {
      output_bundle: [
        ...parsedOutputBundle,
        buildUploadedDocumentOutputEntry({
          outputLabel,
        }),
      ],
    });
  }

  const versions = await listDocumentVersionsFromDb(document.id);
  const approvedVersion =
    (input.reviewApproval.latestVersionId
      ? versions.find((version) => version.id === input.reviewApproval.latestVersionId)
      : null) ??
    input.reviewApproval.approvedVersionIds
      .map((versionId) => versions.find((version) => version.id === versionId) ?? null)
      .find((version): version is DocumentVersionRecord => Boolean(version)) ??
    getLatestPdfVersion(versions);

  if (!approvedVersion?.storage_path || approvedVersion.mime_type !== "application/pdf") {
    return {
      document,
      ready: false,
      error: {
        error: "not_found",
        message: "Approved uploaded PDF version could not be resolved for signing preparation",
      },
    };
  }

  const generationRuns = await listDocumentGenerationRunsFromDb(document.id);
  let uploadedRun =
    generationRuns.find(
      (run) =>
        run.output_key === UPLOADED_DOCUMENT_OUTPUT_KEY &&
        run.document_version_id === approvedVersion.id,
    ) ??
    generationRuns.find((run) => run.output_key === UPLOADED_DOCUMENT_OUTPUT_KEY) ??
    null;

  const renderedAt = input.reviewApproval.approvedAt ?? new Date().toISOString();

  if (!uploadedRun) {
    uploadedRun = await createDocumentGenerationRun({
      documentId: document.id,
      intakeRevision: Math.max(approvedVersion.version, 1),
      outputKey: UPLOADED_DOCUMENT_OUTPUT_KEY,
      documentKey: UPLOADED_DOCUMENT_DOCUMENT_KEY,
      templateKey: UPLOADED_DOCUMENT_TEMPLATE_KEY,
      templateVersion: UPLOADED_DOCUMENT_TEMPLATE_VERSION,
      templateHash: UPLOADED_DOCUMENT_TEMPLATE_HASH,
      payload: {
        source: "uploaded_pdf_review_approval",
        reviewApproval: input.reviewApproval,
        approvedVersionId: approvedVersion.id,
      },
      coverage: {
        source: "uploaded_pdf_review_approval",
        synthetic: true,
      },
      renderContext: {
        source: "uploaded_pdf_review_approval",
      },
      resolvedSources: {
        reviewSource: input.reviewApproval.reviewSource ?? "uploaded_pdf",
      },
      status: "rendered",
      documentVersionId: approvedVersion.id,
      renderedAt,
      startedAt: renderedAt,
    });
  } else if (
    uploadedRun.document_version_id !== approvedVersion.id ||
    uploadedRun.status !== "rendered" ||
    !uploadedRun.rendered_at
  ) {
    uploadedRun = await updateDocumentGenerationRun(uploadedRun.id, {
      document_version_id: approvedVersion.id,
      status: "rendered",
      blocked_at: null,
      started_at: uploadedRun.started_at ?? renderedAt,
      rendered_at: uploadedRun.rendered_at ?? renderedAt,
      failed_at: null,
      canceled_at: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
      error_message: null,
    });
  }

  if (approvedVersion.generation_run_id !== uploadedRun.id) {
    await updateDocumentVersion(approvedVersion.id, {
      generation_run_id: uploadedRun.id,
    });
  }

  const existingSigners = await listDocumentOutputSigners({
    documentId: document.id,
    generationRunId: uploadedRun.id,
  });

  if (existingSigners.length === 0) {
    const parties = await listDocumentPartiesFromDb(document.id);
    const signerInputs = buildUploadedDocumentSignerInputs({
      parties,
      outputLabel,
    });

    if (signerInputs.length > 0) {
      await replaceDocumentOutputSigners({
        documentId: document.id,
        generationRunId: uploadedRun.id,
        signers: signerInputs,
      });
    }
  }

  logDocumentTrace("signing.uploaded_document_prepared", {
    documentId: document.id,
    generationRunId: uploadedRun.id,
    approvedVersionId: approvedVersion.id,
    outputLabel,
    signerCount: existingSigners.length,
  });

  return {
    document,
    ready: true,
    error: null,
  };
};

const mapSavedSignatureResponse = async (
  signature: SignatureRecord,
): Promise<SavedSignatureResponse> => {
  const assetDownloadUrl = await createSignatureAssetDownloadUrl({
    signature,
    feature: "saved_signatures",
  });

  return {
    id: signature.id,
    captureMethod:
      signature.capture_method === "upload" ||
      signature.capture_method === "type" ||
      signature.capture_method === "draw"
        ? signature.capture_method
        : "type",
    typedValue: signature.typed_value ?? null,
    typedKind:
      signature.typed_kind === "name" || signature.typed_kind === "initials"
        ? signature.typed_kind
        : null,
    assetDownloadUrl,
    mimeType: signature.mime_type ?? null,
    sizeBytes: signature.size_bytes ?? null,
    capturedAt: signature.captured_at ?? null,
    createdAt: signature.created_at,
  };
};

const mapBlockingRequirementResponse = (
  requirement: GenerationRunBlockingRequirement,
) => {
  return {
    code: requirement.code,
    source: requirement.source ?? null,
    field: requirement.field ?? null,
    message: requirement.message,
    blocking: requirement.blocking,
  };
};

const mapBlockingRequirementsResponse = (
  requirements: GenerationRunBlockingRequirement[] | null | undefined,
) => {
  return Array.isArray(requirements)
    ? requirements.map(mapBlockingRequirementResponse)
    : [];
};

const resolveVisibleReviewOutputs = (
  document: Pick<DocumentRecord, "output_bundle">,
  viewerRole?: string | null,
) => {
  return parseOutputBundle(document.output_bundle).filter((output) =>
    shouldExposeDocumentReviewOutput({
      outputKey: output.outputKey,
      viewerRole,
    }),
  );
};

const shouldUseInlineReviewGenerationFallback = () => {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_ENV !== "test"
  );
};

const processQueuedGenerationRunsInline = async (input: {
  document: DocumentRecord;
  outputKeys: string[];
  rendererJobPrefix: string;
}) => {
  if (!shouldUseInlineReviewGenerationFallback()) {
    return false;
  }

  const outputKeys = new Set(input.outputKeys);

  if (outputKeys.size === 0) {
    return false;
  }

  const generationRuns = await listDocumentGenerationRunsFromDb(input.document.id);
  const queuedVisibleRuns = generationRuns.filter(
    (run) => run.status === "queued" && outputKeys.has(run.output_key),
  );

  if (queuedVisibleRuns.length === 0) {
    return false;
  }

  let processedAny = false;

  for (const run of queuedVisibleRuns) {
    const processed = await processDocumentGenerationRun({
      runId: run.id,
      rendererJobId: `${input.rendererJobPrefix}:${run.id}`,
    }).catch(() => null);

    if (processed) {
      processedAny = true;
    }
  }

  return processedAny;
};

const processQueuedReviewOutputsInline = async (input: {
  document: DocumentRecord;
  viewerRole?: string | null;
}) => {
  return processQueuedGenerationRunsInline({
    document: input.document,
    outputKeys: resolveVisibleReviewOutputs(input.document, input.viewerRole).map(
      (output) => output.outputKey,
    ),
    rendererJobPrefix: "review-inline",
  });
};

const processQueuedSigningOutputsInline = async (input: {
  document: DocumentRecord;
  signing: Pick<DocumentSigningState, "approvedOutputKeys" | "pendingOutputs">;
}) => {
  if (!input.signing.pendingOutputs.some((output) => output.status === "queued")) {
    return false;
  }

  return processQueuedGenerationRunsInline({
    document: input.document,
    outputKeys: input.signing.approvedOutputKeys,
    rendererJobPrefix: "signing-inline",
  });
};

const isRetryableReviewRunStatus = (status: DocumentGenerationRunRecord["status"]) => {
  return status === "blocked" || status === "failed" || status === "canceled";
};

const isSatisfiedReviewRunStatus = (status: DocumentGenerationRunRecord["status"]) => {
  return status === "queued" || status === "rendering" || status === "rendered";
};

const isStaleRenderingReviewRun = (run: DocumentGenerationRunRecord | null) => {
  if (!run || run.status !== "rendering") {
    return false;
  }

  const startedTimestamp = toTimestamp(run.started_at ?? run.created_at);
  return (
    startedTimestamp > 0 &&
    Date.now() - startedTimestamp >= RENDERING_RUN_STALE_AFTER_MS
  );
};

const isRetryableReviewRun = (run: DocumentGenerationRunRecord | null) => {
  if (!run) {
    return false;
  }

  return isRetryableReviewRunStatus(run.status) || isStaleRenderingReviewRun(run);
};

const isReusableReviewRun = (run: DocumentGenerationRunRecord) => {
  return isSatisfiedReviewRunStatus(run.status) && !isStaleRenderingReviewRun(run);
};

const mapReadyReviewOutputToPending = (
  output: ReadyReviewOutput,
  status: string,
  errorMessage: string | null,
): PendingReviewOutputResponse => ({
  outputKey: output.outputKey,
  outputLabel: output.outputLabel,
  status,
  errorMessage,
  versionId: output.versionId,
  mimeType: output.mimeType,
  blockers: [],
});

const signReadyReviewOutput = async (
  documentId: string,
  output: ReadyReviewOutput,
) => {
  try {
    const download = await createDocumentDownloadUrl(output.storagePath);

    return {
      readyOutput: output,
      output: {
        outputKey: output.outputKey,
        outputLabel: output.outputLabel,
        versionId: output.versionId,
        generationRunId: output.generationRunId,
        version: output.version,
        fileName: output.fileName,
        mimeType: output.mimeType,
        sizeBytes: output.sizeBytes,
        createdAt: output.createdAt,
        isFinal: output.isFinal,
        downloadUrl: download.signedUrl,
      } satisfies ReviewOutputResponse,
      pendingOutput: null,
    };
  } catch (error) {
    logDocumentTrace("review.download_url_unavailable", {
      documentId,
      outputKey: output.outputKey,
      versionId: output.versionId,
      storagePath: output.storagePath,
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return {
      readyOutput: output,
      output: null,
      pendingOutput: mapReadyReviewOutputToPending(
        output,
        "download_unavailable",
        "Secure preview link is temporarily unavailable. DARCi will retry automatically.",
      ),
    };
  }
};

const signReadyReviewOutputs = async (input: {
  documentId: string;
  readyOutputs: ReadyReviewOutput[];
  holdUntilBundleReady: boolean;
}) => {
  if (input.holdUntilBundleReady) {
    return {
      outputs: [],
      pendingOutputs: input.readyOutputs.map((output) =>
        mapReadyReviewOutputToPending(output, "rendered", null),
      ),
    };
  }

  const results = await Promise.all(
    input.readyOutputs.map((output) => signReadyReviewOutput(input.documentId, output)),
  );
  const hasDownloadFailure = results.some((result) => result.pendingOutput);

  if (!hasDownloadFailure) {
    return {
      outputs: results
        .map((result) => result.output)
        .filter((output): output is ReviewOutputResponse => Boolean(output)),
      pendingOutputs: [],
    };
  }

  if (input.readyOutputs.length > 1) {
    return {
      outputs: [],
      pendingOutputs: results.map((result) =>
        result.pendingOutput ??
        mapReadyReviewOutputToPending(result.readyOutput, "rendered", null),
      ),
    };
  }

  return {
    outputs: [],
    pendingOutputs: results
      .map((result) => result.pendingOutput)
      .filter((output): output is PendingReviewOutputResponse => Boolean(output)),
  };
};

const sortReviewOutputs = (
  outputs: ReviewOutputResponse[],
  outputBundle: ParsedOutputBundleEntry[],
) => {
  outputs.sort((left, right) => {
    const visibleLeft = outputBundle.find((output) => output.outputKey === left.outputKey);
    const visibleRight = outputBundle.find((output) => output.outputKey === right.outputKey);
    const leftOrder = visibleLeft?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = visibleRight?.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
  });
};

const sortPendingReviewOutputs = (
  outputs: PendingReviewOutputResponse[],
  outputBundle: ParsedOutputBundleEntry[],
) => {
  outputs.sort((left, right) => {
    const visibleLeft = outputBundle.find((output) => output.outputKey === left.outputKey);
    const visibleRight = outputBundle.find((output) => output.outputKey === right.outputKey);
    const leftOrder = visibleLeft?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = visibleRight?.sortOrder ?? Number.MAX_SAFE_INTEGER;

    return leftOrder - rightOrder;
  });
};

const buildDocumentReviewState = async (input: {
  document: DocumentRecord;
  viewerRole?: string | null;
}): Promise<DocumentReviewState> => {
  const [rawSystemValues, rawVersions, rawGenerationRuns] = await Promise.all([
    listDocumentSystemValues(input.document.id),
    listDocumentVersionsFromDb(input.document.id),
    listDocumentGenerationRunsFromDb(input.document.id),
  ]);

  const systemValues = Array.isArray(rawSystemValues) ? rawSystemValues : [];
  const versions = Array.isArray(rawVersions) ? rawVersions : [];
  const generationRuns = Array.isArray(rawGenerationRuns) ? rawGenerationRuns : [];

  const reviewApproval = parseReviewApprovalValue(
    systemValues.find((value) => value.system_key === "review_approval")?.value_json,
  );
  const visibleOutputs = resolveVisibleReviewOutputs(input.document, input.viewerRole);
  const readyOutputs: ReadyReviewOutput[] = [];
  const pendingOutputs: PendingReviewOutputResponse[] = [];

  if (visibleOutputs.length === 0) {
    const latestVersion = getLatestPdfVersion(versions);
    if (latestVersion?.storage_path) {
      const latestRenderedRun = generationRuns.find((run) => run.status === "rendered") ?? null;
      readyOutputs.push({
        outputKey: latestRenderedRun?.output_key ?? "uploaded_document",
        outputLabel: resolveIdnTitle(input.document, latestRenderedRun?.output_key ?? null),
        versionId: latestVersion.id,
        generationRunId: latestVersion.generation_run_id,
        version: latestVersion.version,
        fileName: latestVersion.file_name,
        mimeType: latestVersion.mime_type,
        sizeBytes: latestVersion.size_bytes,
        createdAt: latestVersion.created_at,
        isFinal: latestVersion.is_final === true,
        storagePath: latestVersion.storage_path,
      });
    }
  } else {
    for (const output of visibleOutputs) {
      const runsForOutput = generationRuns.filter((run) => run.output_key === output.outputKey);
      const latestRun = runsForOutput[0] ?? null;
      const latestRenderedRun = runsForOutput.find((run) => run.status === "rendered") ?? null;
      const latestVersion = latestRenderedRun
        ? getLatestVersionForRun(versions, latestRenderedRun.id)
        : null;

      if (
        latestVersion?.storage_path &&
        latestVersion.mime_type === "application/pdf"
      ) {
        readyOutputs.push({
          outputKey: output.outputKey,
          outputLabel: output.outputLabel,
          versionId: latestVersion.id,
          generationRunId: latestVersion.generation_run_id,
          version: latestVersion.version,
          fileName: latestVersion.file_name,
          mimeType: latestVersion.mime_type,
          sizeBytes: latestVersion.size_bytes,
          createdAt: latestVersion.created_at,
          isFinal: latestVersion.is_final === true,
          storagePath: latestVersion.storage_path,
        });
        continue;
      }

      const unsupportedFormatMessage =
        latestVersion?.storage_path && latestVersion.mime_type
          ? `Latest rendered output is ${latestVersion.mime_type}, but review requires PDF artifacts.`
          : null;
      const blockers = mapBlockingRequirementsResponse(
        latestRun?.blocking_requirements_json,
      );
      const staleRenderingMessage = isStaleRenderingReviewRun(latestRun)
        ? "Rendering is taking longer than expected. DARCi is retrying this output."
        : null;

      pendingOutputs.push({
        outputKey: output.outputKey,
        outputLabel: output.outputLabel,
        status: unsupportedFormatMessage ? "unsupported_format" : latestRun?.status ?? "not_started",
        errorMessage:
          unsupportedFormatMessage ??
          latestRun?.error_message ??
          staleRenderingMessage ??
          blockers.find((blocker) => blocker.blocking)?.message ??
          null,
        versionId: latestVersion?.id ?? latestRun?.document_version_id ?? null,
        mimeType: latestVersion?.mime_type ?? null,
        blockers,
      });
    }
  }

  const signedReadyOutputs = await signReadyReviewOutputs({
    documentId: input.document.id,
    readyOutputs,
    holdUntilBundleReady: visibleOutputs.length > 1 && pendingOutputs.length > 0,
  });
  const outputs = signedReadyOutputs.outputs;

  pendingOutputs.push(...signedReadyOutputs.pendingOutputs);
  sortReviewOutputs(outputs, visibleOutputs);
  sortPendingReviewOutputs(pendingOutputs, visibleOutputs);

  const missingOutputKeys = visibleOutputs
    .filter((output) => {
      const latestRun = generationRuns.find((run) => run.output_key === output.outputKey) ?? null;
      const latestRenderedRun = generationRuns.find(
        (run) => run.output_key === output.outputKey && run.status === "rendered",
      ) ?? null;
      const latestVersion = latestRenderedRun
        ? getLatestVersionForRun(versions, latestRenderedRun.id)
        : null;

      if (
        latestVersion?.storage_path &&
        latestVersion.mime_type === "application/pdf"
      ) {
        return false;
      }

      if (!latestRun) {
        return true;
      }

      return isRetryableReviewRun(latestRun);
    })
    .map((output) => output.outputKey);
  const requiresGeneration =
    input.document.intake_status === "submitted" && missingOutputKeys.length > 0;
  const allVisibleOutputsReady =
    visibleOutputs.length > 0 ? outputs.length === visibleOutputs.length : outputs.length > 0;
  const canApprove =
    (input.document.status === "pending_review" || input.document.status === "draft") &&
    allVisibleOutputsReady &&
    outputs.length > 0;

  return {
    reviewApproval,
    outputs,
    pendingOutputs,
    missingOutputKeys,
    requiresGeneration,
    allVisibleOutputsReady,
    canApprove,
    state: reviewApproval
      ? "approved"
      : canApprove
        ? "ready"
        : requiresGeneration || pendingOutputs.length > 0
          ? "generating"
          : outputs.length > 0
            ? "ready"
            : "empty",
  };
};

const ensureDocumentReadyForSignature = (res: Response, document: {
  id?: string | null;
  status: string | null;
  idn: string | null;
}) => {
  if (document.status !== "pending_signature") {
    const message =
      document.status === "pending_review" || document.status === "draft"
        ? "Document review approval is required before signing"
        : "Document is not ready for signing";

    captureSigningReadinessIssue({
      document,
      message,
      reason: "status_not_pending_signature",
      statusCode: 400,
    });

    res.status(400).json({
      error: "validation_error",
      message,
      details: [
        {
          path: "status",
          message,
        },
      ],
    });

    return false;
  }

  if (!isFinalIdn(document.idn)) {
    captureSigningReadinessIssue({
      document,
      message: "Document IDN is not prepared for signing",
      reason: "idn_not_final",
      statusCode: 409,
    });

    res.status(409).json({
      error: "conflict",
      message: "Document IDN is not prepared for signing",
      details: [
        {
          path: "idn",
          message: "Document IDN is not prepared for signing",
        },
      ],
    });

    return false;
  }

  return true;
};

const ensureDocumentReadableForSigning = (res: Response, document: {
  id?: string | null;
  status: string | null;
  idn: string | null;
}) => {
  if (
    document.status !== "pending_signature" &&
    !postSigningReadableStatuses.has(document.status ?? "")
  ) {
    const message =
      document.status === "pending_review" || document.status === "draft"
        ? "Document review approval is required before signing"
        : "Document is not ready for signing";

    captureSigningReadinessIssue({
      document,
      message,
      reason: "status_not_signing_readable",
      statusCode: 400,
    });

    res.status(400).json({
      error: "validation_error",
      message,
      details: [
        {
          path: "status",
          message,
        },
      ],
    });

    return false;
  }

  if (!isFinalIdn(document.idn)) {
    captureSigningReadinessIssue({
      document,
      message: "Document IDN is not prepared for signing",
      reason: "idn_not_final",
      statusCode: 409,
    });

    res.status(409).json({
      error: "conflict",
      message: "Document IDN is not prepared for signing",
      details: [
        {
          path: "idn",
          message: "Document IDN is not prepared for signing",
        },
      ],
    });

    return false;
  }

  return true;
};

const parseSigningExecutionValue = (value: unknown): SigningExecutionValue | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const asRecord = value as Record<string, unknown>;

  return {
    confirmedAt: typeof asRecord.confirmedAt === "string" ? asRecord.confirmedAt : null,
    confirmedBySupabaseId:
      typeof asRecord.confirmedBySupabaseId === "string"
        ? asRecord.confirmedBySupabaseId
        : null,
    confirmedByRole:
      typeof asRecord.confirmedByRole === "string" ? asRecord.confirmedByRole : null,
    generationRunIds: Array.isArray(asRecord.generationRunIds)
      ? asRecord.generationRunIds.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    completedOutputSignerIds: Array.isArray(asRecord.completedOutputSignerIds)
      ? asRecord.completedOutputSignerIds.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
    completedSignatureIds: Array.isArray(asRecord.completedSignatureIds)
      ? asRecord.completedSignatureIds.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
        )
      : [],
  };
};

const formatSigningGroupLabel = (value: string) => {
  return value
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const getSignatureGroupMinimumRequired = (metadata: Record<string, unknown>) => {
  const candidate = metadata.groupMinimumRequired;

  if (typeof candidate !== "number" || !Number.isFinite(candidate)) {
    return 1;
  }

  return Math.max(1, Math.floor(candidate));
};

const buildDocumentSigningState = async (input: {
  document: DocumentRecord;
  viewerRole?: string | null;
}): Promise<DocumentSigningState> => {
  const [rawSystemValues, rawVersions, rawGenerationRuns, signatureRecords] = await Promise.all([
    listDocumentSystemValues(input.document.id),
    listDocumentVersionsFromDb(input.document.id),
    listDocumentGenerationRunsFromDb(input.document.id),
    listDocumentSignatures({ documentId: input.document.id }),
  ]);

  const systemValues = Array.isArray(rawSystemValues) ? rawSystemValues : [];
  const versions = Array.isArray(rawVersions) ? rawVersions : [];
  const generationRuns = Array.isArray(rawGenerationRuns) ? rawGenerationRuns : [];
  const reviewApproval = parseReviewApprovalValue(
    systemValues.find((value) => value.system_key === "review_approval")?.value_json,
  );
  const signingExecution = parseSigningExecutionValue(
    systemValues.find((value) => value.system_key === "signature_execution")?.value_json,
  );
  const approvedOutputKeys = reviewApproval?.approvedOutputKeys?.length
    ? [...reviewApproval.approvedOutputKeys]
    : resolveVisibleReviewOutputs(input.document, input.viewerRole).map((output) => output.outputKey);

  if (!reviewApproval || approvedOutputKeys.length === 0) {
    return {
      reviewApproval,
      signingExecution,
      approvedOutputKeys,
      outputs: [],
      pendingOutputs: [],
      missingOutputKeys: [],
      requiresGeneration: false,
      allOutputsReady: false,
      signatures: [],
      groups: [],
      completion: {
        requiredSignatureCount: 0,
        capturedRequiredSignatureCount: 0,
        allRequiredSignaturesComplete: false,
        canConfirm: false,
      },
      state: "not_ready",
    };
  }

  const approvedAtTimestamp = toTimestamp(reviewApproval.approvedAt ?? "");
  const outputBundle = parseOutputBundle(input.document.output_bundle).filter((output) =>
    approvedOutputKeys.includes(output.outputKey),
  );
  const officialRuns = generationRuns.filter((run) => {
    return (
      approvedOutputKeys.includes(run.output_key) &&
      (approvedAtTimestamp === 0 || toTimestamp(run.created_at) >= approvedAtTimestamp)
    );
  });
  const readyOutputs: ReadyReviewOutput[] = [];
  const pendingOutputs: PendingReviewOutputResponse[] = [];
  const latestRunsByOutputKey = new Map<string, DocumentGenerationRunRecord>();

  for (const output of outputBundle) {
    const runsForOutput = officialRuns.filter((run) => run.output_key === output.outputKey);
    const latestRun = runsForOutput[0] ?? null;
    const latestRenderedRun = runsForOutput.find((run) => run.status === "rendered") ?? null;
    const latestVersion = latestRenderedRun
      ? getLatestVersionForRun(versions, latestRenderedRun.id)
      : null;

    if (latestRun) {
      latestRunsByOutputKey.set(output.outputKey, latestRun);
    }

    if (latestVersion?.storage_path && latestVersion.mime_type === "application/pdf") {
      readyOutputs.push({
        outputKey: output.outputKey,
        outputLabel: output.outputLabel,
        versionId: latestVersion.id,
        generationRunId: latestVersion.generation_run_id,
        version: latestVersion.version,
        fileName: latestVersion.file_name,
        mimeType: latestVersion.mime_type,
        sizeBytes: latestVersion.size_bytes,
        createdAt: latestVersion.created_at,
        isFinal: latestVersion.is_final === true,
        storagePath: latestVersion.storage_path,
      });
      continue;
    }

    const unsupportedFormatMessage =
      latestVersion?.storage_path && latestVersion.mime_type
        ? `Latest signing output is ${latestVersion.mime_type}, but signing requires PDF artifacts.`
        : null;
    const blockers = mapBlockingRequirementsResponse(
      latestRun?.blocking_requirements_json,
    );
    const staleRenderingMessage = isStaleRenderingReviewRun(latestRun)
      ? "Rendering is taking longer than expected. DARCi is retrying this output."
      : null;

    pendingOutputs.push({
      outputKey: output.outputKey,
      outputLabel: output.outputLabel,
      status: unsupportedFormatMessage ? "unsupported_format" : latestRun?.status ?? "not_started",
      errorMessage:
        unsupportedFormatMessage ??
        latestRun?.error_message ??
        staleRenderingMessage ??
        blockers.find((blocker) => blocker.blocking)?.message ??
        null,
      versionId: latestVersion?.id ?? latestRun?.document_version_id ?? null,
      mimeType: latestVersion?.mime_type ?? null,
      blockers,
    });
  }

  const signedReadyOutputs = await signReadyReviewOutputs({
    documentId: input.document.id,
    readyOutputs,
    holdUntilBundleReady: outputBundle.length > 1 && pendingOutputs.length > 0,
  });
  const outputs = signedReadyOutputs.outputs;

  pendingOutputs.push(...signedReadyOutputs.pendingOutputs);
  sortReviewOutputs(outputs, outputBundle);
  sortPendingReviewOutputs(pendingOutputs, outputBundle);

  const missingOutputKeys = outputBundle
    .filter((output) => {
      const latestRun = latestRunsByOutputKey.get(output.outputKey) ?? null;
      const latestRenderedRun = officialRuns.find(
        (run) => run.output_key === output.outputKey && run.status === "rendered",
      ) ?? null;
      const latestVersion = latestRenderedRun
        ? getLatestVersionForRun(versions, latestRenderedRun.id)
        : null;

      if (latestVersion?.storage_path && latestVersion.mime_type === "application/pdf") {
        return false;
      }

      if (!latestRun) {
        return true;
      }

      if (latestVersion?.storage_path && latestVersion.mime_type !== "application/pdf") {
        return true;
      }

      return isRetryableReviewRun(latestRun);
    })
    .map((output) => output.outputKey);
  const requiresGeneration =
    input.document.intake_status === "submitted" && missingOutputKeys.length > 0;
  const allOutputsReady = outputBundle.length > 0 && outputs.length === outputBundle.length;

  const latestSignerRuns = Array.from(
    new Set(
      outputBundle
        .map((output) => latestRunsByOutputKey.get(output.outputKey)?.id ?? null)
        .filter((runId): runId is string => typeof runId === "string"),
    ),
  );
  const signerObligations = (
    await Promise.all(
      latestSignerRuns.map((generationRunId) =>
        listDocumentOutputSigners({
          documentId: input.document.id,
          generationRunId,
        }),
      ),
    )
  ).flat();
  const outputLabelByKey = new Map(outputBundle.map((output) => [output.outputKey, output.outputLabel]));
  const signatureByOutputSignerId = new Map<string, (typeof signatureRecords)[number]>();

  for (const signature of signatureRecords) {
    if (!signature.document_output_signer_id) {
      continue;
    }

    const existing = signatureByOutputSignerId.get(signature.document_output_signer_id);
    if (!existing) {
      signatureByOutputSignerId.set(signature.document_output_signer_id, signature);
      continue;
    }

    if (existing.status !== "captured" && signature.status === "captured") {
      signatureByOutputSignerId.set(signature.document_output_signer_id, signature);
    }
  }

  const signatures = await Promise.all(
    signerObligations
      .filter((signer) => signer.obligation_type === "signer")
      .map(async (signer) => {
        const matchedSignature = signatureByOutputSignerId.get(signer.id) ?? null;
        const groupMinimumRequired =
          !signer.is_required && signer.signing_group
            ? getSignatureGroupMinimumRequired(signer.metadata ?? {})
            : null;
        const assetDownloadUrl = matchedSignature
          ? await createSignatureAssetDownloadUrl({
              signature: matchedSignature,
              feature: "document_signing",
            })
          : null;

        return {
          outputSignerId: signer.id,
          generationRunId: signer.generation_run_id,
          outputKey: signer.output_key,
          outputLabel: outputLabelByKey.get(signer.output_key) ?? signer.output_key,
          documentKey: signer.document_key,
          partyName: signer.party_name,
          partyRole: signer.party_role,
          signingGroup: signer.signing_group,
          isRequired: signer.is_required,
          status: matchedSignature?.status === "captured" ? "captured" : "pending",
          captureMethod:
            matchedSignature?.capture_method === "upload" ||
            matchedSignature?.capture_method === "type" ||
            matchedSignature?.capture_method === "draw"
              ? matchedSignature.capture_method
              : null,
          typedValue: matchedSignature?.typed_value ?? null,
          typedKind:
            matchedSignature?.typed_kind === "name" || matchedSignature?.typed_kind === "initials"
              ? matchedSignature.typed_kind
              : null,
          signatureId: matchedSignature?.id ?? null,
          storagePath: matchedSignature?.storage_path ?? null,
          assetDownloadUrl,
          mimeType: matchedSignature?.mime_type ?? null,
          sizeBytes: matchedSignature?.size_bytes ?? null,
          capturedAt: matchedSignature?.captured_at ?? null,
          groupMinimumRequired,
          groupSatisfied: signer.is_required,
        } satisfies SigningSignatureResponse;
      }),
  );

  const groupAccumulator = new Map<string, SigningGroupResponse>();

  for (const signature of signatures) {
    if (signature.isRequired || !signature.signingGroup || !signature.groupMinimumRequired) {
      continue;
    }

    const groupKey = `${signature.generationRunId}:${signature.signingGroup}`;
    const existing = groupAccumulator.get(groupKey);
    const nextValue: SigningGroupResponse = existing
      ? {
          ...existing,
          capturedCount: existing.capturedCount + (signature.status === "captured" ? 1 : 0),
          totalCount: existing.totalCount + 1,
        }
      : {
          generationRunId: signature.generationRunId,
          outputKey: signature.outputKey,
          outputLabel: signature.outputLabel,
          signingGroup: signature.signingGroup,
          label: formatSigningGroupLabel(signature.signingGroup),
          minimumRequired: signature.groupMinimumRequired,
          capturedCount: signature.status === "captured" ? 1 : 0,
          totalCount: 1,
          isSatisfied: false,
        };

    nextValue.isSatisfied = nextValue.capturedCount >= nextValue.minimumRequired;
    groupAccumulator.set(groupKey, nextValue);
  }

  const groups = Array.from(groupAccumulator.values());
  const groupSatisfaction = new Map<string, boolean>(
    Array.from(groupAccumulator.entries()).map(([key, group]) => [key, group.isSatisfied]),
  );

  for (const signature of signatures) {
    if (signature.isRequired || !signature.signingGroup) {
      continue;
    }

    const groupKey = `${signature.generationRunId}:${signature.signingGroup}`;
    signature.groupSatisfied = groupSatisfaction.get(groupKey) ?? false;
  }

  const requiredSignatureCount = signatures.filter((signature) => signature.isRequired).length;
  const capturedRequiredSignatureCount = signatures.filter(
    (signature) => signature.isRequired && signature.status === "captured",
  ).length;
  const allRequiredSignaturesComplete =
    signatures.every((signature) => {
      if (signature.isRequired) {
        return signature.status === "captured";
      }

      if (!signature.signingGroup || !signature.groupMinimumRequired) {
        return true;
      }

      return signature.groupSatisfied;
    }) && signatures.length > 0;
  const canConfirm = allOutputsReady && allRequiredSignaturesComplete;

  return {
    reviewApproval,
    signingExecution,
    approvedOutputKeys,
    outputs,
    pendingOutputs,
    missingOutputKeys,
    requiresGeneration,
    allOutputsReady,
    signatures,
    groups,
    completion: {
      requiredSignatureCount,
      capturedRequiredSignatureCount,
      allRequiredSignaturesComplete,
      canConfirm,
    },
    state: signingExecution?.confirmedAt
      ? "confirmed"
      : allOutputsReady
        ? "ready"
        : "preparing",
  };
};

type GenerationRunCreationResult =
  | { runs: DocumentGenerationRunRecord[]; error?: never }
  | {
      runs?: never;
      error: {
        status: number;
        body: Record<string, unknown>;
      };
    };

const createGenerationRunsForDocument = async (input: {
  document: DocumentRecord;
  outputKeys?: string[];
  reuseSatisfiedRunsCreatedAfter?: string | null;
  actorContext?: { actorSupabaseId?: string; actorRole?: string };
}): Promise<GenerationRunCreationResult> => {
  if (!isDocumentIntakeLocked(input.document)) {
    return {
      error: {
        status: 409,
        body: {
          error: "conflict",
          message: "Intake must be submitted before creating generation runs",
          intakeStatus: input.document.intake_status,
        },
      },
    };
  }

  const draft = await getDocumentIntakeDraftFromDb(input.document.id);
  if (!draft) {
    return {
      error: {
        status: 404,
        body: {
          error: "not_found",
          message: "Intake draft not found",
        },
      },
    };
  }

  const outputBundle = parseOutputBundle(input.document.output_bundle);
  const requestedOutputKeys = input.outputKeys ?? [];
  const selectedOutputBundle =
    requestedOutputKeys.length > 0
      ? outputBundle.filter((output) => requestedOutputKeys.includes(output.outputKey))
      : outputBundle;

  if (selectedOutputBundle.length === 0) {
    return {
      error: {
        status: 400,
        body: {
          error: "validation_error",
          message: "No eligible outputs found to create generation runs",
        },
      },
    };
  }

  const missingOutputKeys = requestedOutputKeys.filter(
    (outputKey) => !outputBundle.some((entry) => entry.outputKey === outputKey),
  );

  if (missingOutputKeys.length > 0) {
    return {
      error: {
        status: 400,
        body: {
          error: "validation_error",
          message: "One or more requested output keys are not configured for this document",
          details: missingOutputKeys.map((outputKey) => ({
            path: "outputKeys",
            message: `Unsupported output key: ${outputKey}`,
          })),
        },
      },
    };
  }

  const selection = await buildMemberFormSelectionForDocument(draft.product_flow_mode);
  const rulesResult = await deriveMemberFormRulesByJurisdiction(
    draft.jurisdiction,
    selection,
  );

  if (rulesResult.availabilityConflict) {
    return {
      error: {
        status: 409,
        body: {
          error: "conflict",
          message:
            rulesResult.availabilityConflict.message ??
            `Jurisdiction ${rulesResult.availabilityConflict.jurisdiction} is unavailable for the selected product flow.`,
          jurisdiction: rulesResult.availabilityConflict.jurisdiction,
          reason: rulesResult.availabilityConflict.reason,
          unavailableRequirements: rulesResult.availabilityConflict.unavailableRequirements.map(
            (requirement) => ({
              family: requirement.family,
              documentType: requirement.documentType,
              reason: requirement.reason,
            }),
          ),
        },
      },
    };
  }

  if (!rulesResult.contract || rulesResult.missing.length > 0) {
    return {
      error: {
        status: 404,
        body: {
          error: "not_found",
          message: "Member form requirements not found for one or more selected families",
          details: rulesResult.missing,
        },
      },
    };
  }

  const extractionPayload = await buildMemberFormDocumentExtractionPayload(
    rulesResult.contract,
  );
  const existingRunsResult = await listDocumentGenerationRunsFromDb(input.document.id);
  const existingRuns = Array.isArray(existingRunsResult) ? existingRunsResult : [];
  const latestRunByOutputKey = new Map<string, DocumentGenerationRunRecord>();
  const cutoffTimestamp = input.reuseSatisfiedRunsCreatedAfter
    ? toTimestamp(input.reuseSatisfiedRunsCreatedAfter)
    : null;

  for (const run of existingRuns) {
    if (
      cutoffTimestamp !== null &&
      toTimestamp(run.created_at) < cutoffTimestamp
    ) {
      continue;
    }

    if (!latestRunByOutputKey.has(run.output_key)) {
      latestRunByOutputKey.set(run.output_key, run);
    }
  }

  const runs: DocumentGenerationRunRecord[] = [];

  for (const output of selectedOutputBundle) {
    const existingRun = latestRunByOutputKey.get(output.outputKey) ?? null;

    if (
      existingRun &&
      existingRun.intake_revision === draft.revision &&
      isReusableReviewRun(existingRun)
    ) {
      runs.push(existingRun);
      continue;
    }

    const template = await getActiveTemplateRegistryForOutput({
      jurisdiction: draft.jurisdiction,
      outputKey: output.outputKey,
    });

    const templateArtifact = template
      ? await getActiveTemplateArtifact({
          templateKey: template.template_key,
          templateVersion: template.template_version,
          templateHash: template.template_hash,
        })
      : null;

    const preparedRun = await prepareGenerationRun({
      document: input.document,
      draft,
      outputKey: output.outputKey,
      outputMetadata: output.metadata,
      ...(template?.document_key
        ? { templateDocumentKey: template.document_key }
        : {}),
      templateResolved: Boolean(template),
      templateArtifact,
      templateKey: template?.template_key ?? "unresolved_template",
      templateVersion: template?.template_version ?? "unresolved",
      templateHash: template?.template_hash ?? "unresolved",
      extractionPayload,
    });

    const coverageSnapshot: Record<string, unknown> = preparedRun.extractionDocument
      ? {
          generatedAt: extractionPayload.generatedAt,
          documentKey: preparedRun.documentKey,
          templateCoverage: preparedRun.extractionDocument.templateCoverage,
          templateBindings: preparedRun.extractionDocument.templateBindings,
        }
      : {
          generatedAt: extractionPayload.generatedAt,
          documentKey: preparedRun.documentKey,
          error: "document_extraction_contract_not_found",
        };

    const runPayload = {
      documentId: preparedRun.document.id,
      jurisdiction: draft.jurisdiction,
      productFlowMode: draft.product_flow_mode,
      rulesSnapshotVersion: draft.rules_snapshot_version,
      revision: draft.revision,
      canonicalAnswers: draft.canonical_answers_json,
    };

    const shouldUpdateExistingRun =
      existingRun &&
      existingRun.intake_revision === draft.revision &&
      !isStaleRenderingReviewRun(existingRun);
    const run = shouldUpdateExistingRun
      ? await updateDocumentGenerationRun(existingRun.id, {
          template_artifact_id: templateArtifact?.id ?? null,
          payload_json: runPayload,
          coverage_json: coverageSnapshot,
          render_context_json: preparedRun.renderContext,
          blocking_requirements_json: preparedRun.blockingRequirements,
          resolved_sources_json: preparedRun.resolvedSources,
          status: preparedRun.status,
          renderer_job_id: null,
          document_version_id: null,
          blocked_at:
            preparedRun.status === "blocked"
              ? existingRun.blocked_at ?? new Date().toISOString()
              : null,
          started_at: null,
          rendered_at: null,
          failed_at: null,
          canceled_at: null,
          failure_code: null,
          failure_details_json: {},
          cancellation_reason: null,
          error_message: preparedRun.errorMessage,
        })
      : await createDocumentGenerationRun({
          documentId: preparedRun.document.id,
          intakeRevision: draft.revision,
          outputKey: output.outputKey,
          documentKey: preparedRun.documentKey,
          templateKey: template?.template_key ?? "unresolved_template",
          templateVersion: template?.template_version ?? "unresolved",
          templateHash: template?.template_hash ?? "unresolved",
          templateArtifactId: templateArtifact?.id ?? null,
          payload: runPayload,
          coverage: coverageSnapshot,
          renderContext: preparedRun.renderContext,
          blockingRequirements: preparedRun.blockingRequirements,
          resolvedSources: preparedRun.resolvedSources,
          status: preparedRun.status,
          blockedAt:
            preparedRun.status === "blocked" ? new Date().toISOString() : null,
          errorMessage: preparedRun.errorMessage,
        });

    latestRunByOutputKey.set(output.outputKey, run);

    await replaceDocumentOutputSigners({
      documentId: preparedRun.document.id,
      generationRunId: run.id,
      signers: preparedRun.signerObligations,
    });

    logDocumentTrace(
      preparedRun.status === "blocked"
        ? "generation.run_blocked"
        : "generation.run_created",
      {
        documentId: run.document_id,
        generationRunId: run.id,
        outputKey: run.output_key,
        documentKey: run.document_key,
        templateKey: run.template_key,
        templateVersion: run.template_version,
        status: run.status,
        blockerCount: preparedRun.blockingRequirements.length,
        blockers: preparedRun.blockingRequirements,
        placeholders: preparedRun.renderContext.placeholders ?? {},
        signerObligations: preparedRun.signerObligations.map((signer) => ({
          partyRole: signer.party_role,
          partyName: signer.party_name,
          obligationType: signer.obligation_type,
          isRequired: signer.is_required,
          resolutionSource: signer.resolution_source,
        })),
      },
    );

    if (preparedRun.status === "blocked") {
      captureGenerationRunBlocked({
        document: preparedRun.document,
        draft,
        run,
        blockers: preparedRun.blockingRequirements,
        placeholderKeys: Object.keys(preparedRun.renderContext.placeholders ?? {}),
        signerObligations: preparedRun.signerObligations.map((signer) => ({
          party_role: signer.party_role,
          obligation_type: signer.obligation_type,
          is_required: signer.is_required,
          resolution_source: signer.resolution_source,
        })),
      });
    }

    if (preparedRun.status === "queued") {
      await enqueueDocumentGenerationRun({
        runId: run.id,
      });
    }

    if (input.actorContext) {
      await recordAuditEvent({
        ...input.actorContext,
        entityType: "generation_run",
        entityId: run.id,
        action:
          preparedRun.status === "blocked"
            ? "system.generation_run_blocked"
            : "system.generation_run_created",
        metadata: {
          document_id: run.document_id,
          generation_run_id: run.id,
          output_key: run.output_key,
          document_key: run.document_key,
          template_key: run.template_key,
          template_version: run.template_version,
          template_hash: run.template_hash,
          blocker_count: preparedRun.blockingRequirements.length,
        },
      });
    }

    runs.push(run);
  }

  return {
    runs,
  };
};

const ensureSigningState = async (input: {
  document: DocumentRecord;
  viewerRole?: string | null;
  actorContext?: { actorSupabaseId?: string; actorRole?: string };
}) => {
  let document = input.document;
  let signingState = await buildDocumentSigningState({
    document,
    ...(input.viewerRole !== undefined ? { viewerRole: input.viewerRole } : {}),
  });

  if (
    document.status === "pending_signature" &&
    signingState.reviewApproval?.approvedAt &&
    !isDocumentIntakeLocked(document)
  ) {
    document = await updateDocument(document.id, {
      intake_status: "submitted",
      intake_submitted_at:
        document.intake_submitted_at ?? signingState.reviewApproval.approvedAt,
    });

    logDocumentTrace("signing.intake_status_repaired", {
      documentId: document.id,
      repairedAt: new Date().toISOString(),
      intakeStatus: document.intake_status,
      intakeSubmittedAt: document.intake_submitted_at,
    });

    signingState = await buildDocumentSigningState({
      document,
      ...(input.viewerRole !== undefined ? { viewerRole: input.viewerRole } : {}),
    });
  }

  if (
    document.status === "pending_signature" &&
    signingState.reviewApproval?.reviewSource === "uploaded_pdf" &&
    signingState.reviewApproval.approvedOutputKeys.includes(UPLOADED_DOCUMENT_OUTPUT_KEY)
  ) {
    const preparation = await ensureUploadedDocumentSigningPreparation({
      document,
      reviewApproval: signingState.reviewApproval,
    });

    document = preparation.document;
    signingState = await buildDocumentSigningState({
      document,
      ...(input.viewerRole !== undefined ? { viewerRole: input.viewerRole } : {}),
    });
  }

  if (
    document.status === "pending_signature" &&
    signingState.reviewApproval?.approvedAt &&
    signingState.missingOutputKeys.length > 0
  ) {
    const creation = await createGenerationRunsForDocument({
      document,
      outputKeys: signingState.missingOutputKeys,
      reuseSatisfiedRunsCreatedAfter: signingState.reviewApproval.approvedAt,
      ...(input.actorContext ? { actorContext: input.actorContext } : {}),
    });

    if (!creation.error) {
      signingState = await buildDocumentSigningState({
        document: input.document,
        ...(input.viewerRole !== undefined ? { viewerRole: input.viewerRole } : {}),
      });
    }
  }

  return signingState;
};

const resolveSigningSignatureTarget = async (input: {
  document: DocumentRecord;
  generationRunId: string;
  outputSignerId: string;
  viewerRole?: string | null;
  actorContext?: { actorSupabaseId?: string; actorRole?: string };
}) => {
  const signingState = await ensureSigningState({
    document: input.document,
    ...(input.viewerRole !== undefined ? { viewerRole: input.viewerRole } : {}),
    ...(input.actorContext ? { actorContext: input.actorContext } : {}),
  });
  const signatureTask = signingState.signatures.find(
    (signature) =>
      signature.outputSignerId === input.outputSignerId &&
      signature.generationRunId === input.generationRunId,
  ) ?? null;
  const signerRecord = await getDocumentOutputSignerById({
    signerId: input.outputSignerId,
    documentId: input.document.id,
  });

  return {
    signingState,
    signatureTask,
    signerRecord,
  };
};

const parseSignatureImageDataUrl = (imageDataUrl: string) => {
  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/i.exec(imageDataUrl.trim());
  if (!match) {
    return null;
  }

  const mimeType = (match[1] ?? "").toLowerCase();
  const payload = match[2] ?? "";
  const content = Buffer.from(payload, "base64");

  if (content.byteLength === 0 || content.byteLength > MAX_SIGNATURE_BYTES) {
    return null;
  }

  return {
    mimeType,
    content,
  };
};

const parseOutputBundle = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as ParsedOutputBundleEntry[];
  }

  const parsed = value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const asRecord = item as Record<string, unknown>;
      const outputKey =
        typeof asRecord.outputKey === "string" ? asRecord.outputKey.trim() : "";

      if (!outputKey) {
        return null;
      }

      return {
        outputKey,
        outputLabel:
          typeof asRecord.outputLabel === "string"
            ? asRecord.outputLabel
            : outputKey,
        isRequired: asRecord.isRequired !== false,
        sortOrder:
          typeof asRecord.sortOrder === "number" && Number.isFinite(asRecord.sortOrder)
            ? asRecord.sortOrder
            : 0,
        metadata:
          asRecord.metadata &&
          typeof asRecord.metadata === "object" &&
          !Array.isArray(asRecord.metadata)
            ? (asRecord.metadata as Record<string, unknown>)
            : {},
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  return parsed;
};

const toMemberFormSubmissionValueRecord = (
  answers: Record<string, unknown>,
): Record<string, MemberFormSubmissionValue> => {
  const normalized: Record<string, MemberFormSubmissionValue> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (typeof value === "string" || typeof value === "boolean") {
      normalized[key] = value;
      continue;
    }

    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      normalized[key] = [...value];
    }
  }

  return normalized;
};

const normalizeCanonicalKey = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

const buildCanonicalPayload = (
  contract: MemberFormRulesContract | null,
  answers: Record<string, unknown>,
) => {
  if (!contract) {
    return {} as Record<string, unknown>;
  }

  const canonicalPayload = new Map<string, unknown>();

  for (const section of contract.aggregatedForm.sections) {
    for (const field of section.fields) {
      const fieldKey = field.canonical_key;
      const normalizedCanonicalKey = normalizeCanonicalKey(fieldKey);

      if (!Object.prototype.hasOwnProperty.call(answers, fieldKey)) {
        continue;
      }

      if (!canonicalPayload.has(normalizedCanonicalKey)) {
        canonicalPayload.set(normalizedCanonicalKey, answers[fieldKey]);
      }
    }
  }

  if (
    !canonicalPayload.has("jurisdiction") &&
    typeof contract.jurisdiction === "string" &&
    contract.jurisdiction.trim().length > 0
  ) {
    canonicalPayload.set("jurisdiction", contract.jurisdiction.trim());
  }

  return Object.fromEntries(
    [...canonicalPayload.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
};

const buildMemberFormSelectionForDocument = async (
  productFlowMode: string,
): Promise<MemberFormSelection> => {
  const selection = await buildSelectionForMode(productFlowMode);

  return {
    families: [...selection.families],
    poaType: selection.poaType,
    trustType: selection.trustType,
    idnType: selection.idnType,
  };
};

export const createDocument = async (req: Request, res: Response) => {
  const parsed = createDocumentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const source = parsed.data.templateId ? "template" : "upload";
  const documentType = parsed.data.templateId
    ? parsed.data.documentType ?? "template"
    : parsed.data.documentType ?? "generic";
  const jurisdiction = parsed.data.jurisdiction ?? "US-OH";

  let productFlowMode: string | null = null;
  let selectedFamilies: string[] | null = null;
  let outputBundle: Array<Record<string, unknown>> = [];

  if (parsed.data.productFlowMode) {
    const selection = await buildSelectionForMode(parsed.data.productFlowMode);
    const expectedOutputs = await resolveExpectedOutputsForMode(selection.modeKey);

    productFlowMode = selection.modeKey;
    selectedFamilies = [...selection.families];
    outputBundle = expectedOutputs.map((output) => ({
      outputKey: output.outputKey,
      outputLabel: output.outputLabel,
      isRequired: output.isRequired,
      sortOrder: output.sortOrder,
      metadata: output.metadata,
    }));
  } else if (parsed.data.selectedFamilies?.length) {
    const normalizedFamilies = normalizeSelectedFamilies(parsed.data.selectedFamilies);
    selectedFamilies = normalizedFamilies.length > 0 ? [...normalizedFamilies] : null;
  }

  const ownerId = await getOrCreateUserId(
    req.user.id,
    req.user.email,
    req.user.role,
    req.user.phone,
  );
  const documentId = randomUUID();
  const storagePath = `${ownerId}/${documentId}/v1/source.pdf`;
  const { document, version } = await createDocumentWithVersion({
    documentId,
    ownerId,
    documentType,
    jurisdiction,
    productFlowMode,
    selectedFamilies,
    outputBundle,
    storagePath,
    fileName: parsed.data.fileName,
    fileSize: parsed.data.fileSize,
    mimeType: parsed.data.mimeType,
  });
  const upload = await createDocumentUploadUrl(storagePath);
  const actorContext = buildAuditActorContext(req);

  await recordAuditEvent({
    ...actorContext,
    entityType: "document",
    entityId: document.id,
    action: "member.document_upload_started",
    metadata: {
      document_id: document.id,
      source,
      template_id: parsed.data.templateId ?? null,
      file_name: parsed.data.fileName ?? null,
      file_size: parsed.data.fileSize ?? null,
      mime_type: parsed.data.mimeType ?? null,
      product_flow_mode: productFlowMode,
      selected_families: selectedFamilies,
      output_bundle_count: outputBundle.length,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "document",
    entityId: document.id,
    action: "system.document_created",
    metadata: {
      document_id: document.id,
      owner_id: ownerId,
    },
  });

  res.status(201).json({
    document: mapDocumentResponse(document, req.user?.role ?? "member"),
    version: {
      id: version.id,
      version: version.version,
      storagePath: version.storage_path,
      fileName: version.file_name,
      mimeType: version.mime_type,
      sizeBytes: version.size_bytes,
      isFinal: version.is_final,
      createdAt: version.created_at,
    },
    upload: {
      bucket: upload.bucket,
      path: upload.path,
      signedUrl: upload.signedUrl,
      token: upload.token,
    },
  });
};

export const bootstrapDocumentIntakeDraft = async (req: Request, res: Response) => {
  const parsed = bootstrapDocumentIntakeDraftSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const ownerId = await getOrCreateUserId(
    req.user.id,
    req.user.email,
    req.user.role,
    req.user.phone,
  );

  const selection = await buildSelectionForMode(parsed.data.productFlowMode);
  const expectedOutputs = await resolveExpectedOutputsForMode(selection.modeKey);
  const rulesSnapshotVersion =
    parsed.data.rulesSnapshotVersion ?? "member_form_rules_contract_v1";

  const bootstrapResult = await bootstrapDocumentIntakeDraftFromDb({
    ownerId,
    productFlowMode: selection.modeKey,
    jurisdiction: parsed.data.jurisdiction,
    rulesSnapshotVersion,
    resumeLatestDraft: parsed.data.resumeLatestDraft ?? false,
    selectedFamilies: [...selection.families],
    outputBundle: expectedOutputs.map((output) => ({
      outputKey: output.outputKey,
      outputLabel: output.outputLabel,
      isRequired: output.isRequired,
      sortOrder: output.sortOrder,
      metadata: output.metadata,
    })),
    createdBy: ownerId,
  });

  return res.status(200).json({
    created: bootstrapResult.created,
    document: mapDocumentResponse(
      bootstrapResult.document,
      req.user?.role ?? "member",
    ),
    draft: mapDocumentIntakeDraftResponse(bootstrapResult.draft),
  });
};

export const finalizeDocumentUpload = async (req: Request, res: Response) => {
  const parsed = finalizeUploadSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const ownerId = await getUserIdBySupabaseId(req.user.id);
  if (!ownerId) {
    return res.status(403).json({
      error: "forbidden",
      message: "User not registered",
    });
  }

  if (typeof req.params.id !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Document id is required",
      details: [
        {
          path: "id",
          message: "Document id is required",
        },
      ],
    });
  }

  const documentId = req.params.id;

  const document = await getDocumentById(documentId);
  if (!document || document.owner_id !== ownerId) {
    return res.status(404).json({
      error: "not_found",
      message: "Document not found",
    });
  }

  const version = await getDocumentVersionById(
    parsed.data.documentVersionId,
    documentId
  );
  if (!version || !version.storage_path) {
    return res.status(404).json({
      error: "not_found",
      message: "Document version not found",
    });
  }
  const uploadStoragePath = version.storage_path;

  let objectMetadata: Awaited<ReturnType<typeof getDocumentObjectMetadata>>;
  try {
    objectMetadata = await getDocumentObjectMetadata(uploadStoragePath);
  } catch (error) {
    captureException(error, {
      level: "error",
      tags: {
        feature: "document_upload",
        document_id: document.id,
        document_version_id: version.id,
      },
      contexts: {
        document_upload: {
          documentId: document.id,
          documentVersionId: version.id,
          storagePath: uploadStoragePath,
          stage: "metadata_lookup",
        },
      },
      fingerprint: ["document_upload", "metadata_lookup_failed"],
    });
    throw error;
  }

  if (!objectMetadata) {
    captureDocumentUploadIssue({
      message: "Document upload finalize failed because uploaded object was not found",
      documentId: document.id,
      versionId: version.id,
      storagePath: uploadStoragePath,
    });

    return res.status(404).json({
      error: "not_found",
      message: "Uploaded file not found",
    });
  }

  let inspectedContent: Buffer | null = null;
  const inspectUploadedDocument = async () => {
    if (inspectedContent) {
      return inspectedContent;
    }

    try {
      inspectedContent = await downloadDocumentObject(uploadStoragePath);
      return inspectedContent;
    } catch (error) {
      captureException(error, {
        level: "error",
        tags: {
          feature: "document_upload",
          document_id: document.id,
          document_version_id: version.id,
        },
        contexts: {
          document_upload: {
            documentId: document.id,
            documentVersionId: version.id,
            storagePath: uploadStoragePath,
            stage: "object_download_validation",
            metadata: objectMetadata,
          },
        },
        fingerprint: ["document_upload", "object_download_validation_failed"],
      });
      throw error;
    }
  };

  const normalizedMimeType = objectMetadata.mimeType?.toLowerCase().trim() ?? "";
  const ambiguousMimeType =
    normalizedMimeType === "" ||
    normalizedMimeType === "application/octet-stream" ||
    normalizedMimeType === "binary/octet-stream";
  let resolvedMimeType =
    normalizedMimeType === "application/pdf" ? "application/pdf" : "";

  if (!resolvedMimeType && ambiguousMimeType) {
    const content = await inspectUploadedDocument();
    if (hasPdfMagicBytes(content)) {
      resolvedMimeType = "application/pdf";
      captureDocumentUploadIssue({
        message: "Document upload PDF mime type inferred from file bytes",
        documentId: document.id,
        versionId: version.id,
        storagePath: uploadStoragePath,
        metadata: {
          storageMimeType: objectMetadata.mimeType,
          storedVersionMimeType: version.mime_type,
        },
      });
    }
  }

  if (resolvedMimeType !== "application/pdf") {
    captureDocumentUploadIssue({
      message: "Document upload finalize rejected non-PDF content",
      documentId: document.id,
      versionId: version.id,
      storagePath: uploadStoragePath,
      metadata: {
        storageMimeType: objectMetadata.mimeType,
        storedVersionMimeType: version.mime_type,
        sizeBytes: objectMetadata.sizeBytes,
      },
    });

    return res.status(400).json({
      error: "validation_error",
      message: "Only application/pdf is supported",
      details: [
        {
          path: "mimeType",
          message: "Only application/pdf is supported",
        },
      ],
    });
  }

  let resolvedSizeBytes =
    typeof objectMetadata.sizeBytes === "number" ? objectMetadata.sizeBytes : null;

  if (resolvedSizeBytes === null) {
    const content = await inspectUploadedDocument();
    resolvedSizeBytes = content.byteLength;
    captureDocumentUploadIssue({
      message: "Document upload file size inferred from object download",
      documentId: document.id,
      versionId: version.id,
      storagePath: uploadStoragePath,
      metadata: {
        storageMimeType: objectMetadata.mimeType,
        inferredSizeBytes: resolvedSizeBytes,
      },
    });
  }

  if (resolvedSizeBytes === null) {
    captureDocumentUploadIssue({
      message: "Document upload finalize failed because file size metadata is missing",
      documentId: document.id,
      versionId: version.id,
      storagePath: uploadStoragePath,
      metadata: {
        storageMimeType: objectMetadata.mimeType,
        storedVersionMimeType: version.mime_type,
      },
    });

    return res.status(400).json({
      error: "validation_error",
      message: "File size metadata is missing",
      details: [
        {
          path: "fileSize",
          message: "File size metadata is missing",
        },
      ],
    });
  }

  if (resolvedSizeBytes > MAX_UPLOAD_BYTES) {
    captureDocumentUploadIssue({
      message: "Document upload finalize rejected oversized PDF",
      documentId: document.id,
      versionId: version.id,
      storagePath: uploadStoragePath,
      metadata: {
        storageMimeType: objectMetadata.mimeType,
        sizeBytes: resolvedSizeBytes,
        maxUploadBytes: MAX_UPLOAD_BYTES,
      },
    });

    return res.status(400).json({
      error: "validation_error",
      message: "File exceeds 25 MB limit",
      details: [
        {
          path: "fileSize",
          message: "File exceeds 25 MB limit",
        },
      ],
    });
  }

  const updatedVersion = await updateDocumentVersion(version.id, {
    mime_type: resolvedMimeType,
    size_bytes: resolvedSizeBytes,
    file_name: version.file_name,
  });

  let updatedDocument = document;
  if (document.status !== "pending_review") {
    updatedDocument = await updateDocument(document.id, {
      status: "pending_review",
    });
  }

  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};
  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }

  await recordAuditEvent({
    ...actorContext,
    entityType: "document_version",
    entityId: updatedVersion.id,
    action: "member.document_upload_completed",
    metadata: {
      document_id: updatedDocument.id,
      document_version_id: updatedVersion.id,
      storage_path: updatedVersion.storage_path,
      file_name: updatedVersion.file_name,
      file_size: updatedVersion.size_bytes,
      mime_type: updatedVersion.mime_type,
    },
  });

  if (document.status !== "pending_review") {
    await recordAuditEvent({
      ...actorContext,
      entityType: "document",
      entityId: updatedDocument.id,
      action: "system.document_ready_for_review",
      metadata: {
        document_id: updatedDocument.id,
        document_version_id: updatedVersion.id,
        review_source: "uploaded_pdf",
      },
    });

    await queueDocumentReadyForReviewNotification({
      documentId: updatedDocument.id,
      documentVersionId: updatedVersion.id,
      reviewSource: "uploaded_pdf",
      requestedBySupabaseUserId: req.user?.id,
    });
  }

  res.status(200).json({
    document: mapDocumentResponse(updatedDocument, req.user?.role ?? "member"),
    version: {
      id: updatedVersion.id,
      version: updatedVersion.version,
      storagePath: updatedVersion.storage_path,
      fileName: updatedVersion.file_name,
      mimeType: updatedVersion.mime_type,
      sizeBytes: updatedVersion.size_bytes,
      isFinal: updatedVersion.is_final,
      createdAt: updatedVersion.created_at,
    },
  });
};

const getAuthorizedDocument = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });

    return null;
  }

  if (typeof req.params.id !== "string") {
    res.status(400).json({
      error: "validation_error",
      message: "Document id is required",
      details: [
        {
          path: "id",
          message: "Document id is required",
        },
      ],
    });

    return null;
  }

  const documentId = req.params.id;
  const document = await getDocumentById(documentId);
  if (!document) {
    res.status(404).json({
      error: "not_found",
      message: "Document not found",
    });

    return null;
  }

  const role = req.user.role ?? "member";
  if (role !== "admin" && role !== "service_role") {
    const ownerId = await getUserIdBySupabaseId(req.user.id);
    if (!ownerId || document.owner_id !== ownerId) {
      res.status(404).json({
        error: "not_found",
        message: "Document not found",
      });

      return null;
    }
  }

  return document;
};

const getAuthorizedSigningAccess = async (
  req: Request,
  res: Response,
): Promise<DocumentSigningAccessContext | null> => {
  if (!req.user?.id) {
    res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });

    return null;
  }

  if (typeof req.params.id !== "string") {
    res.status(400).json({
      error: "validation_error",
      message: "Document id is required",
      details: [
        {
          path: "id",
          message: "Document id is required",
        },
      ],
    });

    return null;
  }

  const document = await getDocumentById(req.params.id);
  if (!document) {
    res.status(404).json({
      error: "not_found",
      message: "Document not found",
    });

    return null;
  }

  const role = req.user.role ?? "member";
  const actorUserId = await resolveRequestActorUserId(req);
  const actorEmail = req.user.email ?? null;

  if (role === "admin" || role === "service_role") {
    return {
      document,
      kind: role,
      actorUserId,
      actorEmail,
      signerUserId: document.owner_id,
      inviteAccess: null,
    };
  }

  if (actorUserId && document.owner_id === actorUserId) {
    return {
      document,
      kind: "owner",
      actorUserId,
      actorEmail,
      signerUserId: document.owner_id,
      inviteAccess: null,
    };
  }

  const inviteAccess = await resolveClaimedSignerInviteAccess({
    documentId: document.id,
    viewerUserId: actorUserId,
    viewerEmail: actorEmail,
  });

  if (inviteAccess) {
    return {
      document,
      kind: "invited_signer",
      actorUserId,
      actorEmail,
      signerUserId: inviteAccess.claimedUserId,
      inviteAccess,
    };
  }

  res.status(404).json({
    error: "not_found",
    message: "Document not found",
  });

  return null;
};

const mapSigningViewerAccess = (access: DocumentSigningAccessContext) => ({
  kind: access.kind,
  inviteId: access.inviteAccess?.inviteId ?? null,
  documentOutputSignerId: access.inviteAccess?.documentOutputSignerId ?? null,
  documentPartyId: access.inviteAccess?.documentPartyId ?? null,
});

const getScopedOutputKeys = (
  signing: DocumentSigningState,
  inviteAccess: ClaimedSignerInviteAccess,
) => {
  const outputKeys = new Set<string>();
  if (inviteAccess.outputKey) {
    outputKeys.add(inviteAccess.outputKey);
  }

  for (const signature of signing.signatures) {
    if (signature.outputSignerId === inviteAccess.documentOutputSignerId) {
      outputKeys.add(signature.outputKey);
    }
  }

  return outputKeys;
};

const buildScopedSigningCompletion = (signatures: SigningSignatureResponse[]) => {
  const requiredSignatureCount = signatures.filter((signature) => signature.isRequired).length;
  const capturedRequiredSignatureCount = signatures.filter(
    (signature) => signature.isRequired && signature.status === "captured",
  ).length;
  const allRequiredSignaturesComplete =
    signatures.length > 0 &&
    signatures.every((signature) => {
      if (signature.isRequired) {
        return signature.status === "captured";
      }

      if (!signature.signingGroup || !signature.groupMinimumRequired) {
        return true;
      }

      return signature.groupSatisfied;
    });

  return {
    requiredSignatureCount,
    capturedRequiredSignatureCount,
    allRequiredSignaturesComplete,
    canConfirm: false,
  } satisfies SigningCompletionSummary;
};

const scopeSigningStateForAccess = (
  signing: DocumentSigningState,
  access: DocumentSigningAccessContext,
): DocumentSigningState => {
  if (access.kind !== "invited_signer" || !access.inviteAccess) {
    return signing;
  }

  const scopedSignatures = signing.signatures.filter(
    (signature) => signature.outputSignerId === access.inviteAccess?.documentOutputSignerId,
  );
  const scopedOutputKeys = getScopedOutputKeys(signing, access.inviteAccess);
  const scopedGroups = signing.groups.filter((group) =>
    scopedSignatures.some(
      (signature) =>
        signature.signingGroup === group.signingGroup &&
        signature.generationRunId === group.generationRunId,
    ),
  );

  return {
    ...signing,
    approvedOutputKeys: signing.approvedOutputKeys.filter((outputKey) => scopedOutputKeys.has(outputKey)),
    outputs: signing.outputs.filter((output) => scopedOutputKeys.has(output.outputKey)),
    pendingOutputs: signing.pendingOutputs.filter((output) => scopedOutputKeys.has(output.outputKey)),
    missingOutputKeys: signing.missingOutputKeys.filter((outputKey) => scopedOutputKeys.has(outputKey)),
    allOutputsReady:
      scopedOutputKeys.size > 0 &&
      Array.from(scopedOutputKeys).every((outputKey) =>
        signing.outputs.some((output) => output.outputKey === outputKey),
      ),
    signatures: scopedSignatures,
    groups: scopedGroups,
    completion: buildScopedSigningCompletion(scopedSignatures),
  };
};

const ensureSigningAccessAllowsSignature = (
  access: DocumentSigningAccessContext,
  outputSignerId: string,
) => access.kind !== "invited_signer" || access.inviteAccess?.documentOutputSignerId === outputSignerId;

export const getDocument = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const summary = await buildDocumentWorkspaceSummary({
    document,
    viewerRole: req.user?.role ?? "member",
  });

  res.status(200).json({
    document: {
      ...mapDocumentResponse(document, req.user?.role ?? "member"),
      summary,
    },
  });
};

export const getDocumentReview = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  let review = await buildDocumentReviewState({
    document,
    viewerRole: req.user?.role ?? "member",
  });

  if (
    review.pendingOutputs.some((output) => output.status === "queued") &&
    (await processQueuedReviewOutputsInline({
      document,
      viewerRole: req.user?.role ?? "member",
    }))
  ) {
    review = await buildDocumentReviewState({
      document,
      viewerRole: req.user?.role ?? "member",
    });
  }

  return res.status(200).json({
    document: mapDocumentResponse(document, req.user?.role ?? "member"),
    review: {
      state: review.state,
      requiresGeneration: review.requiresGeneration,
      missingOutputKeys: review.missingOutputKeys,
      allVisibleOutputsReady: review.allVisibleOutputsReady,
      canApprove: review.canApprove,
      reviewApproval: review.reviewApproval,
      outputs: review.outputs,
      pendingOutputs: review.pendingOutputs,
    },
  });
};

export const approveDocumentReview = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const parsed = reviewApprovalSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (
    document.status !== "draft" &&
    document.status !== "pending_review" &&
    document.status !== "pending_signature"
  ) {
    return res.status(409).json({
      error: "conflict",
      message: "Document is not in a reviewable state",
      status: document.status,
    });
  }

  const review = await buildDocumentReviewState({
    document,
    viewerRole: req.user?.role ?? "member",
  });

  if (document.status === "pending_signature" && isFinalIdn(document.idn) && review.reviewApproval) {
    let signingReady = true;
    let idempotentDocument = document;

    if (
      review.reviewApproval.reviewSource === "uploaded_pdf" &&
      review.reviewApproval.approvedOutputKeys.includes(UPLOADED_DOCUMENT_OUTPUT_KEY)
    ) {
      const preparation = await ensureUploadedDocumentSigningPreparation({
        document,
        reviewApproval: review.reviewApproval,
      });

      idempotentDocument = preparation.document;
      signingReady = preparation.ready;
    }

    return res.status(200).json({
      document: mapDocumentResponse(idempotentDocument, req.user?.role ?? "member"),
      reviewApproval: {
        approvedAt: review.reviewApproval.approvedAt,
        signingReady,
        reviewSource: review.reviewApproval.reviewSource,
        latestVersionId: review.reviewApproval.latestVersionId,
        latestRenderedRunId: review.reviewApproval.latestRenderedRunId,
        approvedOutputKeys: review.reviewApproval.approvedOutputKeys,
        approvedVersionIds: review.reviewApproval.approvedVersionIds,
      },
    });
  }

  if (!review.canApprove) {
    return res.status(409).json({
      error: "conflict",
      message: "Document is not ready for review approval yet",
    });
  }

  const approvedAt = new Date().toISOString();
  const assignedIdn = resolveReviewApprovalIdn(document);
  const reviewedRunIds = Array.from(
    new Set(
      review.outputs
        .map((output) => output.generationRunId)
        .filter((generationRunId): generationRunId is string => typeof generationRunId === "string"),
    ),
  );
  const signerObligations = (
    await Promise.all(
      reviewedRunIds.map((generationRunId) =>
        listDocumentOutputSigners({
          documentId: document.id,
          generationRunId,
        }),
      ),
    )
  ).flat();
  const signerNamesFromObligations = signerObligations
    .filter((signer) => signer.obligation_type === "signer")
    .map((signer) => signer.party_name.trim())
    .filter((name) => name.length > 0);
  const parties = signerNamesFromObligations.length === 0
    ? await listDocumentPartiesFromDb(document.id)
    : [];
  const signerNames = Array.from(
    new Set(
      (signerNamesFromObligations.length > 0
        ? signerNamesFromObligations
        : parties
            .filter((party) => party.is_signing_party)
            .map((party) => party.full_name.trim())
      ).filter((name) => name.length > 0),
    ),
  );

  const latestReviewedOutput = review.outputs.reduce((latest, current) => {
    return toTimestamp(current.createdAt) > toTimestamp(latest.createdAt)
      ? current
      : latest;
  });
  const reviewSource = reviewedRunIds.length > 0 ? "generated_output" : "uploaded_pdf";
  const title =
    review.outputs.length === 1
      ? review.outputs[0]?.outputLabel ?? "Document"
      : resolveIdnTitle(document, null);
  const idnRecord = {
    idn: assignedIdn,
    signers: signerNames,
    notary: null,
    date: approvedAt,
    title,
    pages: null,
    latestVersionId: latestReviewedOutput.versionId,
    latestVersionNumber: latestReviewedOutput.version,
    latestRenderedRunId: latestReviewedOutput.generationRunId,
    approvedOutputKeys: review.outputs.map((output) => output.outputKey),
    approvedVersionIds: review.outputs.map((output) => output.versionId),
    reviewSource,
  };

  const verificationUrl = buildVerificationUrl(assignedIdn);
  const updatedDocument = await updateDocument(document.id, {
    idn: assignedIdn,
    status: "pending_signature",
    intake_status:
      document.intake_status?.trim().toLowerCase() === "locked"
        ? "locked"
        : "submitted",
    intake_submitted_at: document.intake_submitted_at ?? approvedAt,
  });

  await upsertDocumentSystemValues({
    documentId: document.id,
    values: [
      {
        systemKey: "review_approval",
        value: {
          agreed: true,
          approvedAt,
          reviewSource,
          latestVersionId: latestReviewedOutput.versionId,
          latestRenderedRunId: latestReviewedOutput.generationRunId,
          approvedOutputKeys: review.outputs.map((output) => output.outputKey),
          approvedVersionIds: review.outputs.map((output) => output.versionId),
          actorSupabaseId: req.user?.id ?? null,
          actorRole: req.user?.role ?? null,
        },
        source: "review_approval",
        metadata: {
          documentStatusBeforeApproval: document.status,
        },
      },
      {
        systemKey: "registry_number",
        value: assignedIdn,
        source: "review_approval",
        metadata: {
          aliases: ["DarciNo", "Trust.No", "DdpoaNo"],
        },
      },
      {
        systemKey: "verification_url",
        value: verificationUrl,
        source: "review_approval",
        metadata: {
          registryNumber: assignedIdn,
        },
      },
      {
        systemKey: "idn_record",
        value: idnRecord,
        source: "review_approval",
        metadata: {
          reviewSource,
        },
      },
    ],
  });

  logDocumentTrace("review.approved", {
    documentId: updatedDocument.id,
    approvedAt,
    assignedIdn,
    reviewSource,
    verificationUrl,
    latestVersionId: latestReviewedOutput.versionId,
    latestRenderedRunId: latestReviewedOutput.generationRunId,
    approvedOutputKeys: review.outputs.map((output) => output.outputKey),
    approvedVersionIds: review.outputs.map((output) => output.versionId),
    signerNames,
    idnRecord,
  });

  const actorContext = buildAuditActorContext(req);
  await recordAuditEvent({
    ...actorContext,
    entityType: "document",
    entityId: updatedDocument.id,
    action: "member.document_review_approved",
    metadata: {
      document_id: updatedDocument.id,
      approved_at: approvedAt,
      latest_version_id: latestReviewedOutput.versionId,
      latest_rendered_run_id: latestReviewedOutput.generationRunId,
      approved_output_keys: review.outputs.map((output) => output.outputKey),
      approved_version_ids: review.outputs.map((output) => output.versionId),
      review_source: reviewSource,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "document",
    entityId: updatedDocument.id,
    action: "system.document_idn_assigned",
    metadata: {
      document_id: updatedDocument.id,
      idn: assignedIdn,
      idn_algorithm_version: "phase_c_v1",
      latest_version_id: latestReviewedOutput.versionId,
      latest_rendered_run_id: latestReviewedOutput.generationRunId,
      approved_output_keys: review.outputs.map((output) => output.outputKey),
      approved_version_ids: review.outputs.map((output) => output.versionId),
      review_source: reviewSource,
    },
  });

  let signingReady = false;
  let signingPreparationError: Record<string, unknown> | null = null;
  let signingPreparedDocument = updatedDocument;

  if (reviewSource === "uploaded_pdf") {
    const preparation = await ensureUploadedDocumentSigningPreparation({
      document: updatedDocument,
      reviewApproval: {
        approvedAt,
        reviewSource,
        latestVersionId: latestReviewedOutput.versionId,
        latestRenderedRunId: latestReviewedOutput.generationRunId,
        approvedOutputKeys: review.outputs.map((output) => output.outputKey),
        approvedVersionIds: review.outputs.map((output) => output.versionId),
      },
    });

    signingPreparedDocument = preparation.document;
    signingReady = preparation.ready;
    signingPreparationError = preparation.error;
  } else {
    const signingGeneration = await createGenerationRunsForDocument({
      document: updatedDocument,
      outputKeys: review.outputs.map((output) => output.outputKey),
      reuseSatisfiedRunsCreatedAfter: approvedAt,
      actorContext,
    });

    signingReady = !signingGeneration.error;
    signingPreparationError = signingGeneration.error?.body ?? null;
  }

  if (signingReady) {
    await recordAuditEvent({
      ...actorContext,
      entityType: "document",
      entityId: signingPreparedDocument.id,
      action: "system.document_signing_prepared",
      metadata: {
        document_id: signingPreparedDocument.id,
        approved_at: approvedAt,
        idn: assignedIdn,
        signer_count: signerNames.length,
        review_source: reviewSource,
      },
    });

    await queueDocumentSigningPreparedNotification({
      documentId: signingPreparedDocument.id,
      approvedAt,
      requestedBySupabaseUserId: req.user?.id,
    });
  } else if (signingPreparationError) {
    logDocumentTrace("review.signing_generation_deferred", {
      documentId: signingPreparedDocument.id,
      approvedAt,
      error: signingPreparationError,
    });
  }

  return res.status(200).json({
    document: mapDocumentResponse(signingPreparedDocument, req.user?.role ?? "member"),
    reviewApproval: {
      approvedAt,
      signingReady,
      reviewSource,
      latestVersionId: latestReviewedOutput.versionId,
      latestRenderedRunId: latestReviewedOutput.generationRunId,
      approvedOutputKeys: review.outputs.map((output) => output.outputKey),
      approvedVersionIds: review.outputs.map((output) => output.versionId),
    },
  });
};

export const getDocumentIntakeDraft = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const draft = await getDocumentIntakeDraftFromDb(document.id);
  if (!draft) {
    return res.status(200).json({
      draft: null,
    });
  }

  return res.status(200).json({
    draft: mapDocumentIntakeDraftResponse(draft),
  });
};

export const resaveDocumentIntakeDraft = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const draft = await getDocumentIntakeDraftFromDb(document.id);
  if (!draft) {
    return res.status(404).json({
      error: "not_found",
      message: "Document intake draft not found",
    });
  }

  const result = await saveDocumentIntakeDraftToDb({
    documentId: draft.document_id,
    ownerId: draft.owner_id,
    productFlowMode: draft.product_flow_mode,
    jurisdiction: draft.jurisdiction,
    currentStep: draft.current_step,
    rulesSnapshotVersion: draft.rules_snapshot_version,
    answers: draft.answers_json,
    canonicalAnswers: draft.canonical_answers_json,
    createdBy: document.owner_id,
    eventType: "autosave",
  });

  if (result.conflict) {
    return res.status(409).json({
      error: "conflict",
      message: "Draft revision mismatch",
      currentRevision: result.currentRevision,
    });
  }

  return res.status(200).json({
    draft: mapDocumentIntakeDraftResponse(result.draft),
  });
};

export const saveDocumentIntakeDraft = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  if (isDocumentIntakeLocked(document)) {
    return res.status(409).json({
      error: "conflict",
      message: "Intake is already submitted and cannot be modified",
      intakeStatus: document.intake_status,
    });
  }

  const parsed = documentIntakeDraftUpsertSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const documentProductFlowMode = document.product_flow_mode?.trim();
  const documentJurisdiction = document.jurisdiction?.trim();

  if (!documentProductFlowMode || !documentJurisdiction) {
    return res.status(400).json({
      error: "validation_error",
      message: "Document is missing product flow mode or jurisdiction",
      details: [
        {
          path: "document",
          message: "Document must include product_flow_mode and jurisdiction",
        },
      ],
    });
  }

  const rulesSnapshotVersion =
    parsed.data.rulesSnapshotVersion ?? "member_form_rules_contract_v1";
  const createdBy = document.owner_id;

  const saveInput: SaveDocumentIntakeDraftInput = {
    documentId: document.id,
    ownerId: document.owner_id,
    productFlowMode: documentProductFlowMode,
    jurisdiction: documentJurisdiction,
    rulesSnapshotVersion,
    answers: parsed.data.answers,
    createdBy,
    eventType: "autosave",
  };

  if (Object.prototype.hasOwnProperty.call(parsed.data, "currentStep")) {
    saveInput.currentStep = parsed.data.currentStep ?? null;
  }

  if (
    Object.prototype.hasOwnProperty.call(parsed.data, "canonicalAnswers") &&
    parsed.data.canonicalAnswers !== undefined
  ) {
    saveInput.canonicalAnswers = parsed.data.canonicalAnswers;
  }

  if (
    Object.prototype.hasOwnProperty.call(parsed.data, "expectedRevision") &&
    parsed.data.expectedRevision !== undefined
  ) {
    saveInput.expectedRevision = parsed.data.expectedRevision;
  }

  const result = await saveDocumentIntakeDraftToDb(saveInput);

  if (result.conflict) {
    return res.status(409).json({
      error: "conflict",
      message: "Draft revision mismatch",
      currentRevision: result.currentRevision,
    });
  }

  return res.status(200).json({
    draft: mapDocumentIntakeDraftResponse(result.draft),
  });
};

export const submitDocumentIntakeDraft = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  if (isDocumentIntakeLocked(document)) {
    return res.status(409).json({
      error: "conflict",
      message: "Intake is already submitted and cannot be modified",
      intakeStatus: document.intake_status,
    });
  }

  const parsed = documentIntakeSubmitSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const documentProductFlowMode = document.product_flow_mode?.trim();
  const documentJurisdiction = document.jurisdiction?.trim();

  if (!documentProductFlowMode || !documentJurisdiction) {
    return res.status(400).json({
      error: "validation_error",
      message: "Document is missing product flow mode or jurisdiction",
      details: [
        {
          path: "document",
          message: "Document must include product_flow_mode and jurisdiction",
        },
      ],
    });
  }

  const selection = await buildMemberFormSelectionForDocument(documentProductFlowMode);
  const rulesResult = await deriveMemberFormRulesByJurisdiction(
    documentJurisdiction,
    selection,
  );

  if (rulesResult.availabilityConflict) {
    return sendJurisdictionAvailabilityConflict(
      res,
      rulesResult.availabilityConflict,
    );
  }

  if (!rulesResult.contract || rulesResult.missing.length > 0) {
    return res.status(404).json({
      error: "not_found",
      message: "Member form requirements not found for one or more selected families",
      details: rulesResult.missing,
    });
  }

  const normalizedAnswers = toMemberFormSubmissionValueRecord(parsed.data.answers);
  const validation = validateMemberFormSubmission(
    rulesResult.contract,
    normalizedAnswers,
  );

  if (!validation.valid) {
    return res.status(422).json({
      valid: false,
      message: "Member form validation failed",
      errors: validation.errors,
    });
  }

  const rulesSnapshotVersion =
    parsed.data.rulesSnapshotVersion ?? "member_form_rules_contract_v1";
  const createdBy = document.owner_id;
  const canonicalPayload = buildCanonicalPayload(rulesResult.contract, parsed.data.answers);

  const saveInput: SaveDocumentIntakeDraftInput = {
    documentId: document.id,
    ownerId: document.owner_id,
    productFlowMode: documentProductFlowMode,
    jurisdiction: documentJurisdiction,
    rulesSnapshotVersion,
    answers: parsed.data.answers,
    canonicalAnswers: canonicalPayload,
    createdBy,
    eventType: "submit",
    validationResult: {
      valid: true,
      errors: [],
    },
  };

  if (Object.prototype.hasOwnProperty.call(parsed.data, "currentStep")) {
    saveInput.currentStep = parsed.data.currentStep ?? null;
  }

  if (
    Object.prototype.hasOwnProperty.call(parsed.data, "expectedRevision") &&
    parsed.data.expectedRevision !== undefined
  ) {
    saveInput.expectedRevision = parsed.data.expectedRevision;
  }

  const result = await saveDocumentIntakeDraftToDb(saveInput);

  if (result.conflict) {
    return res.status(409).json({
      error: "conflict",
      message: "Draft revision mismatch",
      currentRevision: result.currentRevision,
    });
  }

  const syncedParties = await syncDocumentPartiesFromCanonicalAnswers({
    documentId: document.id,
    canonicalAnswers: canonicalPayload,
  });

  logDocumentTrace("intake.submit", {
    documentId: document.id,
    intakeRevision: result.draft.revision,
    productFlowMode: documentProductFlowMode,
    jurisdiction: documentJurisdiction,
    currentStep: parsed.data.currentStep ?? result.draft.current_step ?? null,
    canonicalPayload,
    parties: syncedParties.map((party) => ({
      partyRole: party.party_role,
      fullName: party.full_name,
      isSigningParty: party.is_signing_party,
    })),
  });

  return res.status(200).json({
    draft: mapDocumentIntakeDraftResponse(result.draft),
    canonicalPayload,
  });
};

export const getDocumentIntakePayload = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  if (!isDocumentIntakeLocked(document)) {
    return res.status(409).json({
      error: "conflict",
      message: "Intake has not been submitted yet",
      intakeStatus: document.intake_status,
    });
  }

  const draft = await getDocumentIntakeDraftFromDb(document.id);
  if (!draft) {
    return res.status(404).json({
      error: "not_found",
      message: "Intake draft not found",
    });
  }

  return res.status(200).json({
    documentId: document.id,
    intakeStatus: document.intake_status,
    submittedAt: document.intake_submitted_at,
    payload: {
      jurisdiction: draft.jurisdiction,
      productFlowMode: draft.product_flow_mode,
      rulesSnapshotVersion: draft.rules_snapshot_version,
      revision: draft.revision,
      canonicalAnswers: draft.canonical_answers_json,
    },
  });
};

export const createDocumentGenerationRuns = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const parsed = createDocumentGenerationRunsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const result = await createGenerationRunsForDocument({
    document,
    ...(parsed.data.outputKeys ? { outputKeys: parsed.data.outputKeys } : {}),
    actorContext: buildAuditActorContext(req),
  });

  if (result.error) {
    return res.status(result.error.status).json(result.error.body);
  }

  return res.status(201).json({
    runs: result.runs.map(mapDocumentGenerationRunResponse),
  });
};

export const listDocumentGenerationRuns = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const runs = await listDocumentGenerationRunsFromDb(document.id);

  return res.status(200).json({
    runs: runs.map(mapDocumentGenerationRunResponse),
  });
};

export const getDocumentGenerationRun = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  if (typeof req.params.runId !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Generation run id is required",
    });
  }

  const run = await getDocumentGenerationRunById({
    runId: req.params.runId,
    documentId: document.id,
  });

  if (!run) {
    return res.status(404).json({
      error: "not_found",
      message: "Generation run not found",
    });
  }

  const includeDebug =
    req.query.includeDebug === "true" &&
    (req.user?.role === "admin" || req.user?.role === "service_role");
  const templateArtifact = run.template_artifact_id
    ? await getTemplateArtifactById(run.template_artifact_id)
    : null;
  const signerObligations = await listDocumentOutputSigners({
    documentId: document.id,
    generationRunId: run.id,
  });

  return res.status(200).json(
    mapDocumentGenerationRunDetailResponse(
      run,
      templateArtifact,
      signerObligations,
      includeDebug,
    ),
  );
};

export const cancelDocumentGenerationRun = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const parsed = generationRunCancelSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (typeof req.params.runId !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Generation run id is required",
    });
  }

  const run = await getDocumentGenerationRunById({
    runId: req.params.runId,
    documentId: document.id,
  });

  if (!run) {
    return res.status(404).json({
      error: "not_found",
      message: "Generation run not found",
    });
  }

  if (!transitionAllowed(run.status, "canceled")) {
    return res.status(409).json({
      error: "conflict",
      message: `Generation run in status ${run.status} cannot be canceled.`,
    });
  }

  if (run.status === "rendering") {
    return res.status(409).json({
      error: "conflict",
      message: "Rendering generation runs must be canceled through the internal service workflow.",
    });
  }

  const canceledRun = await updateDocumentGenerationRun(run.id, {
    status: "canceled",
    canceled_at: new Date().toISOString(),
    cancellation_reason: parsed.data.reason ?? null,
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "generation_run",
    entityId: canceledRun.id,
    action: "system.generation_run_canceled",
    metadata: {
      document_id: canceledRun.document_id,
      generation_run_id: canceledRun.id,
      cancellation_reason: canceledRun.cancellation_reason,
    },
  });

  const templateArtifact = canceledRun.template_artifact_id
    ? await getTemplateArtifactById(canceledRun.template_artifact_id)
    : null;
  const signerObligations = await listDocumentOutputSigners({
    documentId: document.id,
    generationRunId: canceledRun.id,
  });

  return res.status(200).json(
    mapDocumentGenerationRunDetailResponse(
      canceledRun,
      templateArtifact,
      signerObligations,
      false,
    ),
  );
};

export const claimNextDocumentGenerationRun = async (req: Request, res: Response) => {
  const parsed = generationRunClaimSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const rendererJobId = `${parsed.data.workerId}:${Date.now()}`;
  const run = await claimNextQueuedDocumentGenerationRun({ rendererJobId });
  if (!run) {
    return res.status(204).send();
  }

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "generation_run",
    entityId: run.id,
    action: "system.generation_run_render_started",
    metadata: {
      document_id: run.document_id,
      generation_run_id: run.id,
      renderer_job_id: run.renderer_job_id,
    },
  });

  return res.status(200).json({
    run: {
      id: run.id,
      status: run.status,
      rendererJobId: run.renderer_job_id,
      startedAt: run.started_at,
    },
  });
};

export const recheckDocumentGenerationRun = async (req: Request, res: Response) => {
  if (typeof req.params.runId !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Generation run id is required",
    });
  }

  const run = await getDocumentGenerationRunById({ runId: req.params.runId });
  if (!run) {
    return res.status(404).json({
      error: "not_found",
      message: "Generation run not found",
    });
  }

  if (run.status !== "blocked") {
    return res.status(409).json({
      error: "conflict",
      message: `Generation run in status ${run.status} cannot be rechecked.`,
    });
  }

  const document = await getDocumentById(run.document_id);
  const draft = await getDocumentIntakeDraftFromDb(run.document_id);

  if (!document || !draft) {
    return res.status(404).json({
      error: "not_found",
      message: "Document or intake draft not found for generation run",
    });
  }

  const selection = await buildMemberFormSelectionForDocument(draft.product_flow_mode);
  const rulesResult = await deriveMemberFormRulesByJurisdiction(
    draft.jurisdiction,
    selection,
  );

  if (rulesResult.availabilityConflict) {
    return sendJurisdictionAvailabilityConflict(res, rulesResult.availabilityConflict);
  }

  if (!rulesResult.contract || rulesResult.missing.length > 0) {
    return res.status(404).json({
      error: "not_found",
      message: "Member form requirements not found for one or more selected families",
      details: rulesResult.missing,
    });
  }

  const extractionPayload = await buildMemberFormDocumentExtractionPayload(
    rulesResult.contract,
  );
  const templateArtifact =
    run.template_key !== "unresolved_template"
      ? await getActiveTemplateArtifact({
          templateKey: run.template_key,
          templateVersion: run.template_version,
          templateHash: run.template_hash,
        })
      : null;

  const outputMetadata =
    parseOutputBundle(document.output_bundle).find(
      (entry) => entry.outputKey === run.output_key,
    )?.metadata ?? {};

  const preparedRun = await prepareGenerationRun({
    document,
    draft,
    outputKey: run.output_key,
    outputMetadata,
    ...(run.document_key ? { templateDocumentKey: run.document_key } : {}),
    templateResolved: run.template_key !== "unresolved_template",
    templateArtifact,
    templateKey: run.template_key,
    templateVersion: run.template_version,
    templateHash: run.template_hash,
    extractionPayload,
  });

  const updatedRun = await updateDocumentGenerationRun(run.id, {
    template_artifact_id: templateArtifact?.id ?? null,
    render_context_json: preparedRun.renderContext,
    blocking_requirements_json: preparedRun.blockingRequirements,
    resolved_sources_json: preparedRun.resolvedSources,
    status: preparedRun.status,
    blocked_at:
      preparedRun.status === "blocked"
        ? run.blocked_at ?? new Date().toISOString()
        : null,
    error_message: preparedRun.errorMessage,
  });

  await replaceDocumentOutputSigners({
    documentId: document.id,
    generationRunId: run.id,
    signers: preparedRun.signerObligations,
  });

  if (preparedRun.status === "queued") {
    await enqueueDocumentGenerationRun({
      runId: run.id,
    });
  }

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "generation_run",
    entityId: updatedRun.id,
    action:
      updatedRun.status === "blocked"
        ? "system.generation_run_blocked"
        : "system.generation_run_queued",
    metadata: {
      document_id: updatedRun.document_id,
      generation_run_id: updatedRun.id,
      blocker_count: preparedRun.blockingRequirements.length,
    },
  });

  const artifactForResponse = updatedRun.template_artifact_id
    ? await getTemplateArtifactById(updatedRun.template_artifact_id)
    : null;
  const signerObligations = await listDocumentOutputSigners({
    documentId: document.id,
    generationRunId: updatedRun.id,
  });

  return res.status(200).json(
    mapDocumentGenerationRunDetailResponse(
      updatedRun,
      artifactForResponse,
      signerObligations,
      true,
    ),
  );
};

export const completeDocumentGenerationRun = async (req: Request, res: Response) => {
  const parsed = generationRunCompleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (typeof req.params.runId !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Generation run id is required",
    });
  }

  const run = await getDocumentGenerationRunById({ runId: req.params.runId });
  if (!run) {
    return res.status(404).json({
      error: "not_found",
      message: "Generation run not found",
    });
  }

  if (!transitionAllowed(run.status, "rendered")) {
    return res.status(409).json({
      error: "conflict",
      message: `Generation run in status ${run.status} cannot be marked rendered.`,
    });
  }

  const version = await getDocumentVersionById(
    parsed.data.documentVersionId,
    run.document_id,
  );
  if (!version) {
    return res.status(404).json({
      error: "not_found",
      message: "Document version not found",
    });
  }

  if (version.generation_run_id !== run.id) {
    await updateDocumentVersion(version.id, {
      generation_run_id: run.id,
    });
  }

  const updatedRun = await updateDocumentGenerationRun(run.id, {
    status: "rendered",
    document_version_id: version.id,
    rendered_at: new Date().toISOString(),
    error_message: null,
    failure_code: null,
    failure_details_json: {},
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "generation_run",
    entityId: updatedRun.id,
    action: "system.generation_run_render_completed",
    metadata: {
      document_id: updatedRun.document_id,
      generation_run_id: updatedRun.id,
      document_version_id: version.id,
    },
  });

  const templateArtifact = updatedRun.template_artifact_id
    ? await getTemplateArtifactById(updatedRun.template_artifact_id)
    : null;
  const signerObligations = await listDocumentOutputSigners({
    documentId: updatedRun.document_id,
    generationRunId: updatedRun.id,
  });

  return res.status(200).json(
    mapDocumentGenerationRunDetailResponse(
      updatedRun,
      templateArtifact,
      signerObligations,
      true,
    ),
  );
};

export const failDocumentGenerationRun = async (req: Request, res: Response) => {
  const parsed = generationRunFailSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (typeof req.params.runId !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Generation run id is required",
    });
  }

  const run = await getDocumentGenerationRunById({ runId: req.params.runId });
  if (!run) {
    return res.status(404).json({
      error: "not_found",
      message: "Generation run not found",
    });
  }

  if (!transitionAllowed(run.status, "failed")) {
    return res.status(409).json({
      error: "conflict",
      message: `Generation run in status ${run.status} cannot be marked failed.`,
    });
  }

  const updatedRun = await updateDocumentGenerationRun(run.id, {
    status: "failed",
    failed_at: new Date().toISOString(),
    failure_code: parsed.data.failureCode ?? null,
    failure_details_json: parsed.data.failureDetails ?? {},
    error_message: parsed.data.message ?? run.error_message,
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "generation_run",
    entityId: updatedRun.id,
    action: "system.generation_run_failed",
    metadata: {
      document_id: updatedRun.document_id,
      generation_run_id: updatedRun.id,
      failure_code: updatedRun.failure_code,
    },
  });

  const templateArtifact = updatedRun.template_artifact_id
    ? await getTemplateArtifactById(updatedRun.template_artifact_id)
    : null;
  const signerObligations = await listDocumentOutputSigners({
    documentId: updatedRun.document_id,
    generationRunId: updatedRun.id,
  });

  return res.status(200).json(
    mapDocumentGenerationRunDetailResponse(
      updatedRun,
      templateArtifact,
      signerObligations,
      true,
    ),
  );
};

export const cancelDocumentGenerationRunInternal = async (
  req: Request,
  res: Response,
) => {
  const parsed = generationRunCancelSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (typeof req.params.runId !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Generation run id is required",
    });
  }

  const run = await getDocumentGenerationRunById({ runId: req.params.runId });
  if (!run) {
    return res.status(404).json({
      error: "not_found",
      message: "Generation run not found",
    });
  }

  if (!transitionAllowed(run.status, "canceled")) {
    return res.status(409).json({
      error: "conflict",
      message: `Generation run in status ${run.status} cannot be canceled.`,
    });
  }

  const updatedRun = await updateDocumentGenerationRun(run.id, {
    status: "canceled",
    canceled_at: new Date().toISOString(),
    cancellation_reason: parsed.data.reason ?? null,
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "generation_run",
    entityId: updatedRun.id,
    action: "system.generation_run_canceled",
    metadata: {
      document_id: updatedRun.document_id,
      generation_run_id: updatedRun.id,
      cancellation_reason: updatedRun.cancellation_reason,
    },
  });

  const templateArtifact = updatedRun.template_artifact_id
    ? await getTemplateArtifactById(updatedRun.template_artifact_id)
    : null;
  const signerObligations = await listDocumentOutputSigners({
    documentId: updatedRun.document_id,
    generationRunId: updatedRun.id,
  });

  return res.status(200).json(
    mapDocumentGenerationRunDetailResponse(
      updatedRun,
      templateArtifact,
      signerObligations,
      true,
    ),
  );
};

export const listDocuments = async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const role = req.user.role ?? "member";
  const ownerId =
    role === "admin" || role === "service_role"
      ? undefined
      : (await getUserIdBySupabaseId(req.user.id)) ?? undefined;

  if (!ownerId && role !== "admin" && role !== "service_role") {
    return res.status(403).json({
      error: "forbidden",
      message: "User not registered",
    });
  }

  const documents = await listDocumentsFromDb(ownerId);
  const summaries = await buildDocumentWorkspaceSummaries({
    documents,
    viewerRole: req.user?.role ?? "member",
  });

  res.status(200).json({
    documents: documents.map((document) => ({
      ...mapDocumentResponse(document, req.user?.role ?? "member"),
      summary: summaries.get(document.id) ?? null,
    })),
  });
};

export const listDocumentVersions = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const versions = await listDocumentVersionsFromDb(document.id);

  res.status(200).json({
    versions: versions.map((version) => ({
      id: version.id,
      version: version.version,
      storagePath: version.storage_path,
      fileName: version.file_name,
      mimeType: version.mime_type,
      sizeBytes: version.size_bytes,
      isFinal: version.is_final,
      createdAt: version.created_at,
    })),
  });
};

export const getDocumentParties = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const parties = await listDocumentPartiesFromDb(document.id);

  res.status(200).json({
    parties: parties.map(mapDocumentPartyResponse),
  });
};

export const updateDocumentParties = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const parsed = documentPartiesUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const sortOrderByRole = new Map<DocumentPartyRole, number>();
  const normalizedParties = parsed.data.parties.map((party) => {
    const role = party.partyRole as DocumentPartyRole;
    const sortOrder = sortOrderByRole.get(role) ?? 0;
    sortOrderByRole.set(role, sortOrder + 1);

    const email = party.email?.trim() ?? "";
    const phone = party.phone?.trim() ?? "";
    const phoneCountryCode = party.phoneCountryCode?.trim() || DEFAULT_PHONE_COUNTRY_CODE;

    return {
      party_role: role,
      full_name: party.fullName.trim(),
      email: email.length > 0 ? email : null,
      phone_country_code: phoneCountryCode,
      phone: phone.length > 0 ? phone : null,
      is_signing_party: Boolean(party.isSigningParty),
      sort_order: sortOrder,
      metadata: party.metadata ?? {},
    };
  });

  const updatedParties = await replaceDocumentParties({
    documentId: document.id,
    parties: normalizedParties,
  });

  res.status(200).json({
    parties: updatedParties.map(mapDocumentPartyResponse),
  });
};

export const getDocumentTimeline = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const [systemValues, request, finalizationStatusHistory] = await Promise.all([
    listDocumentSystemValues(document.id),
    getActiveNotarizationRequest(document.id),
    listFinalizationStatusHistory(document.id),
  ]);

  const workflowStatusHistory = request?.workflow_id
    ? await listWorkflowStatusHistory(request.workflow_id)
    : [];

  const timeline = buildDocumentTimeline({
    document,
    systemValues,
    request,
    workflowStatusHistory,
    finalizationStatusHistory,
  });

  res.status(200).json({ timeline });
};

export const getDocumentSignerObligations = async (
  req: Request,
  res: Response,
) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const generationRunId =
    typeof req.query.runId === "string" && req.query.runId.trim().length > 0
      ? req.query.runId.trim()
      : undefined;

  const signerObligations = await listDocumentOutputSigners({
    documentId: document.id,
    ...(generationRunId ? { generationRunId } : {}),
  });

  res.status(200).json({
    signerObligations: signerObligations.map(mapDocumentOutputSignerResponse),
  });
};

export const getSignatureFields = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  const explicitRunId =
    typeof req.query.runId === "string" && req.query.runId.trim().length > 0
      ? req.query.runId.trim()
      : null;

  const latestRunId = explicitRunId
    ? explicitRunId
    : (await listDocumentGenerationRunsFromDb(document.id))[0]?.id ?? null;

  const signerObligations = latestRunId
    ? await listDocumentOutputSigners({
        documentId: document.id,
        generationRunId: latestRunId,
      })
    : [];

  const fields = signerObligations
    .filter((signer) => signer.obligation_type === "signer")
    .map((signer, index) => {
      const placement = parseSignatureFieldPlacement(signer.metadata.signatureField);

      return {
        id: `signature-field-${signer.id}`,
        generationRunId: signer.generation_run_id,
        partyName: signer.party_name,
        partyRole: signer.party_role,
        signingGroup: signer.signing_group,
        pageNumber: placement?.pageNumber ?? 1,
        x: placement?.signatureRect.x ?? 72,
        y: placement?.signatureRect.y ?? 160 + index * 56,
        width: placement?.signatureRect.width ?? 240,
        height: placement?.signatureRect.height ?? 40,
        required: signer.is_required,
      };
    });

  res.status(200).json({
    generationRunId: latestRunId,
    fields,
  });
};

export const listSavedSignatures = async (req: Request, res: Response) => {
  try {
    const signingAccess = await getAuthorizedSigningAccess(req, res);
    if (!signingAccess) {
      return;
    }

    const savedSignatures = await listCapturedSignaturesForSigner({
      signerId: signingAccess.signerUserId,
      limit: 24,
    });

    return res.status(200).json({
      savedSignatures: await Promise.all(
        savedSignatures.map((signature) => mapSavedSignatureResponse(signature)),
      ),
    });
  } catch (error) {
    return sendSigningEndpointFailure(res, error, {
      route: "list_saved_signatures",
      documentId: typeof req.params.id === "string" ? req.params.id : null,
      actorSupabaseId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
    });
  }
};

export const getDocumentSigning = async (req: Request, res: Response) => {
  try {
    const signingAccess = await getAuthorizedSigningAccess(req, res);
    if (!signingAccess) {
      return;
    }
    const { document } = signingAccess;

    if (!ensureDocumentReadableForSigning(res, document)) {
      return;
    }

    let signing = await ensureSigningState({
      document,
      viewerRole: req.user?.role ?? "member",
      actorContext: buildAuditActorContext(req),
    });

    if (
      signing.state === "preparing" &&
      (await processQueuedSigningOutputsInline({
        document,
        signing,
      }))
    ) {
      signing = await ensureSigningState({
        document,
        viewerRole: req.user?.role ?? "member",
        actorContext: buildAuditActorContext(req),
      });
    }

    const scopedSigning = scopeSigningStateForAccess(signing, signingAccess);

    return res.status(200).json({
      document: mapDocumentResponse(document, req.user?.role ?? "member"),
      signing: {
        state: scopedSigning.state,
        reviewApproval: scopedSigning.reviewApproval,
        signingExecution: scopedSigning.signingExecution,
        approvedOutputKeys: scopedSigning.approvedOutputKeys,
        outputs: scopedSigning.outputs,
        pendingOutputs: scopedSigning.pendingOutputs,
        missingOutputKeys: scopedSigning.missingOutputKeys,
        requiresGeneration: scopedSigning.requiresGeneration,
        allOutputsReady: scopedSigning.allOutputsReady,
        signatures: scopedSigning.signatures,
        groups: scopedSigning.groups,
        completion: scopedSigning.completion,
        viewerAccess: mapSigningViewerAccess(signingAccess),
      },
    });
  } catch (error) {
    return sendSigningEndpointFailure(res, error, {
      route: "get_document_signing",
      documentId: typeof req.params.id === "string" ? req.params.id : null,
      actorSupabaseId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
    });
  }
};

export const signDocument = async (req: Request, res: Response) => {
  const parsed = signDocumentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  if (!ensureDocumentReadyForSignature(res, document)) {
    return;
  }
  const signing = await ensureSigningState({
    document,
    viewerRole: req.user?.role ?? "member",
    actorContext: buildAuditActorContext(req),
  });

  if (signing.signingExecution?.confirmedAt) {
    return res.status(200).json({
      status: "ok",
      signingExecution: signing.signingExecution,
      completion: signing.completion,
    });
  }

  if (!signing.completion.canConfirm) {
    return res.status(409).json({
      error: "conflict",
      message: "All required signing outputs and signatures must be complete before confirming",
      completion: signing.completion,
      pendingOutputs: signing.pendingOutputs,
      signatures: signing.signatures,
    });
  }

  const confirmedAt = new Date().toISOString();
  const signingExecution = {
    confirmedAt,
    confirmedBySupabaseId: req.user?.id ?? null,
    confirmedByRole: req.user?.role ?? null,
    generationRunIds: Array.from(
      new Set(
        signing.outputs
          .map((output) => output.generationRunId)
          .filter((generationRunId): generationRunId is string => typeof generationRunId === "string"),
      ),
    ),
    completedOutputSignerIds: signing.signatures
      .filter((signature) => signature.status === "captured")
      .map((signature) => signature.outputSignerId),
    completedSignatureIds: signing.signatures
      .map((signature) => signature.signatureId)
      .filter((signatureId): signatureId is string => typeof signatureId === "string"),
  } satisfies SigningExecutionValue;

  await upsertDocumentSystemValues({
    documentId: document.id,
    values: [
      {
        systemKey: "signature_execution",
        value: signingExecution,
        source: "signature_execution",
        metadata: {
          confirmedAt,
        },
      },
    ],
  });

  await recordAuditEvent({
    ...buildAuditActorContext(req),
    entityType: "document",
    entityId: document.id,
    action: "member.document_signatures_confirmed",
    metadata: {
      document_id: document.id,
      confirmed_at: confirmedAt,
      generation_run_ids: signingExecution.generationRunIds,
      completed_output_signer_ids: signingExecution.completedOutputSignerIds,
      completed_signature_ids: signingExecution.completedSignatureIds,
    },
  });

  await queueMemberSignaturesRecordedNotification({
    documentId: document.id,
    confirmedAt,
    requestedBySupabaseUserId: req.user?.id,
  });

  return res.status(200).json({
    status: "ok",
    signingExecution,
    completion: signing.completion,
  });
};

const mapCapturedSignatureResponse = async (signatureRecord: SignatureRecord) => {
  const assetDownloadUrl = await createSignatureAssetDownloadUrl({
    signature: signatureRecord,
    feature: "signature_capture_response",
  });

  return {
    signature: {
      id: signatureRecord.id,
      documentId: signatureRecord.document_id,
      generationRunId: signatureRecord.generation_run_id,
      outputSignerId: signatureRecord.document_output_signer_id,
      status: signatureRecord.status,
      captureMethod: signatureRecord.capture_method,
      typedValue: signatureRecord.typed_value,
      typedKind: signatureRecord.typed_kind,
      storagePath: signatureRecord.storage_path,
      assetDownloadUrl,
      mimeType: signatureRecord.mime_type,
      sizeBytes: signatureRecord.size_bytes,
      capturedAt: signatureRecord.captured_at,
    },
  };
};

const completeSignatureCapture = async (input: {
  document: DocumentRecord;
  signatureTask: SigningSignatureResponse;
  signatureRecord: SignatureRecord;
  actorContext: { actorSupabaseId?: string; actorRole?: string };
  actorUserId: string | null;
  actorEmail: string | null;
}) => {
  await applySignatureCaptureToDocumentOutput({
    document: input.document,
    generationRunId: input.signatureTask.generationRunId,
    outputSignerId: input.signatureTask.outputSignerId,
    signatureRecord: input.signatureRecord,
    actorContext: input.actorContext,
  });

  await recordAuditEvent({
    ...input.actorContext,
    entityType: "signature",
    entityId: input.signatureRecord.id,
    action: "member.signature_capture_completed",
    metadata: {
      signature_id: input.signatureRecord.id,
      document_id: input.document.id,
      generation_run_id: input.signatureTask.generationRunId,
      output_signer_id: input.signatureTask.outputSignerId,
      capture_method: input.signatureRecord.capture_method,
      storage_path: input.signatureRecord.storage_path,
      typed_value: input.signatureRecord.typed_value,
      mime_type: input.signatureRecord.mime_type,
      file_size: input.signatureRecord.size_bytes,
    },
  });

  await recordAuditEvent({
    ...input.actorContext,
    entityType: "signature",
    entityId: input.signatureRecord.id,
    action: "system.signature_linked_to_document",
    metadata: {
      signature_id: input.signatureRecord.id,
      document_id: input.document.id,
      generation_run_id: input.signatureTask.generationRunId,
      output_signer_id: input.signatureTask.outputSignerId,
    },
  });

  let remainingSignerInvites: RemainingSignerInviteDispatchResult | null = null;
  let signingCompletion: Awaited<
    ReturnType<typeof completeSigningWorkflowAfterSignatureCapture>
  > | null = null;
  try {
    remainingSignerInvites = await queueRemainingSignerInvitesAfterCreatorSignature({
      documentId: input.document.id,
      actorUserId: input.actorUserId,
      actorEmail: input.actorEmail,
      completedOutputSignerId: input.signatureTask.outputSignerId,
      completedSignatureId: input.signatureRecord.id,
    });

    if (remainingSignerInvites.failures.length > 0) {
      await recordAuditEvent({
        ...input.actorContext,
        entityType: "document",
        entityId: input.document.id,
        action: "system.remaining_signer_invite_dispatch_failed",
        metadata: {
          document_id: input.document.id,
          signature_id: input.signatureRecord.id,
          output_signer_id: input.signatureTask.outputSignerId,
          failures: remainingSignerInvites.failures,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("Remaining signer invite dispatch failed", {
      documentId: input.document.id,
      signatureId: input.signatureRecord.id,
      outputSignerId: input.signatureTask.outputSignerId,
      error: errorMessage,
    });
    await recordAuditEvent({
      ...input.actorContext,
      entityType: "document",
      entityId: input.document.id,
      action: "system.remaining_signer_invite_dispatch_failed",
      metadata: {
        document_id: input.document.id,
        signature_id: input.signatureRecord.id,
        output_signer_id: input.signatureTask.outputSignerId,
        error: errorMessage,
      },
    });
  }

  try {
    signingCompletion = await completeSigningWorkflowAfterSignatureCapture({
      documentId: input.document.id,
      completedOutputSignerId: input.signatureTask.outputSignerId,
      completedSignatureId: input.signatureRecord.id,
      signatureRecord: input.signatureRecord,
      actorSupabaseId: input.actorContext.actorSupabaseId ?? null,
      actorRole: input.actorContext.actorRole ?? null,
    });

    if (
      signingCompletion?.signingExecution.persisted ||
      signingCompletion?.documentStatus.updated
    ) {
      await recordAuditEvent({
        ...input.actorContext,
        entityType: "document",
        entityId: input.document.id,
        action: "system.signature_completion_workflow_applied",
        metadata: {
          document_id: input.document.id,
          signature_id: input.signatureRecord.id,
          output_signer_id: input.signatureTask.outputSignerId,
          all_signer_requirements_satisfied:
            signingCompletion.allSignerRequirementsSatisfied,
          remaining_signer_count: signingCompletion.remainingSignerCount,
          completed_invite_ids: signingCompletion.completedInviteIds,
          signing_execution_persisted: signingCompletion.signingExecution.persisted,
          previous_status: signingCompletion.documentStatus.previousStatus,
          next_status: signingCompletion.documentStatus.nextStatus,
          status_updated: signingCompletion.documentStatus.updated,
          requires_notarization: signingCompletion.documentStatus.requiresNotarization,
        },
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn("Signing completion workflow failed", {
      documentId: input.document.id,
      signatureId: input.signatureRecord.id,
      outputSignerId: input.signatureTask.outputSignerId,
      error: errorMessage,
    });
    await recordAuditEvent({
      ...input.actorContext,
      entityType: "document",
      entityId: input.document.id,
      action: "system.signature_completion_workflow_failed",
      metadata: {
        document_id: input.document.id,
        signature_id: input.signatureRecord.id,
        output_signer_id: input.signatureTask.outputSignerId,
        error: errorMessage,
      },
    });
  }

  const signatureResponse = await mapCapturedSignatureResponse(input.signatureRecord);
  const inviteDispatchResponse = mapRemainingSignerInviteDispatchResponse(remainingSignerInvites);
  const signingCompletionResponse = signingCompletion
    ? {
        allSignerRequirementsSatisfied:
          signingCompletion.allSignerRequirementsSatisfied,
        remainingSignerCount: signingCompletion.remainingSignerCount,
        completedInviteIds: signingCompletion.completedInviteIds,
        documentStatus: signingCompletion.documentStatus,
        signingExecution: signingCompletion.signingExecution,
        notifications: signingCompletion.notifications,
      }
    : null;

  return {
    ...signatureResponse,
    ...(inviteDispatchResponse ? { remainingSignerInvites: inviteDispatchResponse } : {}),
    ...(signingCompletionResponse ? { signingCompletion: signingCompletionResponse } : {}),
  };
};

export const captureSignature = async (req: Request, res: Response) => {
  const parsed = signatureCaptureSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const signingAccess = await getAuthorizedSigningAccess(req, res);
  if (!signingAccess) {
    return;
  }
  const { document } = signingAccess;

  if (!ensureDocumentReadyForSignature(res, document)) {
    return;
  }

  const actorContext = buildAuditActorContext(req);
  const actorUserId = await resolveRequestActorUserId(req);
  const { signingState, signatureTask } = await resolveSigningSignatureTarget({
    document,
    generationRunId: parsed.data.generationRunId,
    outputSignerId: parsed.data.outputSignerId,
    viewerRole: req.user?.role ?? "member",
    actorContext,
  });

  if (signingState.signingExecution?.confirmedAt) {
    return res.status(409).json({
      error: "conflict",
      message: "Signing has already been confirmed for this document",
    });
  }

  if (!signatureTask) {
    return res.status(404).json({
      error: "not_found",
      message: "Signature obligation not found for the prepared signing set",
    });
  }

  if (!ensureSigningAccessAllowsSignature(signingAccess, signatureTask.outputSignerId)) {
    return res.status(404).json({
      error: "not_found",
      message: "Signature obligation not found for the prepared signing set",
    });
  }

  const signatureId = randomUUID();
  const capturedAt = new Date().toISOString();
  const metadata = {
    outputKey: signatureTask.outputKey,
    outputLabel: signatureTask.outputLabel,
    documentKey: signatureTask.documentKey,
    partyName: signatureTask.partyName,
    partyRole: signatureTask.partyRole,
  };

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signatureId,
    action: "member.signature_capture_started",
    metadata: {
      signature_id: signatureId,
      document_id: document.id,
      generation_run_id: signatureTask.generationRunId,
      output_signer_id: signatureTask.outputSignerId,
      capture_method: parsed.data.captureMethod,
      ip_address: req.ip,
    },
  });

  let signatureRecord: SignatureRecord;

  if (parsed.data.captureMethod === "type") {
    signatureRecord = await createSignatureRecord({
      signatureId,
      documentId: document.id,
      generationRunId: parsed.data.generationRunId,
      documentOutputSignerId: parsed.data.outputSignerId,
      signerId: signingAccess.signerUserId,
      captureMethod: "type",
      typedValue: parsed.data.typedValue?.trim() ?? null,
      typedKind: parsed.data.typedKind ?? "name",
      status: "captured",
      metadata,
      capturedAt,
    });
  } else if (parsed.data.captureMethod === "saved") {
    const savedSignatureId = parsed.data.savedSignatureId;
    if (!savedSignatureId) {
      return res.status(400).json({
        error: "validation_error",
        message: "Saved signature id is required",
      });
    }

    const savedSignature = await getSignatureRecordById(savedSignatureId);

    if (
      !savedSignature ||
      savedSignature.signer_id !== signingAccess.signerUserId ||
      savedSignature.status !== "captured"
    ) {
      return res.status(404).json({
        error: "not_found",
        message: "Saved signature not found",
      });
    }

    if (
      savedSignature.capture_method === "type" &&
      (!savedSignature.typed_value || savedSignature.typed_value.trim().length === 0)
    ) {
      return res.status(409).json({
        error: "conflict",
        message: "Saved signature is missing its typed value",
      });
    }

    if (
      (savedSignature.capture_method === "upload" || savedSignature.capture_method === "draw") &&
      !savedSignature.storage_path
    ) {
      return res.status(409).json({
        error: "conflict",
        message: "Saved signature asset could not be resolved",
      });
    }

    signatureRecord = await createSignatureRecord({
      signatureId,
      documentId: document.id,
      generationRunId: parsed.data.generationRunId,
      documentOutputSignerId: parsed.data.outputSignerId,
      signerId: signingAccess.signerUserId,
      storagePath: savedSignature.storage_path,
      captureMethod:
        savedSignature.capture_method === "upload" || savedSignature.capture_method === "draw"
          ? savedSignature.capture_method
          : "type",
      typedValue: savedSignature.typed_value,
      typedKind:
        savedSignature.typed_kind === "name" || savedSignature.typed_kind === "initials"
          ? savedSignature.typed_kind
          : null,
      mimeType: savedSignature.mime_type,
      sizeBytes: savedSignature.size_bytes,
      status: "captured",
      metadata: {
        ...metadata,
        savedSignatureId: savedSignature.id,
      },
      capturedAt,
    });
  } else {
    const parsedImage = parseSignatureImageDataUrl(parsed.data.imageDataUrl ?? "");
    if (!parsedImage) {
      return res.status(400).json({
        error: "validation_error",
        message: "Unsupported drawn signature payload",
        details: [
          {
            path: "imageDataUrl",
            message: "Drawn signature must be a PNG or JPEG data URL under 5 MB",
          },
        ],
      });
    }

    const extension = SIGNATURE_EXTENSION_MAP[parsedImage.mimeType] ?? "png";
    const storagePath = `signatures/${document.id}/${parsed.data.generationRunId}/${signatureId}.${extension}`;

    await uploadSignatureAsset({
      storagePath,
      content: parsedImage.content,
      contentType: parsedImage.mimeType,
    });

    signatureRecord = await createSignatureRecord({
      signatureId,
      documentId: document.id,
      generationRunId: parsed.data.generationRunId,
      documentOutputSignerId: parsed.data.outputSignerId,
      signerId: signingAccess.signerUserId,
      storagePath,
      captureMethod: "draw",
      mimeType: parsedImage.mimeType,
      sizeBytes: parsedImage.content.byteLength,
      status: "captured",
      metadata,
      capturedAt,
    });
  }

  return res.status(201).json(
    await completeSignatureCapture({
      document,
      signatureTask,
      signatureRecord,
      actorContext,
      actorUserId,
      actorEmail: req.user?.email ?? null,
    }),
  );
};

export const requestSignatureUpload = async (req: Request, res: Response) => {
  const parsed = signatureRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const signingAccess = await getAuthorizedSigningAccess(req, res);
  if (!signingAccess) {
    return;
  }
  const { document } = signingAccess;

  if (!ensureDocumentReadyForSignature(res, document)) {
    return;
  }

  const actorContext = buildAuditActorContext(req);
  const { signingState, signatureTask } = await resolveSigningSignatureTarget({
    document,
    generationRunId: parsed.data.generationRunId,
    outputSignerId: parsed.data.outputSignerId,
    viewerRole: req.user?.role ?? "member",
    actorContext,
  });

  if (signingState.signingExecution?.confirmedAt) {
    return res.status(409).json({
      error: "conflict",
      message: "Signing has already been confirmed for this document",
    });
  }

  if (!signatureTask) {
    return res.status(404).json({
      error: "not_found",
      message: "Signature obligation not found for the prepared signing set",
    });
  }

  if (!ensureSigningAccessAllowsSignature(signingAccess, signatureTask.outputSignerId)) {
    return res.status(404).json({
      error: "not_found",
      message: "Signature obligation not found for the prepared signing set",
    });
  }

  const signatureId = randomUUID();
  const normalizedMimeType = parsed.data.mimeType.toLowerCase();
  const extension = SIGNATURE_EXTENSION_MAP[normalizedMimeType] ?? "png";
  const storagePath = `signatures/${document.id}/${parsed.data.generationRunId}/${signatureId}.${extension}`;
  const upload = await createSignatureUploadUrl(storagePath);
  const signatureRecord = await createSignatureRecord({
    signatureId,
    documentId: document.id,
    generationRunId: parsed.data.generationRunId,
    documentOutputSignerId: parsed.data.outputSignerId,
    signerId: signingAccess.signerUserId,
    storagePath,
    captureMethod: "upload",
    mimeType: normalizedMimeType,
    sizeBytes: parsed.data.fileSize,
    status: "upload_pending",
    metadata: {
      outputKey: signatureTask.outputKey,
      outputLabel: signatureTask.outputLabel,
      documentKey: signatureTask.documentKey,
      partyName: signatureTask.partyName,
      partyRole: signatureTask.partyRole,
      fileName: parsed.data.fileName ?? null,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signatureRecord.id,
    action: "member.signature_capture_started",
    metadata: {
      signature_id: signatureRecord.id,
      document_id: document.id,
      generation_run_id: parsed.data.generationRunId,
      output_signer_id: parsed.data.outputSignerId,
      storage_path: signatureRecord.storage_path,
      file_name: parsed.data.fileName ?? null,
      file_size: parsed.data.fileSize,
      mime_type: normalizedMimeType,
      ip_address: req.ip,
    },
  });

  res.status(201).json({
    signature: {
      id: signatureRecord.id,
      documentId: signatureRecord.document_id,
      generationRunId: signatureRecord.generation_run_id,
      outputSignerId: signatureRecord.document_output_signer_id,
      storagePath: signatureRecord.storage_path,
      status: signatureRecord.status,
    },
    upload: {
      bucket: upload.bucket,
      path: upload.path,
      signedUrl: upload.signedUrl,
      token: upload.token,
    },
  });
};

export const finalizeSignatureUpload = async (req: Request, res: Response) => {
  const parsed = signatureFinalizeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const signingAccess = await getAuthorizedSigningAccess(req, res);
  if (!signingAccess) {
    return;
  }
  const { document } = signingAccess;

  if (!ensureDocumentReadyForSignature(res, document)) {
    return;
  }

  const actorContext = buildAuditActorContext(req);
  const actorUserId = await resolveRequestActorUserId(req);
  const { signingState, signatureTask } = await resolveSigningSignatureTarget({
    document,
    generationRunId: parsed.data.generationRunId,
    outputSignerId: parsed.data.outputSignerId,
    viewerRole: req.user?.role ?? "member",
    actorContext,
  });

  if (signingState.signingExecution?.confirmedAt) {
    return res.status(409).json({
      error: "conflict",
      message: "Signing has already been confirmed for this document",
    });
  }

  if (!signatureTask) {
    return res.status(404).json({
      error: "not_found",
      message: "Signature obligation not found for the prepared signing set",
    });
  }

  if (!ensureSigningAccessAllowsSignature(signingAccess, signatureTask.outputSignerId)) {
    return res.status(404).json({
      error: "not_found",
      message: "Signature obligation not found for the prepared signing set",
    });
  }

  const signature = await getSignatureById(parsed.data.signatureId, document.id);
  if (
    !signature ||
    !signature.storage_path ||
    signature.signer_id !== signingAccess.signerUserId ||
    signature.generation_run_id !== parsed.data.generationRunId ||
    signature.document_output_signer_id !== parsed.data.outputSignerId
  ) {
    return res.status(404).json({
      error: "not_found",
      message: "Signature not found",
    });
  }

  const objectMetadata = await getSignatureObjectMetadata(
    signature.storage_path
  );
  if (!objectMetadata) {
    return res.status(404).json({
      error: "not_found",
      message: "Uploaded file not found",
    });
  }

  const normalizedMimeType =
    objectMetadata.mimeType?.toLowerCase() ?? "";
  if (!ALLOWED_SIGNATURE_MIME_TYPES.has(normalizedMimeType)) {
    return res.status(400).json({
      error: "validation_error",
      message: "Unsupported signature file type",
      details: [
        {
          path: "mimeType",
          message: "Unsupported signature file type",
        },
      ],
    });
  }

  if (typeof objectMetadata.sizeBytes !== "number") {
    return res.status(400).json({
      error: "validation_error",
      message: "File size metadata is missing",
      details: [
        {
          path: "fileSize",
          message: "File size metadata is missing",
        },
      ],
    });
  }

  if (objectMetadata.sizeBytes > MAX_SIGNATURE_BYTES) {
    return res.status(400).json({
      error: "validation_error",
      message: "Signature exceeds 5 MB limit",
      details: [
        {
          path: "fileSize",
          message: "Signature exceeds 5 MB limit",
        },
      ],
    });
  }

  const capturedAt = new Date().toISOString();
  const updatedSignature = await updateSignatureRecord(signature.id, document.id, {
    mimeType: normalizedMimeType,
    sizeBytes: objectMetadata.sizeBytes,
    status: "captured",
    capturedAt,
  });

  return res.status(200).json(
    await completeSignatureCapture({
      document,
      signatureTask,
      signatureRecord: updatedSignature,
      actorContext,
      actorUserId,
      actorEmail: req.user?.email ?? null,
    }),
  );
};

export const submitNotarization = async (req: Request, res: Response) => {
  const parsed = submitNotarizationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  if (typeof req.params.id !== "string") {
    return res.status(400).json({
      error: "validation_error",
      message: "Document id is required",
      details: [
        {
          path: "id",
          message: "Document id is required",
        },
      ],
    });
  }

  const documentId = req.params.id;
  const document = await getDocumentById(documentId);
  if (!document) {
    return res.status(404).json({
      error: "not_found",
      message: "Document not found",
    });
  }

  const role = req.user.role ?? "member";
  const actorUserId = await getUserIdBySupabaseId(req.user.id);
  if (role !== "admin" && role !== "service_role") {
    if (!actorUserId || document.owner_id !== actorUserId) {
      return res.status(404).json({
        error: "not_found",
        message: "Document not found",
      });
    }
  }

  const selectedNotaryUserId = parsed.data.selectedNotaryUserId?.trim() || null;
  if (selectedNotaryUserId) {
    const selectedNotaryContext = await getUserIdentityContextByUserId(
      selectedNotaryUserId,
    );
    const selectedNotaryHasActiveAssignment =
      selectedNotaryContext?.roleAssignments.some(
        (assignment) => assignment.role === "notary" && assignment.status === "active",
      ) ?? false;

    if (!selectedNotaryContext || !selectedNotaryHasActiveAssignment) {
      return res.status(400).json({
        error: "validation_error",
        message: "Selected notary must be an active notary user",
        details: [
          {
            path: "selectedNotaryUserId",
            message: "Selected notary must be an active notary user",
          },
        ],
      });
    }
  }

  if (document.status !== "pending_signature" && document.status !== "pending_notary") {
    return res.status(400).json({
      error: "validation_error",
      message: "Document is not ready for notarization",
      details: [
        {
          path: "status",
          message: "Document is not ready for notarization",
        },
      ],
    });
  }

  const existing = await getActiveNotarizationRequest(documentId);
  if (existing) {
    return res.status(409).json({
      error: "conflict",
      message: "Notarization request already exists",
    });
  }

  const actorContext = buildAuditActorContext(req);

  await recordAuditEvent({
    ...actorContext,
    entityType: "notarization_request",
    entityId: null,
    action: "member.notarization_submit_started",
    metadata: {
      document_id: documentId,
      selected_notary_user_id: selectedNotaryUserId,
    },
  });

  const submittedAt = new Date().toISOString();
  const workflow = await createIlluminotarizationWorkflow({
    ownerUserId: document.owner_id,
    createdByUserId: actorUserId,
    primaryDocumentId: documentId,
    status: "submitted",
    selectedNotaryUserId,
    submittedAt,
    contextJson: {
      compatibilityMode: "legacy_request_bridge",
      selectedNotaryLocked: Boolean(selectedNotaryUserId),
    },
    metadata: {
      source: "documents.submit-notarization",
      actorRole: req.user.role ?? null,
    },
  });

  const request = await createNotarizationRequest({
    documentId,
    submittedAt,
    workflowId: workflow.id,
  });

  if (selectedNotaryUserId) {
    await upsertIlluminotarizationWorkflowAssignment({
      workflowId: workflow.id,
      assignmentKind: "selected_notary",
      userId: selectedNotaryUserId,
      assignedByUserId: actorUserId,
      assignmentSource: "member_selection",
      metadata: {
        requestId: request.id,
        documentId,
      },
    });
  }

  await createIlluminotarizationWorkflowDocument({
    workflowId: workflow.id,
    documentId,
    notarizationRequestId: request.id,
    bundleRole: "primary",
    isPrimary: true,
    sortOrder: 0,
    metadata: {
      source: "documents.submit-notarization",
    },
  });

  await createIlluminotarizationWorkflowStatusHistoryEntry({
    workflowId: workflow.id,
    nextStatus: "submitted",
    changedByUserId: actorUserId,
    changeSource: "submit_notarization",
    changeReason: "Document submitted into illuminotarization workflow",
    legacyRequestId: request.id,
    metadata: {
      documentId,
      selectedNotaryUserId,
    },
  });

  await updateDocument(documentId, { status: "pending_notary" });

  const ttlMinutes = Number(process.env.NOTARIZATION_CODE_TTL_MINUTES ?? 30);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  let codeRecord = null as Awaited<ReturnType<typeof createNotarizationCode>> | null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = `NTR-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      codeRecord = await createNotarizationCode({
        requestId: request.id,
        workflowId: workflow.id,
        code,
        expiresAt,
      });
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  if (!codeRecord) {
    throw new Error("Failed to generate illuminotarization code");
  }

  await recordAuditEvent({
    ...actorContext,
    entityType: "notarization_request",
    entityId: request.id,
    action: "member.notarization_submitted",
    metadata: {
      request_id: request.id,
      document_id: documentId,
      workflow_id: workflow.id,
      selected_notary_user_id: selectedNotaryUserId,
      submitted_at: submittedAt,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "illuminotarization_code",
    entityId: codeRecord.id,
    action: "system.code_generated",
    metadata: {
      code_id: codeRecord.id,
      request_id: request.id,
      workflow_id: workflow.id,
      expires_at: codeRecord.expires_at,
    },
  });

  const deliveredAt = new Date().toISOString();
  const notaryNextStepJob = await queueNotaryNextStepNotification({
    documentId,
    requestId: request.id,
    codeId: codeRecord.id,
    codeValue: codeRecord.code,
    expiresAt: codeRecord.expires_at,
    deliveryReason: "initial_submit",
    requestedBySupabaseUserId: req.user?.id,
  });

  await createCodeDeliveryRecord({
    workflowId: workflow.id,
    legacyRequestId: request.id,
    illuminotarizationCodeId: codeRecord.id,
    notificationJobId: notaryNextStepJob?.jobId ?? null,
    recipientUserId: document.owner_id,
    channel: "email",
    deliveryMethod: "notification_outbox",
    deliveryReason: "initial_submit",
    status: "delivered",
    codeValueSnapshot: codeRecord.code,
    expiresAt: codeRecord.expires_at,
    deliveredAt,
    metadata: {
      source: "documents.submit-notarization",
      selectedNotaryUserId,
    },
  });

  const workflowAfterCodeDelivery = await transitionIlluminotarizationWorkflowStatus({
    workflowId: workflow.id,
    nextStatus: "code_delivered",
    changedByUserId: actorUserId,
    changeSource: "code_delivery",
    changeReason: "Initial illuminotarization code delivered to document owner",
    legacyRequestId: request.id,
    metadata: {
      codeId: codeRecord.id,
      deliveryReason: "initial_submit",
    },
    workflowUpdates: {
      currentLegacyRequestId: request.id,
      lastCodeGeneratedAt: codeRecord.created_at,
      submittedAt,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "illuminotarization_code",
    entityId: codeRecord.id,
    action: "system.code_delivered",
    metadata: {
      code_id: codeRecord.id,
      request_id: request.id,
      workflow_id: workflow.id,
      delivery_method: "notification_outbox_email",
      delivery_reason: "initial_submit",
      delivered_at: deliveredAt,
    },
  });

  if (selectedNotaryUserId) {
    await recordAuditEvent({
      ...actorContext,
      entityType: "illuminotarization_workflow",
      entityId: workflow.id,
      action: "member.notary_selected",
      metadata: {
        workflow_id: workflow.id,
        request_id: request.id,
        document_id: documentId,
        selected_notary_user_id: selectedNotaryUserId,
      },
    });
  }

  await queueNotarizationSubmissionConfirmationNotification({
    documentId,
    requestId: request.id,
    requestedBySupabaseUserId: req.user?.id,
  });

  const { webhookUrl } = parsed.data;
  if (webhookUrl) {
    await enqueueWebhook({
      url: webhookUrl,
      payload: {
        requestId: request.id,
        documentId,
        workflowId: workflow.id,
        selectedNotaryUserId,
        code: codeRecord.code,
        expiresAt,
        productFlowMode: document.product_flow_mode,
        selectedFamilies: document.selected_families,
        outputBundle: document.output_bundle,
      },
    });
  }

  res.status(201).json({
    request: {
      id: request.id,
      documentId: request.document_id,
      workflowId: request.workflow_id,
      status: request.status,
      submittedAt: request.submitted_at,
    },
    document: {
      id: documentId,
      status: "pending_notary",
    },
    code: {
      id: codeRecord.id,
      code: codeRecord.code,
      status: codeRecord.status,
      expiresAt: codeRecord.expires_at,
    },
    workflow: buildIlluminotarizationWorkflowResponse(workflowAfterCodeDelivery),
  });
};

export const appendAcknowledgment = async (req: Request, res: Response) => {
  if (!req.user?.id && req.user?.role !== "service_role") {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  if (typeof req.params.id !== "string" || req.params.id.trim().length === 0) {
    return res.status(400).json({
      error: "validation_error",
      message: "Document id is required",
      details: [
        {
          path: "id",
          message: "Document id is required",
        },
      ],
    });
  }

  try {
    const result = await appendAcknowledgmentPageToDocument({
      documentId: req.params.id.trim(),
      actorSupabaseId: req.user?.id,
      actorRole: req.user?.role ?? null,
    });

    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "acknowledgment_page",
      entityId: result.acknowledgmentPage.id,
      action: "system.ack_template_selected",
      metadata: {
        request_id: result.request.id,
        document_id: result.document.id,
        jurisdiction: result.acknowledgmentPage.jurisdiction,
        template_id: result.execution.template_id,
        template_version: result.execution.template_version,
      },
    });
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "acknowledgment_page",
      entityId: result.acknowledgmentPage.id,
      action: "system.ack_page_generated",
      metadata: {
        request_id: result.request.id,
        document_id: result.document.id,
        acknowledgment_page_id: result.acknowledgmentPage.id,
      },
    });
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "document_version",
      entityId: result.version.id,
      action: "system.ack_page_appended",
      metadata: {
        request_id: result.request.id,
        document_id: result.document.id,
        document_version_id: result.version.id,
        execution_run_id: result.execution.id,
      },
    });

    return res.status(200).json({
      status: "ok",
      documentId: result.document.id,
      requestId: result.request.id,
      acknowledgmentPage: {
        id: result.acknowledgmentPage.id,
        jurisdiction: result.acknowledgmentPage.jurisdiction,
        content: result.acknowledgmentPage.content,
        createdAt: result.acknowledgmentPage.created_at,
      },
      execution: mapDocumentFinalizationExecutionSummary(result.execution),
      version: mapDocumentVersionSummary(result.version),
    });
  } catch (error) {
    return sendDocumentFinalizationError(res, error);
  }
};

export const watermarkDocument = async (req: Request, res: Response) => {
  if (!req.user?.id && req.user?.role !== "service_role") {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  if (typeof req.params.id !== "string" || req.params.id.trim().length === 0) {
    return res.status(400).json({
      error: "validation_error",
      message: "Document id is required",
      details: [
        {
          path: "id",
          message: "Document id is required",
        },
      ],
    });
  }

  try {
    const result = await finalizeDocumentWithWatermark({
      documentId: req.params.id.trim(),
      actorSupabaseId: req.user?.id,
      actorRole: req.user?.role ?? null,
    });
    const ledgerStatus = result.ledgerAnchorAttempt?.status ?? "anchored";

    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "document_version",
      entityId: result.version.id,
      action: "system.watermark_started",
      metadata: {
        request_id: result.request.id,
        document_id: result.document.id,
        document_version_id: result.version.id,
        watermark_text: result.execution.watermark_text,
      },
    });
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "document_version",
      entityId: result.version.id,
      action: "system.watermark_completed",
      metadata: {
        request_id: result.request.id,
        document_id: result.document.id,
        document_version_id: result.version.id,
        watermark_text: result.execution.watermark_text,
      },
    });
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "document_version",
      entityId: result.version.id,
      action: "system.notarized_document_created",
      metadata: {
        request_id: result.request.id,
        document_id: result.document.id,
        document_version_id: result.version.id,
        storage_path: result.version.storage_path,
        is_final: result.version.is_final,
      },
    });
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "ledger_entry",
      entityId: result.ledgerEntry.id,
      action: "system.hashing_completed",
      metadata: {
        request_id: result.request.id,
        document_id: result.document.id,
        document_version_id: result.version.id,
        hash: result.hashRecord.hash,
        hash_algorithm: result.hashRecord.algorithm,
      },
    });
    await recordAuditEvent({
      ...buildAuditActorContext(req),
      entityType: "ledger_entry",
      entityId: result.ledgerEntry.id,
      action: "system.ledger_anchor_completed",
      metadata: {
        request_id: result.request.id,
        ledger_entry_id: result.ledgerEntry.id,
        document_id: result.document.id,
        idn: result.ledgerEntry.idn,
        hash: result.ledgerEntry.hash,
        ledger_tx_id: result.ledgerEntry.ledger_tx_id,
        anchored_at: result.ledgerEntry.anchored_at,
        status: ledgerStatus,
      },
    });

    return res.status(200).json({
      status: "ok",
      documentId: result.document.id,
      requestId: result.request.id,
      execution: mapDocumentFinalizationExecutionSummary(result.execution),
      version: mapDocumentVersionSummary(result.version),
      hashRecord: {
        id: result.hashRecord.id,
        algorithm: result.hashRecord.algorithm,
        hash: result.hashRecord.hash,
        status: result.hashRecord.status,
        completedAt: result.hashRecord.completed_at,
      },
      ledger: {
        id: result.ledgerEntry.id,
        ledgerTxId: result.ledgerEntry.ledger_tx_id,
        anchoredAt: result.ledgerEntry.anchored_at,
        status: ledgerStatus,
      },
    });
  } catch (error) {
    return sendDocumentFinalizationError(res, error);
  }
};
