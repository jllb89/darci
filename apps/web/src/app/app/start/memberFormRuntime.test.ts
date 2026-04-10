import { describe, expect, it } from "vitest";
import {
  buildInitialMemberFormValues,
  computeFieldRuntime,
  groupSectionFieldsByFamily,
  getVisibleSections,
  type Condition,
  type MemberFormRulesContract,
} from "./memberFormRuntime";

const inCondition = (fact: string, value: string): Condition => ({
  all: [
    {
      fact,
      operator: "in",
      value: [value],
    },
  ],
});

const buildSourceOnlyContract = (): MemberFormRulesContract => {
  return {
    aggregatedForm: {
      sections: [
        {
          key: "basic_info",
          title: "Basic Information",
          fields: [
            {
              canonical_key: "principal_full_name",
              required: false,
              condition_merge_mode: "source_only",
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "people",
                  field_key: "principal_full_name",
                  original_label: "Principal full name",
                  original_required: false,
                  original_when: inCondition("document_type", "general"),
                },
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "people",
                  field_key: "principal_full_name",
                  original_label: "Principal full name",
                  original_required: true,
                  original_when: inCondition("document_type", "rrr"),
                },
                {
                  family: "idn",
                  document_type: "acknowledgment",
                  section_key: "people",
                  field_key: "principal_full_name",
                  original_label: "Principal full name",
                  original_required: true,
                  original_when: inCondition("document_type", "acknowledgment"),
                },
              ],
            },
          ],
        },
      ],
    },
    familyContracts: [
      {
        family: "poa",
        documentType: "general",
        factContext: {
          document_type: "general",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        factContext: {
          document_type: "rrr",
        },
      },
      {
        family: "idn",
        documentType: "acknowledgment",
        factContext: {
          document_type: "acknowledgment",
        },
      },
    ],
    sourceConditionContexts: [
      {
        family: "poa",
        documentType: "general",
        sectionKey: "people",
        fieldKey: "principal_full_name",
        facts: {
          document_type: "general",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "people",
        fieldKey: "principal_full_name",
        facts: {
          document_type: "rrr",
        },
      },
      {
        family: "idn",
        documentType: "acknowledgment",
        sectionKey: "people",
        fieldKey: "principal_full_name",
        facts: {
          document_type: "acknowledgment",
        },
      },
    ],
  };
};

const buildIdnOnlySourceContract = (): MemberFormRulesContract => {
  return {
    aggregatedForm: {
      sections: [
        {
          key: "basic_info",
          title: "Basic Information",
          fields: [
            {
              canonical_key: "principal_full_name",
              required: true,
              condition_merge_mode: "source_only",
              sources: [
                {
                  family: "idn",
                  document_type: "acknowledgment",
                  section_key: "people",
                  field_key: "principal_full_name",
                  original_label: "Principal full name",
                  original_required: true,
                  original_when: inCondition("document_type", "acknowledgment"),
                },
              ],
            },
          ],
        },
      ],
    },
    familyContracts: [
      {
        family: "idn",
        documentType: "acknowledgment",
        factContext: {
          document_type: "acknowledgment",
        },
      },
    ],
    sourceConditionContexts: [
      {
        family: "idn",
        documentType: "acknowledgment",
        sectionKey: "people",
        fieldKey: "principal_full_name",
        facts: {
          document_type: "acknowledgment",
        },
      },
    ],
  };
};

