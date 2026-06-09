import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors/domainError";
import { buildDomainCaptureContext } from "../../src/utils/sentry";

describe("sentry domain telemetry", () => {
  it("builds stable code, family, operation, and fingerprint context for domain errors", () => {
    const error = new DomainError({
      code: "STORAGE_UPLOAD_GENERATED_DOCUMENT_FAILED",
      family: "storage",
      message: "Upload failed",
      details: {
        bucket: "documents",
        storagePath: "owner/document/generated/run/output.pdf",
      },
    });

    const context = buildDomainCaptureContext(error, {
      service: "backend",
      operation: "generation.render",
      tags: {
        request_id: "request-1",
        document_id: "document-1",
      },
      contexts: {
        generation: {
          generationRunId: "run-1",
        },
      },
    });

    expect(context.tags).toMatchObject({
      service: "backend",
      operation: "generation.render",
      error_code: "STORAGE_UPLOAD_GENERATED_DOCUMENT_FAILED",
      error_family: "storage",
      request_id: "request-1",
      document_id: "document-1",
    });
    expect(context.contexts?.error).toEqual({
      code: "STORAGE_UPLOAD_GENERATED_DOCUMENT_FAILED",
      family: "storage",
      name: "DomainError",
      details: {
        bucket: "documents",
        storagePath: "owner/document/generated/run/output.pdf",
      },
    });
    expect(context.contexts?.generation).toEqual({
      generationRunId: "run-1",
    });
    expect(context.fingerprint).toEqual([
      "backend",
      "storage",
      "STORAGE_UPLOAD_GENERATED_DOCUMENT_FAILED",
      "generation.render",
    ]);
  });

  it("keeps unclassified fallback shape stable for unexpected errors", () => {
    const context = buildDomainCaptureContext(new Error("Unexpected failure"), {
      service: "backend",
      operation: "generation.render",
    });

    expect(context.tags).toMatchObject({
      service: "backend",
      operation: "generation.render",
      error_code: "UNCLASSIFIED_ERROR",
      error_family: "internal",
    });
    expect(context.contexts?.error).toEqual({
      code: "UNCLASSIFIED_ERROR",
      family: "internal",
      name: "Error",
      details: null,
    });
    expect(context.fingerprint).toEqual([
      "backend",
      "internal",
      "UNCLASSIFIED_ERROR",
      "generation.render",
    ]);
  });
});