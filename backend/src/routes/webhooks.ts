import express, { Router } from "express";
import { receiveResendWebhook } from "../controllers/notificationWebhookController";
import { receiveSupabaseAuthSmsHook } from "../controllers/supabaseAuthWebhookController";
import { receiveStripeWebhook } from "../controllers/stripeWebhookController";

const router = Router();

router.post(
  "/stripe",
  express.raw({ type: "application/json", limit: "1mb" }),
  receiveStripeWebhook,
);

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
