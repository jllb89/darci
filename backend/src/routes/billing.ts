import { Router } from "express";
import {
  createCustomerPortalSession,
  createMemberCheckout,
  changeMemberPlan,
  getMemberMembership,
  getRenewalNotice,
} from "../controllers/billingController";

const router = Router();

router.get("/member-membership", getMemberMembership);
router.get("/member-membership/renewal-notice", getRenewalNotice);
router.post("/member-membership/checkout", createMemberCheckout);
router.post("/member-membership/plan-change", changeMemberPlan);
router.post("/customer-portal-session", createCustomerPortalSession);

export default router;
