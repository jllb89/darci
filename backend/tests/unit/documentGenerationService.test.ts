import { describe, expect, it } from "vitest";

import {
  buildGenerationRunBlockers,
  deriveSignerObligationsForRun,
} from "../../src/services/documentGenerationService";
import type { DocumentPartyRecord } from "../../src/services/documentService";
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

const buildParty = (overrides: Partial<DocumentPartyRecord>): DocumentPartyRecord => ({
  id: "party-1",
  document_id: "doc-1",
  party_role: "grantor",
  full_name: "Alex Trustmaker",
  email: "alex.trustmaker@example.com",
  phone_country_code: "+1",
  phone: null,
  is_signing_party: true,
  sort_order: 0,
  metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

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

describe("documentGenerationService signer obligations", () => {
  it("uses the selected trustmaker as principal for trustmaker POA outputs", () => {
    const firstTrustmaker = buildParty({
      id: "party-grantor-1",
      full_name: "Alice Trustmaker",
      email: "alice.trustmaker@example.com",
      sort_order: 0,
    });
    const secondTrustmaker = buildParty({
      id: "party-grantor-2",
      full_name: "Bob Trustmaker",
      email: "bob.trustmaker@example.com",
      sort_order: 1,
    });
    const fallbackPrincipal = buildParty({
      id: "party-principal",
      party_role: "principal",
      full_name: "Platform Creator",
      email: "creator@example.com",
      sort_order: 2,
    });

    const obligations = deriveSignerObligationsForRun({
      outputKey: "poa_document_tm2",
      documentKey: "poa_general",
      parties: [firstTrustmaker, secondTrustmaker, fallbackPrincipal],
      canonicalAnswers: {},
      outputMetadata: {
        principalSource: "grantor",
        grantorIndex: 1,
      },
    });

    expect(obligations).toEqual([
      expect.objectContaining({
        document_party_id: "party-grantor-2",
        output_key: "poa_document_tm2",
        document_key: "poa_general",
        party_role: "principal",
        party_name: "Bob Trustmaker",
        obligation_type: "signer",
        metadata: expect.objectContaining({
          principalSource: "grantor",
          grantorIndex: 1,
          principalEmail: "bob.trustmaker@example.com",
          sourcePartyRole: "grantor",
        }),
      }),
      expect.objectContaining({
        document_party_id: "party-grantor-2",
        party_role: "principal",
        party_name: "Bob Trustmaker",
        obligation_type: "acknowledger",
      }),
    ]);
  });
});