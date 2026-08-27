import { Request, Response } from "express";
import { z } from "zod";
import {
  createMemberCustomerPortalSession,
  createMemberMembershipCheckout,
  getMemberMembershipStatus,
  MemberBillingServiceError,
} from "../services/memberBillingService";

const checkoutSchema = z.object({
  priceCode: z.enum([
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
