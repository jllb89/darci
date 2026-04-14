import { describe, expect, it } from "vitest";
import {
  validateMemberFormSubmission,
  type MemberFormSubmissionValue,
} from "../../src/services/memberFormValidationService";
import type { MemberFormRulesContract } from "../../src/services/memberFormRulesService";

const buildTrustContract = (): MemberFormRulesContract => {
  return {
    jurisdiction: "US-CA",
    families: ["trust"],
    documentTypes: ["rrr"],
    aggregatedForm: {
      jurisdiction: "US-CA",
      families: ["trust"],
      document_types: ["rrr"],
      sections: [
        {
          key: "people",
          title: "People",
          fields: [
            {
              canonical_key: "grantors",
              label: "Trustmakers",
              semantic_type: "person_list",
              data_type: "array",
              required: true,
              repeatable: true,
              sources: [],
              ui_group: "people",
            },
            {
              canonical_key: "trustees",
              label: "Trustees",
              semantic_type: "person_list",
              data_type: "array",
              required: true,
              repeatable: true,
              sources: [],
              ui_group: "people",
            },
            {
              canonical_key: "trustee_signature_authority",
              label: "Trustee signature authority",
              semantic_type: "signature_authority_rule",
              data_type: "string",
              required: false,
              repeatable: false,
              sources: [],
              ui_group: "authority",
            },
            {
              canonical_key: "tax_id_owner",
              label: "Primary tax ID owner",
              semantic_type: "tax_id_owner",
              data_type: "string",
              required: false,
              repeatable: false,
              validation: {
                selection_source_field: "grantors",
                enforce_source_selection_when_multiple: true,
              },
              sources: [],
              ui_group: "authority",
            },
          ],
        },
      ],
      source_trace: [],
    },
    familyContracts: [],
    sourceConditionContexts: [],
  };
};

const buildFormValues = (
  overrides: Partial<Record<string, MemberFormSubmissionValue>>,
): Record<string, MemberFormSubmissionValue> => {
  const trusteeAlice = JSON.stringify({
    fullName: "Alice Trustee",
    isSigningTrustee: true,
  });

  return {
    grantors: ["Alice Trustmaker", "Bob Trustmaker"],
    tax_id_owner: "Alice Trustmaker",
    trustees: [trusteeAlice],
    trustee_signature_authority: "named_signing_trustee",
    ...overrides,
  };
};

describe("memberFormValidationService", () => {
  it("passes when trustmaker-bound tax ID owner matches entered trustmakers", () => {
    const contract = buildTrustContract();

    const result = validateMemberFormSubmission(contract, buildFormValues({}));

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails when multiple trustmakers exist and tax ID owner is missing", () => {
    const contract = buildTrustContract();

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        tax_id_owner: "",
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "trust_tax_id_owner_required")).toBe(
      true,
    );
  });

  it("fails when tax ID owner is not in trustmaker source list", () => {
    const contract = buildTrustContract();

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        tax_id_owner: "Charlie",
      }),
    );

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (error) => error.code === "trust_tax_id_owner_not_in_source_list",
      ),
    ).toBe(true);
  });

  it("fails when signature authority mode is missing", () => {
    const contract = buildTrustContract();

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        trustee_signature_authority: "",
      }),
    );

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.code === "trust_signature_authority_required"),
    ).toBe(true);
  });

  it("fails when named signing authority is selected but no trustee is marked as signer", () => {
    const contract = buildTrustContract();
    const trusteeAlice = JSON.stringify({
      fullName: "Alice Trustee",
      isSigningTrustee: false,
    });

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        trustees: [trusteeAlice],
        trustee_signature_authority: "named_signing_trustee",
      }),
    );

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.code === "trust_named_signing_trustee_required"),
    ).toBe(true);
  });

  it("fails when multiple named signing trustees are selected", () => {
    const contract = buildTrustContract();
    const trusteeAlice = JSON.stringify({
      fullName: "Alice Trustee",
      isSigningTrustee: true,
    });
    const trusteeBob = JSON.stringify({
      fullName: "Bob Trustee",
      isSigningTrustee: true,
    });

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        trustees: [trusteeAlice, trusteeBob],
        trustee_signature_authority: "named_signing_trustee",
      }),
    );

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((error) => error.code === "trust_named_signing_trustee_multiple"),
    ).toBe(true);
  });

  it("fails when custom signing authority mode is selected without custom text", () => {
    const contract = buildTrustContract();
    const trusteeAlice = JSON.stringify({
      fullName: "Alice Trustee",
      isSigningTrustee: false,
    });

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        trustees: [trusteeAlice],
        trustee_signature_authority: "custom",
      }),
    );

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (error) => error.code === "trust_custom_signing_authority_required",
      ),
    ).toBe(true);
  });

  it("allows structured signature authority modes for future signing-authority parity", () => {
    const contract = buildTrustContract();
    const trusteeAlice = JSON.stringify({
      fullName: "Alice Trustee",
      isSigningTrustee: false,
    });

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        trustees: [trusteeAlice],
        trustee_signature_authority: "all_trustees",
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("allows custom signing authority mode with custom instructions", () => {
    const contract = buildTrustContract();
    const trusteeAlice = JSON.stringify({
      fullName: "Alice Trustee",
      isSigningTrustee: false,
    });

    const result = validateMemberFormSubmission(
      contract,
      buildFormValues({
        trustees: [trusteeAlice],
        trustee_signature_authority: "custom",
        trustee_signature_authority_custom_text:
          "Trustees may sign as delegated in the attached trustee resolution.",
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
