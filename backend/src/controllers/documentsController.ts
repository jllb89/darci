import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueueDocumentGenerationRun, enqueueWebhook } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";
import { recordAuditEvent } from "../services/auditService";
import {
  bootstrapDocumentIntakeDraft as bootstrapDocumentIntakeDraftFromDb,
  claimNextQueuedDocumentGenerationRun,
  createDocumentGenerationRun,
  type DocumentGenerationRunRecord,
  type GenerationRunStatus,
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
  getDocumentVersionById,
  getActiveNotarizationRequest,
  listDocumentGenerationRuns as listDocumentGenerationRunsFromDb,
  getSignatureById,
  getOrCreateUserId,
  getUserIdBySupabaseId,
  listDocumentParties as listDocumentPartiesFromDb,
  listDocuments as listDocumentsFromDb,
  listDocumentOutputSigners,
  listDocumentVersions as listDocumentVersionsFromDb,
  replaceDocumentOutputSigners,
  replaceDocumentParties,
  saveDocumentIntakeDraft as saveDocumentIntakeDraftToDb,
  updateDocumentGenerationRun,
  updateDocument,
  updateDocumentVersion,
} from "../services/documentService";
import {
  mapDocumentOutputSignerResponse,
  prepareGenerationRun,
  syncDocumentPartiesFromCanonicalAnswers,
} from "../services/documentGenerationService";
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
  createDocumentUploadUrl,
  createSignatureUploadUrl,
  getDocumentObjectMetadata,
  getSignatureObjectMetadata,
} from "../services/storageService";
import {
  buildSelectionForMode,
  productFlowModeKeys,
  resolveExpectedOutputsForMode,
} from "../services/productFlowModeService";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SIGNATURE_MIME_TYPES = new Set([
  "image/png",
  "image/svg+xml",
  "image/jpeg",
]);
const SIGNATURE_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
};
const DEFAULT_PHONE_COUNTRY_CODE = "+1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneCountryCodePattern = /^\+\d{1,4}$/;

const documentPartyRoles = [
  "principal",
  "agent",
  "successor_agent",
  "grantor",
  "trustee",
  "successor_trustee",
] as const;

const documentFlowFamilies = ["poa", "trust", "idn"] as const;

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
}) => {
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
    idn: document.idn,
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
  })
  .passthrough();

const finalizeUploadSchema = z
  .object({
    documentVersionId: z.string().min(1),
  })
  .passthrough();

const submitNotarizationSchema = z.object({
  webhookUrl: z.string().url().optional(),
}).passthrough();

const signatureRequestSchema = z
  .object({
    fileName: z.string().optional(),
    fileSize: z.number().int().positive().max(MAX_SIGNATURE_BYTES),
    mimeType: z.string().min(1),
  })
  .refine((data) => ALLOWED_SIGNATURE_MIME_TYPES.has(data.mimeType), {
    path: ["mimeType"],
    message: "Unsupported signature file type",
  })
  .passthrough();

