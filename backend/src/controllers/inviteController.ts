import { Request, Response } from "express";
import { z } from "zod";
import {
  createDocumentInvite,
  DocumentInviteServiceError,
  listDocumentInvites,
  resendDocumentInvite,
  revokeDocumentInvite,
} from "../services/documentInviteService";
import {
  claimInviteToken,
  InviteClaimServiceError,
  openAuthenticatedInvite,
  validateInviteToken,
} from "../services/inviteClaimService";
import { getOrCreateUserId } from "../services/documentService";
import type { RequestRole } from "../services/userRoleService";
import { sendValidationError } from "../utils/validation";

const inviteStatusSchema = z.enum([
  "draft",
  "queued",
  "sent",
  "opened",
  "claimed",
  "accepted",
  "declined",
  "revoked",
  "expired",
  "completed",
  "failed",
]);

const claimModeSchema = z.enum([
  "none",
  "optional_signup",
  "required_signup",
  "existing_account_only",
]);

const listInvitesQuerySchema = z.object({
  documentId: z.string().trim().min(1).optional(),
  documentOutputSignerId: z.string().trim().min(1).optional(),
  status: inviteStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createInviteBodySchema = z.object({
  documentId: z.string().trim().min(1),
  documentOutputSignerId: z.string().trim().min(1),
  recipientEmail: z.string().trim().email(),
  recipientName: z.string().trim().min(1).optional(),
  inviteLabel: z.string().trim().min(1).optional(),
  claimMode: claimModeSchema.default("required_signup"),
  expiresAt: z.string().datetime().optional(),
  idempotencyKey: z.string().trim().min(1).optional(),
});

const inviteIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const publicInviteParamsSchema = z.object({
  token: z.string().trim().min(1),
});

const resendInviteBodySchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

const revokeInviteBodySchema = z.object({
  reason: z.string().trim().min(1).optional(),
});

const claimInviteBodySchema = z.object({
  claimAddress: z.string().trim().min(1).optional(),
});

const resolveRole = (req: Request) => {
  return (req.user?.role ?? "member") as RequestRole;
};

const resolveViewerUserId = async (req: Request) => {
  if (req.user?.dbUserId) {
    return req.user.dbUserId;
  }

  if (!req.user?.id) {
    return null;
  }

  return getOrCreateUserId(req.user.id, req.user.email, req.user.role, req.user.phone);
};

const sendServiceError = (res: Response, error: unknown) => {
  if (
    error instanceof DocumentInviteServiceError ||
    error instanceof InviteClaimServiceError
  ) {
    const errorCodeByStatus: Record<number, string> = {
      401: "unauthorized",
      400: "bad_request",
      403: "forbidden",
      404: "not_found",
      409: "conflict",
      410: "gone",
    };

    return res.status(error.statusCode).json({
      error: errorCodeByStatus[error.statusCode] ?? "bad_request",
      message: error.message,
    });
  }

  throw error;
};

export const listInvites = async (req: Request, res: Response) => {
  const parsed = listInvitesQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await listDocumentInvites({
      role: resolveRole(req),
      viewerUserId: req.user?.dbUserId ?? null,
      documentId: parsed.data.documentId ?? null,
      documentOutputSignerId: parsed.data.documentOutputSignerId ?? null,
      status: parsed.data.status ?? null,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const createInvite = async (req: Request, res: Response) => {
  const parsed = createInviteBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const result = await createDocumentInvite({
      role: resolveRole(req),
      viewerUserId: req.user?.dbUserId ?? null,
      documentId: parsed.data.documentId,
      documentOutputSignerId: parsed.data.documentOutputSignerId,
      recipientEmail: parsed.data.recipientEmail,
      recipientName: parsed.data.recipientName ?? null,
      inviteLabel: parsed.data.inviteLabel ?? null,
      claimMode: parsed.data.claimMode,
      expiresAt: parsed.data.expiresAt ?? null,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
    });

    return res.status(201).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const resendInvite = async (req: Request, res: Response) => {
  const parsedParams = inviteIdParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = resendInviteBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const result = await resendDocumentInvite({
      role: resolveRole(req),
      viewerUserId: req.user?.dbUserId ?? null,
      inviteId: parsedParams.data.id,
      expiresAt: parsedBody.data.expiresAt ?? null,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const revokeInvite = async (req: Request, res: Response) => {
  const parsedParams = inviteIdParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = revokeInviteBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const result = await revokeDocumentInvite({
      role: resolveRole(req),
      viewerUserId: req.user?.dbUserId ?? null,
      inviteId: parsedParams.data.id,
      reason: parsedBody.data.reason ?? null,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const getPublicInvite = async (req: Request, res: Response) => {
  const parsed = publicInviteParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const viewerUserId = await resolveViewerUserId(req);
    const invite = await validateInviteToken({
      token: parsed.data.token,
      viewerUserId,
    });

    if (!invite) {
      return res.status(404).json({
        error: "not_found",
        message: "Invite not found",
      });
    }

    return res.status(200).json({ invite });
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const claimPublicInvite = async (req: Request, res: Response) => {
  const parsedParams = publicInviteParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  const parsedBody = claimInviteBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const viewerUserId = await resolveViewerUserId(req);
    const result = await claimInviteToken({
      token: parsedParams.data.token,
      viewerUserId,
      claimAddress: parsedBody.data.claimAddress ?? null,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};

export const openInvite = async (req: Request, res: Response) => {
  const parsedParams = inviteIdParamsSchema.safeParse(req.params ?? {});
  if (!parsedParams.success) {
    return sendValidationError(res, parsedParams.error);
  }

  try {
    const viewerUserId = await resolveViewerUserId(req);
    const result = await openAuthenticatedInvite({
      inviteId: parsedParams.data.id,
      viewerUserId,
      viewerEmail: req.user?.email ?? null,
      claimAddress: req.user?.email ?? null,
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendServiceError(res, error);
  }
};