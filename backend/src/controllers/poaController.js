"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPoaRequirementByJurisdiction = void 0;
const zod_1 = require("zod");
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
        const requirement = await (0, poaService_1.getPoaRequirement)(jurisdiction, poaType);
        if (!requirement) {
            return res.status(404).json({
                error: "not_found",
                message: "POA requirements not found",
            });
        }
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
//# sourceMappingURL=poaController.js.map