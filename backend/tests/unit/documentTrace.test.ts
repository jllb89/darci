import { describe, expect, it } from "vitest";
import {
  buildDocumentTraceBreadcrumb,
  sanitizeTraceMetadataForBreadcrumb,
} from "../../src/utils/documentTrace";

describe("documentTrace", () => {
  it("redacts sensitive trace metadata while preserving causal identifiers", () => {
    const sanitized = sanitizeTraceMetadataForBreadcrumb({
      documentId: "doc-1",
      generationRunId: "run-1",
      requestId: "request-1",
      email: "member@example.com",
      phone: "+15555550100",
      placeholders: {
        principal_full_name: "Jane Member",
        trust_name: "Member Family Trust",
      },
      signerObligations: [
        {
          partyRole: "principal",
          partyName: "Jane Member",
          obligationType: "signer",
        },
      ],
      nested: {
        signatureDataUrl: "data:image/png;base64,AAAA",
        safeStageDetail: "template fallback used",
      },
    });

    expect(sanitized.documentId).toBe("doc-1");
    expect(sanitized.generationRunId).toBe("run-1");
    expect(sanitized.requestId).toBe("request-1");
    expect(sanitized.email).toBe("[redacted]");
    expect(sanitized.phone).toBe("[redacted]");
    expect(sanitized.placeholders).toEqual({
      redacted: true,
      keys: ["principal_full_name", "trust_name"],
    });

    const signerObligations = sanitized.signerObligations as Array<Record<string, unknown>>;
    expect(signerObligations[0]).toEqual({
      partyRole: "principal",
      partyName: "[redacted]",
      obligationType: "signer",
    });

    const nested = sanitized.nested as Record<string, unknown>;
    expect(nested.signatureDataUrl).toBe("[redacted]");
    expect(nested.safeStageDetail).toBe("template fallback used");
  });

  it("classifies breadcrumb severity by trace stage", () => {
    expect(buildDocumentTraceBreadcrumb("generation.render_failed", {}).level).toBe("error");
    expect(buildDocumentTraceBreadcrumb("generation.run_blocked", {}).level).toBe("warning");
    expect(buildDocumentTraceBreadcrumb("generation.render_started", {}).level).toBe("info");
  });
});
