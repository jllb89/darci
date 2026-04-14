import { Router } from "express";
import {
  getPoaRequirementByJurisdiction,
  listPoaJurisdictionsForType,
} from "../controllers/poaController";
import {
  getTrustRequirementByJurisdiction,
  listTrustJurisdictionsForType,
} from "../controllers/trustController";
import {
  getIdnRequirementByJurisdiction,
  listIdnJurisdictionsForType,
} from "../controllers/idnController";
import {
  getMemberFormDocumentExtractionByJurisdiction,
  getMemberFormRulesByJurisdiction,
  listProductFlowModesForSelection,
  listMemberFormJurisdictionsForSelection,
  validateMemberFormSubmissionByJurisdiction,
} from "../controllers/memberFormRulesController";
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

router.get(
  "/trust",
  requireRole(["member", "notary", "admin", "service_role"]),
  listTrustJurisdictionsForType,
);

router.get(
  "/trust/:jurisdiction",
  requireRole(["member", "notary", "admin", "service_role"]),
  getTrustRequirementByJurisdiction,
);

router.get(
  "/idn",
  requireRole(["member", "notary", "admin", "service_role"]),
  listIdnJurisdictionsForType,
);

router.get(
  "/idn/:jurisdiction",
  requireRole(["member", "notary", "admin", "service_role"]),
  getIdnRequirementByJurisdiction,
);

router.get(
  "/product-flow-modes",
  requireRole(["member", "notary", "admin", "service_role"]),
  listProductFlowModesForSelection,
);

router.get(
  "/member-form",
  requireRole(["member", "notary", "admin", "service_role"]),
  listMemberFormJurisdictionsForSelection,
);

router.get(
  "/member-form/:jurisdiction",
  requireRole(["member", "notary", "admin", "service_role"]),
  getMemberFormRulesByJurisdiction,
);

router.get(
  "/member-form/:jurisdiction/document-extraction",
  requireRole(["member", "notary", "admin", "service_role"]),
  getMemberFormDocumentExtractionByJurisdiction,
);

router.post(
  "/member-form/:jurisdiction/validate",
  requireRole(["member", "notary", "admin", "service_role"]),
  validateMemberFormSubmissionByJurisdiction,
);

export default router;