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

const stateNameByAbbreviation: Record<string, string> = {};
for (const [stateName, abbreviation] of Object.entries(stateAbbreviationByName)) {
  stateNameByAbbreviation[abbreviation] = stateName;
}

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

type ServiceAreaSource = "census" | "fallback";
type ServiceAreaOption = { label: string; value: string };

const SERVICE_AREA_CACHE_TTL_MS = 1000 * 60 * 60;
const SERVICE_AREA_CENSUS_TIMEOUT_MS = 1200;

const serviceAreaCache = new Map<string, {
  expiresAt: number;
  options: ServiceAreaOption[];
  source: ServiceAreaSource;
}>();

const buildFallbackServiceAreaOptions = (abbreviation: string) => {
  const serviceAreas = fallbackServiceAreasByState[abbreviation] ?? [`${abbreviation} Statewide`];
  return serviceAreas.map((name) => ({ label: name, value: name }));
};

const getCachedServiceAreas = (abbreviation: string) => {
  const cached = serviceAreaCache.get(abbreviation);
  if (!cached || cached.expiresAt <= Date.now()) {
    serviceAreaCache.delete(abbreviation);
    return null;
  }

  return cached;
};

const cacheServiceAreas = (abbreviation: string, options: ServiceAreaOption[], source: ServiceAreaSource) => {
  serviceAreaCache.set(abbreviation, {
    expiresAt: Date.now() + SERVICE_AREA_CACHE_TTL_MS,
    options,
    source,
  });
};

