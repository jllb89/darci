import { describe, expect, it } from "vitest";
import type {
  PoaInputRequirementsContract,
  TrustInputRequirementsContract,
} from "../../src/services/inputRequirements";
import type { MemberFormRulesContract } from "../../src/services/memberFormRulesService";
import { buildMemberFormDocumentExtractionPayload } from "../../src/services/memberFormDocumentExtractionService";

const buildTrustInputRequirements = (): TrustInputRequirementsContract => ({
  schema_version: "2026-04-01",
  jurisdiction: "US-CA",
  ui_profile: "trust_standard",
  derivation_mode: "rules_plus_overrides",
  review_status: "draft",
  api_representation_mode: "sectioned_only",
  template_resolution: {
    base_template_key: "trust_rrr_v1",
    state_overlay_key: "ca_overlay_v1",
    acknowledgment_profile: "CA_ACK",
  },
  workflow: {
    steps: ["trust_identity", "trust_terms"],
    required_artifacts: ["prior_trust_documents"],
    submission_checks: ["required_fields_complete"],
  },
  sections: [
    {
      key: "document_context",
      title: "Document Context",
      presence: "required",
      repeatable: false,
      fields: [
        {
          key: "jurisdiction",
          label: "Jurisdiction",
          semantic_type: "jurisdiction",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
        },
      ],
    },
    {
      key: "trust_terms",
      title: "Trust Terms",
      presence: "required",
      repeatable: false,
      fields: [
        {
          key: "trustee_power_matrix",
          label: "Trustee powers",
          semantic_type: "enum_multi",
          required: true,
          data_type: "array",
          collect_from: "member",
          default_source: "none",
          validation: {
            allowed_values: ["real_property"],
          },
        },
      ],
    },
  ],
  section_summaries: {},
  document_outputs: [
    {
      key: "generated_trust_rrr",
      required: true,
      output_category: "legal_requirement",
    },
  ],
  notices: [
    {
      key: "trust_notice",
      severity: "info",
      message: "Trust output should be reviewed before signing.",
    },
  ],
  source_trace: [
    {
      source: "trust_requirements",
      field: "Jurisdiction",
      value: "US-CA",
    },
  ],
  document_type: "rrr",
  classification: {
    trust_system: "UTC_STANDARD",
    execution_level: "STANDARD",
  },
  trust_capabilities: {
    asset_protection: false,
    directed_trusts: false,
    decanting_friendly: false,
    silent_trust_friendly: false,
  },
});

