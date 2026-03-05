import { Request, Response } from "express";
import { z } from "zod";
import { enqueueHashing, enqueueWebhook } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";

const codeRequestSchema = z.object({
  requestId: z.string().min(1),
}).passthrough();

const submitRequestSchema = z.object({
  documentId: z.string().optional(),
  idn: z.string().optional(),
  webhookUrl: z.string().url().optional(),
}).passthrough();

export const resolveCode = async (_req: Request, res: Response) => {
  res.status(200).json({
    code: "CODE_TODO",
    status: "active",
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
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