const fetchCensusServiceAreas = async (stateFips: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVICE_AREA_CENSUS_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.census.gov/data/2020/dec/pl?get=NAME&for=county:*&in=state:${stateFips}`,
      { signal: controller.signal },
    );
    const payload = (await response.json().catch(() => null)) as string[][] | null;
    if (!response.ok || !payload || payload.length < 2) {
      return null;
    }

    const options = payload
      .slice(1)
      .map((row) => (Array.isArray(row) ? row[0] : null))
      .filter((name): name is string => Boolean(name && name.trim()))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ label: name, value: name }));

    return options.length > 0 ? options : null;
  } finally {
    clearTimeout(timeout);
  }
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

const addressAutocompleteSchema = z
  .object({
    input: z.string().trim().min(2).max(160),
    sessionToken: z.string().max(128).optional(),
  })
  .passthrough();

const addressDetailsSchema = z
  .object({
    placeId: z.string().trim().min(1).max(256),
    sessionToken: z.string().max(128).optional(),
  })
  .passthrough();

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleAddressPrediction = {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
  terms?: Array<{
    value?: string;
  }>;
};

type GooglePlaceDetailsResult = {
  address_components?: GoogleAddressComponent[];
  formatted_address?: string;
  name?: string;
  place_id?: string;
};

type MemberFormAddressSuggestion = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type NormalizedMemberFormAddress = {
  line1: string;
  line2: string;
  city: string;
  county: string;
  state: string;
  stateCode: string;
  postalCode: string;
  country: string;
  formattedAddress: string;
  normalizedAddress: string;
};

const normalizeAddressToken = (value: string) => {
  return value.trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
};

const escapeRegExp = (value: string) => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const formatStateName = (abbreviation: string) => {
  const stateName = stateNameByAbbreviation[abbreviation];
  if (!stateName) {
    return abbreviation;
  }

  return stateName.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
};

const normalizeOptionalSessionToken = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
};

export const predictionMatchesJurisdictionState = (
  prediction: GoogleAddressPrediction,
  stateCode: string,
) => {
  const normalizedStateCode = normalizeAddressToken(stateCode);
  const normalizedStateName = stateNameByAbbreviation[normalizedStateCode] ?? "";
  const normalizedTerms = (prediction.terms ?? [])
    .map((term) => normalizeAddressToken(term.value ?? ""))
    .filter(Boolean);

  if (
    normalizedTerms.some(
      (term) => term === normalizedStateCode || term === normalizedStateName,
    )
  ) {
    return true;
  }

  const normalizedDescription = normalizeAddressToken(prediction.description ?? "");
  if (!normalizedDescription) {
    return false;
  }

  const stateCodePattern = new RegExp(
    `(?:^|[\\s,])${escapeRegExp(normalizedStateCode)}(?:[\\s,]|$)`,
  );

  return (
    stateCodePattern.test(normalizedDescription) ||
    (normalizedStateName.length > 0 && normalizedDescription.includes(normalizedStateName))
  );
};

const findGoogleAddressComponent = (
  components: GoogleAddressComponent[],
  type: string,
) => {
  return components.find(
    (component) => Array.isArray(component.types) && component.types.includes(type),
  );
};

const componentLongName = (
  components: GoogleAddressComponent[],
  type: string,
) => {
  return findGoogleAddressComponent(components, type)?.long_name?.trim() ?? "";
};

const componentShortName = (
  components: GoogleAddressComponent[],
  type: string,
) => {
  return findGoogleAddressComponent(components, type)?.short_name?.trim() ?? "";
};

const normalizeCountyLabel = (value: string) => {
  return value.replace(/\s+County$/i, "").trim();
};

export const normalizeGooglePlaceAddress = (
  result: GooglePlaceDetailsResult,
): NormalizedMemberFormAddress | null => {
  const components = Array.isArray(result.address_components)
    ? result.address_components
    : [];
  const formattedAddress = result.formatted_address?.trim() ?? "";
  const streetNumber = componentLongName(components, "street_number");
  const route = componentLongName(components, "route");
  const subpremise = componentLongName(components, "subpremise");
  const line1 =
    [streetNumber, route].filter(Boolean).join(" ").trim() ||
    formattedAddress.split(",")[0]?.trim() ||
    result.name?.trim() ||
    "";
  const line2 = subpremise;
  const city =
    componentLongName(components, "locality") ||
    componentLongName(components, "postal_town") ||
    componentLongName(components, "sublocality_level_1") ||
    componentLongName(components, "administrative_area_level_3");
  const county = normalizeCountyLabel(componentLongName(components, "administrative_area_level_2"));
  const state = componentLongName(components, "administrative_area_level_1");
  const stateCode = componentShortName(components, "administrative_area_level_1").toUpperCase();
  const postalCode = [
    componentLongName(components, "postal_code"),
    componentLongName(components, "postal_code_suffix"),
  ]
    .filter(Boolean)
    .join("-");
  const country = componentShortName(components, "country") || componentLongName(components, "country");

  if (!line1 && !formattedAddress) {
    return null;
  }

  const cityStatePostal = [stateCode, postalCode].filter(Boolean).join(" ").trim();
  const normalizedAddress =
    [
      [line1, line2].filter(Boolean).join(", "),
      city,
      cityStatePostal,
    ]
      .filter(Boolean)
      .join(", ") || formattedAddress;

  return {
    line1,
    line2,
    city,
    county,
    state,
    stateCode,
    postalCode,
    country,
    formattedAddress,
    normalizedAddress,
  };
};

const getGoogleMapsServerApiKey = () => {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim() ?? "";
};

const resolveJurisdictionStateForAddressLookup = (jurisdiction: string, res: Response) => {
  const abbreviation = resolveStateAbbreviation(jurisdiction);
  if (!abbreviation) {
    res.status(400).json({
      error: "validation_error",
      message: "Unsupported jurisdiction format",
    });
    return null;
  }

  if (!stateFipsByAbbreviation[abbreviation]) {
    res.status(400).json({
      error: "validation_error",
      message: "Jurisdiction is not a supported US state",
    });
    return null;
  }

  return abbreviation;
};

export const buildMemberFormAddressSuggestionsFromGeocodeResults = (
  results: GooglePlaceDetailsResult[],
  stateCode: string,
): MemberFormAddressSuggestion[] => {
  return results
    .map((result) => {
      const address = normalizeGooglePlaceAddress(result);
      if (!address || address.stateCode !== stateCode) {
        return null;
      }

      const description = address.formattedAddress || address.normalizedAddress;
      if (!result.place_id || !description) {
        return null;
      }

      const cityStatePostal = [
        address.city,
        [address.stateCode, address.postalCode].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ");

      return {
        placeId: result.place_id,
        description,
        mainText: address.line1 || description,
        secondaryText: cityStatePostal,
      };
    })
    .filter((suggestion): suggestion is MemberFormAddressSuggestion => Boolean(suggestion))
    .slice(0, 5);
};

const fetchGoogleGeocodeResults = async (url: URL) => {
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Geocode request failed");
  }

  const payload = (await response.json()) as {
    status?: string;
    results?: GooglePlaceDetailsResult[];
  };

  if (payload.status === "ZERO_RESULTS") {
    return [];
  }

  if (payload.status && payload.status !== "OK") {
    throw new Error(`Geocode status ${payload.status}`);
  }

  return payload.results ?? [];
};

const fetchGoogleGeocodeAddressSuggestions = async ({
  input,
  stateCode,
  googleMapsServerKey,
}: {
  input: string;
  stateCode: string;
  googleMapsServerKey: string;
}) => {
  const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geocodeUrl.searchParams.set("address", input);
  geocodeUrl.searchParams.set("components", `country:US|administrative_area:${stateCode}`);
  geocodeUrl.searchParams.set("region", "us");
  geocodeUrl.searchParams.set("key", googleMapsServerKey);

  return buildMemberFormAddressSuggestionsFromGeocodeResults(
    await fetchGoogleGeocodeResults(geocodeUrl),
    stateCode,
  );
};

const fetchGoogleGeocodeAddressByPlaceId = async ({
  placeId,
  googleMapsServerKey,
}: {
  placeId: string;
  googleMapsServerKey: string;
}) => {
  const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geocodeUrl.searchParams.set("place_id", placeId);
  geocodeUrl.searchParams.set("key", googleMapsServerKey);

  return (await fetchGoogleGeocodeResults(geocodeUrl))[0] ?? null;
};

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
  const cached = getCachedServiceAreas(abbreviation);
  if (cached) {
    return res.status(200).json({
      jurisdiction: req.params.jurisdiction,
      abbreviation,
      options: cached.options,
      source: cached.source,
    });
  }

  if (fallbackServiceAreasByState[abbreviation]?.length) {
    cacheServiceAreas(abbreviation, fallbackOptions, "fallback");
    return res.status(200).json({
      jurisdiction: req.params.jurisdiction,
      abbreviation,
      options: fallbackOptions,
      source: "fallback",
    });
  }

  try {
    const options = await fetchCensusServiceAreas(stateFips);
    if (!options) {
      cacheServiceAreas(abbreviation, fallbackOptions, "fallback");
      return res.status(200).json({
        jurisdiction: req.params.jurisdiction,
        abbreviation,
        options: fallbackOptions,
        source: "fallback",
      });
    }

    cacheServiceAreas(abbreviation, options, "census");
    return res.status(200).json({
      jurisdiction: req.params.jurisdiction,
      abbreviation,
      options,
      source: "census",
    });
  } catch {
    cacheServiceAreas(abbreviation, fallbackOptions, "fallback");
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

export const autocompleteMemberFormAddressByJurisdiction = async (
  req: Request,
  res: Response,
) => {
  if (!ensureAuthenticatedUser(req, res)) {
    return;
  }

  if (typeof req.params.jurisdiction !== "string" || !req.params.jurisdiction.trim()) {
    return sendJurisdictionRequiredError(res);
  }

  const parsedBody = addressAutocompleteSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  const stateCode = resolveJurisdictionStateForAddressLookup(req.params.jurisdiction, res);
  if (!stateCode) {
    return;
  }

  const googleMapsServerKey = getGoogleMapsServerApiKey();
  if (!googleMapsServerKey) {
    return res.status(503).json({
      error: "service_unavailable",
      message: "Address autocomplete service is not configured",
    });
  }

  try {
    const placesUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    placesUrl.searchParams.set("input", parsedBody.data.input);
    placesUrl.searchParams.set("types", "address");
    placesUrl.searchParams.set("components", "country:us");
    placesUrl.searchParams.set("language", "en");
    placesUrl.searchParams.set("region", "us");
    placesUrl.searchParams.set("key", googleMapsServerKey);

    const sessionToken = normalizeOptionalSessionToken(parsedBody.data.sessionToken);
    if (sessionToken) {
      placesUrl.searchParams.set("sessiontoken", sessionToken);
    }

    let suggestions: MemberFormAddressSuggestion[] = [];

    try {
      const response = await fetch(placesUrl.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Places autocomplete request failed");
      }

      const payload = (await response.json()) as {
        status?: string;
        predictions?: GoogleAddressPrediction[];
      };

      if (payload.status === "OK") {
        suggestions = (payload.predictions ?? [])
          .filter((prediction) => predictionMatchesJurisdictionState(prediction, stateCode))
          .map((prediction) => ({
            placeId: prediction.place_id ?? "",
            description: prediction.description ?? "",
            mainText: prediction.structured_formatting?.main_text ?? prediction.description ?? "",
            secondaryText: prediction.structured_formatting?.secondary_text ?? "",
          }))
          .filter((suggestion) => suggestion.placeId && suggestion.description)
          .slice(0, 5);
      } else if (payload.status && payload.status !== "ZERO_RESULTS") {
        console.warn("Member form Places autocomplete unavailable", {
          status: payload.status,
          jurisdiction: req.params.jurisdiction,
        });
      }
    } catch (error) {
      console.warn("Member form Places autocomplete request failed", {
        jurisdiction: req.params.jurisdiction,
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }

    if (suggestions.length === 0) {
      suggestions = await fetchGoogleGeocodeAddressSuggestions({
        input: parsedBody.data.input,
        stateCode,
        googleMapsServerKey,
      });
    }

    return res.status(200).json({
      jurisdiction: req.params.jurisdiction,
      state: { code: stateCode, name: formatStateName(stateCode) },
      suggestions,
    });
  } catch (error) {
    console.error("Member form address autocomplete error:", error);
    return res.status(503).json({
      error: "service_unavailable",
      message: "Address autocomplete service is temporarily unavailable",
    });
  }
};

export const resolveMemberFormAddressDetailsByJurisdiction = async (
  req: Request,
  res: Response,
) => {
  if (!ensureAuthenticatedUser(req, res)) {
    return;
  }

  if (typeof req.params.jurisdiction !== "string" || !req.params.jurisdiction.trim()) {
    return sendJurisdictionRequiredError(res);
  }

  const parsedBody = addressDetailsSchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  const stateCode = resolveJurisdictionStateForAddressLookup(req.params.jurisdiction, res);
  if (!stateCode) {
    return;
  }

  const googleMapsServerKey = getGoogleMapsServerApiKey();
  if (!googleMapsServerKey) {
    return res.status(503).json({
      error: "service_unavailable",
      message: "Address details service is not configured",
    });
  }

  try {
    const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    detailsUrl.searchParams.set("place_id", parsedBody.data.placeId);
    detailsUrl.searchParams.set("fields", "address_component,formatted_address,name,place_id");
    detailsUrl.searchParams.set("language", "en");
    detailsUrl.searchParams.set("key", googleMapsServerKey);

    const sessionToken = normalizeOptionalSessionToken(parsedBody.data.sessionToken);
    if (sessionToken) {
      detailsUrl.searchParams.set("sessiontoken", sessionToken);
    }

    let result: GooglePlaceDetailsResult | null = null;

    try {
      const response = await fetch(detailsUrl.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Places details request failed");
      }

      const payload = (await response.json()) as {
        status?: string;
        result?: GooglePlaceDetailsResult;
      };

      if (payload.status === "OK") {
        result = payload.result ?? null;
      } else if (payload.status && payload.status !== "ZERO_RESULTS" && payload.status !== "NOT_FOUND") {
        console.warn("Member form Places details unavailable", {
          status: payload.status,
          jurisdiction: req.params.jurisdiction,
        });
      }
    } catch (error) {
      console.warn("Member form Places details request failed", {
        jurisdiction: req.params.jurisdiction,
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }

    if (!result) {
      result = await fetchGoogleGeocodeAddressByPlaceId({
        placeId: parsedBody.data.placeId,
        googleMapsServerKey,
      });
    }

    if (!result) {
      return res.status(404).json({
        error: "not_found",
        message: "Address was not found",
      });
    }

    const address = normalizeGooglePlaceAddress(result);
    if (!address) {
      return res.status(422).json({
        error: "validation_error",
        message: "Google did not return a usable address for this place",
      });
    }

    if (address.stateCode !== stateCode) {
      return res.status(422).json({
        error: "validation_error",
        message: `Address must be in ${formatStateName(stateCode)} (${stateCode})`,
      });
    }

    return res.status(200).json({
      jurisdiction: req.params.jurisdiction,
      state: { code: stateCode, name: formatStateName(stateCode) },
      placeId: result.place_id ?? parsedBody.data.placeId,
      address,
    });
  } catch (error) {
    console.error("Member form address details error:", error);
    return res.status(503).json({
      error: "service_unavailable",
      message: "Address details service is temporarily unavailable",
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
