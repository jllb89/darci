"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watermarkDocument = exports.appendAcknowledgment = exports.submitNotarization = exports.finalizeSignatureUpload = exports.requestSignatureUpload = exports.signDocument = exports.getSignatureFields = exports.getDocumentTimeline = exports.listDocumentVersions = exports.listDocuments = exports.getDocument = exports.finalizeDocumentUpload = exports.createDocument = void 0;
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const jobs_1 = require("../worker/jobs");
const validation_1 = require("../utils/validation");
const auditService_1 = require("../services/auditService");
const documentService_1 = require("../services/documentService");
const storageService_1 = require("../services/storageService");
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SIGNATURE_MIME_TYPES = new Set([
    "image/png",
    "image/svg+xml",
    "image/jpeg",
]);
const SIGNATURE_EXTENSION_MAP = {
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/jpeg": "jpg",
};
const createDocumentSchema = zod_1.z
    .object({
    title: zod_1.z.string().optional(),
    templateId: zod_1.z.string().optional(),
    documentType: zod_1.z.string().optional(),
    jurisdiction: zod_1.z.string().optional(),
    fileName: zod_1.z.string().min(1),
    fileSize: zod_1.z.number().int().positive().max(MAX_UPLOAD_BYTES),
    mimeType: zod_1.z.string().min(1),
})
    .refine((data) => data.mimeType.toLowerCase() === "application/pdf", {
    path: ["mimeType"],
    message: "Only application/pdf is supported",
})
    .passthrough();
const finalizeUploadSchema = zod_1.z
    .object({
    documentVersionId: zod_1.z.string().min(1),
})
    .passthrough();
const submitNotarizationSchema = zod_1.z.object({
    webhookUrl: zod_1.z.string().url().optional(),
}).passthrough();
const signatureRequestSchema = zod_1.z
    .object({
    fileName: zod_1.z.string().optional(),
    fileSize: zod_1.z.number().int().positive().max(MAX_SIGNATURE_BYTES),
    mimeType: zod_1.z.string().min(1),
})
    .refine((data) => ALLOWED_SIGNATURE_MIME_TYPES.has(data.mimeType), {
    path: ["mimeType"],
    message: "Unsupported signature file type",
})
    .passthrough();
const signatureFinalizeSchema = zod_1.z
    .object({
    signatureId: zod_1.z.string().min(1),
})
    .passthrough();
