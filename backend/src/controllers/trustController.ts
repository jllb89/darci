import { Request, Response } from "express";
import { z } from "zod";
import { sendValidationError } from "../utils/validation";
import {
  getTrustRequirementDetails,
  listTrustJurisdictions,
  normalizeTrustJurisdiction,
  trustDocumentTypes,
  type TrustRequirementDetails,
} from "../services/trustService";
import { deriveTrustInputRequirements } from "../services/trustInputRequirements";

const trustRequirementQuerySchema = z.object({
  type: z.enum(trustDocumentTypes).optional(),
});

const buildTrustRequirementResponse = (details: TrustRequirementDetails) => {
  const { requirement } = details;
  const inputRequirements = deriveTrustInputRequirements(requirement);

  return {
    requirement: {
      id: requirement.id,
      jurisdiction: requirement.jurisdiction,
      documentType: requirement.document_type,
      uiProfile: requirement.ui_profile,
      reviewStatus: requirement.review_status,
      reviewedAt: requirement.reviewed_at,
      reviewedBy: requirement.reviewed_by,
      source: {
        citation: requirement.source_citation,
        url: requirement.source_url,
        notes: requirement.notes,
      },
      inputRequirements,
      createdAt: requirement.created_at,
      updatedAt: requirement.updated_at,
    },
  };
};

export const getTrustRequirementByJurisdiction = async (
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

  const parsedQuery = trustRequirementQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    return sendValidationError(res, parsedQuery.error);
  }

  try {
    const jurisdiction = normalizeTrustJurisdiction(req.params.jurisdiction);
    const documentType = parsedQuery.data.type ?? "rrr";
    const details = await getTrustRequirementDetails(jurisdiction, documentType);

    if (!details) {
      return res.status(404).json({
        error: "not_found",
        message: "Trust requirements not found",
      });
    }

    return res.status(200).json(buildTrustRequirementResponse(details));
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to load trust requirements",
    });
  }
};

export const listTrustJurisdictionsForType = async (
  req: Request,
  res: Response,
) => {
  if (!req.user?.id) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Missing user context",
    });
  }

  const parsedQuery = trustRequirementQuerySchema.safeParse(req.query ?? {});
  if (!parsedQuery.success) {
    return sendValidationError(res, parsedQuery.error);
  }

  try {
    const documentType = parsedQuery.data.type ?? "rrr";
    const jurisdictions = await listTrustJurisdictions(documentType);

    return res.status(200).json({
      jurisdictions,
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to list trust jurisdictions",
    });
  }
};
