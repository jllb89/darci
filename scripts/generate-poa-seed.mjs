import fs from "node:fs";
import path from "node:path";

const repoRoot = "/Users/jorge/Desktop/darci";
const jsonPath = path.join(repoRoot, "docs/POA_requirements.json");

const jurisdictionMap = {
  Alabama: "US-AL",
  Alaska: "US-AK",
  Arizona: "US-AZ",
  Arkansas: "US-AR",
  California: "US-CA",
  Colorado: "US-CO",
  Connecticut: "US-CT",
  Delaware: "US-DE",
  "District of Columbia": "US-DC",
  Florida: "US-FL",
  Georgia: "US-GA",
  Hawaii: "US-HI",
  Idaho: "US-ID",
  Illinois: "US-IL",
  Indiana: "US-IN",
  Iowa: "US-IA",
  Kansas: "US-KS",
  Kentucky: "US-KY",
  Louisiana: "US-LA",
  Maine: "US-ME",
  Maryland: "US-MD",
  Massachusetts: "US-MA",
  Michigan: "US-MI",
  Minnesota: "US-MN",
  Mississippi: "US-MS",
  Missouri: "US-MO",
  Montana: "US-MT",
  Nebraska: "US-NE",
  Nevada: "US-NV",
  "New Hampshire": "US-NH",
  "New Jersey": "US-NJ",
  "New Mexico": "US-NM",
  "New York": "US-NY",
  "North Carolina": "US-NC",
  "North Dakota": "US-ND",
  Ohio: "US-OH",
  Oklahoma: "US-OK",
  Oregon: "US-OR",
  Pennsylvania: "US-PA",
  "Puerto Rico": "US-PR",
  "Rhode Island": "US-RI",
  "South Carolina": "US-SC",
  "South Dakota": "US-SD",
  Tennessee: "US-TN",
  Texas: "US-TX",
  Utah: "US-UT",
  Vermont: "US-VT",
  Virginia: "US-VA",
  Washington: "US-WA",
  "West Virginia": "US-WV",
  Wisconsin: "US-WI",
  Wyoming: "US-WY",
};

