import { Router } from "express";
import { anchorLedger } from "../controllers/ledgerController";
import { requireRole } from "../middleware/roles";

const router = Router();

router.post("/anchor", requireRole(["admin", "service_role"]), anchorLedger);

export default router;
