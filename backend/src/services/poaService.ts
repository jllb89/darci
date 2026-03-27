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