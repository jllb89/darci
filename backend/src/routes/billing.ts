import { Router } from "express";
import { createCustomerPortalSession, createMemberCheckout } from "../controllers/billingController";

const router = Router();

router.post("/member-membership/checkout", createMemberCheckout);
router.post("/customer-portal-session", createCustomerPortalSession);

export default router;
