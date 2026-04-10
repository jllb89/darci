import { describe, expect, it } from "vitest";
import {
  applyMemberFormFallbackHelpText,
  applyPoaGlossaryHelpText,
  applyPoaSpecialAuthorityOptions,
  applyTrusteePowersOptions,
  buildContractFactContext,
  buildMemberFormRulesContract,
} from "../../src/services/memberFormRulesService";
import type {
  Condition,
  IdnInputRequirementsContract,
  InputRequirementField,
  InputRequirementSection,
  PoaInputRequirementsContract,
  TrustInputRequirementsContract,
} from "../../src/services/inputRequirements";

const buildCondition = (
  fact: string,
  operator: "in" | "is_true",
  value?: string[],
): Condition => ({
  all: [
    {
      fact,
      operator,
      ...(value ? { value } : {}),
    },
  ],
});

const buildMemberField = (
  overrides: Partial<InputRequirementField> = {},
): InputRequirementField => ({
  key: "jurisdiction",
  label: "Jurisdiction",
  semantic_type: "jurisdiction",
  required: true,
  data_type: "string",
  collect_from: "member",
  default_source: "none",
  ...overrides,
});

const buildSection = (
  overrides: Partial<InputRequirementSection> = {},
): InputRequirementSection => ({
  key: "document_context",
  title: "Document Context",
  presence: "required",
  repeatable: false,
  fields: [buildMemberField()],
  ...overrides,
});

const buildPoaContract = (
  overrides: Partial<PoaInputRequirementsContract> = {},
): PoaInputRequirementsContract => ({
  schema_version: "2026-04-01",
  jurisdiction: "US-OH",
  ui_profile: "poa_standard",
  derivation_mode: "rules_only",
  review_status: "draft",
  api_representation_mode: "sectioned_only",
  template_resolution: {
    base_template_key: "poa_general_v2",
  },
  workflow: {
    steps: ["collect"],
    required_artifacts: [],
    submission_checks: [],
  },
  sections: [buildSection()],
  section_summaries: {},
  document_outputs: [],
  notices: [],
  source_trace: [
    {
      source: "poa_requirements",
      field: "Jurisdiction",
      value: "US-OH",
    },
  ],
  poa_type: "general",
  classification: {
    poa_system: "NON_UPOAA_STANDARD",
    execution_model: "NOTARY_ONLY",
  },
  poa_capabilities: {
    notary_required: true,
    witnesses_required: false,
    alternative_execution_path_allowed: false,
    special_authority_initials_required: false,
    statutory_form_available: true,
    springing_authority_supported: false,
    durability_default_presumed: false,
    type_specific_execution_rules_present: false,
  },
  ...overrides,
});

