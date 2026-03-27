import { Router } from "express";
import { getPoaRequirementByJurisdiction } from "../controllers/poaController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.get(
  "/poa/:jurisdiction",
  requireRole(["member", "notary", "admin", "service_role"]),
  getPoaRequirementByJurisdiction,
);

export default router;