const createDocument = async (req, res) => {
    const parsed = createDocumentSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
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
    const ownerId = await (0, documentService_1.getOrCreateUserId)(req.user.id, req.user.email, req.user.role);
    const documentId = (0, crypto_1.randomUUID)();
    const storagePath = `${ownerId}/${documentId}/v1/source.pdf`;
    const { document, version } = await (0, documentService_1.createDocumentWithVersion)({
        documentId,
        ownerId,
        documentType,
        jurisdiction,
        storagePath,
        fileName: parsed.data.fileName,
        fileSize: parsed.data.fileSize,
        mimeType: parsed.data.mimeType,
    });
    const upload = await (0, storageService_1.createDocumentUploadUrl)(storagePath);
    const actorContext = {};
    if (req.user?.id) {
        actorContext.actorSupabaseId = req.user.id;
    }
    if (req.user?.role) {
        actorContext.actorRole = req.user.role;
    }
    await (0, auditService_1.recordAuditEvent)({
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
    await (0, auditService_1.recordAuditEvent)({
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
exports.createDocument = createDocument;
const finalizeDocumentUpload = async (req, res) => {
    const parsed = finalizeUploadSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    if (!req.user?.id) {
        return res.status(401).json({
            error: "unauthorized",
            message: "Missing user context",
        });
    }
    const ownerId = await (0, documentService_1.getUserIdBySupabaseId)(req.user.id);
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
    const document = await (0, documentService_1.getDocumentById)(documentId);
    if (!document || document.owner_id !== ownerId) {
        return res.status(404).json({
            error: "not_found",
            message: "Document not found",
        });
    }
    const version = await (0, documentService_1.getDocumentVersionById)(parsed.data.documentVersionId, documentId);
    if (!version || !version.storage_path) {
        return res.status(404).json({
            error: "not_found",
            message: "Document version not found",
        });
    }
    const objectMetadata = await (0, storageService_1.getDocumentObjectMetadata)(version.storage_path);
    if (!objectMetadata) {
        return res.status(404).json({
            error: "not_found",
            message: "Uploaded file not found",
        });
    }
    const normalizedMimeType = objectMetadata.mimeType?.toLowerCase() ?? "";
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
    const updatedVersion = await (0, documentService_1.updateDocumentVersion)(version.id, {
        mime_type: normalizedMimeType || version.mime_type,
        size_bytes: objectMetadata.sizeBytes,
        file_name: version.file_name,
    });
    let updatedDocument = document;
    if (!document.idn) {
        const idn = `IDN-${(0, crypto_1.randomUUID)().slice(0, 8).toUpperCase()}`;
        updatedDocument = await (0, documentService_1.updateDocument)(document.id, {
            idn,
            status: "pending_signature",
        });
    }
    else if (document.status !== "pending_signature") {
        updatedDocument = await (0, documentService_1.updateDocument)(document.id, {
            status: "pending_signature",
        });
    }
    const actorContext = {};
    if (req.user?.id) {
        actorContext.actorSupabaseId = req.user.id;
    }
    if (req.user?.role) {
        actorContext.actorRole = req.user.role;
    }
    await (0, auditService_1.recordAuditEvent)({
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
        await (0, auditService_1.recordAuditEvent)({
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
exports.finalizeDocumentUpload = finalizeDocumentUpload;
const getDocument = async (req, res) => {
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
    const document = await (0, documentService_1.getDocumentById)(documentId);
    if (!document) {
        return res.status(404).json({
            error: "not_found",
            message: "Document not found",
        });
    }
    const role = req.user.role ?? "member";
    if (role !== "admin" && role !== "service_role") {
        const ownerId = await (0, documentService_1.getUserIdBySupabaseId)(req.user.id);
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
exports.getDocument = getDocument;
const listDocuments = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            error: "unauthorized",
            message: "Missing user context",
        });
    }
    const role = req.user.role ?? "member";
    const ownerId = role === "admin" || role === "service_role"
        ? undefined
        : (await (0, documentService_1.getUserIdBySupabaseId)(req.user.id)) ?? undefined;
    if (!ownerId && role !== "admin" && role !== "service_role") {
        return res.status(403).json({
            error: "forbidden",
            message: "User not registered",
        });
    }
    const documents = await (0, documentService_1.listDocuments)(ownerId);
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
exports.listDocuments = listDocuments;
const listDocumentVersions = async (req, res) => {
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
    const document = await (0, documentService_1.getDocumentById)(documentId);
    if (!document) {
        return res.status(404).json({
            error: "not_found",
            message: "Document not found",
        });
    }
    const role = req.user.role ?? "member";
    if (role !== "admin" && role !== "service_role") {
        const ownerId = await (0, documentService_1.getUserIdBySupabaseId)(req.user.id);
        if (!ownerId || document.owner_id !== ownerId) {
            return res.status(404).json({
                error: "not_found",
                message: "Document not found",
            });
        }
    }
    const versions = await (0, documentService_1.listDocumentVersions)(documentId);
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
exports.listDocumentVersions = listDocumentVersions;
const getDocumentTimeline = async (req, res) => {
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
exports.getDocumentTimeline = getDocumentTimeline;
const getSignatureFields = async (req, res) => {
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
exports.getSignatureFields = getSignatureFields;
const signDocument = async (req, res) => {
    const signatureId = (0, crypto_1.randomUUID)();
    const signatureMethod = typeof req.body?.signatureMethod === "string"
        ? req.body.signatureMethod
        : "draw";
    const deviceType = typeof req.body?.deviceType === "string" ? req.body.deviceType : null;
    const actorContext = {};
    if (req.user?.id) {
        actorContext.actorSupabaseId = req.user.id;
    }
    if (req.user?.role) {
        actorContext.actorRole = req.user.role;
    }
    await (0, auditService_1.recordAuditEvent)({
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
    await (0, auditService_1.recordAuditEvent)({
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
    await (0, auditService_1.recordAuditEvent)({
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
exports.signDocument = signDocument;
const requestSignatureUpload = async (req, res) => {
    const parsed = signatureRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
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
    const document = await (0, documentService_1.getDocumentById)(documentId);
    if (!document) {
        return res.status(404).json({
            error: "not_found",
            message: "Document not found",
        });
    }
    const role = req.user.role ?? "member";
    if (role !== "admin" && role !== "service_role") {
        const ownerId = await (0, documentService_1.getUserIdBySupabaseId)(req.user.id);
        if (!ownerId || document.owner_id !== ownerId) {
            return res.status(404).json({
                error: "not_found",
                message: "Document not found",
            });
        }
    }
    const signatureId = (0, crypto_1.randomUUID)();
    const extension = SIGNATURE_EXTENSION_MAP[parsed.data.mimeType] ?? "png";
    const storagePath = `signatures/${documentId}/${signatureId}.${extension}`;
    const upload = await (0, storageService_1.createSignatureUploadUrl)(storagePath);
    const signatureRecord = await (0, documentService_1.createSignatureRecord)({
        signatureId,
        documentId,
        signerId: document.owner_id,
        storagePath,
    });
    const actorContext = {};
    if (req.user?.id) {
        actorContext.actorSupabaseId = req.user.id;
    }
    if (req.user?.role) {
        actorContext.actorRole = req.user.role;
    }
    await (0, auditService_1.recordAuditEvent)({
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
exports.requestSignatureUpload = requestSignatureUpload;
const finalizeSignatureUpload = async (req, res) => {
    const parsed = signatureFinalizeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
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
    const document = await (0, documentService_1.getDocumentById)(documentId);
    if (!document) {
        return res.status(404).json({
            error: "not_found",
            message: "Document not found",
        });
    }
    const role = req.user.role ?? "member";
    if (role !== "admin" && role !== "service_role") {
        const ownerId = await (0, documentService_1.getUserIdBySupabaseId)(req.user.id);
        if (!ownerId || document.owner_id !== ownerId) {
            return res.status(404).json({
                error: "not_found",
                message: "Document not found",
            });
        }
    }
    const signature = await (0, documentService_1.getSignatureById)(parsed.data.signatureId, documentId);
    if (!signature || !signature.storage_path) {
        return res.status(404).json({
            error: "not_found",
            message: "Signature not found",
        });
    }
    const objectMetadata = await (0, storageService_1.getSignatureObjectMetadata)(signature.storage_path);
    if (!objectMetadata) {
        return res.status(404).json({
            error: "not_found",
            message: "Uploaded file not found",
        });
    }
    const normalizedMimeType = objectMetadata.mimeType?.toLowerCase() ?? "";
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
    const actorContext = {};
    if (req.user?.id) {
        actorContext.actorSupabaseId = req.user.id;
    }
    if (req.user?.role) {
        actorContext.actorRole = req.user.role;
    }
    await (0, auditService_1.recordAuditEvent)({
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
    await (0, auditService_1.recordAuditEvent)({
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
exports.finalizeSignatureUpload = finalizeSignatureUpload;
const submitNotarization = async (req, res) => {
    const parsed = submitNotarizationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
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
    const document = await (0, documentService_1.getDocumentById)(documentId);
    if (!document) {
        return res.status(404).json({
            error: "not_found",
            message: "Document not found",
        });
    }
    const role = req.user.role ?? "member";
    if (role !== "admin" && role !== "service_role") {
        const ownerId = await (0, documentService_1.getUserIdBySupabaseId)(req.user.id);
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
    const existing = await (0, documentService_1.getActiveNotarizationRequest)(documentId);
    if (existing) {
        return res.status(409).json({
            error: "conflict",
            message: "Notarization request already exists",
        });
    }
    const actorContext = {};
    if (req.user?.id) {
        actorContext.actorSupabaseId = req.user.id;
    }
    if (req.user?.role) {
        actorContext.actorRole = req.user.role;
    }
    await (0, auditService_1.recordAuditEvent)({
        ...actorContext,
        entityType: "notarization_request",
        entityId: null,
        action: "member.notarization_submit_started",
        metadata: {
            document_id: documentId,
        },
    });
    const submittedAt = new Date().toISOString();
    const request = await (0, documentService_1.createNotarizationRequest)({
        documentId,
        submittedAt,
    });
    await (0, documentService_1.updateDocument)(documentId, { status: "pending_notary" });
    const ttlMinutes = Number(process.env.NOTARIZATION_CODE_TTL_MINUTES ?? 30);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    let codeRecord = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = `NTR-${(0, crypto_1.randomUUID)().slice(0, 8).toUpperCase()}`;
        try {
            codeRecord = await (0, documentService_1.createNotarizationCode)({
                requestId: request.id,
                code,
                expiresAt,
            });
            break;
        }
        catch (error) {
            if (attempt === 2) {
                throw error;
            }
        }
    }
    await (0, auditService_1.recordAuditEvent)({
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
        await (0, auditService_1.recordAuditEvent)({
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
        await (0, auditService_1.recordAuditEvent)({
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
        await (0, jobs_1.enqueueWebhook)({
            url: webhookUrl,
            payload: {
                requestId: request.id,
                documentId,
                code: codeRecord?.code ?? null,
                expiresAt,
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
exports.submitNotarization = submitNotarization;
const appendAcknowledgment = async (req, res) => {
    res.status(200).json({
        status: "ok",
        message: `TODO: append acknowledgment page and notice for ${req.params.id}`,
    });
};
exports.appendAcknowledgment = appendAcknowledgment;
const watermarkDocument = async (req, res) => {
    res.status(200).json({
        status: "ok",
        message: `TODO: watermark document with IDN and notice for ${req.params.id}`,
    });
};
exports.watermarkDocument = watermarkDocument;
//# sourceMappingURL=documentsController.js.map