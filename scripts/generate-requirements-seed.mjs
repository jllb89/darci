import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

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

const args = process.argv.slice(2);
let outputArg = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--output") {
    outputArg = args[i + 1];
    i += 1;
  }
}

const toTimestamp = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
  ].join("");
};

const defaultOutput = path.join(
  repoRoot,
  "supabase",
  "migrations",
  `${toTimestamp(new Date())}_seed_trust_idn_and_poa_requirements.sql`,
);
const outputPath = outputArg ? path.resolve(repoRoot, outputArg) : defaultOutput;

const readJson = (relativePath) => {
  const fullPath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
};

const escapeSql = (value) => {
  if (value === null || typeof value === "undefined") {
    return "null";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
};

const toSqlBool = (value) => (value ? "true" : "false");

const isTruthyText = (text) => {
  if (!text) {
    return false;
  }
  const lower = text.toLowerCase();
  if (
    lower.includes("not authorized") ||
    lower.includes("not permitted") ||
    lower.includes("not required") ||
    lower.includes("not yet implemented") ||
    lower.includes("no active")
  ) {
    return false;
  }

  return (
    lower.includes("yes") ||
    lower.includes("required") ||
    lower.includes("authorized") ||
    lower.includes("permitted")
  );
};

const includesAny = (text, needles) => {
  if (!text) {
    return false;
  }
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
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
    lower.includes("witnessed by two adults") ||
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

const mapExecutionModelV2 = (uiProfile) => {
  switch (uiProfile) {
    case "notary_only":
      return "NOTARY_ONLY";
    case "witness_only":
      return "WITNESSES_ONLY";
    case "notary_or_witness":
      return "NOTARY_OR_WITNESSES";
    case "notary_and_witness":
      return "NOTARY_AND_WITNESSES";
    case "review_required":
      return "TYPE_SPECIFIC_VARIANT";
    default:
      return null;
  }
};

const mapDurabilityDefaultStatusV2 = (durabilityRule) => {
  switch (durabilityRule) {
    case "presumed_durable":
      return "durable_by_default";
    case "requires_explicit_language":
      return "durable_if_stated";
    case "not_durable_unless_stated":
      return "non_durable_by_default";
    case "varies_by_type":
    case "conditional":
      return "type_specific";
    default:
      return "not_addressed";
  }
};

const mapSpecificAuthorityStatusV2 = (rule, rawText) => {
  if (rule === "required_for_certain_acts") {
    if (includesAny(rawText, ["initial"])) {
      return "explicit_required_with_initials";
    }
    return "explicit_required";
  }

  if (rule === "varies_by_type") {
    return "type_specific";
  }

  if (rule === "not_required") {
    return "not_required";
  }

  return "not_addressed";
};

const mapEffectiveDateStatusV2 = (rule) => {
  switch (rule) {
    case "upon_execution":
      return "immediate_default";
    case "upon_execution_unless_specified":
      return "immediate_or_specified";
    case "upon_triggering_event":
      return "specified_event_allowed";
    case "varies_by_type":
      return "type_specific";
    default:
      return "not_addressed";
  }
};

const mapStatutoryFormStatusV2 = (rule, rawText) => {
  if (rule === "available") {
    if (includesAny(rawText, ["not mandatory", "voluntary"])) {
      return "available_not_mandatory";
    }
    return "available";
  }

  if (rule === "multiple_forms") {
    return "multiple_forms_available";
  }

  if (rule === "not_available") {
    return "not_available";
  }

  return "not_addressed";
};

const mapCompetencyStatusV2 = (rule, rawText) => {
  if (rule === "sound_mind_required") {
    return "sound_mind_required";
  }

  if (rule === "not_addressed") {
    return "not_addressed";
  }

  if (includesAny(rawText, ["competent adult"])) {
    return "competent_adult_required";
  }

  return "capacity_required";
};

const requireJurisdictionCode = (name) => {
  const code = jurisdictionMap[name];
  if (!code) {
    throw new Error(`Missing jurisdiction mapping for ${name}`);
  }
  return code;
};

const buildInsertSql = ({
  table,
  columns,
  rows,
  conflictColumns,
  updateColumns,
}) => {
  const sqlRows = rows.map((row) => {
    const values = columns.map((column) => row[column]);
    return `  (${values.join(", ")})`;
  });

  return [
    `insert into ${table} (`,
    columns
      .map((column, index) => `  ${column}${index < columns.length - 1 ? "," : ""}`)
      .join("\n"),
    ") values",
    sqlRows.join(",\n"),
    `on conflict (${conflictColumns.join(", ")}) do update set`,
    updateColumns
      .map((column) => `  ${column} = excluded.${column}`)
      .concat("  updated_at = now()")
      .join(",\n"),
    ";",
  ].join("\n");
};

const trustData = readJson("docs/Trust_requirements.json");
const idnData = readJson("docs/IDN_requirements.json");
const poaData = readJson("docs/POA_requirements.json");

const expectedCount = 52;
for (const [name, rows] of [
  ["Trust", trustData],
  ["IDN", idnData],
  ["POA", poaData],
]) {
  if (rows.length !== expectedCount) {
    throw new Error(`${name} dataset must contain ${expectedCount} rows. Found ${rows.length}.`);
  }
}

const trustColumns = [
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
  "notes",
];

const trustRows = trustData.map((row) => {
  const jurisdiction = requireJurisdictionCode(row.Jurisdiction);
  const manualReviewRaw = row["Manual Review Required"];
  const governingLaw = row["Governing Law"];
  const nonDefaultPowers = row["Non-Default Powers Requiring Express Authority"];

  return {
    jurisdiction: escapeSql(jurisdiction),
    document_type: escapeSql("rrr"),
    ui_profile: escapeSql("trust_standard"),
    derivation_mode: escapeSql("rules_plus_overrides"),
    api_representation_mode: escapeSql("sectioned_only"),
    manual_review_required: toSqlBool(isTruthyText(manualReviewRaw)),
    governing_law: escapeSql(governingLaw),
    utc_adopted: escapeSql(row["UTC Adopted"]),
    revocability_presumption: escapeSql(row["Revocability Presumption"]),
    writing_required: escapeSql(row["Writing Required"]),
    signature_required: escapeSql(row["Signature Required"]),
    notarization_required: escapeSql(row["Notarization Required"]),
    witnesses_required: escapeSql(row["Witnesses Required"]),
    special_execution_rules: escapeSql(row["Special Execution Rules"]),
    trust_certification_statutory_basis: escapeSql(row["Trust Certification Statutory Basis"]),
    certification_required_elements: escapeSql(row["Certification Required Elements"]),
    certification_permissive_elements: escapeSql(row["Certification Permissive Elements"]),
    certification_prohibited_elements: escapeSql(row["Certification Prohibited Elements"]),
    non_default_powers_requiring_express_authority: escapeSql(nonDefaultPowers),
    statutory_form_available: escapeSql(row["Statutory Form Available"]),
    pour_over_will_recognized: escapeSql(row["Pour-Over Will Recognized"]),
    registration_requirement: escapeSql(row["Registration Requirement"]),
    real_property_rule: escapeSql(row["Real Property Rule"]),
    competency_requirement: escapeSql(row["Competency Requirement"]),
    specific_authority_required_for_certain_acts: escapeSql(
      row["Specific Authority Required for Certain Acts"],
    ),
    manual_review_required_text: escapeSql(manualReviewRaw),
    trust_system: "null",
    execution_level: "null",
    acknowledgment_profile: "null",
    base_template_key: "null",
    state_overlay_key: "null",
    asset_protection: toSqlBool(includesAny(governingLaw, ["asset protection"])),
    directed_trusts: toSqlBool(includesAny(governingLaw, ["directed trust"])),
    decanting_friendly: toSqlBool(includesAny(governingLaw, ["decant"])),
    silent_trust_friendly: toSqlBool(includesAny(governingLaw, ["silent trust"])),
    normalization_confidence: escapeSql("medium"),
    source_citation: escapeSql(governingLaw),
    source_url: "null",
    review_status: escapeSql("needs_review"),
    notes: escapeSql(
      "Seeded from docs/Trust_requirements.json. Review against licensed counsel before production reliance.",
    ),
  };
});

const idnColumns = [
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
  "notes",
];

const idnRows = idnData.map((row) => {
  const jurisdiction = requireJurisdictionCode(row.Jurisdiction);
  const ronText = row["Remote Online Notarization (RON)"];
  const eNotText = row["E-Notarization"];
  const witnessReqText = row["Witness Requirements"];
  const signerIdText = row["Signer Identification"];
  const ackFormText = row["Acknowledgment Form"];
  const commExpText = row["Commission Expiration on Certificate"];

  const ronAllowed = isTruthyText(ronText);
  const eNotAllowed = isTruthyText(eNotText);

  let digitalChannelStatus = "DIGITAL_NOT_AUTHORIZED";
  if (ronAllowed) {
    digitalChannelStatus = "RON_AUTHORIZED";
  } else if (eNotAllowed) {
    digitalChannelStatus = "E_NOTARIZATION_AUTHORIZED_NO_RON";
  }

  const personalKnowledgeOnly =
    includesAny(signerIdText, ["personal knowledge"]) &&
    includesAny(signerIdText, ["alone", "only"]) &&
    !includesAny(signerIdText, ["not sufficient", "not enough", "or satisfactory evidence", "credible witness"]);

  return {
    jurisdiction: escapeSql(jurisdiction),
    document_type: escapeSql("acknowledgment"),
    ui_profile: escapeSql("idn_standard"),
    derivation_mode: escapeSql("rules_plus_overrides"),
    api_representation_mode: escapeSql("sectioned_only"),
    manual_review_required: "false",
    governing_law: escapeSql(row["Governing Law"]),
    acknowledgment_form: escapeSql(ackFormText),
    notary_commission_authority: escapeSql(row["Notary Commission Authority"]),
    venue_requirement: escapeSql(row["Venue Requirement"]),
    signer_identification: escapeSql(signerIdText),
    witness_requirements: escapeSql(witnessReqText),
    remote_online_notarization: escapeSql(ronText),
    e_notarization: escapeSql(eNotText),
    notarial_certificate_required_elements: escapeSql(
      row["Notarial Certificate Required Elements"],
    ),
    seal_stamp_requirements: escapeSql(row["Seal/Stamp Requirements"]),
    commission_expiration_on_certificate: escapeSql(commExpText),
    recording_requirements: escapeSql(row["Recording Requirements"]),
    competency_of_signer: escapeSql(row["Competency of Signer"]),
    notarial_system: "null",
    execution_presence_mode: escapeSql(ronAllowed ? "IN_PERSON_OR_REMOTE_ALLOWED" : "IN_PERSON_ONLY"),
    digital_channel_status: escapeSql(digitalChannelStatus),
    acknowledgment_profile: "null",
    base_template_key: "null",
    jurisdiction_overlay_key: "null",
    ron_allowed: toSqlBool(ronAllowed),
    e_notarization_allowed: toSqlBool(eNotAllowed),
    witnesses_required_for_primary_act: toSqlBool(!includesAny(witnessReqText, ["not required"])),
    personal_knowledge_only_identification_allowed: toSqlBool(personalKnowledgeOnly),
    credible_witness_identification_allowed: toSqlBool(includesAny(signerIdText, ["credible witness"])),
    commission_expiration_on_certificate_required: toSqlBool(isTruthyText(commExpText)),
    statutory_short_form_available: toSqlBool(
      includesAny(ackFormText, ["short form", "statutory form"]),
    ),
    custom_certificate_language_required: toSqlBool(
      includesAny(ackFormText, ["exact statutory", "must use exact", "mandatory"]),
    ),
    normalization_confidence: escapeSql("medium"),
    source_citation: escapeSql(row["Governing Law"]),
    source_url: "null",
    review_status: escapeSql("needs_review"),
    notes: escapeSql(
      "Seeded from docs/IDN_requirements.json. Review against licensed counsel before production reliance.",
    ),
  };
});

const poaColumns = [
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
  "api_representation_mode",
  "derivation_mode",
  "poa_system",
  "execution_model",
  "execution_profile",
  "notary_required",
  "witnesses_required",
  "alternative_execution_path_allowed",
  "special_authority_initials_required",
  "statutory_form_available",
  "springing_authority_supported",
  "durability_default_presumed",
  "type_specific_execution_rules_present",
  "execution_rule",
  "durability_default_status",
  "specific_authority_status",
  "effective_date_status",
  "statutory_form_status",
  "competency_status",
  "normalization_confidence",
  "base_template_key",
  "state_overlay_key",
];

const poaRows = poaData.map((row) => {
  const jurisdiction = requireJurisdictionCode(row.Jurisdiction);
  const acknowledgmentText = row["Acknowledgment/Witnessing"];
  const executionText = row["Execution Requirements"];
  const durabilityText = row.Durability;
  const specialAuthorityText = row["Specific Authority Required for Certain Acts"];
  const statutoryFormText = row["Statutory Form Available"];
  const effectiveDateText = row["Effective Date"];
  const competencyText = row["Competency Requirement"];

  const notarizationRule = mapNotarizationRule(acknowledgmentText);
  const witnessRule = mapWitnessRule(acknowledgmentText);
  const witnessCount = parseWitnessCount(acknowledgmentText);
  const durabilityRule = mapDurabilityRule(durabilityText);
  const statutoryFormRule = mapStatutoryFormRule(statutoryFormText);
  const effectiveDateRule = mapEffectiveDateRule(effectiveDateText);
  const competencyRule = mapCompetencyRule(competencyText);
  const specialAuthorityRule = mapSpecialAuthorityRule(specialAuthorityText);
  const uiProfile = deriveUiProfile(notarizationRule, witnessRule);

  const executionModel = mapExecutionModelV2(uiProfile);
  const executionRule = executionModel;
  const durabilityDefaultStatus = mapDurabilityDefaultStatusV2(durabilityRule);
  const specificAuthorityStatus = mapSpecificAuthorityStatusV2(
    specialAuthorityRule,
    specialAuthorityText,
  );
  const effectiveDateStatus = mapEffectiveDateStatusV2(effectiveDateRule);
  const statutoryFormStatus = mapStatutoryFormStatusV2(
    statutoryFormRule,
    statutoryFormText,
  );
  const competencyStatus = mapCompetencyStatusV2(competencyRule, competencyText);

  const notaryRequired = notarizationRule === "required";
  const witnessesRequired = witnessRule === "required" || witnessRule === "additional_to_notary";
  const alternativeExecutionPathAllowed =
    notarizationRule === "alternative_to_witnesses" || witnessRule === "alternative_to_notary";
  const specialAuthorityInitialsRequired = includesAny(specialAuthorityText, ["initial"]);
  const statutoryFormAvailable = statutoryFormRule === "available" || statutoryFormRule === "multiple_forms";
  const springingAuthoritySupported =
    effectiveDateRule === "upon_triggering_event" ||
    includesAny(effectiveDateText, ["specified event", "trigger"]);
  const durabilityDefaultPresumed = durabilityRule === "presumed_durable";
  const typeSpecificExecutionRulesPresent =
    notarizationRule === "varies_by_type" ||
    witnessRule === "varies_by_type" ||
    includesAny(executionText, ["varies by type"]);

  return {
    jurisdiction: escapeSql(jurisdiction),
    poa_type: escapeSql("general"),
    ui_profile: escapeSql(uiProfile),
    notarization_rule: escapeSql(notarizationRule),
    witness_rule: escapeSql(witnessRule),
    witness_count: witnessCount ?? "null",
    durability_rule: escapeSql(durabilityRule),
    statutory_form_rule: escapeSql(statutoryFormRule),
    effective_date_rule: escapeSql(effectiveDateRule),
    competency_rule: escapeSql(competencyRule),
    special_authority_rule: escapeSql(specialAuthorityRule),
    allows_agent_certification: "false",
    requires_principal_signature: "true",
    allows_proxy_signature: toSqlBool(allowsProxySignature(executionText)),
    requires_acknowledgment_certificate: toSqlBool(notarizationRule === "required"),
    governing_law: escapeSql(row["Governing Law"]),
    execution_requirements_text: escapeSql(executionText),
    acknowledgment_witnessing_text: escapeSql(acknowledgmentText),
    durability_text: escapeSql(durabilityText),
    special_authority_text: escapeSql(specialAuthorityText),
    competency_text: escapeSql(competencyText),
    statutory_form_text: escapeSql(statutoryFormText),
    effective_date_text: escapeSql(effectiveDateText),
    source_citation: escapeSql(row["Governing Law"]),
    source_url: "null",
    review_status: escapeSql("needs_review"),
    notes: escapeSql(
      "Seeded from docs/POA_requirements.json. Review against licensed counsel before production reliance.",
    ),
    api_representation_mode: escapeSql("sectioned_only"),
    derivation_mode: escapeSql("rules_plus_overrides"),
    poa_system: "null",
    execution_model: executionModel ? escapeSql(executionModel) : "null",
    execution_profile: "null",
    notary_required: toSqlBool(notaryRequired),
    witnesses_required: toSqlBool(witnessesRequired),
    alternative_execution_path_allowed: toSqlBool(alternativeExecutionPathAllowed),
    special_authority_initials_required: toSqlBool(specialAuthorityInitialsRequired),
    statutory_form_available: toSqlBool(statutoryFormAvailable),
    springing_authority_supported: toSqlBool(springingAuthoritySupported),
    durability_default_presumed: toSqlBool(durabilityDefaultPresumed),
    type_specific_execution_rules_present: toSqlBool(typeSpecificExecutionRulesPresent),
    execution_rule: executionRule ? escapeSql(executionRule) : "null",
    durability_default_status: escapeSql(durabilityDefaultStatus),
    specific_authority_status: escapeSql(specificAuthorityStatus),
    effective_date_status: escapeSql(effectiveDateStatus),
    statutory_form_status: escapeSql(statutoryFormStatus),
    competency_status: escapeSql(competencyStatus),
    normalization_confidence: escapeSql("medium"),
    base_template_key: "null",
    state_overlay_key: "null",
  };
});

const trustUpdateColumns = trustColumns.filter(
  (column) => !["jurisdiction", "document_type"].includes(column),
);
const idnUpdateColumns = idnColumns.filter(
  (column) => !["jurisdiction", "document_type"].includes(column),
);
const poaUpdateColumns = poaColumns.filter(
  (column) => !["jurisdiction", "poa_type"].includes(column),
);

const sqlParts = [
  "-- Seed Trust, IDN, and POA requirements from docs JSON files",
  "-- Source files:",
  "-- - docs/Trust_requirements.json",
  "-- - docs/IDN_requirements.json",
  "-- - docs/POA_requirements.json",
  "",
  "begin;",
  "",
  "-- TRUST (52 jurisdictions, document_type=rrr)",
  buildInsertSql({
    table: "public.trust_requirements",
    columns: trustColumns,
    rows: trustRows,
    conflictColumns: ["jurisdiction", "document_type"],
    updateColumns: trustUpdateColumns,
  }),
  "",
  "-- IDN (52 jurisdictions, document_type=acknowledgment)",
  buildInsertSql({
    table: "public.idn_requirements",
    columns: idnColumns,
    rows: idnRows,
    conflictColumns: ["jurisdiction", "document_type"],
    updateColumns: idnUpdateColumns,
  }),
  "",
  "-- POA (52 jurisdictions, poa_type=general)",
  buildInsertSql({
    table: "public.poa_requirements",
    columns: poaColumns,
    rows: poaRows,
    conflictColumns: ["jurisdiction", "poa_type"],
    updateColumns: poaUpdateColumns,
  }),
  "",
  "commit;",
  "",
].join("\n");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, sqlParts, "utf8");

console.log(`Wrote seed migration: ${path.relative(repoRoot, outputPath)}`);
console.log(`Trust rows: ${trustRows.length}`);
console.log(`IDN rows: ${idnRows.length}`);
console.log(`POA rows: ${poaRows.length}`);
