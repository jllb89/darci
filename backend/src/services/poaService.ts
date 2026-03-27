import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export const poaTypes = [
  "general",
  "limited",
  "durable",
  "medical",
  "vehicle",
  "tax",
  "springing",
  "other",
] as const;

const jurisdictionAliases: Record<string, string> = {
  ALABAMA: "US-AL",
  ALASKA: "US-AK",
  ARIZONA: "US-AZ",
  ARKANSAS: "US-AR",
  CALIFORNIA: "US-CA",
  COLORADO: "US-CO",
  CONNECTICUT: "US-CT",
  DELAWARE: "US-DE",
  "DISTRICT OF COLUMBIA": "US-DC",
  FLORIDA: "US-FL",
  GEORGIA: "US-GA",
  HAWAII: "US-HI",
  IDAHO: "US-ID",
  ILLINOIS: "US-IL",
  INDIANA: "US-IN",
  IOWA: "US-IA",
  KANSAS: "US-KS",
  KENTUCKY: "US-KY",
  LOUISIANA: "US-LA",
  MAINE: "US-ME",
  MARYLAND: "US-MD",
  MASSACHUSETTS: "US-MA",
  MICHIGAN: "US-MI",
  MINNESOTA: "US-MN",
  MISSISSIPPI: "US-MS",
  MISSOURI: "US-MO",
  MONTANA: "US-MT",
  NEBRASKA: "US-NE",
  NEVADA: "US-NV",
  "NEW HAMPSHIRE": "US-NH",
  "NEW JERSEY": "US-NJ",
  "NEW MEXICO": "US-NM",
  "NEW YORK": "US-NY",
  "NORTH CAROLINA": "US-NC",
  "NORTH DAKOTA": "US-ND",
  OHIO: "US-OH",
  OKLAHOMA: "US-OK",
  OREGON: "US-OR",
  PENNSYLVANIA: "US-PA",
  "PUERTO RICO": "US-PR",
  "RHODE ISLAND": "US-RI",
  "SOUTH CAROLINA": "US-SC",
  "SOUTH DAKOTA": "US-SD",
  TENNESSEE: "US-TN",
  TEXAS: "US-TX",
  UTAH: "US-UT",
  VERMONT: "US-VT",
  VIRGINIA: "US-VA",
  WASHINGTON: "US-WA",
  "WEST VIRGINIA": "US-WV",
  WISCONSIN: "US-WI",
  WYOMING: "US-WY",
};

const jurisdictionLabels: Record<string, string> = Object.fromEntries(
  Object.entries(jurisdictionAliases).map(([label, code]) => [code, label]),
);

