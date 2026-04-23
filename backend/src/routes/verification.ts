import { Router } from "express";
import {
  getVerificationDetail,
  listVerificationResults,
} from "../controllers/verificationController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.use(requireRole(["member", "notary", "admin", "service_role"]));

router.get("/", listVerificationResults);
router.get("/:idn", getVerificationDetail);

export default router;