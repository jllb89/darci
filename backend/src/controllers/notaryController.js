"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitRequest = exports.signRequest = exports.getNotaryContext = exports.regenerateCode = exports.resendCode = exports.resolveCode = void 0;
const zod_1 = require("zod");
const jobs_1 = require("../worker/jobs");
const validation_1 = require("../utils/validation");
const auditService_1 = require("../services/auditService");
const documentService_1 = require("../services/documentService");
const resolveCodeSchema = zod_1.z.object({
    code: zod_1.z.string().min(1),
}).passthrough();
const codeRequestSchema = zod_1.z.object({
    requestId: zod_1.z.string().min(1),
}).passthrough();
const submitRequestSchema = zod_1.z.object({
    documentId: zod_1.z.string().optional(),
    idn: zod_1.z.string().optional(),
    webhookUrl: zod_1.z.string().url().optional(),
}).passthrough();
const resolveCode = async (_req, res) => {
    const parsed = resolveCodeSchema.safeParse(_req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    if (!_req.user?.id) {
        return res.status(401).json({
            error: "unauthorized",
            message: "Missing user context",
        });
    }
    const notaryId = await (0, documentService_1.getOrCreateUserId)(_req.user.id, _req.user.email, _req.user.role);
    const codeRecord = await (0, documentService_1.getNotarizationCodeByValue)(parsed.data.code);
    if (!codeRecord) {
        return res.status(404).json({
            error: "not_found",
            message: "Code not found",
        });
    }
    if (codeRecord.status !== "active" || codeRecord.consumed_at) {
        return res.status(409).json({
            error: "conflict",
            message: "Code already consumed",
        });
    }
    if (codeRecord.expires_at) {
        const expiresAt = new Date(codeRecord.expires_at);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
            return res.status(400).json({
                error: "validation_error",
                message: "Code expired",
                details: [
                    {
                        path: "code",
                        message: "Code expired",
                    },
                ],
            });
        }
    }
    const request = await (0, documentService_1.getNotarizationRequestById)(codeRecord.request_id);
    if (!request) {
        return res.status(404).json({
            error: "not_found",
            message: "Notarization request not found",
        });
    }
    if (request.assigned_notary_id) {
        return res.status(409).json({
            error: "conflict",
            message: "Request already assigned",
        });
    }
    if (request.status !== "pending") {
        return res.status(409).json({
            error: "conflict",
            message: "Request is not eligible for review",
        });
    }
    const consumedAt = new Date().toISOString();
    const updatedCode = await (0, documentService_1.updateNotarizationCode)(codeRecord.id, {
        status: "consumed",
        consumed_at: consumedAt,
    });
    const updatedRequest = await (0, documentService_1.updateNotarizationRequest)(request.id, {
        assigned_notary_id: notaryId,
        status: "in_review",
    });
    const actorContext = {};
    if (_req.user?.id) {
        actorContext.actorSupabaseId = _req.user.id;
    }
    if (_req.user?.role) {
        actorContext.actorRole = _req.user.role;
    }
    await (0, auditService_1.recordAuditEvent)({
        ...actorContext,
        entityType: "illuminotarization_code",
        entityId: updatedCode.id,
        action: "notary.code_resolved",
        metadata: {
            code_id: updatedCode.id,
            request_id: updatedRequest.id,
            document_id: updatedRequest.document_id,
            notary_id: notaryId,
        },
    });
    await (0, auditService_1.recordAuditEvent)({
        ...actorContext,
        entityType: "illuminotarization_code",
        entityId: updatedCode.id,
        action: "system.code_consumed",
        metadata: {
            code_id: updatedCode.id,
            request_id: updatedRequest.id,
            consumed_at: consumedAt,
        },
    });
    await (0, auditService_1.recordAuditEvent)({
        ...actorContext,
        entityType: "notarization_request",
        entityId: updatedRequest.id,
        action: "system.request_assigned_to_notary",
        metadata: {
            request_id: updatedRequest.id,
            document_id: updatedRequest.document_id,
            notary_id: notaryId,
        },
    });
    res.status(200).json({
        request: {
            id: updatedRequest.id,
            documentId: updatedRequest.document_id,
            status: updatedRequest.status,
        },
        code: {
            id: updatedCode.id,
            code: updatedCode.code,
            status: updatedCode.status,
            expiresAt: updatedCode.expires_at,
        },
    });
};
exports.resolveCode = resolveCode;
const resendCode = async (req, res) => {
    const parsed = codeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    res.status(200).json({
        code: "CODE_TODO",
        status: "resent",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
};
exports.resendCode = resendCode;
const regenerateCode = async (req, res) => {
    const parsed = codeRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    res.status(200).json({
        code: "CODE_NEW",
        status: "regenerated",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
};
exports.regenerateCode = regenerateCode;
const getNotaryContext = async (req, res) => {
    res.status(200).json({
        context: {
            requestId: req.params.id,
            documentId: "TODO_DOCUMENT_ID",
            jurisdiction: "US-OH",
            idRequirements: "Identity verification handled by notary; not stored by DARCI",
            acknowledgmentTemplate: "TODO: acknowledgment wording",
            appearanceType: "ipen",
            venueRequired: true,
            consentRequired: true,
        },
    });
};
exports.getNotaryContext = getNotaryContext;
const signRequest = async (req, res) => {
    res.status(200).json({
        status: "ok",
        message: `TODO: notary digital signature and seal for ${req.params.id}`,
    });
};
exports.signRequest = signRequest;
const submitRequest = async (req, res) => {
    const parsed = submitRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
        return (0, validation_1.sendValidationError)(res, parsed.error);
    }
    const { documentId, idn, webhookUrl } = parsed.data;
    const hashingJobId = documentId
        ? await (0, jobs_1.enqueueHashing)(idn ? { documentId, idn } : { documentId })
        : null;
    const webhookJobId = webhookUrl
        ? await (0, jobs_1.enqueueWebhook)({
            url: webhookUrl,
            payload: { requestId: req.params.id, status: "completed" },
        })
        : null;
    res.status(200).json({
        status: "ok",
        message: `TODO: finalize and submit notarized document for ${req.params.id}`,
    });
};
exports.submitRequest = submitRequest;
//# sourceMappingURL=notaryController.js.map