const buildExclusionContract = (): MemberFormRulesContract => {
  return {
    aggregatedForm: {
      sections: [
        {
          key: "basic_info",
          title: "Basic Information",
          fields: [
            {
              canonical_key: "document_title",
              required: false,
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "document_context",
                  field_key: "document_title",
                  original_label: "Document title",
                },
              ],
            },
            {
              canonical_key: "document_type",
              required: false,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "document_context",
                  field_key: "document_type",
                  original_label: "Document type",
                },
              ],
            },
            {
              canonical_key: "poa_type",
              required: false,
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "document_context",
                  field_key: "poa_type",
                  original_label: "POA type",
                },
              ],
            },
            {
              canonical_key: "trustee_signature_authority",
              required: false,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "authority",
                  field_key: "trustee_signature_authority",
                  original_label: "Trustee signature authority",
                },
              ],
            },
            {
              canonical_key: "jurisdiction",
              required: true,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "document_context",
                  field_key: "jurisdiction",
                  original_label: "Jurisdiction",
                  original_required: true,
                },
              ],
            },
          ],
        },
      ],
    },
    familyContracts: [
      {
        family: "poa",
        documentType: "general",
        factContext: {
          document_type: "general",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        factContext: {
          document_type: "rrr",
        },
      },
    ],
    sourceConditionContexts: [
      {
        family: "poa",
        documentType: "general",
        sectionKey: "document_context",
        fieldKey: "document_title",
        facts: {
          document_type: "general",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "document_context",
        fieldKey: "document_type",
        facts: {
          document_type: "rrr",
        },
      },
      {
        family: "poa",
        documentType: "general",
        sectionKey: "document_context",
        fieldKey: "poa_type",
        facts: {
          document_type: "general",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "authority",
        fieldKey: "trustee_signature_authority",
        facts: {
          document_type: "rrr",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "document_context",
        fieldKey: "jurisdiction",
        facts: {
          document_type: "rrr",
        },
      },
    ],
  };
};

const buildConditionalRequiredContract = (): MemberFormRulesContract => {
  return {
    aggregatedForm: {
      sections: [
        {
          key: "documents",
          title: "Documents",
          fields: [
            {
              canonical_key: "restatement_context_type",
              required: true,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "document_context",
                  field_key: "restatement_summary",
                  original_label: "Restatement summary",
                  original_required: false,
                },
              ],
            },
            {
              canonical_key: "prior_document_items",
              required: false,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "documents",
                  field_key: "prior_document_items",
                  original_label: "Prior document items",
                  original_required: false,
                },
              ],
            },
          ],
        },
      ],
    },
    familyContracts: [
      {
        family: "trust",
        documentType: "rrr",
        factContext: {
          document_type: "rrr",
        },
      },
    ],
    sourceConditionContexts: [
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "document_context",
        fieldKey: "restatement_summary",
        facts: {
          document_type: "rrr",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "documents",
        fieldKey: "prior_document_items",
        facts: {
          document_type: "rrr",
        },
      },
    ],
  };
};

const buildFamilyGroupingContract = (): MemberFormRulesContract => {
  return {
    aggregatedForm: {
      sections: [
        {
          key: "people",
          title: "People",
          fields: [
            {
              canonical_key: "shared_field",
              required: true,
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "people",
                  field_key: "principal_full_name",
                  original_label: "Principal",
                },
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "people",
                  field_key: "grantors",
                  original_label: "Grantors",
                },
              ],
            },
            {
              canonical_key: "trust_only_field",
              required: false,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "people",
                  field_key: "trustees",
                  original_label: "Trustees",
                },
              ],
            },
            {
              canonical_key: "poa_only_field",
              required: false,
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "people",
                  field_key: "agent_full_name",
                  original_label: "Agent",
                },
              ],
            },
          ],
        },
      ],
    },
    familyContracts: [
      {
        family: "poa",
        documentType: "general",
        factContext: {
          document_type: "general",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        factContext: {
          document_type: "rrr",
        },
      },
    ],
    sourceConditionContexts: [
      {
        family: "poa",
        documentType: "general",
        sectionKey: "people",
        fieldKey: "principal_full_name",
        facts: {
          document_type: "general",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "people",
        fieldKey: "grantors",
        facts: {
          document_type: "rrr",
        },
      },
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "people",
        fieldKey: "trustees",
        facts: {
          document_type: "rrr",
        },
      },
      {
        family: "poa",
        documentType: "general",
        sectionKey: "people",
        fieldKey: "agent_full_name",
        facts: {
          document_type: "general",
        },
      },
    ],
  };
};

const buildRevocationCustomContract = (): MemberFormRulesContract => {
  return {
    aggregatedForm: {
      sections: [
        {
          key: "authority",
          title: "Authority",
          fields: [
            {
              canonical_key: "revocation_holders",
              required: false,
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "authority",
                  field_key: "revocation_holders",
                  original_label: "Revocation holders",
                },
              ],
            },
            {
              canonical_key: "revocation_holders_custom_text",
              required: true,
              when: {
                all: [
                  {
                    fact: "revocation_holders",
                    operator: "equals",
                    value: "custom",
                  },
                ],
              },
              sources: [
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "authority",
                  field_key: "revocation_holders",
                  original_label: "Revocation holders",
                },
              ],
            },
          ],
        },
      ],
    },
    familyContracts: [
      {
        family: "trust",
        documentType: "rrr",
        factContext: {
          document_type: "rrr",
        },
      },
    ],
    sourceConditionContexts: [
      {
        family: "trust",
        documentType: "rrr",
        sectionKey: "authority",
        fieldKey: "revocation_holders",
        facts: {
          document_type: "rrr",
        },
      },
    ],
  };
};

