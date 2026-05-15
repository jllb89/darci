import express, { Router } from "express";
import { receiveResendWebhook } from "../controllers/notificationWebhookController";
import { receiveSupabaseAuthSmsHook } from "../controllers/supabaseAuthWebhookController";

const router = Router();

router.post(
  "/resend",
  express.raw({ type: "application/json" }),
  receiveResendWebhook,
);

router.post(
  "/supabase/auth/send-sms",
  express.raw({ type: "application/json" }),
  receiveSupabaseAuthSmsHook,
);

export default router;