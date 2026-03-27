"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPoaRequirement = exports.normalizeJurisdiction = exports.poaTypes = void 0;
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
//# sourceMappingURL=poaService.js.map