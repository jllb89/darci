import { createClient } from "@supabase/supabase-js";
import { getJurisdictionLabel, normalizeJurisdiction } from "./poaService";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export const idnDocumentTypes = [
  "acknowledgment",
  "authentic_act",
  "public_instrument",
] as const;

export type IdnDocumentType = (typeof idnDocumentTypes)[number];

export type IdnRequirementRecord = {
  id: string;
  jurisdiction: string;
  document_type: IdnDocumentType;
  ui_profile: string;
  derivation_mode: "rules_only" | "rules_plus_overrides" | "manual_review";
  api_representation_mode:
    | "sectioned_only"
    | "sectioned_plus_flattened_summaries";
  manual_review_required: boolean;

  governing_law: string | null;
  acknowledgment_form: string | null;
  notary_commission_authority: string | null;
  venue_requirement: string | null;
  signer_identification: string | null;
  witness_requirements: string | null;
  remote_online_notarization: string | null;
  e_notarization: string | null;
  notarial_certificate_required_elements: string | null;
  seal_stamp_requirements: string | null;
  commission_expiration_on_certificate: string | null;
  recording_requirements: string | null;
  competency_of_signer: string | null;

  notarial_system:
    | "COMMON_LAW_STANDARD"
    | "COMMON_LAW_VARIANT"
    | "CIVIL_LAW_AUTHENTIC_ACT"
    | "CIVIL_LAW_PUBLIC_INSTRUMENT"
    | null;
  execution_presence_mode:
    | "IN_PERSON_ONLY"
    | "IN_PERSON_OR_REMOTE_ALLOWED"
    | "CIVIL_LAW_IN_PERSON_DEFAULT"
    | null;
  digital_channel_status:
    | "RON_AUTHORIZED"
    | "E_NOTARIZATION_AUTHORIZED_NO_RON"
    | "DIGITAL_NOT_AUTHORIZED"
    | "DIGITAL_STATUS_EVOLVING"
    | null;
  acknowledgment_profile: string | null;
  base_template_key: string | null;
  jurisdiction_overlay_key: string | null;

  ron_allowed: boolean;
  e_notarization_allowed: boolean;
  witnesses_required_for_primary_act: boolean;
  personal_knowledge_only_identification_allowed: boolean;
  credible_witness_identification_allowed: boolean;
  commission_expiration_on_certificate_required: boolean;
  statutory_short_form_available: boolean;
  custom_certificate_language_required: boolean;

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

export type IdnRequirementDetails = {
  requirement: IdnRequirementRecord;
};

type IdnJurisdictionRow = {
  jurisdiction: string;
};

export const getIdnRequirement = async (
  jurisdiction: string,
  documentType: IdnDocumentType,
) => {
  const { data, error } = await supabaseAdmin
    .from("idn_requirements")
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
        "acknowledgment_form",
        "notary_commission_authority",
        "venue_requirement",
        "signer_identification",
        "witness_requirements",
        "remote_online_notarization",
        "e_notarization",
        "notarial_certificate_required_elements",
        "seal_stamp_requirements",
        "commission_expiration_on_certificate",
        "recording_requirements",
        "competency_of_signer",
        "notarial_system",
        "execution_presence_mode",
        "digital_channel_status",
        "acknowledgment_profile",
        "base_template_key",
        "jurisdiction_overlay_key",
        "ron_allowed",
        "e_notarization_allowed",
        "witnesses_required_for_primary_act",
        "personal_knowledge_only_identification_allowed",
        "credible_witness_identification_allowed",
        "commission_expiration_on_certificate_required",
        "statutory_short_form_available",
        "custom_certificate_language_required",
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

  return data as IdnRequirementRecord | null;
};

export const getIdnRequirementDetails = async (
  jurisdiction: string,
  documentType: IdnDocumentType,
) => {
  const requirement = await getIdnRequirement(jurisdiction, documentType);

  if (!requirement) {
    return null;
  }

  return {
    requirement,
  } satisfies IdnRequirementDetails;
};

export const listIdnJurisdictions = async (documentType: IdnDocumentType) => {
  const { data, error } = await supabaseAdmin
    .from("idn_requirements")
    .select("jurisdiction")
    .eq("document_type", documentType)
    .order("jurisdiction", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const unique = new Map<string, { code: string; label: string }>();

  for (const row of (data ?? []) as IdnJurisdictionRow[]) {
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

export const normalizeIdnJurisdiction = normalizeJurisdiction;
