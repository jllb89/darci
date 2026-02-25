import { Request, Response } from "express";
import { z } from "zod";
import { enqueueLedgerAnchor } from "../worker/jobs";
import { sendValidationError } from "../utils/validation";

const anchorSchema = z.object({
  idn: z.string().min(1),
  hash: z.string().min(1),
}).passthrough();

export const anchorLedger = async (req: Request, res: Response) => {
  const parsed = anchorSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  const { idn, hash } = parsed.data;
  const jobId = idn && hash ? await enqueueLedgerAnchor({ idn, hash }) : null;
  res.status(200).json({
    status: "ok",
    message: jobId
      ? `TODO: hash and anchor IDN + hash to ledger (job ${jobId})`
      : "TODO: hash and anchor IDN + hash to ledger",
  });
};
