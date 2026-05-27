import { Request, Response } from "express";
import { z } from "zod";
import { sendValidationError } from "../utils/validation";
import {
  getSharedRequestDetail,
  getSharedRequestTimeline,
  listSharedRequests,
  RequestReadModelServiceError,
} from "../services/requestReadModelService";
import { listSigningRequestCards } from "../services/documentInviteService";
import type { RequestRole } from "../services/userRoleService";

const listRequestsQuerySchema = z.object({
  status: z.string().trim().min(1).optional(),
  memberId: z.string().trim().min(1).optional(),
  notaryId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const listSigningRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const requestIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const resolveRole = (req: Request) => {
  return (req.user?.role ?? "member") as RequestRole;
};

const handleReadModelError = (res: Response, error: unknown) => {
  if (!(error instanceof RequestReadModelServiceError)) {
    return false;
  }

  const errorCode =
    error.statusCode === 403
      ? "forbidden"
      : error.statusCode === 404
        ? "not_found"
        : "bad_request";

  res.status(error.statusCode).json({
    error: errorCode,
    message: error.message,
  });

  return true;
};

export const listRequests = async (req: Request, res: Response) => {
  const parsed = listRequestsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const requests = await listSharedRequests({
      role: resolveRole(req),
      viewerUserId: req.user?.dbUserId ?? null,
      status: parsed.data.status ?? null,
      memberId: parsed.data.memberId ?? null,
      notaryId: parsed.data.notaryId ?? null,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return res.status(200).json({ requests });
  } catch (error) {
    if (handleReadModelError(res, error)) {
      return;
    }

    throw error;
  }
};

export const listSigningRequests = async (req: Request, res: Response) => {
  const parsed = listSigningRequestsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const requests = await listSigningRequestCards({
    role: resolveRole(req),
    viewerUserId: req.user?.dbUserId ?? null,
    viewerEmail: req.user?.email ?? null,
    limit: parsed.data.limit,
  });

  return res.status(200).json(requests);
};

export const getRequest = async (req: Request, res: Response) => {
  const parsed = requestIdParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const detail = await getSharedRequestDetail({
    requestId: parsed.data.id,
    role: resolveRole(req),
    viewerUserId: req.user?.dbUserId ?? null,
  });

  if (!detail) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  return res.status(200).json(detail);
};

export const getRequestTimeline = async (req: Request, res: Response) => {
  const parsed = requestIdParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const timeline = await getSharedRequestTimeline({
    requestId: parsed.data.id,
    role: resolveRole(req),
    viewerUserId: req.user?.dbUserId ?? null,
  });

  if (!timeline) {
    return res.status(404).json({
      error: "not_found",
      message: "Notarization request not found",
    });
  }

  return res.status(200).json({ timeline });
};