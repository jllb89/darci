import { Request, Response } from "express";
import { z } from "zod";
import { sendValidationError } from "../utils/validation";
import {
  getSharedVerificationDetail,
  listSharedVerifications,
} from "../services/verificationReadModelService";
import type { RequestRole } from "../services/userRoleService";

const listVerificationQuerySchema = z.object({
  idn: z.string().trim().min(1).optional(),
  status: z.enum(["verified", "unverified"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const verificationParamsSchema = z.object({
  idn: z.string().trim().min(1),
});

const resolveRole = (req: Request) => {
  return (req.user?.role ?? "member") as RequestRole;
};

export const listVerificationResults = async (req: Request, res: Response) => {
  const parsed = listVerificationQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const verifications = await listSharedVerifications({
    role: resolveRole(req),
    viewerUserId: req.user?.dbUserId ?? null,
    idn: parsed.data.idn ?? null,
    status: parsed.data.status ?? null,
    limit: parsed.data.limit,
    offset: parsed.data.offset,
  });

  return res.status(200).json({ verifications });
};

export const getVerificationDetail = async (req: Request, res: Response) => {
  const parsed = verificationParamsSchema.safeParse(req.params ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const detail = await getSharedVerificationDetail({
    idn: parsed.data.idn,
    role: resolveRole(req),
    viewerUserId: req.user?.dbUserId ?? null,
  });

  if (!detail) {
    return res.status(404).json({
      error: "not_found",
      message: "Verification record not found",
    });
  }

  return res.status(200).json(detail);
};