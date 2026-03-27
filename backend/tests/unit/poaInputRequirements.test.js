"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const poaInputRequirements_1 = require("../../src/services/poaInputRequirements");
const buildRecord = (overrides) => ({
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
const getSection = (requirements, key) => {
    return requirements.sections.find((section) => section.key === key);
};
(0, vitest_1.describe)("derivePoaInputRequirements", () => {
    (0, vitest_1.it)("builds dual execution paths for California-style notary-or-witness rules", () => {
        const requirements = (0, poaInputRequirements_1.derivePoaInputRequirements)(buildRecord({
            jurisdiction: "US-CA",
            ui_profile: "notary_or_witness",
            notarization_rule: "alternative_to_witnesses",
            witness_rule: "alternative_to_notary",
            witness_count: 2,
            competency_rule: "contract_capacity_required",
        }));
        (0, vitest_1.expect)(requirements.workflow.executionPaths.map((path) => path.key)).toEqual([
            "notary_acknowledgment",
            "witness_execution",
        ]);
        (0, vitest_1.expect)(getSection(requirements, "execution_choice")?.presence).toBe("required");
        (0, vitest_1.expect)(getSection(requirements, "witnesses")?.presence).toBe("conditional");
        (0, vitest_1.expect)(requirements.documentOutputs).toEqual(vitest_1.expect.arrayContaining([
            vitest_1.expect.objectContaining({ key: "notary_acknowledgment" }),
            vitest_1.expect.objectContaining({ key: "witness_attestation" }),
        ]));
    });
    (0, vitest_1.it)("applies Florida override to require notary and two witnesses", () => {
        const requirements = (0, poaInputRequirements_1.derivePoaInputRequirements)(buildRecord({
            jurisdiction: "US-FL",
            ui_profile: "notary_only",
            notarization_rule: "required",
            witness_rule: "none",
            witness_count: null,
        }));
        (0, vitest_1.expect)(requirements.derivationMode).toBe("rules_plus_overrides");
        (0, vitest_1.expect)(requirements.workflow.executionPaths).toEqual([
            {
                key: "notary_and_witness_execution",
                label: "Notary and two witnesses required",
                default: true,
                availability: "required",
            },
        ]);
        (0, vitest_1.expect)(getSection(requirements, "witnesses")?.fields[0]?.validation).toEqual({
            min: 2,
            max: 2,
        });
        (0, vitest_1.expect)(requirements.notices.some((notice) => notice.key === "witness_count_needs_confirmation")).toBe(false);
    });
    (0, vitest_1.it)("adds recording requirements for conditional durability states", () => {
        const requirements = (0, poaInputRequirements_1.derivePoaInputRequirements)(buildRecord({
            jurisdiction: "US-SC",
            ui_profile: "notary_and_witness",
            notarization_rule: "required",
            witness_rule: "additional_to_notary",
            witness_count: null,
            durability_rule: "conditional",
        }));
        (0, vitest_1.expect)(getSection(requirements, "durability")?.fields).toEqual(vitest_1.expect.arrayContaining([
            vitest_1.expect.objectContaining({ key: "recording_status", required: true }),
        ]));
        (0, vitest_1.expect)(requirements.documentOutputs).toEqual(vitest_1.expect.arrayContaining([
            vitest_1.expect.objectContaining({ key: "recording_confirmation", required: true }),
        ]));
        (0, vitest_1.expect)(requirements.notices).toEqual(vitest_1.expect.arrayContaining([
            vitest_1.expect.objectContaining({ key: "durability_depends_on_recording" }),
            vitest_1.expect.objectContaining({ key: "witness_count_needs_confirmation" }),
        ]));
    });
});
//# sourceMappingURL=poaInputRequirements.test.js.map