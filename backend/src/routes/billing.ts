import { Router } from "express";
import {
  createCustomerPortalSession,
  createMemberCheckout,
  changeMemberPlan,
  getMemberMembership,
} from "../controllers/billingController";

const router = Router();

router.get("/member-membership", getMemberMembership);
router.post("/member-membership/checkout", createMemberCheckout);
router.post("/member-membership/plan-change", changeMemberPlan);
router.post("/customer-portal-session", createCustomerPortalSession);

export default router;
