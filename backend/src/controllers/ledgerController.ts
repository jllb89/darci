import { Request, Response } from "express";

export const anchorLedger = async (req: Request, res: Response) => {
  return res.status(501).json({
    error: "not_implemented",
    message:
      "Manual ledger anchoring is not mounted on this compatibility route. Use the Phase 6 finalization flow that persists hash, anchor-attempt, and verification state together.",
  });
};
