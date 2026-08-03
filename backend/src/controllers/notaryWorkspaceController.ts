import { Request, Response } from "express";
import { z } from "zod";
import {
  getDocumentByIdn,
  getOrCreateUserId,
  listNotarizationRequests,
  updateNotarizationRequest,
} from "../services/documentService";
import {
  getIlluminotarizationWorkflowById,
  getIlluminotarizationWorkflowByLegacyRequestId,
  transitionIlluminotarizationWorkflowStatus,
  upsertIlluminotarizationWorkflowAssignment,
  type IlluminotarizationWorkflowRecord,
} from "../services/illuminotarizationWorkflowService";
import {
  getNotaryRequestContext,
  listNotaryQueue,
  NotaryWorkspaceReadModelServiceError,
} from "../services/notaryWorkspaceReadModelService";
import type { RequestRole } from "../services/userRoleService";
import { sendValidationError } from "../utils/validation";

const listNotaryQueueQuerySchema = z.object({
  status: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const requestParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const resolveIdnBodySchema = z.object({
  idn: z.string().trim().min(1).max(120),
});

const terminalRequestStatuses = new Set(["completed", "rejected", "canceled", "cancelled"]);
const terminalWorkflowStatuses = new Set(["completed", "rejected", "canceled", "expired"]);

const resolveRole = (req: Request) => {
  return (req.user?.role ?? "notary") as RequestRole;
};

const resolveActorUserId = async (req: Request) => {
  if (req.user?.dbUserId) {
    return req.user.dbUserId;
  }

  if (!req.user?.id) {
    return null;
  }

  return getOrCreateUserId(
    req.user.id,
    req.user.email,
    req.user.role,
    req.user.phone?.trim() ? req.user.phone : undefined,
  );
};

const resolveWorkflowForRequest = async (input: {
  requestId: string;
  workflowId?: string | null | undefined;
}) => {
  if (input.workflowId) {
    return getIlluminotarizationWorkflowById(input.workflowId);
  }

  return getIlluminotarizationWorkflowByLegacyRequestId(input.requestId);
};

const canClaimByIdn = (workflow: IlluminotarizationWorkflowRecord | null, requestStatus: string | null) => {
  if (requestStatus && terminalRequestStatuses.has(requestStatus)) {
    return false;
  }

  if (workflow?.status && terminalWorkflowStatuses.has(workflow.status)) {
    return false;
  }

  return true;
};

const sendServiceError = (res: Response, error: unknown) => {
  if (error instanceof NotaryWorkspaceReadModelServiceError) {
    return res.status(error.statusCode).json({
      error: error.statusCode === 403 ? "forbidden" : "bad_request",
      message: error.message,
    });
  }

  throw error;
};

export const listNotaryRequests = async (req: Request, res: Response) => {
  const parsed = listNotaryQueueQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const queue = await listNotaryQueue({
      role: resolveRole(req),
      viewerUserId: req.user?.dbUserId ?? null,
      status: parsed.data.status ?? null,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return res.status(200).json({
      ...queue,
      realtimeQueueUserId: req.user?.dbUserId ?? null,
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const getNotaryContext = async (req: Request, res: Response) => {
  const parsed = requestParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const context = await getNotaryRequestContext({
      requestId: parsed.data.id,
      role: resolveRole(req),
      viewerUserId: req.user?.dbUserId ?? null,
    });

    if (!context) {
      return res.status(404).json({
        error: "not_found",
        message: "Notary request context not found",
      });
    }

    return res.status(200).json({ context });
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const resolveIdn = async (req: Request, res: Response) => {
  const parsed = resolveIdnBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const actorUserId = await resolveActorUserId(req);
    if (!actorUserId) {
      return res.status(401).json({
        error: "unauthorized",
        message: "A signed-in notary is required to resolve an IDN.",
      });
    }

    const document = await getDocumentByIdn(parsed.data.idn);
    if (!document) {
      return res.status(404).json({
        error: "not_found",
        message: "No document was found for that IDN.",
      });
    }

    const requests = await listNotarizationRequests({
      documentIds: [document.id],
      limit: 5,
      offset: 0,
    });
    const request = requests[0] ?? null;
    if (!request) {
      return res.status(404).json({
        error: "not_found",
        message: "No notarization request is ready for that IDN.",
      });
    }

    const workflow = await resolveWorkflowForRequest({
      requestId: request.id,
      workflowId: request.workflow_id,
    });
    const selectedNotaryUserId = workflow?.selected_notary_user_id ?? null;
    const assignedNotaryUserId = workflow?.assigned_notary_user_id ?? request.assigned_notary_id ?? null;

    if (selectedNotaryUserId && selectedNotaryUserId !== actorUserId) {
      return res.status(409).json({
        error: "notary_mismatch",
        message: "This request is reserved for another notary.",
      });
    }

    if (assignedNotaryUserId && assignedNotaryUserId !== actorUserId) {
      return res.status(409).json({
        error: "already_assigned",
        message: "This request is already assigned to another notary.",
      });
    }

    if (!canClaimByIdn(workflow, request.status)) {
      return res.status(409).json({
        error: "request_ineligible",
        message: "This request is no longer eligible for notary review.",
      });
    }

    const nextRequestStatus = request.status === "pending" || !request.assigned_notary_id
      ? "in_review"
      : request.status;
    const updatedRequest = request.assigned_notary_id !== actorUserId || request.status !== nextRequestStatus
      ? await updateNotarizationRequest(request.id, {
          assigned_notary_id: actorUserId,
          status: nextRequestStatus,
          workflow_id: workflow?.id ?? request.workflow_id,
        })
      : request;

    if (workflow) {
      await upsertIlluminotarizationWorkflowAssignment({
        workflowId: workflow.id,
        assignmentKind: "assigned_notary",
        userId: actorUserId,
        assignedByUserId: actorUserId,
        assignmentSource: "system",
        metadata: {
          source: "idn_resolution",
          documentId: document.id,
          requestId: request.id,
        },
      });

      if (workflow.status !== "in_review" && !terminalWorkflowStatuses.has(workflow.status)) {
        await transitionIlluminotarizationWorkflowStatus({
          workflowId: workflow.id,
          nextStatus: "in_review",
          changedByUserId: actorUserId,
          changeSource: "system",
          changeReason: "notary_idn_resolution",
          legacyRequestId: request.id,
          workflowUpdates: {
            assignedNotaryUserId: actorUserId,
            currentLegacyRequestId: request.id,
          },
          metadata: {
            documentId: document.id,
          },
        });
      }
    }

    const context = await getNotaryRequestContext({
      requestId: updatedRequest.id,
      role: resolveRole(req),
      viewerUserId: actorUserId,
    });

    return res.status(200).json({
      requestId: updatedRequest.id,
      context,
    });
  } catch (error) {
    return sendServiceError(res, error);
  }
};