describe("memberFormRuntime - source_only behavior", () => {
  it("computes visible/required from POA+Trust active source conditions", () => {
    const contract = buildSourceOnlyContract();

    const runtime = computeFieldRuntime(contract);
    const field = runtime.get("principal_full_name");

    expect(field?.visible).toBe(true);
    expect(field?.required).toBe(true);
    expect(field?.activeSources).toHaveLength(2);
    expect(field?.activeSources.map((source) => source.family)).toEqual(
      expect.arrayContaining(["poa", "trust"]),
    );
    expect(field?.activeSources).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          family: "idn",
        }),
      ]),
    );
  });

  it("hides fields when only IDN sources exist", () => {
    const contract = buildIdnOnlySourceContract();

    const runtime = computeFieldRuntime(contract);
    const visibleSections = getVisibleSections(contract, runtime);

    expect(runtime.get("principal_full_name")).toEqual({
      visible: false,
      required: false,
      activeSources: [],
    });
    expect(visibleSections).toHaveLength(0);
  });

  it("suppresses document title/type from visible member form", () => {
    const contract = buildExclusionContract();

    const runtime = computeFieldRuntime(contract);
    const visibleSections = getVisibleSections(contract, runtime);

    expect(runtime.get("document_title")).toEqual({
      visible: false,
      required: false,
      activeSources: [],
    });
    expect(runtime.get("document_type")).toEqual({
      visible: false,
      required: false,
      activeSources: [],
    });
    expect(runtime.get("poa_type")).toEqual({
      visible: false,
      required: false,
      activeSources: [],
    });
    expect(runtime.get("trustee_signature_authority")).toEqual({
      visible: false,
      required: false,
      activeSources: [],
    });
    expect(runtime.get("jurisdiction")).toEqual({
      visible: false,
      required: false,
      activeSources: [],
    });
    expect(visibleSections).toHaveLength(0);
  });

  it("makes prior document items required only for amendment/restatement flows", () => {
    const contract = buildConditionalRequiredContract();

    const initialRuntime = computeFieldRuntime(contract, {
      restatement_context_type: "initial_registration",
    });
    const amendmentRuntime = computeFieldRuntime(contract, {
      restatement_context_type: "amendment",
    });
    const unsureRuntime = computeFieldRuntime(contract, {
      restatement_context_type: "unsure",
    });

    expect(initialRuntime.get("prior_document_items")?.required).toBe(false);
    expect(amendmentRuntime.get("prior_document_items")?.required).toBe(true);
    expect(unsureRuntime.get("prior_document_items")?.required).toBe(false);
  });

  it("groups section fields by shared/trust/poa scopes without duplication", () => {
    const contract = buildFamilyGroupingContract();
    const runtime = computeFieldRuntime(contract);
    const section = contract.aggregatedForm.sections[0];

    expect(section).toBeDefined();

    const groups = groupSectionFieldsByFamily(section!, runtime);

    expect(groups.map((group) => group.scope)).toEqual(["poa", "trust", "shared"]);
    expect(groups.find((group) => group.scope === "shared")?.fields).toHaveLength(1);
    expect(groups.find((group) => group.scope === "trust")?.fields).toHaveLength(1);
    expect(groups.find((group) => group.scope === "poa")?.fields).toHaveLength(1);

    const allKeys = groups.flatMap((group) =>
      group.fields.map((field) => field.canonical_key),
    );
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it("shows revocation custom field only when custom option is selected", () => {
    const contract = buildRevocationCustomContract();

    const defaultRuntime = computeFieldRuntime(contract, {
      revocation_holders: "trustmaker_only",
    });
    const customRuntime = computeFieldRuntime(contract, {
      revocation_holders: "custom",
    });

    expect(defaultRuntime.get("revocation_holders_custom_text")?.visible).toBe(false);
    expect(defaultRuntime.get("revocation_holders_custom_text")?.required).toBe(false);
    expect(customRuntime.get("revocation_holders_custom_text")?.visible).toBe(true);
    expect(customRuntime.get("revocation_holders_custom_text")?.required).toBe(true);
  });

  it("prefills trust name when jurisdiction is selected", () => {
    const contract: MemberFormRulesContract = {
      aggregatedForm: {
        sections: [
          {
            key: "basic_info",
            fields: [
              {
                canonical_key: "trust_name",
                required: true,
                sources: [
                  {
                    family: "trust",
                    document_type: "rrr",
                    section_key: "trust_identity",
                    field_key: "trust_name",
                    original_label: "Trust name",
                    original_required: true,
                  },
                ],
              },
            ],
          },
        ],
      },
      familyContracts: [
        {
          family: "trust",
          documentType: "rrr",
          factContext: {
            document_type: "rrr",
          },
        },
      ],
      sourceConditionContexts: [],
    };

    const initialValues = buildInitialMemberFormValues(contract, {
      jurisdictionCode: "US-CA",
      jurisdictionLabel: "California",
    });

    expect(initialValues).toEqual({
      trust_name: "California Trust",
    });
  });
});
