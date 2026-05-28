import { Request, Response } from "express";
import { z } from "zod";
import {
  buildMemberFormSelection,
  deriveMemberFormRulesByJurisdiction,
  listMemberFormJurisdictions,
  type MissingFamilyRequirement,
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
  type ProductFlowModeKey,
  type ProductFlowModeSelection,
} from "../services/productFlowModeService";
import { sendValidationError } from "../utils/validation";

const productFlowModeKeySet = new Set<ProductFlowModeKey>(productFlowModeKeys);

const stateFipsByAbbreviation: Record<string, string> = {
  AL: "01",
  AK: "02",
  AZ: "04",
  AR: "05",
  CA: "06",
  CO: "08",
  CT: "09",
  DE: "10",
  FL: "12",
  GA: "13",
  HI: "15",
  ID: "16",
  IL: "17",
  IN: "18",
  IA: "19",
  KS: "20",
  KY: "21",
  LA: "22",
  ME: "23",
  MD: "24",
  MA: "25",
  MI: "26",
  MN: "27",
  MS: "28",
  MO: "29",
  MT: "30",
  NE: "31",
  NV: "32",
  NH: "33",
  NJ: "34",
  NM: "35",
  NY: "36",
  NC: "37",
  ND: "38",
  OH: "39",
  OK: "40",
  OR: "41",
  PA: "42",
  RI: "44",
  SC: "45",
  SD: "46",
  TN: "47",
  TX: "48",
  UT: "49",
  VT: "50",
  VA: "51",
  WA: "53",
  WV: "54",
  WI: "55",
  WY: "56",
  DC: "11",
};

const stateAbbreviationByName: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC",
};

const resolveStateAbbreviation = (jurisdiction: string) => {
  const normalized = jurisdiction.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const usCodeMatch = normalized.match(/US-([A-Z]{2})/);
  if (usCodeMatch?.[1] && stateFipsByAbbreviation[usCodeMatch[1]]) {
    return usCodeMatch[1];
  }

  if (stateFipsByAbbreviation[normalized]) {
    return normalized;
  }

  const embeddedCodeMatch = normalized.match(/\b([A-Z]{2})\b/);
  if (embeddedCodeMatch?.[1] && stateFipsByAbbreviation[embeddedCodeMatch[1]]) {
    return embeddedCodeMatch[1];
  }

  if (stateAbbreviationByName[normalized]) {
    return stateAbbreviationByName[normalized];
  }

  return null;
};

const fallbackServiceAreasByState: Record<string, string[]> = {
  CA: [
    "Alameda County",
    "Alpine County",
    "Amador County",
    "Butte County",
    "Calaveras County",
    "Colusa County",
    "Contra Costa County",
    "Del Norte County",
    "El Dorado County",
    "Fresno County",
    "Glenn County",
    "Humboldt County",
    "Imperial County",
    "Inyo County",
    "Kern County",
    "Kings County",
    "Lake County",
    "Lassen County",
    "Los Angeles County",
    "Madera County",
    "Marin County",
    "Mariposa County",
    "Mendocino County",
    "Merced County",
    "Modoc County",
    "Mono County",
    "Monterey County",
    "Napa County",
    "Nevada County",
    "Orange County",
    "Placer County",
    "Plumas County",
    "Riverside County",
    "Sacramento County",
    "San Benito County",
    "San Bernardino County",
    "San Diego County",
    "San Francisco County",
    "San Joaquin County",
    "San Luis Obispo County",
    "San Mateo County",
    "Santa Barbara County",
    "Santa Clara County",
    "Santa Cruz County",
    "Shasta County",
    "Sierra County",
    "Siskiyou County",
    "Solano County",
    "Sonoma County",
    "Stanislaus County",
    "Sutter County",
    "Tehama County",
    "Trinity County",
    "Tulare County",
    "Tuolumne County",
    "Ventura County",
    "Yolo County",
    "Yuba County",
  ],
};

const buildFallbackServiceAreaOptions = (abbreviation: string) => {
  const serviceAreas = fallbackServiceAreasByState[abbreviation] ?? [`${abbreviation} Statewide`];
  return serviceAreas.map((name) => ({ label: name, value: name }));
};

const MEMBER_FORM_REQUIREMENTS_NOT_FOUND_MESSAGE =
  "Member form requirements not found for one or more selected families";

const sendJurisdictionRequiredError = (res: Response) => {
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
};

