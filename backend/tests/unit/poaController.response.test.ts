import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildPoaRequirementResponse } from "../../src/controllers/poaController.ts";

describe("getPoaRequirementByJurisdiction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized form rules, glossary, special authorities, and glossary-enriched input requirements", () => {
    const response = buildPoaRequirementResponse({
      requirement: {
        id: "poa-ca-1",
        jurisdiction: "US-CA",
        poa_type: "general",
        ui_profile: "notary_or_witness",
        notarization_rule: "alternative_to_witnesses",
        witness_rule: "alternative_to_notary",
        witness_count: 2,
        durability_rule: "requires_explicit_language",
        statutory_form_rule: "available",
        effective_date_rule: "upon_execution_unless_specified",
        competency_rule: "contract_capacity_required",
        special_authority_rule: "required_for_certain_acts",
        allows_agent_certification: false,
        requires_principal_signature: true,
        allows_proxy_signature: true,
        requires_acknowledgment_certificate: false,
        governing_law: "California Probate Code",
        execution_requirements_text: "Signed by principal or another in principal's presence",
        acknowledgment_witnessing_text: "Acknowledged before notary public or two witnesses",
        durability_text: "Durable if specific language included",
        special_authority_text: "Certain powers require additional authorization.",
        competency_text: "Capacity to contract required.",
        statutory_form_text: "A statutory form exists.",
        effective_date_text: "Upon execution unless otherwise specified.",
        source_citation: "Cal. Prob. Code §§ 4121, 4122, 4124, 4401, 4264",
        source_url: null,
        review_status: "needs_review",
        reviewed_at: null,
        notes: "starter row",
        created_at: "2026-03-27T00:00:00.000Z",
        updated_at: "2026-03-27T00:00:00.000Z",
      },
      formRules: {
        id: "form-1",
        poa_requirement_id: "poa-ca-1",
        statutory_form_exists: true,
        statutory_form_recommended: true,
        statutory_form_mandatory_for_product: false,
        must_track_statutory_ordering: true,
        must_track_statutory_headings: true,
        must_include_warning_to_principal: true,
        must_include_notice_to_agent: true,
        special_authorities_render_mode: "checklist_with_initials",
        freeform_special_authority_text_allowed: false,
        hybrid_rendering_allowed: false,
        attorney_customization_recommended: true,
        source_citation: "Cal. Prob. Code § 4401",
        source_url: null,
        legal_review_status: "pending",
        reviewed_at: null,
        reviewed_by: null,
        review_notes: "confirm form layout",
        created_at: "2026-03-27T00:00:00.000Z",
        updated_at: "2026-03-27T00:00:00.000Z",
      },
      glossary: [
        {
          id: "glossary-1",
          poa_requirement_id: "poa-ca-1",
          glossary_key: "principal",
          generic_label: "Principal",
          state_specific_label: null,
          product_description: "The principal is the person granting authority.",
          why_user_needs_this: "Explains who is granting the power.",
          source_citation: "Cal. Prob. Code § 4022",
          source_url: null,
          is_materially_state_specific: false,
          legal_review_status: "pending",
          reviewed_at: null,
          reviewed_by: null,
          review_notes: null,
          sort_order: 10,
          created_at: "2026-03-27T00:00:00.000Z",
          updated_at: "2026-03-27T00:00:00.000Z",
        },
        {
          id: "glossary-2",
          poa_requirement_id: "poa-ca-1",
          glossary_key: "special_authority",
          generic_label: "Special authority",
          state_specific_label: null,
          product_description: "Some powers require more explicit authorization.",
          why_user_needs_this: "Explains why some powers are separately listed.",
          source_citation: "Cal. Prob. Code § 4264",
          source_url: null,
          is_materially_state_specific: false,
          legal_review_status: "pending",
          reviewed_at: null,
          reviewed_by: null,
          review_notes: null,
          sort_order: 20,
          created_at: "2026-03-27T00:00:00.000Z",
          updated_at: "2026-03-27T00:00:00.000Z",
        },
        {
          id: "glossary-3",
          poa_requirement_id: "poa-ca-1",
          glossary_key: "proxy_signer",
          generic_label: "Proxy signer",
          state_specific_label: null,
          product_description:
            "California allows another person to sign for the principal at the principal's direction in the principal's conscious presence.",
          why_user_needs_this: "Explains when DARCI needs proxy signer details.",
          source_citation: "Cal. Prob. Code § 4121",
          source_url: null,
          is_materially_state_specific: true,
          legal_review_status: "pending",
          reviewed_at: null,
          reviewed_by: null,
          review_notes: null,
          sort_order: 30,
          created_at: "2026-03-27T00:00:00.000Z",
          updated_at: "2026-03-27T00:00:00.000Z",
        },
      ],
      specialAuthorities: [
        {
          id: "authority-1",
          canonical_key: "make_gifts",
          canonical_label: "Make gifts",
          canonical_description: "Authority to make gifts of the principal's property.",
          category: "estate_planning",
          sort_order: 20,
          is_core_national_key: true,
          explicitly_required: true,
          requirement_type: "separate_initials",
          applies_to_general_financial_poa: true,
          statutory_form_only: true,
          custom_language_required: false,
          initials_required: true,
          checkbox_required: true,
          freeform_text_allowed: false,
          state_specific_label: null,
          statutory_text_excerpt: "To make gifts.",
          exact_statute_citation: "Cal. Prob. Code §§ 4264, 4401",
          source_url: null,
          plain_english_rule: "Gift authority must be separately granted and initialed in the statutory form.",
          confidence: "medium",
          legal_review_status: "pending",
          reviewed_at: null,
          reviewed_by: null,
          review_notes: "starter mapping",
          effective_start_date: null,
          effective_end_date: null,
          renderer_metadata: { render_mode: "checklist_with_initials" },
        },
      ],
    });

    expect(response.requirement.jurisdiction).toBe("US-CA");
    expect(response.requirement.formRules?.specialAuthoritiesRenderMode).toBe(
      "checklist_with_initials",
    );
    expect(response.requirement.glossary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "principal",
          label: "Principal",
        }),
      ]),
    );
    expect(response.requirement.specialAuthorities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "make_gifts",
          requirementType: "separate_initials",
          plainEnglishRule:
            "Gift authority must be separately granted and initialed in the statutory form.",
        }),
      ]),
    );

    const principalSection = response.requirement.inputRequirements.sections.find(
      (section) => section.key === "principal",
    );
    const authorityScopeSection = response.requirement.inputRequirements.sections.find(
      (section) => section.key === "authority_scope",
    );

    expect(principalSection?.description).toBe(
      "The principal is the person granting authority.",
    );
    expect(authorityScopeSection?.description).toBe(
      "Some powers require more explicit authorization.",
    );
    expect(authorityScopeSection?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "special_authorities",
          helpText: "Some powers require more explicit authorization.",
        }),
      ]),
    );

    expect(principalSection?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "proxy_signer_name",
          helpText:
            "California allows another person to sign for the principal at the principal's direction in the principal's conscious presence.",
        }),
      ]),
    );
  });
});