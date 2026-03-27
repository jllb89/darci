"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPoaJurisdictions = exports.getPoaRequirementDetails = exports.getPoaRequirement = exports.normalizeJurisdiction = exports.getJurisdictionLabel = exports.poaTypes = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabaseAdmin = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
exports.poaTypes = [
    "general",
    "limited",
    "durable",
    "medical",
    "vehicle",
    "tax",
    "springing",
    "other",
];
const jurisdictionAliases = {
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
const jurisdictionLabels = Object.fromEntries(Object.entries(jurisdictionAliases).map(([label, code]) => [code, label]));
const getJurisdictionLabel = (jurisdiction) => {
    return jurisdictionLabels[jurisdiction] ?? jurisdiction;
};
exports.getJurisdictionLabel = getJurisdictionLabel;
const normalizeJurisdiction = (input) => {
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
exports.normalizeJurisdiction = normalizeJurisdiction;
const getPoaRequirement = async (jurisdiction, poaType) => {
    const { data, error } = await supabaseAdmin
        .from("poa_requirements")
        .select([
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
    ].join(", "))
        .eq("jurisdiction", jurisdiction)
        .eq("poa_type", poaType)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data;
};
exports.getPoaRequirement = getPoaRequirement;
const getPoaFormRules = async (poaRequirementId) => {
    const { data, error } = await supabaseAdmin
        .from("poa_form_rules")
        .select([
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
    ].join(", "))
        .eq("poa_requirement_id", poaRequirementId)
        .limit(1)
        .maybeSingle();
    if (error) {
        throw new Error(error.message);
    }
    return data ?? null;
};
const getPoaGlossary = async (poaRequirementId) => {
    const { data, error } = await supabaseAdmin
        .from("poa_glossary_terms")
        .select([
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
    ].join(", "))
        .eq("poa_requirement_id", poaRequirementId)
        .order("sort_order", { ascending: true })
        .order("generic_label", { ascending: true });
    if (error) {
        throw new Error(error.message);
    }
    return (data ?? []);
};
const getPoaSpecialAuthorityRules = async (poaRequirementId) => {
    const { data, error } = await supabaseAdmin
        .from("poa_special_authority_rules")
        .select([
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
    ].join(", "))
        .eq("poa_requirement_id", poaRequirementId);
    if (error) {
        throw new Error(error.message);
    }
    const rules = (data ?? []);
    if (!rules.length) {
        return [];
    }
    const canonicalIds = [...new Set(rules.map((rule) => rule.canonical_authority_id))];
    const { data: canonicalData, error: canonicalError } = await supabaseAdmin
        .from("poa_canonical_special_authorities")
        .select([
        "id",
        "key",
        "label",
        "description",
        "category",
        "sort_order",
        "is_core_national_key",
    ].join(", "))
        .in("id", canonicalIds);
    if (canonicalError) {
        throw new Error(canonicalError.message);
    }
    const canonicalById = new Map((canonicalData ?? []).map((record) => [
        record.id,
        record,
    ]));
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
        };
    })
        .filter((rule) => Boolean(rule))
        .sort((left, right) => left.sort_order - right.sort_order);
};
const getPoaRequirementDetails = async (jurisdiction, poaType) => {
    const requirement = await (0, exports.getPoaRequirement)(jurisdiction, poaType);
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
    };
};
exports.getPoaRequirementDetails = getPoaRequirementDetails;
const listPoaJurisdictions = async (poaType) => {
    const { data, error } = await supabaseAdmin
        .from("poa_requirements")
        .select("jurisdiction")
        .eq("poa_type", poaType)
        .order("jurisdiction", { ascending: true });
    if (error) {
        throw new Error(error.message);
    }
    const unique = new Map();
    for (const row of (data ?? [])) {
        if (!unique.has(row.jurisdiction)) {
            unique.set(row.jurisdiction, {
                code: row.jurisdiction,
                label: (0, exports.getJurisdictionLabel)(row.jurisdiction),
            });
        }
    }
    return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
};
exports.listPoaJurisdictions = listPoaJurisdictions;
//# sourceMappingURL=poaService.js.map