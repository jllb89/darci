import { Request, Response } from "express";
import { z } from "zod";
import { enqueueHashing, enqueueWebhook } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";
import { recordAuditEvent } from "../services/auditService";
import {
  getNotarizationCodeByValue,
  getNotarizationRequestById,
  getOrCreateUserId,
  updateNotarizationCode,
  updateNotarizationRequest,
} from "../services/documentService";

const resolveCodeSchema = z.object({
  code: z.string().min(1),
}).passthrough();

const codeRequestSchema = z.object({
  requestId: z.string().min(1),
}).passthrough();

const submitRequestSchema = z.object({
  documentId: z.string().optional(),
  idn: z.string().optional(),
  webhookUrl: z.string().url().optional(),
}).passthrough();

export const resolveCode = async (_req: Request, res: Response) => {
  const parsed = resolveCodeSchema.safeParse(_req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  if (!_req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const notaryId = await getOrCreateUserId(
    _req.user.id,
    _req.user.email,
    _req.user.role
  );

  const codeRecord = await getNotarizationCodeByValue(parsed.data.code);
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

  const request = await getNotarizationRequestById(codeRecord.request_id);
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
  const updatedCode = await updateNotarizationCode(codeRecord.id, {
    status: "consumed",
    consumed_at: consumedAt,
  });
  const updatedRequest = await updateNotarizationRequest(request.id, {
    assigned_notary_id: notaryId,
    status: "in_review",
  });

  const actorContext: { actorSupabaseId?: string; actorRole?: string } = {};
  if (_req.user?.id) {
    actorContext.actorSupabaseId = _req.user.id;
  }
  if (_req.user?.role) {
    actorContext.actorRole = _req.user.role;
  }

  await recordAuditEvent({
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

  await recordAuditEvent({
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

  await recordAuditEvent({
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

export const resendCode = async (req: Request, res: Response) => {
  const parsed = codeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  res.status(200).json({
    code: "CODE_TODO",
    status: "resent",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
};

export const regenerateCode = async (req: Request, res: Response) => {
  const parsed = codeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  res.status(200).json({
    code: "CODE_NEW",
    status: "regenerated",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
};

export const getNotaryContext = async (req: Request, res: Response) => {
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

export const signRequest = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: `TODO: notary digital signature and seal for ${req.params.id}`,
  });
};

export const submitRequest = async (req: Request, res: Response) => {
  const parsed = submitRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { documentId, idn, webhookUrl } = parsed.data;
  const hashingJobId = documentId
    ? await enqueueHashing(
        idn ? { documentId, idn } : { documentId }
      )
    : null;

  const webhookJobId = webhookUrl
    ? await enqueueWebhook({
        url: webhookUrl,
        payload: { requestId: req.params.id, status: "completed" },
      })
    : null;

  res.status(200).json({
    status: "ok",
    message: `TODO: finalize and submit notarized document for ${req.params.id}`,
  });
};
