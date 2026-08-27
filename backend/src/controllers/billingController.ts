import { Request, Response } from "express";
import { z } from "zod";
import {
  createMemberCustomerPortalSession,
  createMemberMembershipCheckout,
  changeMemberMembershipPlan,
  getMemberMembershipStatus,
  MemberBillingServiceError,
} from "../services/memberBillingService";
import { captureMessage } from "../utils/sentry";

const checkoutSchema = z.object({
  priceCode: z.enum([
    "member_starter_monthly",
    "member_plus_monthly",
    "member_volume_monthly",
  ]),
  idempotencyToken: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
}).strict();

const planChangeSchema = z.object({
  targetPriceCode: z.enum([
    "member_starter_monthly",
    "member_plus_monthly",
    "member_volume_monthly",
  ]),
  idempotencyToken: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
}).strict();

const respondWithError = (res: Response, error: unknown) => {
  if (error instanceof MemberBillingServiceError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message });
  }
  console.error("Member billing request failed", error instanceof Error ? error.message : error);
  return res.status(500).json({ error: "billing_internal_error", message: "Billing request failed" });
};

const hasMemberBillingContext = (req: Request) => {
  return req.user?.role === "member" || req.user?.role === "pro";
};

export const createMemberCheckout = async (req: Request, res: Response) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: "A valid internal price code and idempotency token are required",
      issues: parsed.error.issues,
    });
  }
  if (!req.user?.dbUserId) {
    return res.status(403).json({ error: "billing_profile_required", message: "DARCi profile is required" });
  }
  if (!hasMemberBillingContext(req)) {
    return res.status(403).json({
      error: "member_billing_context_required",
      message: "Switch to a member or Pro workspace to manage a member membership",
    });
  }

  try {
    const result = await createMemberMembershipCheckout({
      dbUserId: req.user.dbUserId,
      priceCode: parsed.data.priceCode,
      idempotencyKey: parsed.data.idempotencyToken,
    });
    return res.status(result.reused ? 200 : 201).json(result);
  } catch (error) {
    if (
      error instanceof MemberBillingServiceError
      && ["billing_checkout_already_pending", "billing_idempotency_conflict"].includes(error.code)
    ) {
      captureMessage("Repeated member Checkout request blocked", {
        level: "warning",
        tags: {
          service: "api",
          operation: "member_checkout",
          reason_code: error.code,
        },
        contexts: {
          billing_checkout: {
            requestId: req.requestId ?? null,
            userId: req.user.dbUserId,
          },
        },
        fingerprint: ["stripe", "checkout", "repeated-request-blocked"],
      });
    }
    return respondWithError(res, error);
  }
};

export const getMemberMembership = async (req: Request, res: Response) => {
  if (!req.user?.dbUserId) {
    return res.status(403).json({ error: "billing_profile_required", message: "DARCi profile is required" });
  }
  if (!hasMemberBillingContext(req)) {
    return res.status(403).json({
      error: "member_billing_context_required",
      message: "Switch to a member or Pro workspace to view a member membership",
    });
  }
  try {
    return res.status(200).json(await getMemberMembershipStatus({ dbUserId: req.user.dbUserId }));
  } catch (error) {
    return respondWithError(res, error);
  }
};

export const createCustomerPortalSession = async (req: Request, res: Response) => {
  if (!req.user?.dbUserId) {
    return res.status(403).json({ error: "billing_profile_required", message: "DARCi profile is required" });
  }
  if (!hasMemberBillingContext(req)) {
    return res.status(403).json({
      error: "member_billing_context_required",
      message: "Switch to a member or Pro workspace to manage a member membership",
    });
  }
  try {
    return res.status(201).json(await createMemberCustomerPortalSession({ dbUserId: req.user.dbUserId }));
  } catch (error) {
    return respondWithError(res, error);
  }
};

export const changeMemberPlan = async (req: Request, res: Response) => {
  const parsed = planChangeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "validation_error",
      message: "A valid target membership price and idempotency token are required",
      issues: parsed.error.issues,
    });
  }
  if (!req.user?.dbUserId) {
    return res.status(403).json({ error: "billing_profile_required", message: "DARCi profile is required" });
  }
  if (!hasMemberBillingContext(req)) {
    return res.status(403).json({
      error: "member_billing_context_required",
      message: "Switch to a member or Pro workspace to change a member membership",
    });
  }
  try {
    return res.status(202).json(await changeMemberMembershipPlan({
      dbUserId: req.user.dbUserId,
      targetPriceCode: parsed.data.targetPriceCode,
      idempotencyKey: parsed.data.idempotencyToken,
    }));
  } catch (error) {
    return respondWithError(res, error);
  }
};
