import { Request, Response } from "express";
import {
  buildMemberFormIntakeSelection,
  deriveMemberFormRulesByJurisdiction,
  listMemberFormJurisdictions,
} from "../services/memberFormRulesService";

const ensureAuthenticatedUser = (req: Request, res: Response) => {
  if (req.user?.id) {
    return true;
  }

  res.status(401).json({
    error: "unauthorized",
    message: "Missing user context",
  });

  return false;
};

export const listMemberFormJurisdictionsForSelection = async (
  req: Request,
  res: Response,
) => {
  if (!ensureAuthenticatedUser(req, res)) {
    return;
  }

  try {
    const selection = buildMemberFormIntakeSelection();
    const jurisdictions = await listMemberFormJurisdictions(selection);

    return res.status(200).json({
      selection,
      jurisdictions,
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to list member form jurisdictions",
    });
  }
};

export const getMemberFormRulesByJurisdiction = async (
  req: Request,
  res: Response,
) => {
  if (!ensureAuthenticatedUser(req, res)) {
    return;
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

  try {
    const selection = buildMemberFormIntakeSelection();
    const result = await deriveMemberFormRulesByJurisdiction(
      req.params.jurisdiction,
      selection,
    );

    if (!result.contract || result.missing.length > 0) {
      return res.status(404).json({
        error: "not_found",
        message: "Member form requirements not found for one or more selected families",
        details: result.missing,
      });
    }

    return res.status(200).json({
      memberForm: result.contract,
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to load member form requirements",
    });
  }
};
