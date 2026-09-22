import { describe, expect, it } from "vitest";
import { buildCriticalSignal, classifyCriticalSignal } from "../../src/telemetry/criticalSignals";

describe("independent critical alert boundary", () => {
  it("never copies sensitive or attacker-controlled context into AWS logs", () => {
    const result = JSON.stringify(buildCriticalSignal("auth", { tags: {
      request_id: "token-sensitive", document_id: "private.pdf", email: "person@example.test",
      secret: "sk_live_secret", phone: "+15555555555", error_message: "passport text",
    }, fingerprint: ["https://private.test?token=secret"] }));
    for (const value of ["token-sensitive", "private.pdf", "person@", "sk_live", "+1555", "passport", "https://"]) expect(result).not.toContain(value);
    expect(JSON.parse(result).correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("preserves only UUID correlation and a bounded category", () => {
    const id = "58cd1d88-b9bf-4c7f-81f6-595452542acb";
    expect(buildCriticalSignal("document", { tags: { request_id: id, document_id: id } })).toMatchObject({ correlationId: id, documentId: id, category: "document" });
  });
  it.each([
    ["auth", { level: "error", tags: { telemetry_area: "auth" } }],
    ["notification", { tags: { worker_queue: "notification-outbox" } }],
    ["document", { tags: { error_family: "storage" } }],
    ["audit", { fingerprint: ["material-audit", "write"] }],
    ["retention", { tags: { worker_queue: "stripe-webhook-retention" } }],
    ["billing", { tags: { worker_queue: "stripe-webhook-inbox" } }],
    ["billing", { level: "warning", tags: { worker_queue: "billing-reconciliation" }, fingerprint: ["blocking-drift"] }],
    ["platform", {}],
  ])("routes %s independently of Sentry", (category, context) => expect(classifyCriticalSignal(context)).toBe(category));
  it("does not page on expected authentication warnings or informational messages", () => {
    expect(classifyCriticalSignal({ level: "warning", tags: { telemetry_area: "auth" } })).toBeNull();
    expect(classifyCriticalSignal({ level: "info" })).toBeNull();
  });
});