const signatureFinalizeSchema = z
  .object({
    signatureId: z.string().min(1),
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

const parseOutputBundle = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as Array<{
      outputKey: string;
      outputLabel: string;
      isRequired: boolean;
      sortOrder: number;
      metadata: Record<string, unknown>;
    }>;
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
    document: mapDocumentResponse(document),
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
    document: mapDocumentResponse(bootstrapResult.document),
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

  const objectMetadata = await getDocumentObjectMetadata(version.storage_path);
  if (!objectMetadata) {
    return res.status(404).json({
      error: "not_found",
      message: "Uploaded file not found",
    });
  }

  const normalizedMimeType =
    objectMetadata.mimeType?.toLowerCase() ?? "";
  if (normalizedMimeType !== "application/pdf") {
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

  if (objectMetadata.sizeBytes > MAX_UPLOAD_BYTES) {
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
    mime_type: normalizedMimeType || version.mime_type,
    size_bytes: objectMetadata.sizeBytes,
    file_name: version.file_name,
  });

  let updatedDocument = document;
  if (!document.idn) {
    const idn = `IDN-${randomUUID().slice(0, 8).toUpperCase()}`;
    updatedDocument = await updateDocument(document.id, {
      idn,
      status: "pending_signature",
    });
  } else if (document.status !== "pending_signature") {
    updatedDocument = await updateDocument(document.id, {
      status: "pending_signature",
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

  if (!document.idn && updatedDocument.idn) {
    await recordAuditEvent({
      ...actorContext,
      entityType: "document",
      entityId: updatedDocument.id,
      action: "system.document_idn_assigned",
      metadata: {
        document_id: updatedDocument.id,
        idn: updatedDocument.idn,
        idn_algorithm_version: "v1",
      },
    });
  }

  res.status(200).json({
    document: mapDocumentResponse(updatedDocument),
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

export const getDocument = async (req: Request, res: Response) => {
  const document = await getAuthorizedDocument(req, res);
  if (!document) {
    return;
  }

  res.status(200).json({
    document: mapDocumentResponse(document),
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

  await syncDocumentPartiesFromCanonicalAnswers({
    documentId: document.id,
    canonicalAnswers: canonicalPayload,
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

  if (!isDocumentIntakeLocked(document)) {
    return res.status(409).json({
      error: "conflict",
      message: "Intake must be submitted before creating generation runs",
      intakeStatus: document.intake_status,
    });
  }

  const parsed = createDocumentGenerationRunsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const draft = await getDocumentIntakeDraftFromDb(document.id);
  if (!draft) {
    return res.status(404).json({
      error: "not_found",
      message: "Intake draft not found",
    });
  }

  const outputBundle = parseOutputBundle(document.output_bundle);
  const requestedOutputKeys = parsed.data.outputKeys ?? [];
  const selectedOutputBundle =
    requestedOutputKeys.length > 0
      ? outputBundle.filter((output) => requestedOutputKeys.includes(output.outputKey))
      : outputBundle;

  if (selectedOutputBundle.length === 0) {
    return res.status(400).json({
      error: "validation_error",
      message: "No eligible outputs found to create generation runs",
    });
  }

  const missingOutputKeys = requestedOutputKeys.filter(
    (outputKey) => !outputBundle.some((entry) => entry.outputKey === outputKey),
  );

  if (missingOutputKeys.length > 0) {
    return res.status(400).json({
      error: "validation_error",
      message: "One or more requested output keys are not configured for this document",
      details: missingOutputKeys.map((outputKey) => ({
        path: "outputKeys",
        message: `Unsupported output key: ${outputKey}`,
      })),
    });
  }

  const selection = await buildMemberFormSelectionForDocument(draft.product_flow_mode);
  const rulesResult = await deriveMemberFormRulesByJurisdiction(
    draft.jurisdiction,
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

  const extractionPayload = await buildMemberFormDocumentExtractionPayload(
    rulesResult.contract,
  );

  const runs: ReturnType<typeof mapDocumentGenerationRunResponse>[] = [];
  const actorContext = buildAuditActorContext(req);

  for (const output of selectedOutputBundle) {
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
      document,
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

    const run = await createDocumentGenerationRun({
      documentId: preparedRun.document.id,
      intakeRevision: draft.revision,
      outputKey: output.outputKey,
      documentKey: preparedRun.documentKey,
      templateKey: template?.template_key ?? "unresolved_template",
      templateVersion: template?.template_version ?? "unresolved",
      templateHash: template?.template_hash ?? "unresolved",
      templateArtifactId: templateArtifact?.id ?? null,
      payload: {
        documentId: preparedRun.document.id,
        jurisdiction: draft.jurisdiction,
        productFlowMode: draft.product_flow_mode,
        rulesSnapshotVersion: draft.rules_snapshot_version,
        revision: draft.revision,
        canonicalAnswers: draft.canonical_answers_json,
      },
      coverage: coverageSnapshot,
      renderContext: preparedRun.renderContext,
      blockingRequirements: preparedRun.blockingRequirements,
      resolvedSources: preparedRun.resolvedSources,
      status: preparedRun.status,
      blockedAt:
        preparedRun.status === "blocked" ? new Date().toISOString() : null,
      errorMessage: preparedRun.errorMessage,
    });

    await replaceDocumentOutputSigners({
      documentId: preparedRun.document.id,
      generationRunId: run.id,
      signers: preparedRun.signerObligations,
    });

    if (preparedRun.status === "queued") {
      await enqueueDocumentGenerationRun({
        runId: run.id,
      });
    }

    await recordAuditEvent({
      ...actorContext,
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

    runs.push(mapDocumentGenerationRunResponse(run));
  }

  return res.status(201).json({
    runs,
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

  res.status(200).json({
    documents: documents.map((document) => mapDocumentResponse(document)),
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
  res.status(200).json({
    timeline: [
      {
        action: "submitted",
        timestamp: new Date().toISOString(),
        actorId: "TODO_ACTOR_ID",
      },
    ],
  });
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
    .map((signer, index) => ({
      id: `signature-field-${signer.id}`,
      generationRunId: signer.generation_run_id,
      partyName: signer.party_name,
      partyRole: signer.party_role,
      signingGroup: signer.signing_group,
      pageNumber: 1,
      x: 72,
      y: 160 + index * 56,
      width: 240,
      height: 36,
      required: signer.is_required,
    }));

  res.status(200).json({
    generationRunId: latestRunId,
    fields,
  });
};

export const signDocument = async (req: Request, res: Response) => {
  const signatureId = randomUUID();
  const signatureMethod =
    typeof req.body?.signatureMethod === "string"
      ? req.body.signatureMethod
      : "draw";
  const deviceType =
    typeof req.body?.deviceType === "string" ? req.body.deviceType : null;
  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};
  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signatureId,
    action: "member.signature_capture_started",
    metadata: {
      document_id: req.params.id,
      signature_method: signatureMethod,
      device_type: deviceType,
      ip_address: req.ip,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signatureId,
    action: "member.signature_capture_completed",
    metadata: {
      signature_id: signatureId,
      document_id: req.params.id,
      storage_path: `signatures/${req.params.id}/signature.png`,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signatureId,
    action: "system.signature_linked_to_document",
    metadata: {
      signature_id: signatureId,
      document_id: req.params.id,
    },
  });

  res.status(200).json({
    status: "ok",
    message: `TODO: capture member signature for ${req.params.id}`,
    signatureId,
  });
};

export const requestSignatureUpload = async (req: Request, res: Response) => {
  const parsed = signatureRequestSchema.safeParse(req.body ?? {});
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
  if (role !== "admin" && role !== "service_role") {
    const ownerId = await getUserIdBySupabaseId(req.user.id);
    if (!ownerId || document.owner_id !== ownerId) {
      return res.status(404).json({
        error: "not_found",
        message: "Document not found",
      });
    }
  }

  const signatureId = randomUUID();
  const extension =
    SIGNATURE_EXTENSION_MAP[parsed.data.mimeType] ?? "png";
  const storagePath = `signatures/${documentId}/${signatureId}.${extension}`;
  const upload = await createSignatureUploadUrl(storagePath);
  const signatureRecord = await createSignatureRecord({
    signatureId,
    documentId,
    signerId: document.owner_id,
    storagePath,
  });

  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};
  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signatureRecord.id,
    action: "member.signature_capture_started",
    metadata: {
      signature_id: signatureRecord.id,
      document_id: documentId,
      storage_path: signatureRecord.storage_path,
      file_name: parsed.data.fileName ?? null,
      file_size: parsed.data.fileSize,
      mime_type: parsed.data.mimeType,
      ip_address: req.ip,
    },
  });

  res.status(201).json({
    signature: {
      id: signatureRecord.id,
      documentId: signatureRecord.document_id,
      storagePath: signatureRecord.storage_path,
      status: "upload_pending",
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
  if (role !== "admin" && role !== "service_role") {
    const ownerId = await getUserIdBySupabaseId(req.user.id);
    if (!ownerId || document.owner_id !== ownerId) {
      return res.status(404).json({
        error: "not_found",
        message: "Document not found",
      });
    }
  }

  const signature = await getSignatureById(parsed.data.signatureId, documentId);
  if (!signature || !signature.storage_path) {
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

  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};
  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signature.id,
    action: "member.signature_capture_completed",
    metadata: {
      signature_id: signature.id,
      document_id: documentId,
      storage_path: signature.storage_path,
      file_size: objectMetadata.sizeBytes,
      mime_type: normalizedMimeType,
    },
  });

  await recordAuditEvent({
    ...actorContext,
    entityType: "signature",
    entityId: signature.id,
    action: "system.signature_linked_to_document",
    metadata: {
      signature_id: signature.id,
      document_id: documentId,
    },
  });

  res.status(200).json({
    signature: {
      id: signature.id,
      documentId,
      storagePath: signature.storage_path,
      status: "captured",
    },
  });
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
  if (role !== "admin" && role !== "service_role") {
    const ownerId = await getUserIdBySupabaseId(req.user.id);
    if (!ownerId || document.owner_id !== ownerId) {
      return res.status(404).json({
        error: "not_found",
        message: "Document not found",
      });
    }
  }

  if (document.status !== "pending_signature") {
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

  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};
  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }

  await recordAuditEvent({
    ...actorContext,
    entityType: "notarization_request",
    entityId: null,
    action: "member.notarization_submit_started",
    metadata: {
      document_id: documentId,
    },
  });

  const submittedAt = new Date().toISOString();
  const request = await createNotarizationRequest({
    documentId,
    submittedAt,
  });

  await updateDocument(documentId, { status: "pending_notary" });

  const ttlMinutes = Number(process.env.NOTARIZATION_CODE_TTL_MINUTES ?? 30);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  let codeRecord = null as
    | Awaited<ReturnType<typeof createNotarizationCode>>
    | null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = `NTR-${randomUUID().slice(0, 8).toUpperCase()}`;
    try {
      codeRecord = await createNotarizationCode({
        requestId: request.id,
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

  await recordAuditEvent({
    ...actorContext,
    entityType: "notarization_request",
    entityId: request.id,
    action: "member.notarization_submitted",
    metadata: {
      request_id: request.id,
      document_id: documentId,
      submitted_at: submittedAt,
    },
  });

  if (codeRecord) {
    await recordAuditEvent({
      ...actorContext,
      entityType: "illuminotarization_code",
      entityId: codeRecord.id,
      action: "system.code_generated",
      metadata: {
        code_id: codeRecord.id,
        request_id: request.id,
        expires_at: codeRecord.expires_at,
      },
    });

    await recordAuditEvent({
      ...actorContext,
      entityType: "illuminotarization_code",
      entityId: codeRecord.id,
      action: "system.code_delivered",
      metadata: {
        code_id: codeRecord.id,
        delivery_method: "in_app",
        delivered_at: new Date().toISOString(),
      },
    });
  }

  const { webhookUrl } = parsed.data;
  if (webhookUrl) {
    await enqueueWebhook({
      url: webhookUrl,
      payload: {
        requestId: request.id,
        documentId,
        code: codeRecord?.code ?? null,
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
      status: request.status,
      submittedAt: request.submitted_at,
    },
    document: {
      id: documentId,
      status: "pending_notary",
    },
    code: codeRecord
      ? {
          id: codeRecord.id,
          code: codeRecord.code,
          status: codeRecord.status,
          expiresAt: codeRecord.expires_at,
        }
      : null,
  });
};

export const appendAcknowledgment = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: `TODO: append acknowledgment page and notice for ${req.params.id}`,
  });
};

export const watermarkDocument = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: `TODO: watermark document with IDN and notice for ${req.params.id}`,
  });
};
