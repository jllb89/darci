import { describe, expect, it } from "vitest";

import { buildGenerationRunBlockers } from "../../src/services/documentGenerationService";
import type {
  DocumentExtractionContract,
  DocumentTemplateBinding,
} from "../../src/services/memberFormDocumentExtractionService";

const buildExtractionDocument = (
  templateBindings: DocumentTemplateBinding[],
): DocumentExtractionContract => ({
  documentKey: "trust_rrr",
  family: "trust",
  documentType: "rrr",
  jurisdiction: "US-CA",
  uiProfile: "member_form",
  derivationMode: "rules_contract",
  reviewStatus: "required",
  templateResolution: { status: "resolved" } as DocumentExtractionContract["templateResolution"],
  classification: {},
  capabilities: {},
  workflow: {
    steps: [],
    requiredArtifacts: [],
    submissionChecks: [],
  },
  documentOutputs: [],
  notices: [],
  templateBindings,
  templateCoverage: {
    totalBindings: templateBindings.length,
    mappedBindings: templateBindings.filter((binding) => binding.status === "mapped").length,
    missingBindings: templateBindings.filter(
      (binding) => binding.status === "missing_canonical_field",
    ).length,
    systemBindings: templateBindings.filter((binding) => binding.status === "system_value").length,
  },
  sections: [],
  fields: [],
});

const signerObligations = [{ obligation_type: "signer" }] as never[];

describe("documentGenerationService blockers", () => {
  it("does not block member-form bindings that resolve despite missing coverage", () => {
    const blockers = buildGenerationRunBlockers({
      jurisdiction: "US-CA",
      outputKey: "trust_rrr",
      documentKey: "trust_rrr",
      templateResolved: true,
      templateArtifact: { id: "artifact-1" } as never,
      extractionDocument: buildExtractionDocument([
        {
          placeholder: "TrustState",
          description: "Governing state law.",
          required: true,
          source: "member_form",
          status: "missing_canonical_field",
          canonicalKey: "jurisdiction",
        },
      ]),
      signerObligations,
      placeholderValues: {
        TrustState: "California",
      },
    });

    expect(blockers).toEqual([]);
  });

  it("reports missing member-form values when a canonical key exists but resolves empty", () => {
    const blockers = buildGenerationRunBlockers({
      jurisdiction: "US-CA",
      outputKey: "trust_rrr",
      documentKey: "trust_rrr",
      templateResolved: true,
      templateArtifact: { id: "artifact-1" } as never,
      extractionDocument: buildExtractionDocument([
        {
          placeholder: "RevokePower",
          description: "Who may revoke the trust.",
          required: true,
          source: "member_form",
          status: "missing_canonical_field",
          canonicalKey: "revocation_holders",
        },
      ]),
      signerObligations,
      placeholderValues: {
        RevokePower: null,
      },
    });

    expect(blockers).toEqual([
      expect.objectContaining({
        code: "missing_render_context_value",
        field: "RevokePower",
        blocking: true,
      }),
    ]);
  });

  it("defers registry-dependent system placeholders during review artifact generation", () => {
    const blockers = buildGenerationRunBlockers({
      jurisdiction: "US-CA",
      outputKey: "poa_document",
      documentKey: "poa_general",
      templateResolved: true,
      templateArtifact: { id: "artifact-1" } as never,
      extractionDocument: buildExtractionDocument([
        {
          placeholder: "DdpoaNo",
          description: "Registry number assigned by DARCi.",
          required: true,
          source: "system",
          status: "system_value",
        },
        {
          placeholder: "QR Code",
          description: "Verification URL.",
          required: true,
          source: "system",
          status: "system_value",
        },
      ]),
      signerObligations,
      placeholderValues: {
        DdpoaNo: null,
        "QR Code": null,
      },
      allowReviewDeferredSystemValues: true,
    });

    expect(blockers).toEqual([
      expect.objectContaining({
        code: "deferred_system_value",
        field: "DdpoaNo",
        blocking: false,
      }),
      expect.objectContaining({
        code: "deferred_system_value",
        field: "QR Code",
        blocking: false,
      }),
    ]);
  });

  it("ignores California notarial acknowledgment placeholders during review generation", () => {
    const blockers = buildGenerationRunBlockers({
      jurisdiction: "US-CA",
      outputKey: "poa_document",
      documentKey: "poa_general",
      templateResolved: true,
      templateArtifact: { id: "artifact-1" } as never,
      extractionDocument: buildExtractionDocument([
        {
          placeholder: "CA_Notarial_Acknowledgment_Block",
          description: "California notarial acknowledgment block.",
          required: true,
          source: "system",
          status: "system_value",
        },
      ]),
      signerObligations,
      placeholderValues: {
        CA_Notarial_Acknowledgment_Block: null,
      },
      allowReviewDeferredSystemValues: true,
    });

    expect(blockers).toEqual([]);
  });
});