const buildTrustContract = (
  overrides: Partial<TrustInputRequirementsContract> = {},
): TrustInputRequirementsContract => ({
  schema_version: "2026-04-01",
  jurisdiction: "US-OH",
  ui_profile: "trust_standard",
  derivation_mode: "rules_only",
  review_status: "draft",
  api_representation_mode: "sectioned_only",
  template_resolution: {
    base_template_key: "trust_rrr_v1",
  },
  workflow: {
    steps: ["collect"],
    required_artifacts: [],
    submission_checks: [],
  },
  sections: [buildSection()],
  section_summaries: {},
  document_outputs: [],
  notices: [],
  source_trace: [
    {
      source: "trust_requirements",
      field: "Jurisdiction",
      value: "US-OH",
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
  ...overrides,
});

const buildIdnContract = (
  overrides: Partial<IdnInputRequirementsContract> = {},
): IdnInputRequirementsContract => ({
  schema_version: "2026-04-01",
  jurisdiction: "US-OH",
  ui_profile: "idn_standard",
  derivation_mode: "rules_only",
  review_status: "draft",
  api_representation_mode: "sectioned_only",
  template_resolution: {
    base_template_key: "idn_ack_v1",
    acknowledgment_profile: "STANDARD_ACK",
  },
  workflow: {
    steps: ["collect"],
    required_artifacts: [],
    submission_checks: [],
  },
  sections: [buildSection()],
  section_summaries: {},
  document_outputs: [],
  notices: [],
  source_trace: [
    {
      source: "idn_requirements",
      field: "Jurisdiction",
      value: "US-OH",
    },
  ],
  document_type: "acknowledgment",
  classification: {
    notarial_system: "COMMON_LAW_STANDARD",
    execution_presence_mode: "IN_PERSON_ONLY",
    digital_channel_status: "DIGITAL_NOT_AUTHORIZED",
  },
  notary_capabilities: {
    ron_allowed: false,
    e_notarization_allowed: false,
    witnesses_required_for_primary_act: false,
    personal_knowledge_only_identification_allowed: false,
    credible_witness_identification_allowed: false,
    commission_expiration_on_certificate_required: false,
  },
  ...overrides,
});

type PoaSpecialAuthorityOptionInput =
  Parameters<typeof applyPoaSpecialAuthorityOptions>[1][number];

const buildPoaSpecialAuthorityOption = (
  overrides: Partial<PoaSpecialAuthorityOptionInput>,
): PoaSpecialAuthorityOptionInput => ({
  canonical_key: "create_or_modify_trust",
  canonical_label: "Create or modify a trust",
  state_specific_label: null,
  sort_order: 10,
  ...overrides,
});

type TrusteePowerOptionInput =
  Parameters<typeof applyTrusteePowersOptions>[1][number];

const buildTrusteePowerOption = (
  overrides: Partial<TrusteePowerOptionInput>,
): TrusteePowerOptionInput => ({
  canonical_key: "real_property",
  canonical_label: "Real property",
  state_specific_label: null,
  sort_order: 10,
  ...overrides,
});

describe("memberFormRulesService", () => {
  it("builds a condition fact context from canonical contracts", () => {
    const contract = buildPoaContract({
      sections: [
        buildSection({
          fields: [
            buildMemberField({
              key: "special_authority_initials",
              when: buildCondition(
                "capability_special_authority_initials_required",
                "is_true",
              ),
            }),
            buildMemberField({
              key: "execution_model",
              when: buildCondition("execution_model", "in", ["NOTARY_ONLY"]),
            }),
          ],
        }),
      ],
    });

    const factContext = buildContractFactContext(contract);

    expect(factContext.document_type).toBe("general");
    expect(factContext.manual_review_required).toBe(false);
    expect(factContext.execution_model).toBe("NOTARY_ONLY");
    expect(factContext.capability_special_authority_initials_required).toBe(false);
    expect(factContext.capability_springing_authority_supported).toBe(false);
  });

  it("returns source-level condition contexts for source_only merged fields", () => {
    const poaContract = buildPoaContract({
      sections: [
        buildSection({
          fields: [
            buildMemberField({
              key: "jurisdiction",
              when: buildCondition("document_type", "in", ["general"]),
            }),
          ],
        }),
      ],
    });

    const trustContract = buildTrustContract({
      sections: [
        buildSection({
          fields: [
            buildMemberField({
              key: "jurisdiction",
              when: buildCondition("document_type", "in", ["rrr"]),
            }),
          ],
        }),
      ],
    });

    const idnContract = buildIdnContract({
      sections: [
        buildSection({
          fields: [
            buildMemberField({
              key: "jurisdiction",
              when: buildCondition("document_type", "in", ["acknowledgment"]),
            }),
          ],
        }),
      ],
    });

    const contract = buildMemberFormRulesContract([
      poaContract,
      trustContract,
      idnContract,
    ]);

    const mergedField = contract.aggregatedForm.sections
      .flatMap((section) => section.fields)
      .find((field) => field.canonical_key === "jurisdiction");

    expect(mergedField?.condition_merge_mode).toBe("source_only");

    const poaSourceContext = contract.sourceConditionContexts.find(
      (context) =>
        context.family === "poa" &&
        context.documentType === "general" &&
        context.sectionKey === "document_context" &&
        context.fieldKey === "jurisdiction",
    );

    const trustSourceContext = contract.sourceConditionContexts.find(
      (context) =>
        context.family === "trust" &&
        context.documentType === "rrr" &&
        context.sectionKey === "document_context" &&
        context.fieldKey === "jurisdiction",
    );

    const idnSourceContext = contract.sourceConditionContexts.find(
      (context) =>
        context.family === "idn" &&
        context.documentType === "acknowledgment" &&
        context.sectionKey === "document_context" &&
        context.fieldKey === "jurisdiction",
    );

    expect(poaSourceContext?.facts.document_type).toBe("general");
    expect(trustSourceContext?.facts.document_type).toBe("rrr");
    expect(idnSourceContext?.facts.document_type).toBe("acknowledgment");
  });

  it("applies POA glossary descriptions to mapped intake fields", () => {
    const contract = buildPoaContract({
      sections: [
        buildSection({
          fields: [
            buildMemberField({
              key: "principal_full_name",
              label: "Principal full legal name",
            }),
            buildMemberField({
              key: "successor_agent_list",
              label: "Successor agents",
              data_type: "array",
            }),
          ],
        }),
      ],
    });

    const enriched = applyPoaGlossaryHelpText(contract, [
      {
        glossary_key: "principal",
        product_description: "The principal grants authority through the POA.",
      },
      {
        glossary_key: "successor_agent",
        product_description:
          "A successor agent can act if the primary agent cannot serve.",
      },
    ]);

    const principalField = enriched.sections[0]?.fields.find(
      (field) => field.key === "principal_full_name",
    );
    const successorAgentField = enriched.sections[0]?.fields.find(
      (field) => field.key === "successor_agent_list",
    );

    expect(principalField?.help_text).toBe(
      "The principal grants authority through the POA.",
    );
    expect(successorAgentField?.help_text).toBe(
      "A successor agent can act if the primary agent cannot serve.",
    );
  });

  it("returns non-POA contracts unchanged when applying POA glossary", () => {
    const trustContract = buildTrustContract();

    const result = applyPoaGlossaryHelpText(trustContract, [
      {
        glossary_key: "principal",
        product_description: "Unused description",
      },
    ]);

    expect(result).toBe(trustContract);
  });

  it("applies DB-provided POA special-authority options to authority scope selection", () => {
    const poaContract = buildPoaContract({
      sections: [
        buildSection({
          key: "authority_scope",
          title: "Authority Scope",
          fields: [
            buildMemberField({
              key: "authority_scope_selection",
              label: "Authority scope selection",
              semantic_type: "authority_selection",
              data_type: "array",
              required: true,
            }),
          ],
        }),
      ],
    });

    const enriched = applyPoaSpecialAuthorityOptions(poaContract, [
      buildPoaSpecialAuthorityOption({
        canonical_key: "make_gifts",
        canonical_label: "Make gifts",
        state_specific_label: "Make gifts (CA)",
        sort_order: 20,
      }),
      buildPoaSpecialAuthorityOption({
        canonical_key: "create_or_modify_trust",
        canonical_label: "Create or modify a trust",
        state_specific_label: null,
        sort_order: 10,
      }),
    ]);

    const authorityField = enriched.sections[0]?.fields.find(
      (field) => field.key === "authority_scope_selection",
    );

    expect(authorityField?.validation).toMatchObject({
      allowed_values: ["create_or_modify_trust", "make_gifts"],
      allowed_value_labels: {
        create_or_modify_trust: "Create or modify a trust",
        make_gifts: "Make gifts (CA)",
      },
    });
  });

  it("applies DB-provided trustee powers to trustee power matrix field", () => {
    const trustContract = buildTrustContract({
      sections: [
        buildSection({
          key: "authority",
          title: "Authority",
          fields: [
            buildMemberField({
              key: "trustee_power_matrix",
              label: "Trustee powers",
              semantic_type: "enum_multi",
              data_type: "array",
              required: false,
            }),
          ],
        }),
      ],
    });

    const enriched = applyTrusteePowersOptions(trustContract, [
      buildTrusteePowerOption({
        canonical_key: "tax_matters",
        canonical_label: "Tax matters",
        state_specific_label: null,
        sort_order: 20,
      }),
      buildTrusteePowerOption({
        canonical_key: "real_property",
        canonical_label: "Real property",
        state_specific_label: "Real property and deeds",
        sort_order: 10,
      }),
    ]);

    const trusteePowerField = enriched.sections[0]?.fields.find(
      (field) => field.key === "trustee_power_matrix",
    );

    expect(trusteePowerField?.validation).toMatchObject({
      allowed_values: ["real_property", "tax_matters"],
      allowed_value_labels: {
        real_property: "Real property and deeds",
        tax_matters: "Tax matters",
      },
    });
  });

  it("applies fallback help text for trust/basic/document fields", () => {
    const trustContract = buildTrustContract({
      sections: [
        buildSection({
          fields: [
            buildMemberField({
              key: "jurisdiction",
              label: "Jurisdiction",
            }),
            buildMemberField({
              key: "key_trust_terms",
              label: "Key trust terms",
              semantic_type: "text",
            }),
            buildMemberField({
              key: "uploaded_document_file",
              label: "Uploaded supporting document",
              semantic_type: "uploaded_document",
              data_type: "object",
            }),
            buildMemberField({
              key: "trust_name",
              label: "Trust name",
              help_text: "Existing help text",
            }),
          ],
        }),
      ],
    });

    const enriched = applyMemberFormFallbackHelpText(trustContract);

    const jurisdictionField = enriched.sections[0]?.fields.find(
      (field) => field.key === "jurisdiction",
    );
    const keyTrustTermsField = enriched.sections[0]?.fields.find(
      (field) => field.key === "key_trust_terms",
    );
    const uploadedDocumentField = enriched.sections[0]?.fields.find(
      (field) => field.key === "uploaded_document_file",
    );
    const trustNameField = enriched.sections[0]?.fields.find(
      (field) => field.key === "trust_name",
    );

    expect(jurisdictionField?.help_text).toBeDefined();
    expect(keyTrustTermsField?.help_text).toContain("key trust terms");
    expect(uploadedDocumentField?.help_text).toContain("Upload");
    expect(trustNameField?.help_text).toBe("Existing help text");
  });
});
