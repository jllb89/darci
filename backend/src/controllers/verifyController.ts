import { Request, Response } from "express";

export const verifyDocument = async (req: Request, res: Response) => {
  res.status(200).json({
    idn: req.params.idn,
    hash: "TODO_HASH",
    ledgerTxId: "TODO_LEDGER_TX",
    anchoredAt: new Date().toISOString(),
    status: "unverified",
  });
};
