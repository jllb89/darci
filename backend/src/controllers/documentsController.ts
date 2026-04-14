import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueueWebhook } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";
import { recordAuditEvent } from "../services/auditService";
import {
  createDocumentWithVersion,
  type DocumentPartyRecord,
  type DocumentPartyRole,
  createSignatureRecord,
  createNotarizationCode,
  createNotarizationRequest,
  getDocumentById,
  getDocumentVersionById,
  getActiveNotarizationRequest,
  getSignatureById,
  getOrCreateUserId,
  getUserIdBySupabaseId,
  listDocumentParties as listDocumentPartiesFromDb,
  listDocuments as listDocumentsFromDb,
  listDocumentVersions as listDocumentVersionsFromDb,
  replaceDocumentParties,
  updateDocument,
  updateDocumentVersion,
} from "../services/documentService";
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
    req.user.role
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
  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};
  if (req.user?.id) {
    actorContext.actorSupabaseId = req.user.id;
  }
  if (req.user?.role) {
    actorContext.actorRole = req.user.role;
  }

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

export const getSignatureFields = async (req: Request, res: Response) => {
  res.status(200).json({
    fields: [
      {
        id: "TODO_FIELD_ID",
        pageNumber: 1,
        x: 100,
        y: 200,
        width: 150,
        height: 40,
        required: true,
      },
    ],
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
