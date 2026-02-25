import { Request, Response } from "express";
import { z } from "zod";
import { enqueueWebhook } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";

const createDocumentSchema = z.object({
  title: z.string().optional(),
}).passthrough();

const submitNotarizationSchema = z.object({
  webhookUrl: z.string().url().optional(),
}).passthrough();

export const createDocument = async (req: Request, res: Response) => {
  const parsed = createDocumentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  res.status(201).json({
    document: {
      id: "TODO_DOCUMENT_ID",
      idn: "IDN_TODO",
      status: "draft",
      documentType: "generic",
      jurisdiction: "US-CA",
      createdAt: new Date().toISOString(),
    },
  });
};

export const getDocument = async (req: Request, res: Response) => {
  res.status(200).json({
    document: {
      id: req.params.id,
      idn: "IDN_TODO",
      status: "draft",
      documentType: "generic",
      jurisdiction: "US-CA",
      createdAt: new Date().toISOString(),
    },
  });
};

export const listDocuments = async (_req: Request, res: Response) => {
  res.status(200).json({
    documents: [
      {
        id: "TODO_DOCUMENT_ID",
        idn: "IDN_TODO",
        status: "draft",
        documentType: "generic",
        jurisdiction: "US-CA",
        createdAt: new Date().toISOString(),
      },
    ],
  });
};

export const listDocumentVersions = async (req: Request, res: Response) => {
  res.status(200).json({
    versions: [
      {
        id: "TODO_VERSION_ID",
        version: 1,
        storagePath: `documents/${req.params.id}/source.pdf`,
        fileName: "source.pdf",
        mimeType: "application/pdf",
        sizeBytes: 0,
        isFinal: false,
        createdAt: new Date().toISOString(),
      },
    ],
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
  res.status(200).json({
    status: "ok",
    message: `TODO: capture member signature for ${req.params.id}`,
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
