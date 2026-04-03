import { describe, expect, it } from "vitest";
import {
  computeFieldRuntime,
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
              canonical_key: "jurisdiction",
              required: false,
              condition_merge_mode: "source_only",
              sources: [
                {
                  family: "poa",
                  document_type: "general",
                  section_key: "document_context",
                  field_key: "jurisdiction",
                  original_label: "Jurisdiction",
                  original_required: false,
                  original_when: inCondition("document_type", "general"),
                },
                {
                  family: "trust",
                  document_type: "rrr",
                  section_key: "document_context",
                  field_key: "jurisdiction",
                  original_label: "Jurisdiction",
                  original_required: true,
                  original_when: inCondition("document_type", "rrr"),
                },
                {
                  family: "idn",
                  document_type: "acknowledgment",
                  section_key: "document_context",
                  field_key: "jurisdiction",
                  original_label: "Jurisdiction",
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
        sectionKey: "document_context",
        fieldKey: "jurisdiction",
        facts: {
          document_type: "general",
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
      {
        family: "idn",
        documentType: "acknowledgment",
        sectionKey: "document_context",
        fieldKey: "jurisdiction",
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
              canonical_key: "jurisdiction",
              required: true,
              condition_merge_mode: "source_only",
              sources: [
                {
                  family: "idn",
                  document_type: "acknowledgment",
                  section_key: "document_context",
                  field_key: "jurisdiction",
                  original_label: "Jurisdiction",
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
        sectionKey: "document_context",
        fieldKey: "jurisdiction",
        facts: {
          document_type: "acknowledgment",
        },
      },
    ],
  };
};

describe("memberFormRuntime - source_only behavior", () => {
  it("computes visible/required from POA+Trust active source conditions", () => {
    const contract = buildSourceOnlyContract();

    const runtime = computeFieldRuntime(contract);
    const field = runtime.get("jurisdiction");

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

    expect(runtime.get("jurisdiction")).toEqual({
      visible: false,
      required: false,
      activeSources: [],
    });
    expect(visibleSections).toHaveLength(0);
  });
});
