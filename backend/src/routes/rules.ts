import { Router } from "express";
import {
  getPoaRequirementByJurisdiction,
  listPoaJurisdictionsForType,
} from "../controllers/poaController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.get(
  "/poa",
  requireRole(["member", "notary", "admin", "service_role"]),
  listPoaJurisdictionsForType,
);

router.get(
  "/poa/:jurisdiction",
  requireRole(["member", "notary", "admin", "service_role"]),
  getPoaRequirementByJurisdiction,
);

export default router;