export type PoaRequirementRecord = {
  id: string;
  jurisdiction: string;
  poa_type: string;
  ui_profile: string;
  notarization_rule: string;
  witness_rule: string;
  witness_count: number | null;
  durability_rule: string;
  statutory_form_rule: string;
  effective_date_rule: string;
  competency_rule: string;
  special_authority_rule: string;
  allows_agent_certification: boolean | null;
  requires_principal_signature: boolean | null;
  allows_proxy_signature: boolean | null;
  requires_acknowledgment_certificate: boolean | null;
  governing_law: string | null;
  execution_requirements_text: string | null;
  acknowledgment_witnessing_text: string | null;
  durability_text: string | null;
  special_authority_text: string | null;
  competency_text: string | null;
  statutory_form_text: string | null;
  effective_date_text: string | null;
  source_citation: string | null;
  source_url: string | null;
  review_status: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PoaFormRuleRecord = {
  id: string;
  poa_requirement_id: string;
  statutory_form_exists: boolean;
  statutory_form_recommended: boolean;
  statutory_form_mandatory_for_product: boolean;
  must_track_statutory_ordering: boolean;
  must_track_statutory_headings: boolean;
  must_include_warning_to_principal: boolean;
  must_include_notice_to_agent: boolean;
  special_authorities_render_mode:
    | "hidden"
    | "checklist"
    | "checklist_with_initials"
    | "checkboxes_from_statutory_form"
    | "freeform_text"
    | "hybrid"
    | "manual_review_only";
  freeform_special_authority_text_allowed: boolean;
  hybrid_rendering_allowed: boolean;
  attorney_customization_recommended: boolean;
  source_citation: string | null;
  source_url: string | null;
  legal_review_status: "pending" | "reviewed" | "needs_update" | "blocked";
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PoaGlossaryTermRecord = {
  id: string;
  poa_requirement_id: string;
  glossary_key: string;
  generic_label: string;
  state_specific_label: string | null;
  product_description: string;
  why_user_needs_this: string | null;
  source_citation: string | null;
  source_url: string | null;
  is_materially_state_specific: boolean;
  legal_review_status: "pending" | "reviewed" | "needs_update" | "blocked";
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type PoaCanonicalSpecialAuthorityRecord = {
  id: string;
  key: string;
  label: string;
  description: string;
  category: string | null;
  sort_order: number;
  is_core_national_key: boolean;
};

type PoaSpecialAuthorityRuleRow = {
  id: string;
  poa_requirement_id: string;
  canonical_authority_id: string;
  explicitly_required: boolean;
  requirement_type:
    | "express_grant"
    | "specific_language"
    | "separate_initials"
    | "statutory_form_checkbox"
    | "not_required"
    | "unclear";
  applies_to_general_financial_poa: boolean;
  statutory_form_only: boolean;
  custom_language_required: boolean;
  initials_required: boolean;
  checkbox_required: boolean;
  freeform_text_allowed: boolean;
  state_specific_label: string | null;
  statutory_text_excerpt: string | null;
  exact_statute_citation: string | null;
  source_url: string | null;
  plain_english_rule: string;
  confidence: "high" | "medium" | "low";
  legal_review_status: "pending" | "reviewed" | "needs_update" | "blocked";
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  effective_start_date: string | null;
  effective_end_date: string | null;
  renderer_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type PoaSpecialAuthorityRuleRecord = {
  id: string;
  canonical_key: string;
  canonical_label: string;
  canonical_description: string;
  category: string | null;
  sort_order: number;
  is_core_national_key: boolean;
  explicitly_required: boolean;
  requirement_type:
    | "express_grant"
    | "specific_language"
    | "separate_initials"
    | "statutory_form_checkbox"
    | "not_required"
    | "unclear";
  applies_to_general_financial_poa: boolean;
  statutory_form_only: boolean;
  custom_language_required: boolean;
  initials_required: boolean;
  checkbox_required: boolean;
  freeform_text_allowed: boolean;
  state_specific_label: string | null;
  statutory_text_excerpt: string | null;
  exact_statute_citation: string | null;
  source_url: string | null;
  plain_english_rule: string;
  confidence: "high" | "medium" | "low";
  legal_review_status: "pending" | "reviewed" | "needs_update" | "blocked";
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  effective_start_date: string | null;
  effective_end_date: string | null;
  renderer_metadata: Record<string, unknown>;
};

export type PoaRequirementDetails = {
  requirement: PoaRequirementRecord;
  formRules: PoaFormRuleRecord | null;
  glossary: PoaGlossaryTermRecord[];
  specialAuthorities: PoaSpecialAuthorityRuleRecord[];
};

type PoaJurisdictionRow = {
  jurisdiction: string;
};

export const getJurisdictionLabel = (jurisdiction: string) => {
  return jurisdictionLabels[jurisdiction] ?? jurisdiction;
};

export const normalizeJurisdiction = (input: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }

  const upper = trimmed.toUpperCase();
  if (upper.startsWith("US-")) {
    return upper;
  }

  if (upper.length === 2) {
    return `US-${upper}`;
  }

  return jurisdictionAliases[upper] ?? upper;
};

export const getPoaRequirement = async (
  jurisdiction: string,
  poaType: (typeof poaTypes)[number],
) => {
  const { data, error } = await supabaseAdmin
    .from("poa_requirements")
    .select(
      [
        "id",
        "jurisdiction",
        "poa_type",
        "ui_profile",
        "notarization_rule",
        "witness_rule",
        "witness_count",
        "durability_rule",
        "statutory_form_rule",
        "effective_date_rule",
        "competency_rule",
        "special_authority_rule",
        "allows_agent_certification",
        "requires_principal_signature",
        "allows_proxy_signature",
        "requires_acknowledgment_certificate",
        "governing_law",
        "execution_requirements_text",
        "acknowledgment_witnessing_text",
        "durability_text",
        "special_authority_text",
        "competency_text",
        "statutory_form_text",
        "effective_date_text",
        "source_citation",
        "source_url",
        "review_status",
        "reviewed_at",
        "notes",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("jurisdiction", jurisdiction)
    .eq("poa_type", poaType)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as PoaRequirementRecord | null;
};

const getPoaFormRules = async (poaRequirementId: string) => {
  const { data, error } = await supabaseAdmin
    .from("poa_form_rules")
    .select(
      [
        "id",
        "poa_requirement_id",
        "statutory_form_exists",
        "statutory_form_recommended",
        "statutory_form_mandatory_for_product",
        "must_track_statutory_ordering",
        "must_track_statutory_headings",
        "must_include_warning_to_principal",
        "must_include_notice_to_agent",
        "special_authorities_render_mode",
        "freeform_special_authority_text_allowed",
        "hybrid_rendering_allowed",
        "attorney_customization_recommended",
        "source_citation",
        "source_url",
        "legal_review_status",
        "reviewed_at",
        "reviewed_by",
        "review_notes",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("poa_requirement_id", poaRequirementId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as PoaFormRuleRecord | null) ?? null;
};

const getPoaGlossary = async (poaRequirementId: string) => {
  const { data, error } = await supabaseAdmin
    .from("poa_glossary_terms")
    .select(
      [
        "id",
        "poa_requirement_id",
        "glossary_key",
        "generic_label",
        "state_specific_label",
        "product_description",
        "why_user_needs_this",
        "source_citation",
        "source_url",
        "is_materially_state_specific",
        "legal_review_status",
        "reviewed_at",
        "reviewed_by",
        "review_notes",
        "sort_order",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("poa_requirement_id", poaRequirementId)
    .order("sort_order", { ascending: true })
    .order("generic_label", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as PoaGlossaryTermRecord[];
};

const getPoaSpecialAuthorityRules = async (poaRequirementId: string) => {
  const { data, error } = await supabaseAdmin
    .from("poa_special_authority_rules")
    .select(
      [
        "id",
        "poa_requirement_id",
        "canonical_authority_id",
        "explicitly_required",
        "requirement_type",
        "applies_to_general_financial_poa",
        "statutory_form_only",
        "custom_language_required",
        "initials_required",
        "checkbox_required",
        "freeform_text_allowed",
        "state_specific_label",
        "statutory_text_excerpt",
        "exact_statute_citation",
        "source_url",
        "plain_english_rule",
        "confidence",
        "legal_review_status",
        "reviewed_at",
        "reviewed_by",
        "review_notes",
        "effective_start_date",
        "effective_end_date",
        "renderer_metadata",
        "created_at",
        "updated_at",
      ].join(", "),
    )
    .eq("poa_requirement_id", poaRequirementId);

  if (error) {
    throw new Error(error.message);
  }

  const rules = (data ?? []) as unknown as PoaSpecialAuthorityRuleRow[];

  if (!rules.length) {
    return [];
  }

  const canonicalIds = [...new Set(rules.map((rule) => rule.canonical_authority_id))];
  const { data: canonicalData, error: canonicalError } = await supabaseAdmin
    .from("poa_canonical_special_authorities")
    .select(
      [
        "id",
        "key",
        "label",
        "description",
        "category",
        "sort_order",
        "is_core_national_key",
      ].join(", "),
    )
    .in("id", canonicalIds);

  if (canonicalError) {
    throw new Error(canonicalError.message);
  }

  const canonicalById = new Map(
    ((canonicalData ?? []) as unknown as PoaCanonicalSpecialAuthorityRecord[]).map((record) => [
      record.id,
      record,
    ]),
  );

  return rules
    .map((rule) => {
      const canonical = canonicalById.get(rule.canonical_authority_id);

      if (!canonical) {
        return null;
      }

      return {
        id: rule.id,
        canonical_key: canonical.key,
        canonical_label: canonical.label,
        canonical_description: canonical.description,
        category: canonical.category,
        sort_order: canonical.sort_order,
        is_core_national_key: canonical.is_core_national_key,
        explicitly_required: rule.explicitly_required,
        requirement_type: rule.requirement_type,
        applies_to_general_financial_poa: rule.applies_to_general_financial_poa,
        statutory_form_only: rule.statutory_form_only,
        custom_language_required: rule.custom_language_required,
        initials_required: rule.initials_required,
        checkbox_required: rule.checkbox_required,
        freeform_text_allowed: rule.freeform_text_allowed,
        state_specific_label: rule.state_specific_label,
        statutory_text_excerpt: rule.statutory_text_excerpt,
        exact_statute_citation: rule.exact_statute_citation,
        source_url: rule.source_url,
        plain_english_rule: rule.plain_english_rule,
        confidence: rule.confidence,
        legal_review_status: rule.legal_review_status,
        reviewed_at: rule.reviewed_at,
        reviewed_by: rule.reviewed_by,
        review_notes: rule.review_notes,
        effective_start_date: rule.effective_start_date,
        effective_end_date: rule.effective_end_date,
        renderer_metadata: rule.renderer_metadata ?? {},
      } satisfies PoaSpecialAuthorityRuleRecord;
    })
    .filter((rule): rule is PoaSpecialAuthorityRuleRecord => Boolean(rule))
    .sort((left, right) => left.sort_order - right.sort_order);
};

export const getPoaRequirementDetails = async (
  jurisdiction: string,
  poaType: (typeof poaTypes)[number],
) => {
  const requirement = await getPoaRequirement(jurisdiction, poaType);

  if (!requirement) {
    return null;
  }

  const [formRules, glossary, specialAuthorities] = await Promise.all([
    getPoaFormRules(requirement.id),
    getPoaGlossary(requirement.id),
    getPoaSpecialAuthorityRules(requirement.id),
  ]);

  return {
    requirement,
    formRules,
    glossary,
    specialAuthorities,
  } satisfies PoaRequirementDetails;
};

export const listPoaJurisdictions = async (
  poaType: (typeof poaTypes)[number],
) => {
  const { data, error } = await supabaseAdmin
    .from("poa_requirements")
    .select("jurisdiction")
    .eq("poa_type", poaType)
    .order("jurisdiction", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const unique = new Map<string, { code: string; label: string }>();

  for (const row of (data ?? []) as PoaJurisdictionRow[]) {
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