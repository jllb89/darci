import { Request, Response } from "express";
import { z } from "zod";
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

const resolveRole = (req: Request) => {
  return (req.user?.role ?? "notary") as RequestRole;
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

    return res.status(200).json(queue);
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