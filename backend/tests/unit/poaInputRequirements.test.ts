import { describe, expect, it } from "vitest";
import {
  derivePoaInputRequirements,
  type PoaInputRequirements,
} from "../../src/services/poaInputRequirements";
import type { PoaRequirementRecord } from "../../src/services/poaService";

const buildRecord = (
  overrides: Partial<PoaRequirementRecord>,
): PoaRequirementRecord => ({
  id: "poa-1",
  jurisdiction: "US-CA",
  poa_type: "general",
  ui_profile: "standard",
  notarization_rule: "required",
  witness_rule: "none",
  witness_count: null,
  durability_rule: "requires_explicit_language",
  statutory_form_rule: "available",
  effective_date_rule: "not_addressed",
  competency_rule: "general_capacity_required",
  special_authority_rule: "required_for_certain_acts",
  allows_agent_certification: false,
  requires_principal_signature: true,
  allows_proxy_signature: false,
  requires_acknowledgment_certificate: false,
  governing_law: null,
  execution_requirements_text: null,
  acknowledgment_witnessing_text: null,
  durability_text: null,
  special_authority_text: null,
  competency_text: null,
  statutory_form_text: null,
  effective_date_text: null,
  source_citation: null,
  source_url: null,
  review_status: "draft",
  reviewed_at: null,
  notes: null,
  created_at: "2026-03-27T00:00:00.000Z",
  updated_at: "2026-03-27T00:00:00.000Z",
  ...overrides,
});

const getSection = (requirements: PoaInputRequirements, key: string) => {
  return requirements.sections.find((section) => section.key === key);
};

describe("derivePoaInputRequirements", () => {
  it("builds dual execution paths for California-style notary-or-witness rules", () => {
    const requirements = derivePoaInputRequirements(
      buildRecord({
        jurisdiction: "US-CA",
        ui_profile: "notary_or_witness",
        notarization_rule: "alternative_to_witnesses",
        witness_rule: "alternative_to_notary",
        witness_count: 2,
        competency_rule: "contract_capacity_required",
      }),
    );

    expect(requirements.workflow.executionPaths.map((path) => path.key)).toEqual([
      "notary_acknowledgment",
      "witness_execution",
    ]);
    expect(getSection(requirements, "execution_choice")?.presence).toBe("required");
    expect(getSection(requirements, "witnesses")?.presence).toBe("conditional");
    expect(requirements.documentOutputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "notary_acknowledgment" }),
        expect.objectContaining({ key: "witness_attestation" }),
      ]),
    );
  });

  it("applies Florida override to require notary and two witnesses", () => {
    const requirements = derivePoaInputRequirements(
      buildRecord({
        jurisdiction: "US-FL",
        ui_profile: "notary_only",
        notarization_rule: "required",
        witness_rule: "none",
        witness_count: null,
      }),
    );

    expect(requirements.derivationMode).toBe("rules_plus_overrides");
    expect(requirements.workflow.executionPaths).toEqual([
      {
        key: "notary_and_witness_execution",
        label: "Notary and two witnesses required",
        default: true,
        availability: "required",
      },
    ]);
    expect(getSection(requirements, "witnesses")?.fields[0]?.validation).toEqual({
      min: 2,
      max: 2,
    });
    expect(requirements.notices.some((notice) => notice.key === "witness_count_needs_confirmation")).toBe(false);
  });

  it("adds recording requirements for conditional durability states", () => {
    const requirements = derivePoaInputRequirements(
      buildRecord({
        jurisdiction: "US-SC",
        ui_profile: "notary_and_witness",
        notarization_rule: "required",
        witness_rule: "additional_to_notary",
        witness_count: null,
        durability_rule: "conditional",
      }),
    );

    expect(getSection(requirements, "durability")?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "recording_status", required: true }),
      ]),
    );
    expect(requirements.documentOutputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "recording_confirmation", required: true }),
      ]),
    );
    expect(requirements.notices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "durability_depends_on_recording" }),
        expect.objectContaining({ key: "witness_count_needs_confirmation" }),
      ]),
    );
  });
});