const buildPoaInputRequirements = (): PoaInputRequirementsContract => ({
  schema_version: "2026-04-01",
  jurisdiction: "US-CA",
  ui_profile: "poa_standard",
  derivation_mode: "rules_plus_overrides",
  review_status: "draft",
  api_representation_mode: "sectioned_only",
  template_resolution: {
    base_template_key: "poa_general_v2",
    state_overlay_key: "ca_overlay_v2",
    execution_profile: "CA_NOTARY_OR_2W",
  },
  workflow: {
    steps: ["principal", "authority_scope"],
    required_artifacts: ["principal_identity_evidence"],
    submission_checks: ["required_fields_complete"],
  },
  sections: [
    {
      key: "document_context",
      title: "Document Context",
      presence: "required",
      repeatable: false,
      fields: [
        {
          key: "jurisdiction",
          label: "Jurisdiction",
          semantic_type: "jurisdiction",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
        },
      ],
    },
    {
      key: "principal",
      title: "Principal",
      presence: "required",
      repeatable: false,
      fields: [
        {
          key: "principal_full_name",
          label: "Principal full legal name",
          semantic_type: "person_name",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "user_profile",
        },
      ],
    },
    {
      key: "manual_review_section",
      title: "Manual Review",
      presence: "hidden",
      repeatable: false,
      fields: [
        {
          key: "internal_review_note",
          label: "Internal review note",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
  ],
  section_summaries: {},
  document_outputs: [
    {
      key: "signed_poa_document",
      required: true,
      output_category: "legal_requirement",
    },
  ],
  notices: [
    {
      key: "poa_notice",
      severity: "warning",
      message: "Execution path may require witnesses.",
    },
  ],
  source_trace: [
    {
      source: "poa_requirements",
      field: "Jurisdiction",
      value: "US-CA",
    },
  ],
  poa_type: "general",
  classification: {
    poa_system: "NON_UPOAA_STANDARD",
    execution_model: "NOTARY_OR_WITNESSES",
  },
  poa_capabilities: {
    notary_required: true,
    witnesses_required: true,
    alternative_execution_path_allowed: true,
    special_authority_initials_required: false,
    statutory_form_available: true,
    springing_authority_supported: true,
    durability_default_presumed: false,
    type_specific_execution_rules_present: false,
  },
});

const buildMemberFormContract = (): MemberFormRulesContract => {
  const trustInputRequirements = buildTrustInputRequirements();
  const poaInputRequirements = buildPoaInputRequirements();

  return {
    jurisdiction: "US-CA",
    families: ["poa", "trust"],
    documentTypes: ["general", "rrr"],
    aggregatedForm: {
      jurisdiction: "US-CA",
      families: ["poa", "trust"],
      document_types: ["general", "rrr"],
      sections: [
        {
          key: "basic_info",
          title: "Basic Information",
          fields: [
            {
              canonical_key: "jurisdiction",
              label: "Jurisdiction",
              semantic_type: "jurisdiction",
              data_type: "string",
              required: true,
              repeatable: false,
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "document_context",
                  field_key: "jurisdiction",
                  original_label: "Jurisdiction",
                },
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "document_context",
                  field_key: "jurisdiction",
                  original_label: "Jurisdiction",
                },
              ],
              ui_group: "basic_info",
            },
          ],
        },
        {
          key: "people",
          title: "People",
          fields: [
            {
              canonical_key: "principal_full_name",
              label: "Principal full legal name",
              semantic_type: "person_name",
              data_type: "string",
              required: true,
              repeatable: false,
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "principal",
                  field_key: "principal_full_name",
                  original_label: "Principal full legal name",
                },
              ],
              ui_group: "people",
            },
          ],
        },
        {
          key: "authority",
          title: "Authority",
          fields: [
            {
              canonical_key: "trustee_powers",
              label: "Trustee powers",
              semantic_type: "enum_multi",
              data_type: "array",
              required: true,
              repeatable: false,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "trust_terms",
                  field_key: "trustee_power_matrix",
                  original_label: "Trustee powers",
                },
              ],
              ui_group: "authority",
            },
          ],
        },
      ],
      source_trace: [],
    },
    familyContracts: [
      {
        family: "poa",
        documentType: "general",
        inputRequirements: poaInputRequirements,
        factContext: {},
      },
      {
        family: "trust",
        documentType: "rrr",
        inputRequirements: trustInputRequirements,
        factContext: {},
      },
    ],
    sourceConditionContexts: [],
  };
};

describe("memberFormDocumentExtractionService", () => {
  it("builds canonical extraction payload for trust RRR and POA", () => {
    const memberForm = buildMemberFormContract();

    const payload = buildMemberFormDocumentExtractionPayload(memberForm);

    expect(payload.jurisdiction).toBe("US-CA");
    expect(payload.documents.map((document) => document.documentKey)).toEqual([
      "poa_general",
      "trust_rrr",
    ]);

    const trustDocument = payload.documents.find((document) => document.documentKey === "trust_rrr");
    expect(trustDocument).toBeDefined();
    expect(trustDocument?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceFieldKey: "trustee_power_matrix",
          canonicalKey: "trustee_powers",
        }),
      ]),
    );
    expect(trustDocument?.templateBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          placeholder: "TrustName",
          canonicalKey: "trust_name",
          status: "missing_canonical_field",
        }),
        expect.objectContaining({
          placeholder: "DarciNo",
          source: "system",
          status: "system_value",
        }),
      ]),
    );
    expect(trustDocument?.templateCoverage.totalBindings).toBeGreaterThan(0);

    const jurisdictionIndex = payload.canonicalFieldIndex.find(
      (item) => item.canonicalKey === "jurisdiction",
    );
    expect(jurisdictionIndex?.inDocuments).toHaveLength(2);
    expect(payload.sharedCanonicalKeys).toContain("jurisdiction");
  });

  it("omits fields from hidden sections", () => {
    const memberForm = buildMemberFormContract();

    const payload = buildMemberFormDocumentExtractionPayload(memberForm);
    const poaDocument = payload.documents.find((document) => document.documentKey === "poa_general");

    expect(poaDocument).toBeDefined();
    expect(
      poaDocument?.fields.some((field) => field.sourceFieldKey === "internal_review_note"),
    ).toBe(false);
    expect(poaDocument?.templateBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          placeholder: "Principal.FullName",
          canonicalKey: "principal_full_name",
          status: "mapped",
        }),
        expect.objectContaining({
          placeholder: "Multiple Agents joint/separate rule",
          canonicalKey: "agent_signature_authority",
          status: "missing_canonical_field",
        }),
      ]),
    );
    expect((poaDocument?.templateCoverage.missingBindings ?? 0) > 0).toBe(true);
  });
});
