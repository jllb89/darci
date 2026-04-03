import type { IdnDocumentType, IdnRequirementRecord } from "./idnService";
import type { PoaRequirementRecord } from "./poaService";
import type { TrustDocumentType, TrustRequirementRecord } from "./trustService";

export const poaDocumentTypes = ["general", "durable", "medical", "limited"] as const;

export type PoaDocumentType = (typeof poaDocumentTypes)[number];
export type DocumentFamily = "poa" | "trust" | "idn";

export type DerivationMode = "rules_only" | "rules_plus_overrides" | "manual_review";
export type ReviewStatus = "draft" | "verified" | "needs_review";
export type ApiRepresentationMode =
  | "sectioned_only"
  | "sectioned_plus_flattened_summaries";
export type SectionPresence =
  | "required"
  | "optional"
  | "conditional"
  | "hidden"
  | "manual_review";
export type NoticeSeverity = "info" | "warning" | "blocking";

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "is_true"
  | "is_false";

export type ConditionClause = {
  fact: string;
  operator: ConditionOperator;
  value?: string | string[];
};

export type Condition = {
  all: ConditionClause[];
};

export type InputRequirementField = {
  key: string;
  label: string;
  semantic_type: string;
  required: boolean;
  data_type: "string" | "integer" | "boolean" | "date" | "array" | "object";
  collect_from: "member" | "principal" | "agent" | "notary" | "witness" | "system";
  default_source:
    | "none"
    | "user_profile"
    | "jurisdiction_default"
    | "system_derived"
    | "document_template"
    | "previous_document";
  validation?: Record<string, unknown>;
  help_text?: string;
  when?: Condition;
  derivation_rule?: string;
};

export type InputRequirementSection = {
  key: string;
  title: string;
  presence: SectionPresence;
  repeatable: boolean;
  fields: InputRequirementField[];
  applies_to_poa_types?: PoaDocumentType[];
  applies_to_document_types?: string[];
};

export type InputRequirementDocumentOutput = {
  key: string;
  required: boolean;
  output_category?: "legal_requirement" | "operational_optional";
  when?: Condition;
};

export type InputRequirementNotice = {
  key: string;
  severity: NoticeSeverity;
  message: string;
  when?: Condition;
};

export type InputRequirementSourceTrace = {
  source: "poa_requirements" | "trust_requirements" | "idn_requirements";
  field: string;
  value: string | number | boolean | null;
};

type BaseInputRequirementsContract = {
  schema_version: string;
  jurisdiction: string;
  ui_profile: string;
  derivation_mode: DerivationMode;
  review_status: ReviewStatus;
  api_representation_mode: ApiRepresentationMode;
  template_resolution: {
    base_template_key: string;
    state_overlay_key?: string;
    jurisdiction_overlay_key?: string;
    execution_profile?: string;
    acknowledgment_profile?: string;
  };
  workflow: {
    steps: string[];
    required_artifacts: string[];
    submission_checks: string[];
  };
  sections: InputRequirementSection[];
  section_summaries: Record<string, unknown>;
  document_outputs: InputRequirementDocumentOutput[];
  notices: InputRequirementNotice[];
  source_trace: InputRequirementSourceTrace[];
};

export type PoaInputRequirementsContract = BaseInputRequirementsContract & {
  poa_type: PoaDocumentType;
  classification: {
    poa_system:
      | "UPOAA_STANDARD"
      | "UPOAA_PLUS"
      | "NON_UPOAA_STANDARD"
      | "CIVIL_LAW_MANDATE"
      | "HIGH_FORMALITY_VARIANT";
    execution_model:
      | "NOTARY_ONLY"
      | "WITNESSES_ONLY"
      | "NOTARY_OR_WITNESSES"
      | "NOTARY_AND_WITNESSES"
      | "FORMAL_ACT"
      | "TYPE_SPECIFIC_VARIANT";
  };
  poa_capabilities: {
    notary_required: boolean;
    witnesses_required: boolean;
    alternative_execution_path_allowed: boolean;
    special_authority_initials_required: boolean;
    statutory_form_available: boolean;
    springing_authority_supported: boolean;
    durability_default_presumed: boolean;
    type_specific_execution_rules_present: boolean;
  };
};

export type TrustInputRequirementsContract = BaseInputRequirementsContract & {
  document_type: TrustDocumentType;
  classification: {
    trust_system:
      | "UTC_STANDARD"
      | "UTC_PLUS"
      | "NON_UTC_STANDARD"
      | "TRUST_FRIENDLY"
      | "CIVIL_LAW";
    execution_level:
      | "STANDARD"
      | "NOTARIZATION_REQUIRED"
      | "ACK_OR_WITNESS_ALTERNATIVE"
      | "FORMAL_ACT";
  };
  trust_capabilities: {
    asset_protection: boolean;
    directed_trusts: boolean;
    decanting_friendly: boolean;
    silent_trust_friendly: boolean;
  };
};

export type IdnInputRequirementsContract = BaseInputRequirementsContract & {
  document_type: IdnDocumentType;
  classification: {
    notarial_system:
      | "COMMON_LAW_STANDARD"
      | "COMMON_LAW_VARIANT"
      | "CIVIL_LAW_AUTHENTIC_ACT"
      | "CIVIL_LAW_PUBLIC_INSTRUMENT";
    execution_presence_mode:
      | "IN_PERSON_ONLY"
      | "IN_PERSON_OR_REMOTE_ALLOWED"
      | "CIVIL_LAW_IN_PERSON_DEFAULT";
    digital_channel_status:
      | "RON_AUTHORIZED"
      | "E_NOTARIZATION_AUTHORIZED_NO_RON"
      | "DIGITAL_NOT_AUTHORIZED"
      | "DIGITAL_STATUS_EVOLVING";
  };
  notary_capabilities: {
    ron_allowed: boolean;
    e_notarization_allowed: boolean;
    witnesses_required_for_primary_act: boolean;
    personal_knowledge_only_identification_allowed: boolean;
    credible_witness_identification_allowed: boolean;
    commission_expiration_on_certificate_required: boolean;
  };
};

export type InputRequirementsContract =
  | PoaInputRequirementsContract
  | TrustInputRequirementsContract
  | IdnInputRequirementsContract;

type DeriveInputRequirementsParams =
  | {
      family: "poa";
      documentType: PoaDocumentType;
      record: PoaRequirementRecord;
    }
  | {
      family: "trust";
      documentType: TrustDocumentType;
      record: TrustRequirementRecord;
    }
  | {
      family: "idn";
      documentType: IdnDocumentType;
      record: IdnRequirementRecord;
    };

type PoaV2Record = PoaRequirementRecord & {
  api_representation_mode?: ApiRepresentationMode | null;
  derivation_mode?: DerivationMode | null;
  poa_system?:
    | "UPOAA_STANDARD"
    | "UPOAA_PLUS"
    | "NON_UPOAA_STANDARD"
    | "CIVIL_LAW_MANDATE"
    | "HIGH_FORMALITY_VARIANT"
    | null;
  execution_model?:
    | "NOTARY_ONLY"
    | "WITNESSES_ONLY"
    | "NOTARY_OR_WITNESSES"
    | "NOTARY_AND_WITNESSES"
    | "FORMAL_ACT"
    | "TYPE_SPECIFIC_VARIANT"
    | null;
  execution_profile?: string | null;
  notary_required?: boolean | null;
  witnesses_required?: boolean | null;
  alternative_execution_path_allowed?: boolean | null;
  special_authority_initials_required?: boolean | null;
  statutory_form_available?: boolean | null;
  springing_authority_supported?: boolean | null;
  durability_default_presumed?: boolean | null;
  type_specific_execution_rules_present?: boolean | null;
  execution_rule?: string | null;
  durability_default_status?:
    | "durable_by_default"
    | "durable_if_stated"
    | "non_durable_by_default"
    | "type_specific"
    | "not_addressed"
    | null;
  specific_authority_status?:
    | "explicit_required"
    | "explicit_required_with_initials"
    | "not_required"
    | "type_specific"
    | "not_addressed"
    | null;
  effective_date_status?:
    | "immediate_default"
    | "immediate_or_specified"
    | "specified_event_allowed"
    | "type_specific"
    | "not_addressed"
    | null;
  statutory_form_status?:
    | "available"
    | "available_not_mandatory"
    | "multiple_forms_available"
    | "not_available"
    | "not_addressed"
    | null;
  competency_status?:
    | "capacity_required"
    | "competent_adult_required"
    | "sound_mind_required"
    | "not_addressed"
    | null;
  base_template_key?: string | null;
  state_overlay_key?: string | null;
};

