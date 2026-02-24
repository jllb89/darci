import { Request, Response } from "express";
import { enqueueHashing, enqueueWebhook } from "../worker/jobs";

export const resolveCode = async (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    message: "TODO: resolve illuminotarization code",
  });
};

export const signRequest = async (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    requestId: req.params.id,
    message: "TODO: notary digital signature and seal",
  });
};

export const submitRequest = async (req: Request, res: Response) => {
  const { documentId, idn, webhookUrl } = req.body ?? {};
  const hashingJobId = documentId
    ? await enqueueHashing({ documentId, idn })
    : null;

  const webhookJobId = webhookUrl
    ? await enqueueWebhook({
        url: webhookUrl,
        payload: { requestId: req.params.id, status: "completed" },
      })
    : null;

  res.status(200).json({
    status: "ok",
    requestId: req.params.id,
    hashingJobId,
    webhookJobId,
    message: "TODO: finalize and submit notarized document",
  });
};
