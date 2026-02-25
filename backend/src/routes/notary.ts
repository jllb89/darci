import { Router } from "express";
import {
  getNotaryContext,
  regenerateCode,
  resendCode,
  resolveCode,
  signRequest,
  submitRequest,
} from "../controllers/notaryController";

const router = Router();

router.post("/code/resolve", resolveCode);
router.post("/code/resend", resendCode);
router.post("/code/regenerate", regenerateCode);
router.get("/requests/:id/context", getNotaryContext);
router.post("/requests/:id/sign", signRequest);
router.post("/requests/:id/submit", submitRequest);

export default router;
