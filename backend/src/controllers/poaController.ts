import { Request, Response } from "express";
import { z } from "zod";
import { derivePoaInputRequirements } from "../services/poaInputRequirements";
import { sendValidationError } from "../utils/validation";
import {
  getPoaRequirement,
  listPoaJurisdictions,
  normalizeJurisdiction,
  poaTypes,
} from "../services/poaService";

const poaRequirementQuerySchema = z.object({
  type: z.enum(poaTypes).optional(),
});

export const getPoaRequirementByJurisdiction = async (
  req: Request,
  res: Response,
) => {
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
    return sendValidationError(res, parsedQuery.error);
  }

  try {
    const jurisdiction = normalizeJurisdiction(req.params.jurisdiction);
    const poaType = parsedQuery.data.type ?? "general";
    const requirement = await getPoaRequirement(jurisdiction, poaType);

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
          allowsAgentCertification:
            requirement.allows_agent_certification ?? false,
          requiresPrincipalSignature:
            requirement.requires_principal_signature ?? true,
          allowsProxySignature: requirement.allows_proxy_signature ?? false,
          requiresAcknowledgmentCertificate:
            requirement.requires_acknowledgment_certificate ?? false,
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
        inputRequirements: derivePoaInputRequirements(requirement),
        createdAt: requirement.created_at,
        updatedAt: requirement.updated_at,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Failed to load POA requirements",
    });
  }
};

export const listPoaJurisdictionsForType = async (
  req: Request,
  res: Response,
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const parsedQuery = poaRequirementQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    return sendValidationError(res, parsedQuery.error);
  }

  try {
    const poaType = parsedQuery.data.type ?? "general";
    const jurisdictions = await listPoaJurisdictions(poaType);

    return res.status(200).json({
      jurisdictions,
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to list POA jurisdictions",
    });
  }
};