import { Request, Response } from "express";
import { recordAuditEvent } from "../services/auditService";
import { verifyDocumentByIdn } from "../services/documentFinalizationService";

export const verifyDocument = async (req: Request, res: Response) => {
  const idn = typeof req.params.idn === "string" ? req.params.idn.trim() : "";
  if (!idn) {
    return res.status(404).json({
      error: "not_found",
      message: "Document verification record not found",
    });
  }

  const requestIp = req.ip ?? null;
  const userAgent = req.get("user-agent") ?? null;

  await recordAuditEvent({
    entityType: "verification",
    entityId: null,
    action: "public.verification_requested",
    metadata: {
      idn,
      ip_address: requestIp,
      user_agent: userAgent,
    },
  });

  const verification = await verifyDocumentByIdn({
    idn,
    requestIp,
    userAgent,
  });

  await recordAuditEvent({
    entityType: "verification",
    entityId: null,
    action: "system.verification_result_returned",
    metadata: {
      idn,
      valid: verification.result?.status === "verified",
      reason: verification.result ? verification.result.status : "not_found",
      ledger_tx_id: verification.result?.ledgerTxId ?? null,
    },
  });

  if (!verification.result) {
    return res.status(404).json({
      error: "not_found",
      message: "Document verification record not found",
    });
  }

  return res.status(200).json(verification.result);
};
