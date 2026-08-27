import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ingest: vi.fn(),
  process: vi.fn(),
}));

vi.mock("../../src/services/stripeWebhookService", () => ({
  ingestStripeWebhook: mocks.ingest,
  processStoredStripeWebhook: mocks.process,
}));

import webhooksRoutes from "../../src/routes/webhooks";

const buildApp = () => {
  const app = express();
  app.use("/webhooks", webhooksRoutes);
  return app;
};

describe("Stripe webhook ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.process.mockResolvedValue({ claimed: true, outcome: "processed" });
  });

  it("rejects an unsigned request before persistence", async () => {
    const response = await request(buildApp())
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_test" }));

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_stripe_webhook");
    expect(mocks.ingest).not.toHaveBeenCalled();
  });

  it("passes the exact raw bytes and signature to durable ingestion", async () => {
    mocks.ingest.mockResolvedValue({
      stored: { id: "stored-event-1", event_id: "evt_test", event_type: "invoice.paid", attempt_count: 0 },
      duplicate: false,
    });
    const raw = JSON.stringify({ id: "evt_test", type: "invoice.paid" });

    const response = await request(buildApp())
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=123,v1=signature")
      .send(raw);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, duplicate: false });
    expect(mocks.ingest).toHaveBeenCalledWith(expect.objectContaining({
      rawBody: Buffer.from(raw),
      signature: "t=123,v1=signature",
    }));
  });

  it("acknowledges duplicate deliveries without launching duplicate immediate work", async () => {
    mocks.ingest.mockResolvedValue({
      stored: { id: "stored-event-1", event_id: "evt_test", event_type: "invoice.paid", attempt_count: 1 },
      duplicate: true,
    });

    const response = await request(buildApp())
      .post("/webhooks/stripe")
      .set("Content-Type", "application/json")
      .set("Stripe-Signature", "t=123,v1=signature")
      .send(JSON.stringify({ id: "evt_test" }));

    expect(response.status).toBe(200);
    expect(response.body.duplicate).toBe(true);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
