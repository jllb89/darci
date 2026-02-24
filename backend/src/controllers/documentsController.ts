import { Request, Response } from "express";
import { enqueueWebhook } from "../worker/jobs";

export const createDocument = async (_req: Request, res: Response) => {
  res.status(201).json({
    status: "ok",
    message: "TODO: create document and assign IDN",
  });
};

export const getDocument = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    documentId: req.params.id,
    message: "TODO: fetch document by id",
  });
};

export const signDocument = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    documentId: req.params.id,
    message: "TODO: capture member signature",
  });
};

export const submitNotarization = async (req: Request, res: Response) => {
  const { webhookUrl } = req.body ?? {};
  const webhookJobId = webhookUrl
    ? await enqueueWebhook({
        url: webhookUrl,
        payload: { documentId: req.params.id, status: "submitted" },
      })
    : null;

  res.status(200).json({
    status: "ok",
    documentId: req.params.id,
    webhookJobId,
    message: "TODO: submit notarization request and issue code",
  });
};

export const appendAcknowledgment = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    documentId: req.params.id,
    message: "TODO: append acknowledgment page and notice",
  });
};

export const watermarkDocument = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    documentId: req.params.id,
    message: "TODO: watermark document with IDN and notice",
  });
};
