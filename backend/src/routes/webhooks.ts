import express, { Router } from "express";
import { receiveResendWebhook } from "../controllers/notificationWebhookController";

const router = Router();

router.post(
  "/resend",
  express.raw({ type: "application/json" }),
  receiveResendWebhook,
);

export default router;