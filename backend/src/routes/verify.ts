import { Router } from "express";
import { verifyDocument } from "../controllers/verifyController";

const router = Router();

router.get("/:idn", verifyDocument);

export default router;