type PoaSectionPresence = {
  document_context: SectionPresence;
  principal: SectionPresence;
  agent: SectionPresence;
  successor_agent: SectionPresence;
  authority_scope: SectionPresence;
  durability: SectionPresence;
  effective_date: SectionPresence;
  execution_choice: SectionPresence;
  witnesses: SectionPresence;
  notary: SectionPresence;
  special_instructions: SectionPresence;
  statutory_notices: SectionPresence;
  manual_review: SectionPresence;
};

type TrustSectionPresence = {
  document_context: SectionPresence;
  trust_identity: SectionPresence;
  trust_parties: SectionPresence;
  trust_terms: SectionPresence;
  certification_scope: SectionPresence;
  prior_documents: SectionPresence;
  supporting_uploads: SectionPresence;
  execution_requirements: SectionPresence;
  notary_and_witness: SectionPresence;
  statutory_notices: SectionPresence;
  manual_review: SectionPresence;
};

type IdnSectionPresence = {
  document_context: SectionPresence;
  legal_basis: SectionPresence;
  signer_identity: SectionPresence;
  venue_and_commission: SectionPresence;
  witness_and_competency: SectionPresence;
  notarization_channel: SectionPresence;
  certificate_requirements: SectionPresence;
  seal_and_stamp: SectionPresence;
  recording_requirements: SectionPresence;
  manual_review: SectionPresence;
};

const toLower = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

const includesAny = (value: string | null | undefined, needles: string[]) => {
  const text = toLower(value);
  return needles.some((needle) => text.includes(needle));
};

const toBooleanFromYesLike = (value: string | null | undefined) => {
  const text = toLower(value);
  if (!text) {
    return false;
  }

  if (
    text.includes("not") ||
    text.includes("no") ||
    text.includes("none") ||
    text.includes("n/a")
  ) {
    return false;
  }

  return text.includes("yes") || text.includes("required") || text.includes("authorized");
};

const normalizeReviewStatus = (
  raw: string | null | undefined,
  manualReviewRequired: boolean,
): ReviewStatus => {
  if (manualReviewRequired) {
    return "needs_review";
  }

  if (raw === "verified" || raw === "needs_review" || raw === "draft") {
    return raw;
  }

  return "draft";
};

const normalizeDerivationMode = (
  raw: string | null | undefined,
  manualReviewRequired: boolean,
): DerivationMode => {
  if (manualReviewRequired) {
    return "manual_review";
  }

  if (raw === "rules_only" || raw === "rules_plus_overrides" || raw === "manual_review") {
    return raw;
  }

  return "rules_plus_overrides";
};

const normalizeApiMode = (
  raw: string | null | undefined,
): ApiRepresentationMode => {
  if (raw === "sectioned_plus_flattened_summaries") {
    return raw;
  }

  return "sectioned_only";
};

const buildStateOverlayKey = (jurisdiction: string, suffix: string) => {
  const code = jurisdiction.startsWith("US-") ? jurisdiction.slice(3).toLowerCase() : "us";
  return `${code}_overlay_${suffix}`;
};

