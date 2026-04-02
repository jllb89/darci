import { Request, Response } from "express";
import { z } from "zod";
import {
  derivePoaInputRequirements,
  type PoaInputRequirementField,
  type PoaInputRequirementSection,
} from "../services/poaInputRequirements";
import { sendValidationError } from "../utils/validation";
import {
  getPoaRequirementDetails,
  type PoaRequirementDetails,
  listPoaJurisdictions,
  normalizeJurisdiction,
  poaTypes,
} from "../services/poaService";

const poaRequirementQuerySchema = z.object({
  type: z.enum(poaTypes).optional(),
});

const sectionGlossaryKeys: Record<string, string> = {
  principal: "principal",
  agent: "agent",
  authority_scope: "special_authority",
  durability: "durable",
  effective_date: "effective_date",
  execution_choice: "acknowledgment",
  witnesses: "witness",
  notary: "notary_acknowledgment",
  statutory_notices: "statutory_form",
};

const fieldGlossaryKeys: Record<string, string> = {
  principal_full_name: "principal",
  principal_signature: "principal",
  proxy_signer_name: "proxy_signer",
  agent_full_name: "agent",
  special_authorities: "special_authority",
  special_authority_initials: "special_authority",
  durability_choice: "durable",
  durability_override: "durable",
  recording_status: "recording",
  effective_date_choice: "effective_date",
  trigger_description: "springing_power",
  selected_execution_path: "acknowledgment",
  witness_count: "witness",
  statutory_form_notice_acknowledged: "statutory_form",
};

const attachGlossaryToInputRequirements = (
  sections: PoaInputRequirementSection[],
  glossary: Array<{
    glossary_key: string;
    product_description: string;
  }>,
) => {
  const glossaryByKey = new Map(
    glossary.map((term) => [term.glossary_key, term.product_description]),
  );

  return sections.map((section) => ({
    ...section,
    description: glossaryByKey.get(sectionGlossaryKeys[section.key] ?? "") ?? section.title,
    fields: section.fields.map((field): PoaInputRequirementField => {
      const nextHelpText =
        glossaryByKey.get(fieldGlossaryKeys[field.key] ?? "") ?? field.helpText;

      return nextHelpText
        ? {
            ...field,
            helpText: nextHelpText,
          }
        : field;
    }),
  }));
};

export const buildPoaRequirementResponse = (details: PoaRequirementDetails) => {
  const { requirement, formRules, glossary, specialAuthorities } = details;
  const inputRequirements = derivePoaInputRequirements(requirement);
  const enrichedInputRequirements = {
    ...inputRequirements,
    sections: attachGlossaryToInputRequirements(inputRequirements.sections, glossary),
  };

  return {
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
      derivation: {
        mode: inputRequirements.derivation_mode,
        reviewStatus: inputRequirements.review_status,
        apiRepresentationMode: inputRequirements.api_representation_mode,
        schemaVersion: inputRequirements.schema_version,
      },
      classification: inputRequirements.classification,
      capabilities: inputRequirements.poa_capabilities,
      templateResolution: inputRequirements.template_resolution,
      formRules: formRules
        ? {
            statutoryFormExists: formRules.statutory_form_exists,
            statutoryFormRecommended: formRules.statutory_form_recommended,
            statutoryFormMandatoryForProduct:
              formRules.statutory_form_mandatory_for_product,
            mustTrackStatutoryOrdering: formRules.must_track_statutory_ordering,
            mustTrackStatutoryHeadings: formRules.must_track_statutory_headings,
            mustIncludeWarningToPrincipal:
              formRules.must_include_warning_to_principal,
            mustIncludeNoticeToAgent: formRules.must_include_notice_to_agent,
            specialAuthoritiesRenderMode:
              formRules.special_authorities_render_mode,
            freeformSpecialAuthorityTextAllowed:
              formRules.freeform_special_authority_text_allowed,
            hybridRenderingAllowed: formRules.hybrid_rendering_allowed,
            attorneyCustomizationRecommended:
              formRules.attorney_customization_recommended,
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
      inputRequirements: enrichedInputRequirements,
      createdAt: requirement.created_at,
      updatedAt: requirement.updated_at,
    },
  };
};

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
    const details = await getPoaRequirementDetails(jurisdiction, poaType);

    if (!details) {
      return res.status(404).json({
        error: "not_found",
        message: "POA requirements not found",
      });
    }

    return res.status(200).json(buildPoaRequirementResponse(details));
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