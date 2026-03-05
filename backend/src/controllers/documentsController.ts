import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { enqueueWebhook } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";
import { recordAuditEvent } from "../services/auditService";
import {
  createDocumentWithVersion,
  createSignatureRecord,
  getDocumentById,
  getDocumentVersionById,
  getSignatureById,
  getOrCreateUserId,
  getUserIdBySupabaseId,
  listDocuments as listDocumentsFromDb,
  listDocumentVersions as listDocumentVersionsFromDb,
  updateDocument,
  updateDocumentVersion,
} from "../services/documentService";
import {
  createDocumentUploadUrl,
  createSignatureUploadUrl,
  getDocumentObjectMetadata,
  getSignatureObjectMetadata,
} from "../services/storageService";

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

const createDocumentSchema = z
  .object({
    title: z.string().optional(),
    templateId: z.string().optional(),
    documentType: z.string().optional(),
    jurisdiction: z.string().optional(),
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
    document: {
      id: document.id,
      idn: document.idn,
      status: document.status,
      documentType: document.document_type,
      jurisdiction: document.jurisdiction,
      createdAt: document.created_at,
    },
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
    document: {
      id: updatedDocument.id,
      idn: updatedDocument.idn,
      status: updatedDocument.status,
      documentType: updatedDocument.document_type,
      jurisdiction: updatedDocument.jurisdiction,
      createdAt: updatedDocument.created_at,
    },
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

export const getDocument = async (req: Request, res: Response) => {
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

  res.status(200).json({
    document: {
      id: document.id,
      idn: document.idn,
      status: document.status,
      documentType: document.document_type,
      jurisdiction: document.jurisdiction,
      createdAt: document.created_at,
    },
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
    documents: documents.map((document) => ({
      id: document.id,
      idn: document.idn,
      status: document.status,
      documentType: document.document_type,
      jurisdiction: document.jurisdiction,
      createdAt: document.created_at,
    })),
  });
};

export const listDocumentVersions = async (req: Request, res: Response) => {
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

  const versions = await listDocumentVersionsFromDb(documentId);

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

  const { webhookUrl } = parsed.data;
  const webhookJobId = webhookUrl
    ? await enqueueWebhook({
        url: webhookUrl,
        payload: { documentId: req.params.id, status: "submitted" },
      })
    : null;

  res.status(200).json({
    status: "ok",
    message: `TODO: submit notarization request and issue code for ${req.params.id}`,
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