const splitList = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(/[;,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseWitnessMinimum = (value: string | null | undefined): number | null => {
  const text = toLower(value);
  if (!text) {
    return null;
  }

  if (text.includes("two") || text.includes("2")) {
    return 2;
  }

  if (text.includes("one") || text.includes("1")) {
    return 1;
  }

  return null;
};

const buildIsTrueWhen = (fact: string): Condition => ({
  all: [
    {
      fact,
      operator: "is_true",
    },
  ],
});

const buildInWhen = (fact: string, values: string[]): Condition => ({
  all: [
    {
      fact,
      operator: "in",
      value: values,
    },
  ],
});

const toExecutionStatus = (
  text: string | null | undefined,
): "required" | "not_required" | "conditional" | "alternative_path" => {
  const normalized = toLower(text);
  if (!normalized) {
    return "conditional";
  }

  if (normalized.includes("or") && normalized.includes("witness") && normalized.includes("notar")) {
    return "alternative_path";
  }

  if (
    normalized.includes("not required") ||
    normalized.includes("not necessary") ||
    normalized.includes("no witness")
  ) {
    return "not_required";
  }

  if (
    normalized.includes("if") ||
    normalized.includes("when") ||
    normalized.includes("unless") ||
    normalized.includes("depending") ||
    normalized.includes("may")
  ) {
    return "conditional";
  }

  if (normalized.includes("required") || normalized.includes("must") || normalized.includes("shall")) {
    return "required";
  }

  return "conditional";
};

const toRequirementStatus = (
  text: string | null | undefined,
): "required" | "not_required" | "conditional" | "not_applicable" => {
  const normalized = toLower(text);
  if (!normalized) {
    return "conditional";
  }

  if (
    normalized.includes("not applicable") ||
    normalized.includes("n/a") ||
    normalized.includes("does not apply")
  ) {
    return "not_applicable";
  }

  if (normalized.includes("not required") || normalized.includes("not necessary")) {
    return "not_required";
  }

  if (
    normalized.includes("if") ||
    normalized.includes("when") ||
    normalized.includes("unless") ||
    normalized.includes("depending") ||
    normalized.includes("may")
  ) {
    return "conditional";
  }

  if (normalized.includes("required") || normalized.includes("must") || normalized.includes("shall")) {
    return "required";
  }

  return "conditional";
};

const toAvailabilityStatus = (
  text: string | null | undefined,
): "allowed" | "not_allowed" | "limited" | "evolving" => {
  const normalized = toLower(text);
  if (!normalized) {
    return "limited";
  }

  if (
    normalized.includes("not authorized") ||
    normalized.includes("not permitted") ||
    normalized.includes("not allowed") ||
    normalized.includes("prohibited")
  ) {
    return "not_allowed";
  }

  if (
    normalized.includes("evolving") ||
    normalized.includes("not fully implemented") ||
    normalized.includes("under evolving")
  ) {
    return "evolving";
  }

  if (
    normalized.includes("limited") ||
    normalized.includes("partial") ||
    normalized.includes("pilot")
  ) {
    return "limited";
  }

  if (
    normalized.includes("authorized") ||
    normalized.includes("permitted") ||
    normalized.includes("allowed")
  ) {
    return "allowed";
  }

  return "limited";
};

const inferPoaExecutionModel = (
  row: PoaV2Record,
  notaryRequired: boolean,
  witnessesRequired: boolean,
  alternativePathAllowed: boolean,
): PoaInputRequirementsContract["classification"]["execution_model"] => {
  if (row.execution_model) {
    return row.execution_model;
  }

  if (includesAny(row.execution_rule, ["formal_act"])) {
    return "FORMAL_ACT";
  }

  if (alternativePathAllowed) {
    return "NOTARY_OR_WITNESSES";
  }

  if (notaryRequired && witnessesRequired) {
    return "NOTARY_AND_WITNESSES";
  }

  if (notaryRequired) {
    return "NOTARY_ONLY";
  }

  if (witnessesRequired) {
    return "WITNESSES_ONLY";
  }

  return "TYPE_SPECIFIC_VARIANT";
};

const inferPoaSystem = (
  row: PoaV2Record,
  executionModel: PoaInputRequirementsContract["classification"]["execution_model"],
): PoaInputRequirementsContract["classification"]["poa_system"] => {
  if (row.poa_system) {
    return row.poa_system;
  }

  if (row.jurisdiction === "US-LA" || row.jurisdiction === "US-PR") {
    return "CIVIL_LAW_MANDATE";
  }

  if (executionModel === "FORMAL_ACT") {
    return "CIVIL_LAW_MANDATE";
  }

  if (row.jurisdiction === "US-FL" || row.jurisdiction === "US-NY") {
    return "HIGH_FORMALITY_VARIANT";
  }

  return "NON_UPOAA_STANDARD";
};

const derivePoaContract = (
  record: PoaRequirementRecord,
  poaType: PoaDocumentType,
): PoaInputRequirementsContract => {
  const row = record as PoaV2Record;

  const notaryRequired =
    row.notary_required ??
    (row.notarization_rule === "required" ||
      row.notarization_rule === "alternative_to_witnesses");
  const witnessesRequired =
    row.witnesses_required ??
    (row.witness_rule === "required" ||
      row.witness_rule === "additional_to_notary" ||
      row.witness_rule === "alternative_to_notary");
  const alternativeExecutionPathAllowed =
    row.alternative_execution_path_allowed ??
    (row.notarization_rule === "alternative_to_witnesses" ||
      row.witness_rule === "alternative_to_notary");

  const specialAuthorityInitialsRequired =
    row.special_authority_initials_required ??
    (row.specific_authority_status === "explicit_required_with_initials" ||
      includesAny(row.special_authority_text, ["initial"]));

  const statutoryFormAvailable =
    row.statutory_form_available ??
    (row.statutory_form_status === "available" ||
      row.statutory_form_status === "multiple_forms_available" ||
      row.statutory_form_rule === "available" ||
      row.statutory_form_rule === "multiple_forms");

  const springingAuthoritySupported =
    row.springing_authority_supported ??
    (row.effective_date_status === "specified_event_allowed" ||
      row.effective_date_rule === "upon_triggering_event");

  const durabilityDefaultPresumed =
    row.durability_default_presumed ??
    (row.durability_default_status === "durable_by_default" ||
      row.durability_rule === "presumed_durable");

  const typeSpecificExecutionRulesPresent =
    row.type_specific_execution_rules_present ??
    (row.execution_model === "TYPE_SPECIFIC_VARIANT" ||
      row.durability_default_status === "type_specific" ||
      row.specific_authority_status === "type_specific");

  const manualReviewRequired =
    row.derivation_mode === "manual_review" ||
    row.review_status === "needs_review" ||
    row.ui_profile === "review_required";

  const reviewStatus = normalizeReviewStatus(row.review_status, manualReviewRequired);
  const derivationMode = normalizeDerivationMode(row.derivation_mode, manualReviewRequired);
  const executionModel = inferPoaExecutionModel(
    row,
    notaryRequired,
    witnessesRequired,
    alternativeExecutionPathAllowed,
  );
  const poaSystem = inferPoaSystem(row, executionModel);

  const sectionPresenceByType: Record<PoaDocumentType, PoaSectionPresence> = {
    general: {
      document_context: "required",
      principal: "required",
      agent: "required",
      successor_agent: "optional",
      authority_scope: "required",
      durability: "optional",
      effective_date: "required",
      execution_choice: "required",
      witnesses: "conditional",
      notary: "conditional",
      special_instructions: "optional",
      statutory_notices: "required",
      manual_review: "conditional",
    },
    durable: {
      document_context: "required",
      principal: "required",
      agent: "required",
      successor_agent: "optional",
      authority_scope: "required",
      durability: "required",
      effective_date: "required",
      execution_choice: "required",
      witnesses: "conditional",
      notary: "conditional",
      special_instructions: "optional",
      statutory_notices: "required",
      manual_review: "conditional",
    },
    medical: {
      document_context: "required",
      principal: "required",
      agent: "required",
      successor_agent: "optional",
      authority_scope: "conditional",
      durability: "conditional",
      effective_date: "required",
      execution_choice: "required",
      witnesses: "conditional",
      notary: "conditional",
      special_instructions: "optional",
      statutory_notices: "required",
      manual_review: "conditional",
    },
    limited: {
      document_context: "required",
      principal: "required",
      agent: "required",
      successor_agent: "optional",
      authority_scope: "required",
      durability: "optional",
      effective_date: "required",
      execution_choice: "required",
      witnesses: "conditional",
      notary: "conditional",
      special_instructions: "optional",
      statutory_notices: "required",
      manual_review: "conditional",
    },
  };

  const presence = sectionPresenceByType[poaType];
  const appliesTo = ["general", "durable", "medical", "limited"] as PoaDocumentType[];

  const requiredArtifactsByType: Record<PoaDocumentType, string[]> = {
    general: [
      "principal_identity_evidence",
      "agent_identity_information",
      "witness_information_if_required",
    ],
    durable: [
      "principal_identity_evidence",
      "agent_identity_information",
      "durability_clause_confirmation",
    ],
    medical: [
      "principal_identity_evidence",
      "agent_identity_information",
      "healthcare_notice_acknowledgment_if_required",
    ],
    limited: [
      "principal_identity_evidence",
      "agent_identity_information",
      "transaction_scope_details",
    ],
  };

  const notaryStatus = alternativeExecutionPathAllowed
    ? "alternative_path"
    : notaryRequired
      ? "required"
      : "not_required";

  const witnessStatus = alternativeExecutionPathAllowed
    ? "alternative_path"
    : witnessesRequired
      ? "required"
      : "not_required";

  const sections: InputRequirementSection[] = [
    {
      key: "document_context",
      title: "Document Context",
      presence: presence.document_context,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "poa_type",
          label: "POA type",
          semantic_type: "enum_single",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
          validation: {
            allowed_values: appliesTo,
          },
        },
        {
          key: "jurisdiction",
          label: "Jurisdiction",
          semantic_type: "enum_single",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
        },
        {
          key: "base_template_key",
          label: "Base template key",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "state_overlay_key",
          label: "State overlay key",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "execution_profile",
          label: "Execution profile",
          semantic_type: "execution_model",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "principal",
      title: "Principal",
      presence: presence.principal,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "principal_full_name",
          label: "Principal full legal name",
          semantic_type: "person_name",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "user_profile",
          validation: { min_length: 2, max_length: 120 },
        },
        {
          key: "principal_address",
          label: "Principal address",
          semantic_type: "person_address",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "principal_contact",
          label: "Principal contact",
          semantic_type: "person_contact",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "user_profile",
        },
      ],
    },
    {
      key: "agent",
      title: "Agent",
      presence: presence.agent,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "agent_full_name",
          label: "Agent full legal name",
          semantic_type: "person_name",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "agent_address",
          label: "Agent address",
          semantic_type: "person_address",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "agent_contact",
          label: "Agent contact",
          semantic_type: "person_contact",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
      ],
    },
    {
      key: "successor_agent",
      title: "Successor Agent",
      presence: presence.successor_agent,
      repeatable: true,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "successor_agent_list",
          label: "Successor agents",
          semantic_type: "person_list",
          required: false,
          data_type: "array",
          collect_from: "member",
          default_source: "none",
        },
      ],
    },
    {
      key: "authority_scope",
      title: "Authority Scope",
      presence: presence.authority_scope,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "authority_scope_selection",
          label: "Authority scope selection",
          semantic_type: "authority_selection",
          required: true,
          data_type: "array",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "specific_authority_status",
          label: "Specific authority status",
          semantic_type: "special_authority_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "special_authority_initials_required",
          label: "Special authority initials required",
          semantic_type: "boolean",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "special_authority_initials",
          label: "Special authority initials",
          semantic_type: "special_authority_initials",
          required: specialAuthorityInitialsRequired,
          data_type: "string",
          collect_from: "principal",
          default_source: "none",
          when: buildIsTrueWhen("capability_special_authority_initials_required"),
        },
      ],
    },
    {
      key: "durability",
      title: "Durability",
      presence: presence.durability,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "durability_default_status",
          label: "Durability default status",
          semantic_type: "durability_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "durability_clause_required",
          label: "Durability clause required",
          semantic_type: "boolean",
          required: false,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "durability_clause_text",
          label: "Durability clause text",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "effective_date",
      title: "Effective Date",
      presence: presence.effective_date,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "effective_date_status",
          label: "Effective date status",
          semantic_type: "effective_date_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "springing_authority_supported",
          label: "Springing authority supported",
          semantic_type: "boolean",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "springing_trigger_description",
          label: "Springing trigger description",
          semantic_type: "springing_trigger",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
          when: buildIsTrueWhen("capability_springing_authority_supported"),
        },
      ],
    },
    {
      key: "execution_choice",
      title: "Execution Choice",
      presence: presence.execution_choice,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "execution_model",
          label: "Execution model",
          semantic_type: "execution_model",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "notary_required_status",
          label: "Notary required status",
          semantic_type: "execution_requirement_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "witnesses_required_status",
          label: "Witnesses required status",
          semantic_type: "execution_requirement_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "alternative_execution_path_allowed",
          label: "Alternative execution path allowed",
          semantic_type: "boolean",
          required: false,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "execution_model_basis",
          label: "Execution model basis",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "witnesses",
      title: "Witnesses",
      presence: presence.witnesses,
      repeatable: true,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "witness_count_minimum",
          label: "Witness count minimum",
          semantic_type: "witness_count",
          required: false,
          data_type: "integer",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "witness_eligibility_note",
          label: "Witness eligibility note",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "notary",
      title: "Notary",
      presence: presence.notary,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "notary_acknowledgment_required",
          label: "Notary acknowledgment required",
          semantic_type: "notary_requirement_status",
          required: false,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "notary_certificate_note",
          label: "Notary certificate note",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "special_instructions",
      title: "Special Instructions",
      presence: presence.special_instructions,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "special_instructions_text",
          label: "Special instructions",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
      ],
    },
    {
      key: "statutory_notices",
      title: "Statutory Notices",
      presence: presence.statutory_notices,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "statutory_form_status",
          label: "Statutory form status",
          semantic_type: "statutory_form_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "competency_status",
          label: "Competency status",
          semantic_type: "competency_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "competency_notice",
          label: "Competency notice",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "recording_requirement_note",
          label: "Recording requirement note",
          semantic_type: "recording_requirement_note",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "manual_review",
      title: "Manual Review",
      presence: manualReviewRequired ? "required" : presence.manual_review,
      repeatable: false,
      applies_to_poa_types: appliesTo,
      fields: [
        {
          key: "manual_review_required",
          label: "Manual review required",
          semantic_type: "manual_review_reason",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "manual_review_reason",
          label: "Manual review reason",
          semantic_type: "manual_review_reason",
          required: manualReviewRequired,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
          when: buildIsTrueWhen("manual_review_required"),
        },
      ],
    },
  ];

  const executionProfile =
    row.execution_profile ?? `${row.jurisdiction.slice(3)}_${executionModel}`;

  const documentOutputs: InputRequirementDocumentOutput[] = [
    {
      key: "generated_poa_document",
      required: true,
      output_category: "legal_requirement",
    },
    {
      key: "execution_signature_packet",
      required: false,
      output_category: "operational_optional",
    },
    {
      key: "state_acknowledgment_page",
      required: notaryRequired,
      output_category: "legal_requirement",
      when: buildInWhen("execution_model", [
        "NOTARY_ONLY",
        "NOTARY_OR_WITNESSES",
        "NOTARY_AND_WITNESSES",
      ]),
    },
    {
      key: "generation_review_report",
      required: false,
      output_category: "operational_optional",
      when: buildIsTrueWhen("manual_review_required"),
    },
  ];

  if (notaryRequired) {
    documentOutputs.push({
      key: "notary_acknowledgment",
      required: !alternativeExecutionPathAllowed,
      output_category: "legal_requirement",
    });
  }

  if (witnessesRequired) {
    documentOutputs.push({
      key: "witness_attestation",
      required: !alternativeExecutionPathAllowed,
      output_category: "legal_requirement",
    });
  }

  const notices: InputRequirementNotice[] = [
    {
      key: "capacity_required_notice",
      severity: "info",
      message: "The principal must have required legal capacity at execution.",
    },
    {
      key: "execution_formality_notice",
      severity: "info",
      message: "Execution formalities vary by jurisdiction and POA type.",
    },
  ];

  if (manualReviewRequired) {
    notices.push({
      key: "manual_review_notice",
      severity: "warning",
      message: "This jurisdiction requires manual review before final generation.",
      when: buildIsTrueWhen("manual_review_required"),
    });
  }

  return {
    schema_version: "2026-04-01",
    jurisdiction: row.jurisdiction,
    poa_type: poaType,
    ui_profile: row.ui_profile,
    derivation_mode: derivationMode,
    review_status: reviewStatus,
    api_representation_mode: normalizeApiMode(row.api_representation_mode),
    classification: {
      poa_system: poaSystem,
      execution_model: executionModel,
    },
    poa_capabilities: {
      notary_required: Boolean(notaryRequired),
      witnesses_required: Boolean(witnessesRequired),
      alternative_execution_path_allowed: Boolean(alternativeExecutionPathAllowed),
      special_authority_initials_required: Boolean(specialAuthorityInitialsRequired),
      statutory_form_available: Boolean(statutoryFormAvailable),
      springing_authority_supported: Boolean(springingAuthoritySupported),
      durability_default_presumed: Boolean(durabilityDefaultPresumed),
      type_specific_execution_rules_present: Boolean(typeSpecificExecutionRulesPresent),
    },
    template_resolution: {
      base_template_key: row.base_template_key ?? `poa_${poaType}_v2`,
      state_overlay_key: row.state_overlay_key ?? buildStateOverlayKey(row.jurisdiction, "v2"),
      execution_profile: executionProfile,
    },
    workflow: {
      steps: [
        "poa_type_selection",
        "principal",
        "agent",
        "authority_scope",
        "durability",
        "effective_date",
        "execution_choice",
        "review",
      ],
      required_artifacts: requiredArtifactsByType[poaType],
      submission_checks: [
        "required_fields_complete",
        "required_execution_fields_complete",
        "required_special_authority_fields_complete",
        "manual_review_gate_if_applicable",
      ],
    },
    sections,
    section_summaries: {
      execution_choice: {
        notary_required_status: notaryStatus,
        witnesses_required_status: witnessStatus,
        execution_model_basis:
          row.execution_rule ?? row.acknowledgment_witnessing_text ?? "Derived from normalized execution inputs",
      },
      authority_scope: {
        specific_authority_status: row.specific_authority_status ?? "not_addressed",
        special_authority_initials_required: Boolean(specialAuthorityInitialsRequired),
      },
    },
    document_outputs: documentOutputs,
    notices,
    source_trace: [
      {
        source: "poa_requirements",
        field: "Governing Law",
        value: row.governing_law,
      },
      {
        source: "poa_requirements",
        field: "Execution Requirements",
        value: row.execution_requirements_text,
      },
      {
        source: "poa_requirements",
        field: "Acknowledgment/Witnessing",
        value: row.acknowledgment_witnessing_text,
      },
      {
        source: "poa_requirements",
        field: "Durability",
        value: row.durability_text,
      },
      {
        source: "poa_requirements",
        field: "Specific Authority Required for Certain Acts",
        value: row.special_authority_text,
      },
      {
        source: "poa_requirements",
        field: "Statutory Form Available",
        value: row.statutory_form_text,
      },
      {
        source: "poa_requirements",
        field: "Effective Date",
        value: row.effective_date_text,
      },
      {
        source: "poa_requirements",
        field: "Competency Requirement",
        value: row.competency_text,
      },
    ],
  };
};

