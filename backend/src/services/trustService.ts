import { createClient } from "@supabase/supabase-js";
import { getJurisdictionLabel, normalizeJurisdiction } from "./poaService";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export const trustDocumentTypes = ["rrr", "certification", "other"] as const;

export type TrustDocumentType = (typeof trustDocumentTypes)[number];

export type TrustRequirementRecord = {
  id: string;
  jurisdiction: string;
  document_type: TrustDocumentType;
  ui_profile: string;
  derivation_mode: "rules_only" | "rules_plus_overrides" | "manual_review";
  api_representation_mode:
    | "sectioned_only"
    | "sectioned_plus_flattened_summaries";
  manual_review_required: boolean;

  governing_law: string | null;
  utc_adopted: string | null;
  revocability_presumption: string | null;
  writing_required: string | null;
  signature_required: string | null;
  notarization_required: string | null;
  witnesses_required: string | null;
  special_execution_rules: string | null;
  trust_certification_statutory_basis: string | null;
  certification_required_elements: string | null;
  certification_permissive_elements: string | null;
  certification_prohibited_elements: string | null;
  non_default_powers_requiring_express_authority: string | null;
  statutory_form_available: string | null;
  pour_over_will_recognized: string | null;
  registration_requirement: string | null;
  real_property_rule: string | null;
  competency_requirement: string | null;
  specific_authority_required_for_certain_acts: string | null;
  manual_review_required_text: string | null;

  trust_system:
    | "UTC_STANDARD"
    | "UTC_PLUS"
    | "NON_UTC_STANDARD"
    | "TRUST_FRIENDLY"
    | "CIVIL_LAW"
    | null;
  execution_level:
    | "STANDARD"
    | "NOTARIZATION_REQUIRED"
    | "ACK_OR_WITNESS_ALTERNATIVE"
    | "FORMAL_ACT"
    | null;
  acknowledgment_profile: string | null;
  base_template_key: string | null;
  state_overlay_key: string | null;

  asset_protection: boolean;
  directed_trusts: boolean;
  decanting_friendly: boolean;
  silent_trust_friendly: boolean;

  normalization_confidence: "high" | "medium" | "low";

  source_citation: string | null;
  source_url: string | null;
  review_status: "draft" | "verified" | "needs_review";
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;

  input_requirements: Record<string, unknown>;
  input_requirements_schema_version: string | null;
  input_requirements_updated_at: string | null;

  created_at: string;
  updated_at: string;
};

export type TrustRequirementDetails = {
  requirement: TrustRequirementRecord;
};

type TrustJurisdictionRow = {
  jurisdiction: string;
};

export const getTrustRequirement = async (
  jurisdiction: string,
  documentType: TrustDocumentType,
) => {
  const { data, error } = await supabaseAdmin
    .from("trust_requirements")
    .select(
      [
        "id",
        "jurisdiction",
        "document_type",
        "ui_profile",
        "derivation_mode",
        "api_representation_mode",
        "manual_review_required",
        "governing_law",
        "utc_adopted",
        "revocability_presumption",
        "writing_required",
        "signature_required",
        "notarization_required",
        "witnesses_required",
        "special_execution_rules",
        "trust_certification_statutory_basis",
        "certification_required_elements",
        "certification_permissive_elements",
        "certification_prohibited_elements",
        "non_default_powers_requiring_express_authority",
        "statutory_form_available",
        "pour_over_will_recognized",
        "registration_requirement",
        "real_property_rule",
        "competency_requirement",
        "specific_authority_required_for_certain_acts",
        "manual_review_required_text",
        "trust_system",
        "execution_level",
        "acknowledgment_profile",
        "base_template_key",
        "state_overlay_key",
        "asset_protection",
        "directed_trusts",
        "decanting_friendly",
        "silent_trust_friendly",
        "normalization_confidence",
        "source_citation",
        "source_url",
        "review_status",
        "reviewed_at",
        "reviewed_by",
        "notes",
        "input_requirements",
        "input_requirements_schema_version",
        "input_requirements_updated_at",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("jurisdiction", jurisdiction)
    .eq("document_type", documentType)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as TrustRequirementRecord | null;
};

export const getTrustRequirementDetails = async (
  jurisdiction: string,
  documentType: TrustDocumentType,
) => {
  const requirement = await getTrustRequirement(jurisdiction, documentType);

  if (!requirement) {
    return null;
  }

  return {
    requirement,
  } satisfies TrustRequirementDetails;
};

export const listTrustJurisdictions = async (documentType: TrustDocumentType) => {
  const { data, error } = await supabaseAdmin
    .from("trust_requirements")
    .select("jurisdiction")
    .eq("document_type", documentType)
    .order("jurisdiction", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const unique = new Map<string, { code: string; label: string }>();

  for (const row of (data ?? []) as TrustJurisdictionRow[]) {
    if (!unique.has(row.jurisdiction)) {
      unique.set(row.jurisdiction, {
        code: row.jurisdiction,
        label: getJurisdictionLabel(row.jurisdiction),
      });
    }
  }

  return [...unique.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
};

export const normalizeTrustJurisdiction = normalizeJurisdiction;
