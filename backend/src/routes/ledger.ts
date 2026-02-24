import { Router } from "express";
import { anchorLedger } from "../controllers/ledgerController";

const router = Router();

router.post("/anchor", anchorLedger);

export default router;