const inferTrustSystem = (
  record: TrustRequirementRecord,
): TrustInputRequirementsContract["classification"]["trust_system"] => {
  if (record.trust_system) {
    return record.trust_system;
  }

  if (record.jurisdiction === "US-LA" || record.jurisdiction === "US-PR") {
    return "CIVIL_LAW";
  }

  if (
    record.asset_protection ||
    record.directed_trusts ||
    record.decanting_friendly ||
    record.silent_trust_friendly
  ) {
    return "TRUST_FRIENDLY";
  }

  if (includesAny(record.utc_adopted, ["yes"])) {
    return "UTC_STANDARD";
  }

  return "NON_UTC_STANDARD";
};

const inferTrustExecutionLevel = (
  record: TrustRequirementRecord,
): TrustInputRequirementsContract["classification"]["execution_level"] => {
  if (record.execution_level) {
    return record.execution_level;
  }

  if (
    includesAny(record.special_execution_rules, ["formal act", "public deed", "authentic act"]) ||
    record.jurisdiction === "US-LA"
  ) {
    return "FORMAL_ACT";
  }

  if (
    includesAny(record.notarization_required, ["or"]) &&
    includesAny(record.witnesses_required, ["witness"])
  ) {
    return "ACK_OR_WITNESS_ALTERNATIVE";
  }

  const notarizationStatus = toExecutionStatus(record.notarization_required);
  if (notarizationStatus === "required") {
    return "NOTARIZATION_REQUIRED";
  }

  return "STANDARD";
};

