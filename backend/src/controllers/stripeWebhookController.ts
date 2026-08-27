import { Request, Response } from "express";
import { ingestStripeWebhook, processStoredStripeWebhook } from "../services/stripeWebhookService";

const readSignature = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0]?.trim() ?? null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export const receiveStripeWebhook = async (req: Request, res: Response) => {
  const signature = readSignature(req.headers["stripe-signature"]);
  if (!signature || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({
      error: "invalid_stripe_webhook",
      message: "Stripe signature and exact raw request body are required",
    });
  }

  try {
    const result = await ingestStripeWebhook({
      rawBody: req.body,
      signature,
      requestId: req.requestId ?? null,
    });

    if (!result.duplicate) {
      setImmediate(() => {
        void processStoredStripeWebhook({
          storedEventId: result.stored.id,
          workerId: `api:${process.pid}`,
        }).catch((error) => {
          console.error("Deferred Stripe webhook attempt failed", {
            storedEventId: result.stored.id,
            error: error instanceof Error ? error.message : error,
          });
        });
      });
    }

    return res.status(200).json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    const signatureFailure = /signature|No signatures|timestamp/i.test(message);
    console.warn("Stripe webhook rejected", { requestId: req.requestId, signatureFailure });
    return res.status(signatureFailure ? 400 : 503).json({
      error: signatureFailure ? "invalid_stripe_signature" : "stripe_webhook_unavailable",
      message: signatureFailure ? "Stripe webhook signature is invalid" : "Webhook could not be persisted",
    });
  }
};
