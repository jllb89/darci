import { describe, expect, it } from "vitest";
import {
  areFieldValidationsCompatible,
  deriveMemberFacingFormContract,
  explainMemberFieldMerge,
  extractMemberFacingFields,
  inferUiGroup,
  type ExtractedMemberField,
  type MemberFacingField,
} from "../../src/services/memberInputAggregator";
import type {
  Condition,
  IdnInputRequirementsContract,
  InputRequirementField,
  InputRequirementSection,
  PoaInputRequirementsContract,
  TrustInputRequirementsContract,
} from "../../src/services/inputRequirements";

const buildMemberField = (
  overrides: Partial<InputRequirementField> = {},
): InputRequirementField => ({
  key: "jurisdiction",
  label: "Jurisdiction",
  semantic_type: "jurisdiction",
  required: true,
  data_type: "string",
  collect_from: "member",
  default_source: "jurisdiction_default",
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

const buildEqualsCondition = (fact: string, value: string): Condition => ({
  all: [
    {
      fact,
      operator: "equals",
      value,
    },
  ],
});

const buildPoaContract = (
  overrides: Partial<PoaInputRequirementsContract> = {},
): PoaInputRequirementsContract => ({
  schema_version: "2026-04-01",
  jurisdiction: "US-OH",
  ui_profile: "standard",
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
  ui_profile: "standard",
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
      field: "Notarization Required",
      value: "required",
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
  ui_profile: "standard",
  derivation_mode: "rules_only",
  review_status: "draft",
  api_representation_mode: "sectioned_only",
  template_resolution: {
    base_template_key: "idn_ack_v1",
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
      field: "Signer Identification",
      value: "required",
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

const flattenFields = (form: ReturnType<typeof deriveMemberFacingFormContract>) => {
  return form.sections.flatMap((section) => section.fields);
};

const getField = (
  fields: MemberFacingField[],
  canonicalKey: string,
): MemberFacingField | undefined => {
  return fields.find((field) => field.canonical_key === canonicalKey);
};

describe("memberInputAggregator", () => {
  it("extracts only collect_from member fields", () => {
    const contract = buildPoaContract({
      sections: [
        buildSection({
          fields: [
            buildMemberField({ key: "jurisdiction" }),
            buildMemberField({
              key: "notary_acknowledgment_required",
              collect_from: "system",
              default_source: "system_derived",
            }),
          ],
        }),
      ],
    });

    const extracted = extractMemberFacingFields([contract]);

    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toMatchObject({
      family: "poa",
      field_key: "jurisdiction",
      section_key: "document_context",
    });
  });

  it("excludes hidden sections during extraction", () => {
    const contract = buildPoaContract({
      sections: [
        buildSection({
          key: "visible_section",
          presence: "required",
          fields: [buildMemberField({ key: "jurisdiction" })],
        }),
        buildSection({
          key: "hidden_section",
          presence: "hidden",
          fields: [buildMemberField({ key: "trust_name" })],
        }),
      ],
    });

    const extracted = extractMemberFacingFields([contract]);

    expect(extracted.map((field) => field.field_key)).toEqual(["jurisdiction"]);
  });

  it("excludes manual review sections during extraction", () => {
    const contract = buildPoaContract({
      sections: [
        buildSection({
          key: "required_section",
          presence: "required",
          fields: [buildMemberField({ key: "jurisdiction" })],
        }),
        buildSection({
          key: "manual_review_section",
          presence: "manual_review",
          fields: [buildMemberField({ key: "special_instructions_text" })],
        }),
      ],
    });

    const extracted = extractMemberFacingFields([contract]);

    expect(extracted).toHaveLength(1);
    expect(extracted[0]?.field_key).toBe("jurisdiction");
  });

  it("keeps required, optional, and conditional sections during extraction", () => {
    const contract = buildPoaContract({
      sections: [
        buildSection({
          key: "required_section",
          presence: "required",
          fields: [buildMemberField({ key: "jurisdiction" })],
        }),
        buildSection({
          key: "optional_section",
          presence: "optional",
          fields: [buildMemberField({ key: "document_title" })],
        }),
        buildSection({
          key: "conditional_section",
          presence: "conditional",
          fields: [buildMemberField({ key: "selected_execution_path" })],
        }),
      ],
    });

    const extracted = extractMemberFacingFields([contract]);

    expect(extracted.map((field) => field.field_key)).toEqual([
      "jurisdiction",
      "document_title",
      "selected_execution_path",
    ]);
  });

  it("merges same-jurisdiction contracts across families", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract(),
      buildPoaContract(),
      buildIdnContract(),
    ]);

    const fields = flattenFields(form);
    const jurisdictionField = getField(fields, "jurisdiction");

    expect(form.jurisdiction).toBe("US-OH");
    expect(form.families).toEqual(["trust", "poa", "idn"]);
    expect(form.document_types).toEqual(["acknowledgment", "general", "rrr"]);
    expect(jurisdictionField?.sources).toHaveLength(3);
  });

  it("rejects mixed jurisdictions", () => {
    expect(() =>
      deriveMemberFacingFormContract([
        buildTrustContract({ jurisdiction: "US-OH" }),
        buildIdnContract({ jurisdiction: "US-CA" }),
      ]),
    ).toThrow("All contracts must share the same jurisdiction");
  });

  it("safely merges semantically equivalent member fields", () => {
    const form = deriveMemberFacingFormContract([
      buildPoaContract(),
      buildTrustContract(),
    ]);

    const jurisdictionFields = flattenFields(form).filter((field) =>
      field.canonical_key.startsWith("jurisdiction"),
    );

    expect(jurisdictionFields).toHaveLength(1);
    expect(jurisdictionFields[0]?.sources).toHaveLength(2);
  });

  it("does not merge role-distinct people fields", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract({
        sections: [
          buildSection({
            key: "trust_parties",
            title: "Trust Parties",
            fields: [
              buildMemberField({
                key: "trustmaker_name",
                label: "Trustmaker name",
                semantic_type: "person_name",
              }),
              buildMemberField({
                key: "trustee_name",
                label: "Trustee name",
                semantic_type: "person_name",
              }),
            ],
          }),
        ],
      }),
    ]);

    const fields = flattenFields(form);

    expect(getField(fields, "trustmaker_name")).toBeDefined();
    expect(getField(fields, "trustee_name")).toBeDefined();
    expect(fields).toHaveLength(2);
  });

  it("promotes merged required when any source requires it", () => {
    const form = deriveMemberFacingFormContract([
      buildPoaContract({
        sections: [
          buildSection({
            fields: [buildMemberField({ key: "jurisdiction", required: false })],
          }),
        ],
      }),
      buildTrustContract({
        sections: [
          buildSection({
            fields: [buildMemberField({ key: "jurisdiction", required: true })],
          }),
        ],
      }),
    ]);

    const jurisdictionField = getField(flattenFields(form), "jurisdiction");

    expect(jurisdictionField?.required).toBe(true);
  });

  it("keeps exact merged condition with exact mode", () => {
    const sharedCondition = buildEqualsCondition("document_type", "rrr");

    const form = deriveMemberFacingFormContract([
      buildPoaContract({
        sections: [
          buildSection({
            fields: [
              buildMemberField({
                key: "jurisdiction",
                when: sharedCondition,
              }),
            ],
          }),
        ],
      }),
      buildTrustContract({
        sections: [
          buildSection({
            fields: [
              buildMemberField({
                key: "jurisdiction",
                when: sharedCondition,
              }),
            ],
          }),
        ],
      }),
    ]);

    const jurisdictionField = getField(flattenFields(form), "jurisdiction");

    expect(jurisdictionField?.when).toEqual(sharedCondition);
    expect(jurisdictionField?.condition_merge_mode).toBe("exact");
  });

  it("marks differing conditions as source_only and preserves source original_when", () => {
    const conditionA = buildEqualsCondition("document_type", "rrr");
    const conditionB = buildEqualsCondition("document_type", "certification");

    const form = deriveMemberFacingFormContract([
      buildPoaContract({
        sections: [
          buildSection({
            fields: [
              buildMemberField({
                key: "jurisdiction",
                when: conditionA,
              }),
            ],
          }),
        ],
      }),
      buildTrustContract({
        sections: [
          buildSection({
            fields: [
              buildMemberField({
                key: "jurisdiction",
                when: conditionB,
              }),
            ],
          }),
        ],
      }),
    ]);

    const jurisdictionField = getField(flattenFields(form), "jurisdiction");

    expect(jurisdictionField?.when).toBeUndefined();
    expect(jurisdictionField?.condition_merge_mode).toBe("source_only");
    expect(jurisdictionField?.sources.map((source) => source.original_when)).toEqual(
      expect.arrayContaining([conditionA, conditionB]),
    );
  });

  it("prevents merge when validations are incompatible", () => {
    const compatible = areFieldValidationsCompatible(
      { allowed_values: ["US-OH"] },
      { allowed_values: ["US-OH"] },
    );
    const incompatible = areFieldValidationsCompatible(
      { allowed_values: ["US-OH"] },
      { allowed_values: ["US-CA"] },
    );

    expect(compatible).toBe(true);
    expect(incompatible).toBe(false);

    const form = deriveMemberFacingFormContract([
      buildPoaContract({
        sections: [
          buildSection({
            fields: [
              buildMemberField({
                key: "jurisdiction",
                validation: { allowed_values: ["US-OH"] },
              }),
            ],
          }),
        ],
      }),
      buildTrustContract({
        sections: [
          buildSection({
            fields: [
              buildMemberField({
                key: "jurisdiction",
                validation: { allowed_values: ["US-CA"] },
              }),
            ],
          }),
        ],
      }),
    ]);

    const jurisdictionVariants = flattenFields(form).filter((field) =>
      field.canonical_key.startsWith("jurisdiction"),
    );

    expect(jurisdictionVariants).toHaveLength(2);
  });

  it("assigns expected UI groups", () => {
    const form = deriveMemberFacingFormContract([
      buildPoaContract({
        sections: [
          buildSection({
            key: "mixed",
            title: "Mixed",
            fields: [
              buildMemberField({
                key: "trust_name",
                label: "Trust name",
                semantic_type: "trust_name",
              }),
              buildMemberField({
                key: "principal_full_name",
                label: "Principal",
                semantic_type: "person_name",
              }),
              buildMemberField({
                key: "authority_scope_selection",
                label: "Authority scope",
                semantic_type: "authority_selection",
                data_type: "array",
              }),
              buildMemberField({
                key: "selected_execution_path",
                label: "Execution path",
                semantic_type: "acknowledgment_choice",
              }),
              buildMemberField({
                key: "uploaded_document_file",
                label: "Uploaded file",
                semantic_type: "uploaded_document",
                data_type: "object",
              }),
              buildMemberField({
                key: "special_instructions_text",
                label: "Special instructions",
                semantic_type: "text",
              }),
            ],
          }),
        ],
      }),
    ]);

    const fields = flattenFields(form);

    expect(getField(fields, "trust_name")?.ui_group).toBe("basic_info");
    expect(getField(fields, "principal_full_name")?.ui_group).toBe("people");
    expect(getField(fields, "authority_scope_selection")?.ui_group).toBe("authority");
    expect(getField(fields, "selected_execution_path")?.ui_group).toBe("execution");
    expect(getField(fields, "uploaded_document_file")?.ui_group).toBe("documents");
    expect(getField(fields, "special_instructions_text")?.ui_group).toBe("authority");
  });

  it("uses canonical ui-group mapping before heuristics", () => {
    const group = inferUiGroup({
      canonical_key: "trust_name",
      label: "Trust name",
      semantic_type: "uploaded_document",
      data_type: "object",
      required: true,
      repeatable: false,
      sources: [
        {
          family: "trust",
          document_type: "rrr",
          section_key: "document_context",
          field_key: "uploaded_document_file",
          original_label: "Upload supporting document",
        },
      ],
      ui_group: "advanced",
    });

    expect(group).toBe("basic_info");
  });

  it("uses field-key ui-group fallback when canonical key is not mapped", () => {
    const field: ExtractedMemberField = {
      family: "trust",
      document_type: "rrr",
      jurisdiction: "US-OH",
      section_key: "document_context",
      section_title: "Document Context",
      field_key: "document_title",
      label: "Document title",
      semantic_type: "uploaded_document",
      data_type: "string",
      required: true,
      repeatable: false,
    };

    expect(inferUiGroup(field)).toBe("basic_info");
  });

  it("falls back to heuristics for unknown keys", () => {
    const field: ExtractedMemberField = {
      family: "idn",
      document_type: "acknowledgment",
      jurisdiction: "US-OH",
      section_key: "custom",
      section_title: "Custom",
      field_key: "custom_notary_toggle",
      label: "Custom notary toggle",
      semantic_type: "custom_notary_preference",
      data_type: "boolean",
      required: false,
      repeatable: false,
    };

    expect(inferUiGroup(field)).toBe("execution");
  });

  it("preserves source references and traceability", () => {
    const poa = buildPoaContract({
      source_trace: [
        {
          source: "poa_requirements",
          field: "Jurisdiction",
          value: "US-OH",
        },
      ],
    });

    const trust = buildTrustContract({
      source_trace: [
        {
          source: "trust_requirements",
          field: "Notarization Required",
          value: "required",
        },
      ],
    });

    const form = deriveMemberFacingFormContract([poa, trust]);
    const merged = explainMemberFieldMerge([poa, trust]);
    const jurisdictionField = getField(flattenFields(form), "jurisdiction");

    expect(form.source_trace).toHaveLength(2);
    expect(jurisdictionField?.sources).toHaveLength(2);
    expect(jurisdictionField?.sources.map((source) => source.family).sort()).toEqual([
      "poa",
      "trust",
    ]);
    expect(merged.find((item) => item.canonical_key === "jurisdiction")?.merged_from).toHaveLength(2);
  });

  it("replaces restatement summary with a structured restatement context field", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract({
        source_trace: [
          {
            source: "trust_requirements",
            field: "Restatement Summary",
            value: "legacy textual summary",
          },
        ],
        sections: [
          buildSection({
            key: "documents",
            title: "Documents",
            fields: [
              buildMemberField({
                key: "restatement_summary",
                label: "Restatement summary",
                semantic_type: "text",
                data_type: "string",
                required: false,
              }),
            ],
          }),
        ],
      }),
    ]);

    const fields = flattenFields(form);
    const restatementField = getField(fields, "restatement_context_type");

    expect(restatementField).toBeDefined();
    expect(restatementField?.label).toBe("What kind of trust update is this?");
    expect(restatementField?.semantic_type).toBe("enum_single");
    expect(restatementField?.data_type).toBe("string");
    expect(restatementField?.validation).toEqual({
      allowed_values: [
        "initial_registration",
        "amendment",
        "restatement",
        "amendment_and_restatement",
        "unsure",
      ],
    });
    expect(restatementField?.sources[0]?.field_key).toBe("restatement_summary");
    expect(form.source_trace).toEqual([
      {
        source: "trust_requirements",
        field: "Restatement Summary",
        value: "legacy textual summary",
      },
    ]);
  });

  it("keeps prior document items optional in aggregated baseline", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract({
        sections: [
          buildSection({
            key: "documents",
            title: "Documents",
            fields: [
              buildMemberField({
                key: "prior_document_items",
                label: "Prior document items",
                semantic_type: "uploaded_document_list",
                data_type: "array",
                required: true,
              }),
            ],
          }),
        ],
      }),
    ]);

    const priorDocumentItemsField = getField(flattenFields(form), "prior_document_items");

    expect(priorDocumentItemsField?.required).toBe(false);
    expect(priorDocumentItemsField?.sources[0]?.field_key).toBe("prior_document_items");
    expect(priorDocumentItemsField?.sources[0]?.original_required).toBe(true);
  });

  it("replaces trustee power matrix with structured trustee powers options", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract({
        sections: [
          buildSection({
            key: "authority",
            title: "Authority",
            fields: [
              buildMemberField({
                key: "trustee_power_matrix",
                label: "Trustee power matrix",
                semantic_type: "text",
                data_type: "string",
                required: false,
              }),
            ],
          }),
        ],
      }),
    ]);

    const trusteePowersField = getField(flattenFields(form), "trustee_powers");

    expect(trusteePowersField).toBeDefined();
    expect(trusteePowersField?.semantic_type).toBe("enum_multi");
    expect(trusteePowersField?.data_type).toBe("array");
    expect(trusteePowersField?.validation).toEqual({
      allowed_values: [
        "real_property",
        "personal_property",
        "banking_and_financial",
        "stocks_and_bonds",
        "commodities_and_options",
        "insurance_and_annuities",
        "government_securities",
        "margin_transactions",
        "mutual_funds",
        "claims_and_litigation",
        "business_operations",
        "tax_matters",
      ],
    });
    expect(trusteePowersField?.sources[0]?.field_key).toBe("trustee_power_matrix");
  });

  it("preserves DB-provided trustee power labels when available", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract({
        sections: [
          buildSection({
            key: "authority",
            title: "Authority",
            fields: [
              buildMemberField({
                key: "trustee_power_matrix",
                label: "Trustee power matrix",
                semantic_type: "text",
                data_type: "string",
                required: false,
                validation: {
                  allowed_values: ["real_property", "tax_matters"],
                  allowed_value_labels: {
                    real_property: "Real property and deeds",
                    tax_matters: "Tax matters",
                  },
                },
              }),
            ],
          }),
        ],
      }),
    ]);

    const trusteePowersField = getField(flattenFields(form), "trustee_powers");

    expect(trusteePowersField).toBeDefined();
    expect(trusteePowersField?.validation).toEqual({
      allowed_values: ["real_property", "tax_matters"],
      allowed_value_labels: {
        real_property: "Real property and deeds",
        tax_matters: "Tax matters",
      },
    });
  });

  it("replaces trustee incapacity standard with structured select options", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract({
        sections: [
          buildSection({
            key: "authority",
            title: "Authority",
            fields: [
              buildMemberField({
                key: "trustee_incapacity_standard",
                label: "Trustee incapacity standard",
                semantic_type: "text",
                data_type: "string",
                required: true,
              }),
            ],
          }),
        ],
      }),
    ]);

    const incapacityField = getField(flattenFields(form), "trustee_incapacity_standard");

    expect(incapacityField).toBeDefined();
    expect(incapacityField?.label).toBe("How is trustee incapacity determined?");
    expect(incapacityField?.semantic_type).toBe("enum_single");
    expect(incapacityField?.data_type).toBe("string");
    expect(incapacityField?.validation).toEqual({
      allowed_values: [
        "licensed_physician_determination",
        "two_physician_determination",
        "court_determination",
        "written_resignation",
        "unanimous_trustee_determination",
        "unable_to_manage_financial_affairs",
        "other",
        "unsure",
      ],
    });
    expect(incapacityField?.sources[0]?.field_key).toBe("trustee_incapacity_standard");
  });

  it("replaces revocation holders with structured options and custom follow-up", () => {
    const form = deriveMemberFacingFormContract([
      buildTrustContract({
        sections: [
          buildSection({
            key: "authority",
            title: "Authority",
            fields: [
              buildMemberField({
                key: "revocation_holders",
                label: "Revocation holders",
                semantic_type: "person_list",
                data_type: "array",
                required: false,
              }),
            ],
          }),
        ],
      }),
    ]);

    const fields = flattenFields(form);
    const revocationHoldersField = getField(fields, "revocation_holders");
    const revocationCustomField = getField(fields, "revocation_holders_custom_text");

    expect(revocationHoldersField).toBeDefined();
    expect(revocationHoldersField?.label).toBe("Who can revoke the trust?");
    expect(revocationHoldersField?.semantic_type).toBe("enum_single");
    expect(revocationHoldersField?.data_type).toBe("string");
    expect(revocationHoldersField?.validation).toEqual({
      allowed_values: [
        "trustmaker_only",
        "all_trustmakers_jointly",
        "each_trustmaker_as_to_own_property",
        "trustee_controlled",
        "custom",
        "unsure",
      ],
    });
    expect(revocationHoldersField?.sources[0]?.field_key).toBe("revocation_holders");

    expect(revocationCustomField).toBeDefined();
    expect(revocationCustomField?.semantic_type).toBe("textarea");
    expect(revocationCustomField?.data_type).toBe("string");
    expect(revocationCustomField?.required).toBe(true);
    expect(revocationCustomField?.when).toEqual({
      all: [
        {
          fact: "revocation_holders",
          operator: "equals",
          value: "custom",
        },
      ],
    });
    expect(revocationCustomField?.sources[0]?.field_key).toBe("revocation_holders");
  });
});