const inferTrustAcknowledgmentProfile = (
  record: TrustRequirementRecord,
  executionLevel: TrustInputRequirementsContract["classification"]["execution_level"],
) => {
  if (record.acknowledgment_profile) {
    return record.acknowledgment_profile;
  }

  if (record.jurisdiction === "US-LA") {
    return "LA_FORMAL_ACT";
  }

  if (record.jurisdiction === "US-PR") {
    return "PR_PUBLIC_INSTRUMENT";
  }

  if (record.jurisdiction === "US-CA") {
    return "CA_ACK";
  }

  if (record.jurisdiction === "US-OH") {
    return "OH_ACK";
  }

  if (record.jurisdiction === "US-NY") {
    return "NY_DEED_ACK";
  }

  if (executionLevel === "FORMAL_ACT") {
    return "LA_FORMAL_ACT";
  }

  return "STANDARD_ACK";
};

const deriveTrustContract = (
  record: TrustRequirementRecord,
  documentType: TrustDocumentType,
): TrustInputRequirementsContract => {
  const manualReviewRequired =
    record.manual_review_required ||
    record.derivation_mode === "manual_review" ||
    record.review_status === "needs_review" ||
    toBooleanFromYesLike(record.manual_review_required_text);

  const reviewStatus = normalizeReviewStatus(record.review_status, manualReviewRequired);
  const derivationMode = normalizeDerivationMode(record.derivation_mode, manualReviewRequired);

  const trustSystem = inferTrustSystem(record);
  const executionLevel = inferTrustExecutionLevel(record);
  const acknowledgmentProfile = inferTrustAcknowledgmentProfile(record, executionLevel);

  const requiredArtifactsByType: Record<TrustDocumentType, string[]> = {
    rrr: ["prior_trust_documents"],
    certification: ["source_trust_instrument_reference"],
    other: ["uploaded_supporting_document"],
  };

  const sectionPresenceByType: Record<TrustDocumentType, TrustSectionPresence> = {
    rrr: {
      document_context: "required",
      trust_identity: "required",
      trust_parties: "required",
      trust_terms: "required",
      certification_scope: "hidden",
      prior_documents: "required",
      supporting_uploads: "optional",
      execution_requirements: "required",
      notary_and_witness: "conditional",
      statutory_notices: "required",
      manual_review: "conditional",
    },
    certification: {
      document_context: "required",
      trust_identity: "required",
      trust_parties: "required",
      trust_terms: "hidden",
      certification_scope: "required",
      prior_documents: "optional",
      supporting_uploads: "optional",
      execution_requirements: "required",
      notary_and_witness: "conditional",
      statutory_notices: "required",
      manual_review: "conditional",
    },
    other: {
      document_context: "required",
      trust_identity: "required",
      trust_parties: "conditional",
      trust_terms: "optional",
      certification_scope: "hidden",
      prior_documents: "hidden",
      supporting_uploads: "required",
      execution_requirements: "required",
      notary_and_witness: "conditional",
      statutory_notices: "required",
      manual_review: "conditional",
    },
  };

  const presence = sectionPresenceByType[documentType];
  const appliesTo = ["rrr", "certification", "other"];

  const notarizationStatus = toExecutionStatus(record.notarization_required);
  const witnessStatus = toExecutionStatus(record.witnesses_required);
  const requiredCertificationElements = splitList(record.certification_required_elements);
  const permissiveCertificationElements = splitList(record.certification_permissive_elements);
  const prohibitedCertificationElements = splitList(record.certification_prohibited_elements);
  const certificationElementsPreview = [
    requiredCertificationElements.length > 0
      ? `Required: ${requiredCertificationElements.join("; ")}`
      : null,
    permissiveCertificationElements.length > 0
      ? `Permitted: ${permissiveCertificationElements.join("; ")}`
      : null,
    prohibitedCertificationElements.length > 0
      ? `Prohibited: ${prohibitedCertificationElements.join("; ")}`
      : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  const sections: InputRequirementSection[] = [
    {
      key: "document_context",
      title: "Document Context",
      presence: presence.document_context,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "document_type",
          label: "Document type",
          semantic_type: "enum_single",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
          validation: { allowed_values: appliesTo },
        },
        {
          key: "document_title",
          label: "Document title",
          semantic_type: "document_title",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "document_template",
        },
        {
          key: "jurisdiction",
          label: "Jurisdiction",
          semantic_type: "enum_single",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
        },
        {
          key: "base_template_key",
          label: "Base template key",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "state_overlay_key",
          label: "State overlay key",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "acknowledgment_profile",
          label: "Acknowledgment profile",
          semantic_type: "enum_single",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "trust_identity",
      title: "Trust Identity",
      presence: presence.trust_identity,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "trust_name",
          label: "Trust name",
          semantic_type: "trust_name",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
          validation: { min_length: 2, max_length: 200 },
        },
        {
          key: "trust_date",
          label: "Trust date",
          semantic_type: "trust_date",
          required: true,
          data_type: "date",
          collect_from: "member",
          default_source: "none",
        },
      ],
    },
    {
      key: "trust_parties",
      title: "Trust Parties",
      presence: presence.trust_parties,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "grantors",
          label: "Grantors",
          semantic_type: "person_list",
          required: documentType !== "other",
          data_type: "array",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "trustees",
          label: "Trustees",
          semantic_type: "person_list",
          required: documentType !== "other",
          data_type: "array",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "successor_trustees",
          label: "Successor trustees",
          semantic_type: "person_list",
          required: false,
          data_type: "array",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "revocability_status",
          label: "Revocability status",
          semantic_type: "enum_single",
          required: documentType !== "other",
          data_type: "string",
          collect_from: "member",
          default_source: "none",
          validation: {
            allowed_values: [
              "revocable",
              "irrevocable",
              "limited_or_conditional",
              "unspecified_or_unknown",
            ],
          },
        },
        {
          key: "revocation_holders",
          label: "Revocation holders",
          semantic_type: "person_list",
          required: false,
          data_type: "array",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "trustee_signature_authority",
          label: "Trustee signature authority",
          semantic_type: "signature_authority_rule",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "tax_id_owner",
          label: "Tax ID owner",
          semantic_type: "tax_id_owner",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
          validation: {
            allowed_values: ["trust", "grantor", "trustee", "other_or_unknown"],
          },
        },
        {
          key: "asset_titling_format",
          label: "Asset titling format",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
      ],
    },
    {
      key: "trust_terms",
      title: "Trust Terms",
      presence: presence.trust_terms,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "restatement_summary",
          label: "Restatement summary",
          semantic_type: "text",
          required: documentType === "rrr",
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "key_trust_terms",
          label: "Key trust terms",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "trustee_incapacity_standard",
          label: "Trustee incapacity standard",
          semantic_type: "trustee_incapacity_standard",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "trustee_power_matrix",
          label: "Trustee power matrix",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
      ],
    },
    {
      key: "certification_scope",
      title: "Certification Scope",
      presence: presence.certification_scope,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "certification_purpose",
          label: "Certification purpose",
          semantic_type: "certification_scope",
          required: documentType === "certification",
          data_type: "string",
          collect_from: "member",
          default_source: "none",
        },
        {
          key: "required_certification_elements",
          label: "Required certification elements",
          semantic_type: "enum_multi",
          required: documentType === "certification",
          data_type: "array",
          collect_from: "system",
          default_source: "system_derived",
          validation: {
            allowed_values: requiredCertificationElements,
          },
        },
        {
          key: "permitted_optional_certification_elements",
          label: "Permitted optional certification elements",
          semantic_type: "enum_multi",
          required: false,
          data_type: "array",
          collect_from: "system",
          default_source: "system_derived",
          validation: {
            allowed_values: permissiveCertificationElements,
          },
        },
        {
          key: "prohibited_certification_elements",
          label: "Prohibited certification elements",
          semantic_type: "enum_multi",
          required: false,
          data_type: "array",
          collect_from: "system",
          default_source: "system_derived",
          validation: {
            allowed_values: prohibitedCertificationElements,
          },
        },
        {
          key: "certification_elements_preview",
          label: "Certification elements preview",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "prior_documents",
      title: "Prior Documents",
      presence: presence.prior_documents,
      repeatable: true,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "prior_document_items",
          label: "Prior document items",
          semantic_type: "object",
          required: documentType === "rrr",
          data_type: "array",
          collect_from: "member",
          default_source: "none",
          validation: {
            item_shape: {
              document_type: {
                type: "string",
                allowed_values: [
                  "trust_agreement",
                  "amendment",
                  "restatement",
                  "certification",
                  "change_of_trustee",
                  "other",
                ],
              },
              title: {
                type: "string",
                max_length: 200,
              },
              pages: {
                type: "string",
                max_length: 50,
              },
              date: {
                type: "date",
              },
              recording_reference: {
                type: "string",
                max_length: 120,
              },
            },
          },
        },
      ],
    },
    {
      key: "supporting_uploads",
      title: "Supporting Uploads",
      presence: presence.supporting_uploads,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "uploaded_document_file",
          label: "Uploaded supporting document",
          semantic_type: "uploaded_document",
          required: documentType === "other",
          data_type: "object",
          collect_from: "member",
          default_source: "none",
        },
      ],
    },
    {
      key: "execution_requirements",
      title: "Execution Requirements",
      presence: presence.execution_requirements,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "writing_required",
          label: "Writing required",
          semantic_type: "boolean",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "signature_required",
          label: "Signature required",
          semantic_type: "signature_requirement",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "special_execution_rules",
          label: "Special execution rules",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "notary_and_witness",
      title: "Notary and Witness",
      presence: presence.notary_and_witness,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "notarization_required_status",
          label: "Notarization required status",
          semantic_type: "execution_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "witnesses_required_status",
          label: "Witnesses required status",
          semantic_type: "execution_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "execution_alternative_available",
          label: "Execution alternative available",
          semantic_type: "boolean",
          required: false,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "real_property_rule_note",
          label: "Real property rule note",
          semantic_type: "registration_note",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "statutory_notices",
      title: "Statutory Notices",
      presence: presence.statutory_notices,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "registration_requirement_note",
          label: "Registration requirement note",
          semantic_type: "registration_note",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "specific_authority_note",
          label: "Specific authority note",
          semantic_type: "signature_authority_rule",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "certification_statutory_basis_note",
          label: "Certification statutory basis",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "revocability_presumption_note",
          label: "Revocability presumption",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "manual_review",
      title: "Manual Review",
      presence: manualReviewRequired ? "required" : presence.manual_review,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "manual_review_required",
          label: "Manual review required",
          semantic_type: "execution_status",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "manual_review_reason",
          label: "Manual review reason",
          semantic_type: "text",
          required: manualReviewRequired,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
          when: buildIsTrueWhen("manual_review_required"),
        },
      ],
    },
  ];

  const documentOutputs: InputRequirementDocumentOutput[] = [
    {
      key: "generated_trust_document",
      required: true,
    },
    {
      key: "execution_signature_packet",
      required: false,
      when: buildInWhen("document_type", ["rrr", "certification", "other"]),
    },
    {
      key: "state_acknowledgment_page",
      required: acknowledgmentProfile !== "STANDARD_ACK",
      when: buildInWhen("acknowledgment_profile", [
        "CA_ACK",
        "OH_ACK",
        "NY_DEED_ACK",
        "LA_FORMAL_ACT",
        "PR_PUBLIC_INSTRUMENT",
      ]),
    },
    {
      key: "generation_review_report",
      required: false,
      when: buildIsTrueWhen("manual_review_required"),
    },
  ];

  const notices: InputRequirementNotice[] = [
    {
      key: "execution_formality_notice",
      severity: "info",
      message: "Execution requirements vary by jurisdiction and document type.",
    },
  ];

  if (manualReviewRequired) {
    notices.push({
      key: "manual_review_notice",
      severity: "warning",
      message: "This jurisdiction requires manual review before final generation.",
      when: buildIsTrueWhen("manual_review_required"),
    });
  }

  return {
    schema_version: "2026-03-31",
    jurisdiction: record.jurisdiction,
    document_type: documentType,
    ui_profile: record.ui_profile,
    derivation_mode: derivationMode,
    review_status: reviewStatus,
    api_representation_mode: normalizeApiMode(record.api_representation_mode),
    classification: {
      trust_system: trustSystem,
      execution_level: executionLevel,
    },
    trust_capabilities: {
      asset_protection: record.asset_protection,
      directed_trusts: record.directed_trusts,
      decanting_friendly: record.decanting_friendly,
      silent_trust_friendly: record.silent_trust_friendly,
    },
    template_resolution: {
      base_template_key: record.base_template_key ?? `trust_${documentType}_v1`,
      state_overlay_key:
        record.state_overlay_key ?? buildStateOverlayKey(record.jurisdiction, "v1"),
      acknowledgment_profile: acknowledgmentProfile,
    },
    workflow: {
      steps: [
        "document_type_selection",
        "trust_identity",
        "trust_parties",
        "document_specific_inputs",
        "execution_requirements",
        "review",
      ],
      required_artifacts: requiredArtifactsByType[documentType],
      submission_checks: [
        "required_fields_complete",
        "required_execution_fields_complete",
        "manual_review_gate_if_applicable",
      ],
    },
    sections,
    section_summaries: {
      notary_and_witness: {
        notarization_required_status: notarizationStatus,
        witnesses_required_status: witnessStatus,
      },
      trust_parties: {
        revocability_presumption: record.revocability_presumption,
      },
      certification_scope: {
        required_certification_elements: requiredCertificationElements,
        permitted_optional_certification_elements: permissiveCertificationElements,
        prohibited_certification_elements: prohibitedCertificationElements,
        certification_elements_preview: certificationElementsPreview || null,
      },
    },
    document_outputs: documentOutputs,
    notices,
    source_trace: [
      {
        source: "trust_requirements",
        field: "Notarization Required",
        value: record.notarization_required,
      },
      {
        source: "trust_requirements",
        field: "Witnesses Required",
        value: record.witnesses_required,
      },
      {
        source: "trust_requirements",
        field: "Manual Review Required",
        value: record.manual_review_required_text,
      },
      {
        source: "trust_requirements",
        field: "Revocability Presumption",
        value: record.revocability_presumption,
      },
      {
        source: "trust_requirements",
        field: "Registration Requirement",
        value: record.registration_requirement,
      },
      {
        source: "trust_requirements",
        field: "Specific Authority Required for Certain Acts",
        value: record.specific_authority_required_for_certain_acts,
      },
      {
        source: "trust_requirements",
        field: "Real Property Rule",
        value: record.real_property_rule,
      },
      {
        source: "trust_requirements",
        field: "Certification Required Elements",
        value: record.certification_required_elements,
      },
      {
        source: "trust_requirements",
        field: "Certification Permissive Elements",
        value: record.certification_permissive_elements,
      },
      {
        source: "trust_requirements",
        field: "Certification Prohibited Elements",
        value: record.certification_prohibited_elements,
      },
      {
        source: "trust_requirements",
        field: "Competency Requirement",
        value: record.competency_requirement,
      },
    ],
  };
};

