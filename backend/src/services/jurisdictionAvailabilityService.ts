import { createClient } from "@supabase/supabase-js";
import { getJurisdictionLabel, normalizeJurisdiction } from "./jurisdictionUtils";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

const launchEnabledJurisdictions = new Set(["US-CA", "US-OH"]);

export const launchAvailabilityReason =
  "Launch limited to California and Ohio during current rollout.";

export const jurisdictionAvailabilityFamilies = ["poa", "trust", "idn"] as const;

export type JurisdictionAvailabilityFamily =
  (typeof jurisdictionAvailabilityFamilies)[number];

export type JurisdictionAvailabilitySelection = {
  families: string[];
  poaType?: string;
  trustType?: string;
  idnType?: string;
};

export type JurisdictionAvailabilityRequirement = {
  family: JurisdictionAvailabilityFamily;
  documentType: string;
};

export type JurisdictionAvailabilityConflictDetail = {
  family: JurisdictionAvailabilityFamily;
  documentType: string;
  reason: string;
};

export type JurisdictionAvailabilityCheckResult = {
  available: boolean;
  jurisdiction: string;
  reason: string | null;
  message: string | null;
  unavailableRequirements: JurisdictionAvailabilityConflictDetail[];
};

type JurisdictionAvailabilityRow = {
  jurisdiction: string;
  family: JurisdictionAvailabilityFamily;
  document_type: string;
  is_available: boolean;
  reason_if_unavailable: string | null;
};

export const buildAvailabilityRequirements = (
  selection: JurisdictionAvailabilitySelection,
): JurisdictionAvailabilityRequirement[] => {
  const requirements: JurisdictionAvailabilityRequirement[] = [];

  if (selection.families.includes("poa") && selection.poaType) {
    requirements.push({
      family: "poa",
      documentType: selection.poaType,
    });
  }

  if (selection.families.includes("trust") && selection.trustType) {
    requirements.push({
      family: "trust",
      documentType: selection.trustType,
    });
  }

  if (selection.families.includes("idn") && selection.idnType) {
    requirements.push({
      family: "idn",
      documentType: selection.idnType,
    });
  }

  return requirements;
};

const buildMissingAvailabilityReason = (jurisdiction: string) => {
  if (!launchEnabledJurisdictions.has(jurisdiction)) {
    return launchAvailabilityReason;
  }

  return "Selected jurisdiction and document combination is not configured for the current launch.";
};

export const listAvailableJurisdictionsForRequirement = async (input: {
  family: JurisdictionAvailabilityFamily;
  documentType: string;
}) => {
  const { data, error } = await supabaseAdmin
    .from("jurisdiction_product_availability")
    .select("jurisdiction")
    .eq("family", input.family)
    .eq("document_type", input.documentType)
    .eq("is_available", true)
    .order("jurisdiction", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const unique = new Map<string, { code: string; label: string }>();

  for (const row of (data ?? []) as Array<{ jurisdiction: string }>) {
    const jurisdiction = normalizeJurisdiction(row.jurisdiction);

    if (!unique.has(jurisdiction)) {
      unique.set(jurisdiction, {
        code: jurisdiction,
        label: getJurisdictionLabel(jurisdiction),
      });
    }
  }

  return [...unique.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

export const checkJurisdictionAvailabilityForSelection = async (
  jurisdiction: string,
  selection: JurisdictionAvailabilitySelection,
): Promise<JurisdictionAvailabilityCheckResult> => {
  const normalizedJurisdiction = normalizeJurisdiction(jurisdiction);
  const requirements = buildAvailabilityRequirements(selection);

  if (requirements.length === 0) {
    return {
      available: true,
      jurisdiction: normalizedJurisdiction,
      reason: null,
      message: null,
      unavailableRequirements: [],
    };
  }

  const families = [...new Set(requirements.map((requirement) => requirement.family))];

  const { data, error } = await supabaseAdmin
    .from("jurisdiction_product_availability")
    .select(
      "jurisdiction, family, document_type, is_available, reason_if_unavailable",
    )
    .eq("jurisdiction", normalizedJurisdiction)
    .in("family", families);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as JurisdictionAvailabilityRow[];
  const unavailableRequirements = requirements.flatMap((requirement) => {
    const matchedRow = rows.find(
      (row) =>
        row.family === requirement.family &&
        row.document_type === requirement.documentType,
    );

    if (matchedRow?.is_available) {
      return [] as JurisdictionAvailabilityConflictDetail[];
    }

    return [
      {
        family: requirement.family,
        documentType: requirement.documentType,
        reason:
          matchedRow?.reason_if_unavailable ??
          buildMissingAvailabilityReason(normalizedJurisdiction),
      },
    ];
  });

  if (unavailableRequirements.length === 0) {
    return {
      available: true,
      jurisdiction: normalizedJurisdiction,
      reason: null,
      message: null,
      unavailableRequirements: [],
    };
  }

  const reason = unavailableRequirements[0]?.reason ?? null;
  const message = reason
    ? `Jurisdiction ${normalizedJurisdiction} is unavailable for the selected product flow. ${reason}`
    : `Jurisdiction ${normalizedJurisdiction} is unavailable for the selected product flow.`;

  return {
    available: false,
    jurisdiction: normalizedJurisdiction,
    reason,
    message,
    unavailableRequirements,
  };
};