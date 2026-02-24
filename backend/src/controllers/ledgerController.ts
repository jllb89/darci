import { Request, Response } from "express";
import { enqueueLedgerAnchor } from "../worker/jobs";

export const anchorLedger = async (req: Request, res: Response) => {
  const { idn, hash } = req.body ?? {};
  const jobId = idn && hash ? await enqueueLedgerAnchor({ idn, hash }) : null;
  res.status(200).json({
    status: "ok",
    jobId,
    message: "TODO: hash and anchor IDN + hash to ledger",
  });
};