const inferIdnNotarialSystem = (
  record: IdnRequirementRecord,
  documentType: IdnDocumentType,
): IdnInputRequirementsContract["classification"]["notarial_system"] => {
  if (record.notarial_system) {
    return record.notarial_system;
  }

  if (documentType === "public_instrument" || record.jurisdiction === "US-PR") {
    return "CIVIL_LAW_PUBLIC_INSTRUMENT";
  }

  if (documentType === "authentic_act" || record.jurisdiction === "US-LA") {
    return "CIVIL_LAW_AUTHENTIC_ACT";
  }

  if (includesAny(record.acknowledgment_form, ["exact statutory", "capacity", "variant"])) {
    return "COMMON_LAW_VARIANT";
  }

  return "COMMON_LAW_STANDARD";
};

const inferIdnExecutionPresenceMode = (
  record: IdnRequirementRecord,
  notarialSystem: IdnInputRequirementsContract["classification"]["notarial_system"],
): IdnInputRequirementsContract["classification"]["execution_presence_mode"] => {
  if (record.execution_presence_mode) {
    return record.execution_presence_mode;
  }

  if (notarialSystem.startsWith("CIVIL_LAW")) {
    return "CIVIL_LAW_IN_PERSON_DEFAULT";
  }

  if (record.ron_allowed) {
    return "IN_PERSON_OR_REMOTE_ALLOWED";
  }

  return "IN_PERSON_ONLY";
};

