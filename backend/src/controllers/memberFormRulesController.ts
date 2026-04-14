import { Request, Response } from "express";
import { z } from "zod";
import {
  buildMemberFormSelection,
  deriveMemberFormRulesByJurisdiction,
  listMemberFormJurisdictions,
} from "../services/memberFormRulesService";
import {
  validateMemberFormSubmission,
  type MemberFormSubmissionValue,
} from "../services/memberFormValidationService";
import { buildMemberFormDocumentExtractionPayload } from "../services/memberFormDocumentExtractionService";
import {
  buildSelectionForMode,
  getProductFlowMode,
  listProductFlowModes,
  productFlowModeKeys,
  type ProductFlowModeDefinition,
  type ProductFlowModeSelection,
} from "../services/productFlowModeService";
import { sendValidationError } from "../utils/validation";

const productFlowModeKeySet = new Set<string>(productFlowModeKeys);

const memberFormValueSchema = z.union([
  z.string(),
  z.boolean(),
  z.array(z.string()),
]);

const memberFormValidationSchema = z
  .object({
    formValues: z.record(z.string(), memberFormValueSchema),
  })
  .passthrough();

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

const parseRequestedMode = (req: Request, res: Response): string | null | undefined => {
  const rawMode = req.query.mode;

  if (typeof rawMode === "undefined") {
    return undefined;
  }

  if (typeof rawMode !== "string") {
    res.status(400).json({
      error: "validation_error",
      message: "mode must be a string",
      details: [
        {
          path: "mode",
          message: "mode must be a string",
        },
      ],
    });

    return null;
  }

  const mode = rawMode.trim();
  if (!mode) {
    res.status(400).json({
      error: "validation_error",
      message: "mode cannot be empty",
      details: [
        {
          path: "mode",
          message: "mode cannot be empty",
        },
      ],
    });

    return null;
  }

  if (!productFlowModeKeySet.has(mode)) {
    res.status(400).json({
      error: "validation_error",
      message: "mode is not supported",
      details: [
        {
          path: "mode",
          message: `mode must be one of: ${[...productFlowModeKeySet.values()].join(", ")}`,
        },
      ],
    });

    return null;
  }

  return mode;
};

const defaultTypeByFamily = (
  selection: ProductFlowModeSelection,
  family: ProductFlowModeSelection["families"][number],
) => {
  if (family === "poa") {
    return selection.poaType;
  }

  if (family === "trust") {
    return selection.trustType;
  }

  return selection.idnType;
};

const buildFallbackModeDefinition = (
  selection: ProductFlowModeSelection,
): ProductFlowModeDefinition => {
  return {
    modeKey: selection.modeKey,
    displayName: selection.modeKey,
    description: null,
    isActive: true,
    isDefault: false,
    sortOrder: 0,
    families: selection.families.map((family, index) => ({
      family,
      defaultDocumentType: defaultTypeByFamily(selection, family),
      isRequired: true,
      sortOrder: (index + 1) * 10,
    })),
    outputs: [],
    ui: [],
  };
};

const resolveSelectionContext = async (requestedMode?: string) => {
  const modeSelection = await buildSelectionForMode(requestedMode);
  const selection = buildMemberFormSelection(modeSelection);
  const productFlowMode =
    (await getProductFlowMode(modeSelection.modeKey)) ??
    buildFallbackModeDefinition(modeSelection);

  return {
    selection,
    productFlowMode,
  };
};

export const listProductFlowModesForSelection = async (
  req: Request,
  res: Response,
) => {
  if (!ensureAuthenticatedUser(req, res)) {
    return;
  }

  try {
    const modes = await listProductFlowModes();

    return res.status(200).json({
      modes,
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to list product flow modes",
    });
  }
};

export const listMemberFormJurisdictionsForSelection = async (
  req: Request,
  res: Response,
) => {
  if (!ensureAuthenticatedUser(req, res)) {
    return;
  }

  try {
    const requestedMode = parseRequestedMode(req, res);
    if (requestedMode === null) {
      return;
    }

    const { selection, productFlowMode } = await resolveSelectionContext(requestedMode);
    const jurisdictions = await listMemberFormJurisdictions(selection);

    return res.status(200).json({
      selection,
      mode: productFlowMode,
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
    const requestedMode = parseRequestedMode(req, res);
    if (requestedMode === null) {
      return;
    }

    const { selection, productFlowMode } = await resolveSelectionContext(requestedMode);
    const result = await deriveMemberFormRulesByJurisdiction(
      req.params.jurisdiction,
      selection,
      {
        productFlowMode,
      },
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

export const getMemberFormDocumentExtractionByJurisdiction = async (
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
    const requestedMode = parseRequestedMode(req, res);
    if (requestedMode === null) {
      return;
    }

    const { selection, productFlowMode } = await resolveSelectionContext(requestedMode);
    const result = await deriveMemberFormRulesByJurisdiction(
      req.params.jurisdiction,
      selection,
      {
        productFlowMode,
      },
    );

    if (!result.contract || result.missing.length > 0) {
      return res.status(404).json({
        error: "not_found",
        message: "Member form requirements not found for one or more selected families",
        details: result.missing,
      });
    }

    return res.status(200).json({
      mode: productFlowMode,
      extraction: buildMemberFormDocumentExtractionPayload(result.contract),
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to build member form document extraction payload",
    });
  }
};

export const validateMemberFormSubmissionByJurisdiction = async (
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

  const parsedBody = memberFormValidationSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const requestedMode = parseRequestedMode(req, res);
    if (requestedMode === null) {
      return;
    }

    const { selection, productFlowMode } = await resolveSelectionContext(requestedMode);
    const result = await deriveMemberFormRulesByJurisdiction(
      req.params.jurisdiction,
      selection,
      {
        productFlowMode,
      },
    );

    if (!result.contract || result.missing.length > 0) {
      return res.status(404).json({
        error: "not_found",
        message: "Member form requirements not found for one or more selected families",
        details: result.missing,
      });
    }

    const validation = validateMemberFormSubmission(
      result.contract,
      parsedBody.data.formValues as Record<string, MemberFormSubmissionValue>,
    );

    if (!validation.valid) {
      return res.status(422).json({
        valid: false,
        message: "Member form validation failed",
        errors: validation.errors,
      });
    }

    return res.status(200).json({
      valid: true,
      errors: [],
    });
  } catch (error) {
    return res.status(500).json({
      error: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Failed to validate member form submission",
    });
  }
};