const escapeSql = (value) => {
  if (value === null || typeof value === "undefined") {
    return "null";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
};

const parseWitnessCount = (text) => {
  if (!text) {
    return null;
  }

  const lower = text.toLowerCase();
  if (lower.includes("one witness")) {
    return 1;
  }

  if (
    lower.includes("two witnesses") ||
    lower.includes("two adults") ||
    lower.includes("another individual")
  ) {
    return 2;
  }

  return null;
};

const mapNotarizationRule = (text) => {
  if (!text || text === "Not addressed") {
    return "not_addressed";
  }

  const lower = text.toLowerCase();

  if (lower.includes("varies")) {
    return "varies_by_type";
  }

  if (
    lower.includes(" or two witnesses") ||
    lower.includes("or witnessed") ||
    lower.includes("witnessed or notarized") ||
    lower.includes("notarized or witnessed") ||
    lower.includes("or notarized")
  ) {
    return "alternative_to_witnesses";
  }

  if (
    lower.includes("notary") ||
    lower.includes("notarial officer") ||
    lower.includes("notarized") ||
    lower.includes("acknowledged") ||
    lower.includes("conveyance") ||
    lower.includes("authorized officer")
  ) {
    return "required";
  }

  return "not_addressed";
};

const mapWitnessRule = (text) => {
  if (!text || text === "Not addressed") {
    return "not_addressed";
  }

  const lower = text.toLowerCase();

  if (lower.includes("varies")) {
    return "varies_by_type";
  }

  if (
    lower.includes(" or two witnesses") ||
    lower.includes("or witnessed") ||
    lower.includes("witnessed or notarized") ||
    lower.includes("notarized or witnessed") ||
    lower.includes("or notarized")
  ) {
    return "alternative_to_notary";
  }

  if (
    lower.includes("and two witnesses") ||
    lower.includes(" and one witness") ||
    lower.includes(", two witnesses") ||
    lower.includes(", one witness") ||
    lower.includes("witness for property poa") ||
    lower.includes("notarized and witnessed") ||
    lower.includes("competent witness and another individual") ||
    lower.includes("same formality as a will") ||
    lower.includes("witnessed by two adults, acknowledged") ||
    lower.includes("two remote witnesses")
  ) {
    return "additional_to_notary";
  }

  if (lower.includes("witness")) {
    return "required";
  }

  return "none";
};

const mapDurabilityRule = (text) => {
  if (!text || text === "Not addressed") {
    return "not_addressed";
  }

  const lower = text.toLowerCase();

  if (lower.includes("durable if recorded")) {
    return "conditional";
  }

  if (lower.includes("presumed durable") || lower.includes("durable unless")) {
    return "presumed_durable";
  }

  if (lower.includes("durable if")) {
    return "requires_explicit_language";
  }

  return "not_addressed";
};

const mapStatutoryFormRule = (text) => {
  if (!text || text === "Not addressed") {
    return "not_addressed";
  }

  const lower = text.toLowerCase();

  if (lower.includes("short and long") || lower.includes("general and health care")) {
    return "multiple_forms";
  }

  if (lower.startsWith("yes")) {
    return "available";
  }

  return "not_available";
};

const mapEffectiveDateRule = (text) => {
  if (!text || text === "Not addressed") {
    return "not_addressed";
  }

  const lower = text.toLowerCase();

  if (lower.includes("specified event") || lower.includes("trigger")) {
    return "upon_triggering_event";
  }

  if (lower.includes("unless otherwise specified")) {
    return "upon_execution_unless_specified";
  }

  if (lower.includes("upon execution")) {
    return "upon_execution";
  }

  return "not_addressed";
};

const mapCompetencyRule = (text) => {
  if (!text || text === "Not addressed") {
    return "not_addressed";
  }

  const lower = text.toLowerCase();

  if (
    lower.includes("capacity to contract") ||
    lower.includes("person with capacity to contract")
  ) {
    return "contract_capacity_required";
  }

  if (lower.includes("sound mind") || lower.includes("of sound mind")) {
    return "sound_mind_required";
  }

  if (
    lower.includes("nature and effect") ||
    lower.includes("nature and consequences") ||
    lower.includes("understand and comprehend")
  ) {
    return "understand_nature_and_effect";
  }

  if (lower.includes("sufficient mental capacity")) {
    return "sufficient_mental_capacity";
  }

  return "general_capacity_required";
};

const mapSpecialAuthorityRule = (text) => {
  if (!text || text === "Not addressed") {
    return "not_addressed";
  }

  const lower = text.toLowerCase();

  if (lower.includes("varies by type")) {
    return "varies_by_type";
  }

  if (lower.startsWith("yes")) {
    return "required_for_certain_acts";
  }

  return "not_required";
};

const allowsProxySignature = (text) => {
  if (!text) {
    return false;
  }

  const lower = text.toLowerCase();

  return (
    lower.includes("another in principal's presence") ||
    lower.includes("another in their presence") ||
    lower.includes("another at principal's direction") ||
    lower.includes("at their direction") ||
    lower.includes("or another in principal's presence") ||
    lower.includes("or another in their presence")
  );
};

const deriveUiProfile = (notarizationRule, witnessRule) => {
  if (
    notarizationRule === "varies_by_type" ||
    witnessRule === "varies_by_type" ||
    notarizationRule === "not_addressed" ||
    witnessRule === "not_addressed"
  ) {
    return "review_required";
  }

  if (witnessRule === "additional_to_notary") {
    return "notary_and_witness";
  }

  if (
    witnessRule === "alternative_to_notary" ||
    notarizationRule === "alternative_to_witnesses"
  ) {
    return "notary_or_witness";
  }

  if (notarizationRule === "required" && witnessRule === "none") {
    return "notary_only";
  }

  if (notarizationRule === "not_required" && witnessRule === "required") {
    return "witness_only";
  }

  return "standard";
};

const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const columns = [
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
  "notes",
];

const valueRows = rows.map((row) => {
  const jurisdiction = jurisdictionMap[row.Jurisdiction];
  if (!jurisdiction) {
    throw new Error(`Missing jurisdiction mapping for ${row.Jurisdiction}`);
  }

  const acknowledgmentText = row["Acknowledgment/Witnessing"];
  const notarizationRule = mapNotarizationRule(acknowledgmentText);
  const witnessRule = mapWitnessRule(acknowledgmentText);
  const witnessCount = parseWitnessCount(acknowledgmentText);
  const durabilityRule = mapDurabilityRule(row.Durability);
  const statutoryFormRule = mapStatutoryFormRule(row["Statutory Form Available"]);
  const effectiveDateRule = mapEffectiveDateRule(row["Effective Date"]);
  const competencyRule = mapCompetencyRule(row["Competency Requirement"]);
  const specialAuthorityRule = mapSpecialAuthorityRule(
    row["Specific Authority Required for Certain Acts"],
  );
  const uiProfile = deriveUiProfile(notarizationRule, witnessRule);

  const values = [
    escapeSql(jurisdiction),
    escapeSql("general"),
    escapeSql(uiProfile),
    escapeSql(notarizationRule),
    escapeSql(witnessRule),
    witnessCount ?? "null",
    escapeSql(durabilityRule),
    escapeSql(statutoryFormRule),
    escapeSql(effectiveDateRule),
    escapeSql(competencyRule),
    escapeSql(specialAuthorityRule),
    "false",
    "true",
    allowsProxySignature(row["Execution Requirements"]) ? "true" : "false",
    notarizationRule === "required" ? "true" : "false",
    escapeSql(row["Governing Law"]),
    escapeSql(row["Execution Requirements"]),
    escapeSql(acknowledgmentText),
    escapeSql(row.Durability),
    escapeSql(row["Specific Authority Required for Certain Acts"]),
    escapeSql(row["Competency Requirement"]),
    escapeSql(row["Statutory Form Available"]),
    escapeSql(row["Effective Date"]),
    escapeSql(row["Governing Law"]),
    "null",
    escapeSql("needs_review"),
    escapeSql(
      "Seeded from docs/POA_requirements.json. Review against licensed counsel before production reliance.",
    ),
  ];

  return `  (${values.join(", ")})`;
});

const updateColumns = [
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
  "notes",
];

const sql = [
  "insert into public.poa_requirements (",
  columns.map((column, index) => `  ${column}${index < columns.length - 1 ? "," : ""}`).join("\n"),
  ") values",
  valueRows.join(",\n"),
  "on conflict (jurisdiction, poa_type) do update set",
  updateColumns
    .map((column) => `  ${column} = excluded.${column}`)
    .concat("  updated_at = now()")
    .join(",\n"),
  ";",
].join("\n");

process.stdout.write(sql);