const inferIdnDigitalStatus = (
  record: IdnRequirementRecord,
): IdnInputRequirementsContract["classification"]["digital_channel_status"] => {
  if (record.digital_channel_status) {
    return record.digital_channel_status;
  }

  if (record.ron_allowed) {
    return "RON_AUTHORIZED";
  }

  if (record.e_notarization_allowed) {
    return "E_NOTARIZATION_AUTHORIZED_NO_RON";
  }

  if (includesAny(record.remote_online_notarization, ["evolving", "limited", "partial"])) {
    return "DIGITAL_STATUS_EVOLVING";
  }

  return "DIGITAL_NOT_AUTHORIZED";
};

const inferIdnAckProfile = (
  record: IdnRequirementRecord,
  documentType: IdnDocumentType,
) => {
  if (record.acknowledgment_profile) {
    return record.acknowledgment_profile;
  }

  if (record.jurisdiction === "US-CA") {
    return "CA_STATUTORY_ACK";
  }

  if (record.jurisdiction === "US-NY") {
    return "NY_CAPACITY_ACK";
  }

  if (record.jurisdiction === "US-LA" || documentType === "authentic_act") {
    return "LA_AUTHENTIC_ACT";
  }

  if (record.jurisdiction === "US-PR" || documentType === "public_instrument") {
    return "PR_PUBLIC_INSTRUMENT";
  }

  return "STANDARD_ACK";
};

