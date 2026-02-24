import { Router } from "express";
import {
  resolveCode,
  signRequest,
  submitRequest,
} from "../controllers/notaryController";

const router = Router();

router.post("/code/resolve", resolveCode);
router.post("/requests/:id/sign", signRequest);
router.post("/requests/:id/submit", submitRequest);

export default router;
