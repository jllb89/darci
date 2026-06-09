import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn(),
}));

import {
  buildDomainTelemetryCaptureContext,
  sanitizeTelemetryData,
} from "./clientTelemetry";

describe("clientTelemetry", () => {
  it("builds backend-compatible domain telemetry context", () => {
    const context = buildDomainTelemetryCaptureContext(new Error("Review failed"), {
      operation: "document_review.approve",
      errorCode: "WEB_REVIEW_APPROVAL_FAILED",
      errorFamily: "review",
      requestId: "request-1",
      tags: {
        document_id: "document-1",
      },
      contexts: {
        document_review: {
          stage: "approve_review",
        },
      },
    });

    expect(context.tags).toMatchObject({
      service: "web",
      operation: "document_review.approve",
      error_code: "WEB_REVIEW_APPROVAL_FAILED",
      error_family: "review",
      request_id: "request-1",
      document_id: "document-1",
    });
    expect(context.contexts?.error).toEqual({
      code: "WEB_REVIEW_APPROVAL_FAILED",
      family: "review",
      name: "Error",
    });
    expect(context.contexts?.document_review).toEqual({
      stage: "approve_review",
    });
    expect(context.fingerprint).toEqual([
      "web",
      "review",
      "WEB_REVIEW_APPROVAL_FAILED",
      "document_review.approve",
    ]);
  });

  it("redacts sensitive breadcrumb data while preserving causal identifiers", () => {
    const sanitized = sanitizeTelemetryData({
      documentId: "document-1",
      requestId: "request-1",
      email: "member@example.com",
      signatureDataUrl: "data:image/png;base64,AAAA",
      nested: {
        outputSignerId: "signer-1",
        typedValue: "Jane Member",
      },
    });

    expect(sanitized.documentId).toBe("document-1");
    expect(sanitized.requestId).toBe("request-1");
    expect(sanitized.email).toBe("[redacted]");
    expect(sanitized.signatureDataUrl).toBe("[redacted]");
    expect(sanitized.nested).toEqual({
      outputSignerId: "signer-1",
      typedValue: "[redacted]",
    });
  });
});