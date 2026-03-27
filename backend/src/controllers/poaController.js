"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPoaJurisdictionsForType = exports.getPoaRequirementByJurisdiction = void 0;
const zod_1 = require("zod");
const poaInputRequirements_1 = require("../services/poaInputRequirements");
const validation_1 = require("../utils/validation");
const poaService_1 = require("../services/poaService");
const poaRequirementQuerySchema = zod_1.z.object({
    type: zod_1.z.enum(poaService_1.poaTypes).optional(),
});
const getPoaRequirementByJurisdiction = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            error: "unauthorized",
            message: "Missing user context",
        });
    }
    if (typeof req.params.jurisdiction !== "string" || !req.params.jurisdiction.trim()) {
        return res.status(400).json({
            error: "validation_error",
            message: "jurisdiction is required",
            details: [
                {
                    path: "jurisdiction",
                    message: "jurisdiction is required",
                },
            ],
        });
    }
    const parsedQuery = poaRequirementQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
        return (0, validation_1.sendValidationError)(res, parsedQuery.error);
    }
    try {
        const jurisdiction = (0, poaService_1.normalizeJurisdiction)(req.params.jurisdiction);
        const poaType = parsedQuery.data.type ?? "general";
        const details = await (0, poaService_1.getPoaRequirementDetails)(jurisdiction, poaType);
        if (!details) {
            return res.status(404).json({
                error: "not_found",
                message: "POA requirements not found",
            });
        }
        const { requirement, formRules, glossary, specialAuthorities } = details;
        return res.status(200).json({
            requirement: {
                id: requirement.id,
                jurisdiction: requirement.jurisdiction,
                poaType: requirement.poa_type,
                uiProfile: requirement.ui_profile,
                reviewStatus: requirement.review_status,
                reviewedAt: requirement.reviewed_at,
                requirements: {
                    notarizationRule: requirement.notarization_rule,
                    witnessRule: requirement.witness_rule,
                    witnessCount: requirement.witness_count,
                    durabilityRule: requirement.durability_rule,
                    statutoryFormRule: requirement.statutory_form_rule,
                    effectiveDateRule: requirement.effective_date_rule,
                    competencyRule: requirement.competency_rule,
                    specialAuthorityRule: requirement.special_authority_rule,
                    allowsAgentCertification: requirement.allows_agent_certification ?? false,
                    requiresPrincipalSignature: requirement.requires_principal_signature ?? true,
                    allowsProxySignature: requirement.allows_proxy_signature ?? false,
                    requiresAcknowledgmentCertificate: requirement.requires_acknowledgment_certificate ?? false,
                },
                legalText: {
                    governingLaw: requirement.governing_law,
                    executionRequirements: requirement.execution_requirements_text,
                    acknowledgmentWitnessing: requirement.acknowledgment_witnessing_text,
                    durability: requirement.durability_text,
                    specialAuthority: requirement.special_authority_text,
                    competency: requirement.competency_text,
                    statutoryForm: requirement.statutory_form_text,
                    effectiveDate: requirement.effective_date_text,
                },
                source: {
                    citation: requirement.source_citation,
                    url: requirement.source_url,
                    notes: requirement.notes,
                },
                formRules: formRules
                    ? {
                        statutoryFormExists: formRules.statutory_form_exists,
                        statutoryFormRecommended: formRules.statutory_form_recommended,
                        statutoryFormMandatoryForProduct: formRules.statutory_form_mandatory_for_product,
                        mustTrackStatutoryOrdering: formRules.must_track_statutory_ordering,
                        mustTrackStatutoryHeadings: formRules.must_track_statutory_headings,
                        mustIncludeWarningToPrincipal: formRules.must_include_warning_to_principal,
                        mustIncludeNoticeToAgent: formRules.must_include_notice_to_agent,
                        specialAuthoritiesRenderMode: formRules.special_authorities_render_mode,
                        freeformSpecialAuthorityTextAllowed: formRules.freeform_special_authority_text_allowed,
                        hybridRenderingAllowed: formRules.hybrid_rendering_allowed,
                        attorneyCustomizationRecommended: formRules.attorney_customization_recommended,
                        sourceCitation: formRules.source_citation,
                        sourceUrl: formRules.source_url,
                        legalReviewStatus: formRules.legal_review_status,
                        reviewedAt: formRules.reviewed_at,
                        reviewedBy: formRules.reviewed_by,
                        reviewNotes: formRules.review_notes,
                    }
                    : null,
                glossary: glossary.map((term) => ({
                    key: term.glossary_key,
                    genericLabel: term.generic_label,
                    stateSpecificLabel: term.state_specific_label,
                    label: term.state_specific_label ?? term.generic_label,
                    productDescription: term.product_description,
                    whyUserNeedsThis: term.why_user_needs_this,
                    sourceCitation: term.source_citation,
                    sourceUrl: term.source_url,
                    isMateriallyStateSpecific: term.is_materially_state_specific,
                    legalReviewStatus: term.legal_review_status,
                    reviewedAt: term.reviewed_at,
                    reviewedBy: term.reviewed_by,
                    reviewNotes: term.review_notes,
                    sortOrder: term.sort_order,
                })),
                specialAuthorities: specialAuthorities.map((authority) => ({
                    key: authority.canonical_key,
                    label: authority.state_specific_label ?? authority.canonical_label,
                    canonicalLabel: authority.canonical_label,
                    description: authority.canonical_description,
                    category: authority.category,
                    sortOrder: authority.sort_order,
                    isCoreNationalKey: authority.is_core_national_key,
                    explicitlyRequired: authority.explicitly_required,
                    requirementType: authority.requirement_type,
                    appliesToGeneralFinancialPoa: authority.applies_to_general_financial_poa,
                    statutoryFormOnly: authority.statutory_form_only,
                    customLanguageRequired: authority.custom_language_required,
                    initialsRequired: authority.initials_required,
                    checkboxRequired: authority.checkbox_required,
                    freeformTextAllowed: authority.freeform_text_allowed,
                    statutoryTextExcerpt: authority.statutory_text_excerpt,
                    exactStatuteCitation: authority.exact_statute_citation,
                    sourceUrl: authority.source_url,
                    plainEnglishRule: authority.plain_english_rule,
                    confidence: authority.confidence,
                    legalReviewStatus: authority.legal_review_status,
                    reviewedAt: authority.reviewed_at,
                    reviewedBy: authority.reviewed_by,
                    reviewNotes: authority.review_notes,
                    effectiveStartDate: authority.effective_start_date,
                    effectiveEndDate: authority.effective_end_date,
                    rendererMetadata: authority.renderer_metadata,
                })),
                inputRequirements: (0, poaInputRequirements_1.derivePoaInputRequirements)(requirement),
                createdAt: requirement.created_at,
                updatedAt: requirement.updated_at,
            },
        });
    }
    catch (error) {
        return res.status(500).json({
            error: "internal_error",
            message: error instanceof Error ? error.message : "Failed to load POA requirements",
        });
    }
};
exports.getPoaRequirementByJurisdiction = getPoaRequirementByJurisdiction;
const listPoaJurisdictionsForType = async (req, res) => {
    if (!req.user?.id) {
        return res.status(401).json({
            error: "unauthorized",
            message: "Missing user context",
        });
    }
    const parsedQuery = poaRequirementQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
        return (0, validation_1.sendValidationError)(res, parsedQuery.error);
    }
    try {
        const poaType = parsedQuery.data.type ?? "general";
        const jurisdictions = await (0, poaService_1.listPoaJurisdictions)(poaType);
        return res.status(200).json({
            jurisdictions,
        });
    }
    catch (error) {
        return res.status(500).json({
            error: "internal_error",
            message: error instanceof Error
                ? error.message
                : "Failed to list POA jurisdictions",
        });
    }
};
exports.listPoaJurisdictionsForType = listPoaJurisdictionsForType;
//# sourceMappingURL=poaController.js.map