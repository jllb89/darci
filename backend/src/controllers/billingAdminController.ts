import type { Request, Response } from "express";
import { z } from "zod";
import { sensitiveActionPolicy } from "../auth/authPolicy";
import {
  BillingPolicyError,
  forceReleaseBillingHeldDocument,
  reverseMemberWorkflowUsage,
} from "../services/billingPolicyService";

const actionSchema = z.object({
  reason: z.string().trim().min(8).max(500),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/).optional(),
}).strict();

const hasRecentReauthentication = (req: Request) => {
  if (req.user?.role === "service_role") return true;
  const authTime = req.user?.rawClaims?.auth_time;
  const authTimeSeconds = typeof authTime === "number"
    ? authTime
    : typeof authTime === "string"
      ? Number(authTime)
      : Number.NaN;
  const elapsedSeconds = Date.now() / 1000 - authTimeSeconds;
  return Number.isFinite(authTimeSeconds) && elapsedSeconds >= 0 &&
    elapsedSeconds <= sensitiveActionPolicy.recentReauthWindowSeconds;
};

const validateSupportAction = (req: Request, res: Response) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      message: "A support reason and valid idempotency key are required",
      issues: parsed.error.issues,
    });
    return null;
  }
  if (!hasRecentReauthentication(req)) {
    res.status(403).json({
      error: "recent_reauthentication_required",
      message: "Reauthenticate before performing a billing support override",
    });
    return null;
  }
  if (req.user?.role !== "service_role" && !req.user?.dbUserId) {
    res.status(403).json({ error: "billing_actor_required", message: "A DARCi admin profile is required" });
    return null;
  }
  return parsed.data;
};

const respondWithSupportError = (res: Response, error: unknown) => {
  if (error instanceof BillingPolicyError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message });
  }
  console.error("Billing support action failed", error instanceof Error ? error.message : error);
  return res.status(500).json({ error: "billing_support_action_failed", message: "Billing support action failed" });
};

export const reverseMemberUsageAdmin = async (req: Request, res: Response) => {
  const input = validateSupportAction(req, res);
  if (!input) return;
  if (!input.idempotencyKey) {
    return res.status(400).json({
      error: "billing_idempotency_key_required",
      message: "An idempotency key is required for usage reversal",
    });
  }
  try {
    return res.status(200).json(await reverseMemberWorkflowUsage({
      usageEventId: String(req.params.usageEventId),
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      actorUserId: req.user?.dbUserId ?? null,
    }));
  } catch (error) {
    return respondWithSupportError(res, error);
  }
};

export const releaseBillingHeldDocumentAdmin = async (req: Request, res: Response) => {
  const input = validateSupportAction(req, res);
  if (!input) return;
  try {
    return res.status(200).json(await forceReleaseBillingHeldDocument({
      documentId: String(req.params.documentId),
      reason: input.reason,
      actorUserId: req.user?.dbUserId ?? null,
    }));
  } catch (error) {
    return respondWithSupportError(res, error);
  }
};