const deriveIdnContract = (
  record: IdnRequirementRecord,
  documentType: IdnDocumentType,
): IdnInputRequirementsContract => {
  const notarialSystem = inferIdnNotarialSystem(record, documentType);
  const executionPresenceMode = inferIdnExecutionPresenceMode(record, notarialSystem);
  const digitalChannelStatus = inferIdnDigitalStatus(record);

  const manualReviewRequired =
    record.manual_review_required ||
    record.derivation_mode === "manual_review" ||
    record.review_status === "needs_review" ||
    (documentType === "public_instrument" && notarialSystem === "CIVIL_LAW_PUBLIC_INSTRUMENT");

  const reviewStatus = normalizeReviewStatus(record.review_status, manualReviewRequired);
  const derivationMode = normalizeDerivationMode(record.derivation_mode, manualReviewRequired);

  const acknowledgmentProfile = inferIdnAckProfile(record, documentType);
  const witnessStatus = toRequirementStatus(record.witness_requirements);
  const witnessMinimum = parseWitnessMinimum(record.witness_requirements);

  const ronStatus = toAvailabilityStatus(record.remote_online_notarization);
  const eNotarizationStatus = toAvailabilityStatus(record.e_notarization);

  const requiredArtifactsByType: Record<IdnDocumentType, string[]> = {
    acknowledgment: ["document_to_be_notarized", "signer_identity_evidence"],
    authentic_act: [
      "document_to_be_notarized",
      "signer_identity_evidence",
      "witness_information",
    ],
    public_instrument: [
      "document_to_be_notarized",
      "party_identity_evidence",
      "representative_capacity_evidence",
      "witness_bundle_if_applicable",
    ],
  };

  const sectionPresenceByType: Record<IdnDocumentType, IdnSectionPresence> = {
    acknowledgment: {
      document_context: "required",
      legal_basis: "required",
      signer_identity: "required",
      venue_and_commission: "required",
      witness_and_competency: "conditional",
      notarization_channel: "required",
      certificate_requirements: "required",
      seal_and_stamp: "required",
      recording_requirements: "required",
      manual_review: "conditional",
    },
    authentic_act: {
      document_context: "required",
      legal_basis: "required",
      signer_identity: "required",
      venue_and_commission: "required",
      witness_and_competency: "required",
      notarization_channel: "required",
      certificate_requirements: "required",
      seal_and_stamp: "required",
      recording_requirements: "required",
      manual_review: "conditional",
    },
    public_instrument: {
      document_context: "required",
      legal_basis: "required",
      signer_identity: "required",
      venue_and_commission: "required",
      witness_and_competency: "conditional",
      notarization_channel: "required",
      certificate_requirements: "required",
      seal_and_stamp: "required",
      recording_requirements: "required",
      manual_review: "conditional",
    },
  };

  const presence = sectionPresenceByType[documentType];
  const appliesTo = ["acknowledgment", "authentic_act", "public_instrument"];

  const personalAppearanceRequired = executionPresenceMode !== "IN_PERSON_OR_REMOTE_ALLOWED";

  const sections: InputRequirementSection[] = [
    {
      key: "document_context",
      title: "Document Context",
      presence: presence.document_context,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "document_type",
          label: "Document type",
          semantic_type: "enum_single",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
          validation: { allowed_values: appliesTo },
        },
        {
          key: "jurisdiction",
          label: "Jurisdiction",
          semantic_type: "jurisdiction",
          required: true,
          data_type: "string",
          collect_from: "member",
          default_source: "jurisdiction_default",
        },
        {
          key: "base_template_key",
          label: "Base template key",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "jurisdiction_overlay_key",
          label: "Jurisdiction overlay key",
          semantic_type: "text",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "acknowledgment_profile",
          label: "Acknowledgment profile",
          semantic_type: "acknowledgment_form_type",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "legal_basis",
      title: "Legal Basis",
      presence: presence.legal_basis,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "governing_law_reference",
          label: "Governing law reference",
          semantic_type: "governing_law_reference",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "acknowledgment_form_type",
          label: "Acknowledgment form type",
          semantic_type: "acknowledgment_form_type",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "notary_commission_authority",
          label: "Notary commission authority",
          semantic_type: "notary_commission_authority",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "signer_identity",
      title: "Signer Identity",
      presence: presence.signer_identity,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "signer_identification_rule",
          label: "Signer identification rule",
          semantic_type: "signer_identification_rule",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "personal_knowledge_only_identification_allowed",
          label: "Personal knowledge only identification allowed",
          semantic_type: "boolean",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "credible_witness_identification_allowed",
          label: "Credible witness identification allowed",
          semantic_type: "boolean",
          required: false,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "venue_and_commission",
      title: "Venue and Commission",
      presence: presence.venue_and_commission,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "venue_requirement_note",
          label: "Venue requirement note",
          semantic_type: "venue_requirement_note",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "commission_expiration_status",
          label: "Commission expiration status",
          semantic_type: "commission_expiration_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "witness_and_competency",
      title: "Witness and Competency",
      presence: presence.witness_and_competency,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "witness_requirement_status",
          label: "Witness requirement status",
          semantic_type: "witness_requirement_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "witness_count_minimum",
          label: "Witness count minimum",
          semantic_type: "witness_requirement_status",
          required: false,
          data_type: "integer",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "signer_competency_note",
          label: "Signer competency note",
          semantic_type: "signer_competency_note",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "notarization_channel",
      title: "Notarization Channel",
      presence: presence.notarization_channel,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "ron_status",
          label: "RON status",
          semantic_type: "ron_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "e_notarization_status",
          label: "E-notarization status",
          required: true,
          semantic_type: "e_notarization_status",
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "personal_appearance_required",
          label: "Personal appearance required",
          semantic_type: "boolean",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "personal_appearance_basis",
          label: "Personal appearance basis",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "certificate_requirements",
      title: "Certificate Requirements",
      presence: presence.certificate_requirements,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "required_certificate_elements",
          label: "Required certificate elements",
          semantic_type: "required_certificate_elements",
          required: true,
          data_type: "array",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "permitted_optional_certificate_elements",
          label: "Permitted optional certificate elements",
          semantic_type: "permitted_optional_certificate_elements",
          required: false,
          data_type: "array",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "prohibited_certificate_elements",
          label: "Prohibited certificate elements",
          semantic_type: "prohibited_certificate_elements",
          required: false,
          data_type: "array",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "certificate_language_note",
          label: "Certificate language note",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "statutory_short_form_available",
          label: "Statutory short form available",
          semantic_type: "statutory_short_form_available",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "custom_certificate_language_required",
          label: "Custom certificate language required",
          semantic_type: "custom_certificate_language_required",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "seal_and_stamp",
      title: "Seal and Stamp",
      presence: presence.seal_and_stamp,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "seal_requirement_status",
          label: "Seal requirement status",
          semantic_type: "seal_requirement_status",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "seal_required_elements",
          label: "Seal required elements",
          semantic_type: "seal_required_elements",
          required: false,
          data_type: "array",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "seal_format_notes",
          label: "Seal format notes",
          semantic_type: "text",
          required: false,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "recording_requirements",
      title: "Recording Requirements",
      presence: presence.recording_requirements,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "recording_requirement_note",
          label: "Recording requirement note",
          semantic_type: "recording_requirement_note",
          required: true,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "recording_acknowledgment_required",
          label: "Recording acknowledgment required",
          semantic_type: "boolean",
          required: false,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
      ],
    },
    {
      key: "manual_review",
      title: "Manual Review",
      presence: manualReviewRequired ? "required" : presence.manual_review,
      repeatable: false,
      applies_to_document_types: appliesTo,
      fields: [
        {
          key: "manual_review_required",
          label: "Manual review required",
          semantic_type: "manual_review_reason",
          required: true,
          data_type: "boolean",
          collect_from: "system",
          default_source: "system_derived",
        },
        {
          key: "manual_review_reason",
          label: "Manual review reason",
          semantic_type: "manual_review_reason",
          required: manualReviewRequired,
          data_type: "string",
          collect_from: "system",
          default_source: "system_derived",
          when: buildIsTrueWhen("manual_review_required"),
        },
      ],
    },
  ];

  const documentOutputs: InputRequirementDocumentOutput[] = [
    {
      key: "generated_notarial_certificate",
      required: true,
    },
    {
      key: "jurisdiction_acknowledgment_page",
      required: acknowledgmentProfile !== "STANDARD_ACK",
      when: buildInWhen("acknowledgment_profile", [
        "CA_STATUTORY_ACK",
        "NY_CAPACITY_ACK",
        "LA_AUTHENTIC_ACT",
        "PR_PUBLIC_INSTRUMENT",
      ]),
    },
    {
      key: "execution_packet",
      required: false,
      when: buildInWhen("document_type", [
        "acknowledgment",
        "authentic_act",
        "public_instrument",
      ]),
    },
    {
      key: "generation_review_report",
      required: false,
      when: buildIsTrueWhen("manual_review_required"),
    },
  ];

  const notices: InputRequirementNotice[] = [
    {
      key: "identity_rule_notice",
      severity: "info",
      message:
        "Signer identification rules vary by jurisdiction and may allow personal knowledge, satisfactory evidence, or credible witnesses.",
    },
    {
      key: "digital_channel_notice",
      severity: "info",
      message:
        "RON and electronic notarization permissions vary by jurisdiction and channel configuration.",
    },
  ];

  if (manualReviewRequired) {
    notices.push({
      key: "manual_review_notice",
      severity: "warning",
      message: "This jurisdiction requires manual review before final generation.",
      when: buildIsTrueWhen("manual_review_required"),
    });
  }

  return {
    schema_version: "2026-04-01",
    jurisdiction: record.jurisdiction,
    document_type: documentType,
    ui_profile: record.ui_profile,
    derivation_mode: derivationMode,
    review_status: reviewStatus,
    api_representation_mode: normalizeApiMode(record.api_representation_mode),
    classification: {
      notarial_system: notarialSystem,
      execution_presence_mode: executionPresenceMode,
      digital_channel_status: digitalChannelStatus,
    },
    notary_capabilities: {
      ron_allowed: record.ron_allowed,
      e_notarization_allowed: record.e_notarization_allowed,
      witnesses_required_for_primary_act: record.witnesses_required_for_primary_act,
      personal_knowledge_only_identification_allowed:
        record.personal_knowledge_only_identification_allowed,
      credible_witness_identification_allowed: record.credible_witness_identification_allowed,
      commission_expiration_on_certificate_required:
        record.commission_expiration_on_certificate_required,
    },
    template_resolution: {
      base_template_key: record.base_template_key ?? `idn_${documentType}_v1`,
      jurisdiction_overlay_key:
        record.jurisdiction_overlay_key ?? buildStateOverlayKey(record.jurisdiction, "v1"),
      acknowledgment_profile: acknowledgmentProfile,
    },
    workflow: {
      steps: [
        "document_type_selection",
        "jurisdiction_selection",
        "signer_identity",
        "venue_and_commission",
        "certificate_requirements",
        "seal_and_stamp",
        "review",
      ],
      required_artifacts: requiredArtifactsByType[documentType],
      submission_checks: [
        "required_fields_complete",
        "required_identity_rules_complete",
        "required_certificate_elements_complete",
        "required_seal_elements_complete",
        "manual_review_gate_if_applicable",
      ],
    },
    sections,
    section_summaries: {
      notarization_channel: {
        ron_status: ronStatus,
        e_notarization_status: eNotarizationStatus,
        personal_appearance_required: personalAppearanceRequired,
        personal_appearance_basis:
          executionPresenceMode === "IN_PERSON_OR_REMOTE_ALLOWED"
            ? "IN_PERSON_OR_REMOTE_ALLOWED"
            : `${executionPresenceMode} plus remote restrictions`,
      },
      certificate_requirements: {
        statutory_short_form_available: record.statutory_short_form_available,
        custom_certificate_language_required: record.custom_certificate_language_required,
      },
      witness_and_competency: {
        witness_requirement_status: witnessStatus,
        witness_count_minimum: witnessMinimum,
      },
    },
    document_outputs: documentOutputs,
    notices,
    source_trace: [
      {
        source: "idn_requirements",
        field: "Governing Law",
        value: record.governing_law,
      },
      {
        source: "idn_requirements",
        field: "Acknowledgment Form",
        value: record.acknowledgment_form,
      },
      {
        source: "idn_requirements",
        field: "Signer Identification",
        value: record.signer_identification,
      },
      {
        source: "idn_requirements",
        field: "Witness Requirements",
        value: record.witness_requirements,
      },
      {
        source: "idn_requirements",
        field: "Remote Online Notarization (RON)",
        value: record.remote_online_notarization,
      },
      {
        source: "idn_requirements",
        field: "E-Notarization",
        value: record.e_notarization,
      },
      {
        source: "idn_requirements",
        field: "Commission Expiration on Certificate",
        value: record.commission_expiration_on_certificate,
      },
      {
        source: "idn_requirements",
        field: "Recording Requirements",
        value: record.recording_requirements,
      },
      {
        source: "idn_requirements",
        field: "Competency of Signer",
        value: record.competency_of_signer,
      },
    ],
  };
};

export const normalizePoaDocumentType = (input: string): PoaDocumentType => {
  if ((poaDocumentTypes as readonly string[]).includes(input)) {
    return input as PoaDocumentType;
  }

  return "general";
};

export const deriveInputRequirements = (
  params: DeriveInputRequirementsParams,
): InputRequirementsContract => {
  switch (params.family) {
    case "poa":
      return derivePoaContract(params.record, params.documentType);
    case "trust":
      return deriveTrustContract(params.record, params.documentType);
    case "idn":
      return deriveIdnContract(params.record, params.documentType);
    default: {
      const exhaustive: never = params;
      throw new Error(`Unsupported requirements family: ${String(exhaustive)}`);
    }
  }
};