const sendMissingMemberFormRequirements = (
  res: Response,
  missing: MissingFamilyRequirement[],
) => {
  return res.status(404).json({
    error: "not_found",
    message: MEMBER_FORM_REQUIREMENTS_NOT_FOUND_MESSAGE,
    details: missing,
  });
};

const sendJurisdictionAvailabilityConflict = (
  res: Response,
  conflict: NonNullable<
    Awaited<ReturnType<typeof deriveMemberFormRulesByJurisdiction>>["availabilityConflict"]
  >,
) => {
  return res.status(409).json({
    error: "conflict",
    message:
      conflict.message ??
      `Jurisdiction ${conflict.jurisdiction} is unavailable for the selected product flow.`,
    jurisdiction: conflict.jurisdiction,
    reason: conflict.reason,
    unavailableRequirements: conflict.unavailableRequirements.map((requirement) => ({
      family: requirement.family,
      documentType: requirement.documentType,
      reason: requirement.reason,
    })),
  });
};

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

const parseRequestedMode = (
  req: Request,
  res: Response,
): ProductFlowModeKey | null | undefined => {
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

  if (!productFlowModeKeySet.has(mode as ProductFlowModeKey)) {
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

  return mode as ProductFlowModeKey;
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

const formatFallbackModeDisplayName = (modeKey: string) => {
  return modeKey
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

const buildFallbackModeDefinition = (
  selection: ProductFlowModeSelection,
): ProductFlowModeDefinition => {
  return {
    modeKey: selection.modeKey,
    displayName: formatFallbackModeDisplayName(selection.modeKey),
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
    return sendJurisdictionRequiredError(res);
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

    if (result.availabilityConflict) {
      return sendJurisdictionAvailabilityConflict(res, result.availabilityConflict);
    }

    if (!result.contract || result.missing.length > 0) {
      return sendMissingMemberFormRequirements(res, result.missing);
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

export const listServiceAreasByJurisdiction = async (
  req: Request,
  res: Response,
) => {
  if (!ensureAuthenticatedUser(req, res)) {
    return;
  }

  if (typeof req.params.jurisdiction !== "string" || !req.params.jurisdiction.trim()) {
    return sendJurisdictionRequiredError(res);
  }

  const abbreviation = resolveStateAbbreviation(req.params.jurisdiction);
  if (!abbreviation) {
    return res.status(400).json({
      error: "validation_error",
      message: "Unsupported jurisdiction format",
    });
  }

  const stateFips = stateFipsByAbbreviation[abbreviation];
  if (!stateFips) {
    return res.status(400).json({
      error: "validation_error",
      message: "Jurisdiction is not a supported US state",
    });
  }

  const fallbackOptions = buildFallbackServiceAreaOptions(abbreviation);

  try {
    const response = await fetch(
      `https://api.census.gov/data/2020/dec/pl?get=NAME&for=county:*&in=state:${stateFips}`,
    );

    const payload = (await response.json().catch(() => null)) as string[][] | null;
    if (!response.ok || !payload || payload.length < 2) {
      return res.status(200).json({
        jurisdiction: req.params.jurisdiction,
        abbreviation,
        options: fallbackOptions,
        source: "fallback",
      });
    }

    const options = payload
      .slice(1)
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .filter((name): name is string => Boolean(name && name.trim()))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ label: name, value: name }));

    if (options.length === 0) {
      return res.status(200).json({
        jurisdiction: req.params.jurisdiction,
        abbreviation,
        options: fallbackOptions,
        source: "fallback",
      });
    }

    return res.status(200).json({
      jurisdiction: req.params.jurisdiction,
      abbreviation,
      options,
      source: "census",
    });
  } catch {
    return res.status(200).json({
      jurisdiction: req.params.jurisdiction,
      abbreviation,
      options: fallbackOptions,
      source: "fallback",
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
    return sendJurisdictionRequiredError(res);
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

    if (result.availabilityConflict) {
      return sendJurisdictionAvailabilityConflict(res, result.availabilityConflict);
    }

    if (!result.contract || result.missing.length > 0) {
      return sendMissingMemberFormRequirements(res, result.missing);
    }

    return res.status(200).json({
      mode: productFlowMode,
      extraction: await buildMemberFormDocumentExtractionPayload(result.contract),
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
    return sendJurisdictionRequiredError(res);
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

    if (result.availabilityConflict) {
      return sendJurisdictionAvailabilityConflict(res, result.availabilityConflict);
    }

    if (!result.contract || result.missing.length > 0) {
      return sendMissingMemberFormRequirements(res, result.missing);
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
