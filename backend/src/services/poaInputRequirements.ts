import type { PoaRequirementRecord } from "./poaService";

const INPUT_REQUIREMENTS_SCHEMA_VERSION = "2026-03-27";

type DerivationMode = "rules_only" | "rules_plus_overrides" | "manual_review";
type ExecutionPathAvailability =
  | "required"
  | "allowed"
  | "not_allowed"
  | "manual_review";
type ExecutionPathKey =
  | "notary_acknowledgment"
  | "witness_execution"
  | "notary_and_witness_execution"
  | "manual_review";
type SectionPresence =
  | "required"
  | "optional"
  | "conditional"
  | "hidden"
  | "manual_review";
type SemanticType =
  | "person_name"
  | "enum_single"
  | "enum_multi"
  | "boolean"
  | "date"
  | "text"
  | "initials"
  | "signature_mark"
  | "witness_count"
  | "acknowledgment_choice"
  | "legal_notice_acceptance"
  | "recording_status";
type DataType = "string" | "integer" | "boolean" | "date" | "array";
type CollectFrom = "member" | "principal" | "agent" | "notary" | "system";
type DefaultSource =
  | "none"
  | "user_profile"
  | "document_template"
  | "jurisdiction_default"
  | "system_derived";
type ConditionFact =
  | "selected_execution_path"
  | "durability_rule"
  | "specific_authority_rule"
  | "effective_date_rule"
  | "statutory_form_rule"
  | "review_status";
type ConditionOperator = "equals" | "not_equals" | "in" | "not_in";
type NoticeSeverity = "info" | "warning" | "blocking";
type DocumentOutputKey =
  | "signed_poa_document"
  | "principal_signature"
  | "notary_acknowledgment"
  | "witness_attestation"
  | "special_authority_initials"
  | "durability_clause"
  | "springing_trigger_clause"
  | "recording_confirmation";

type ConditionClause = {
  fact: ConditionFact;
  operator: ConditionOperator;
  value: string;
};

type Condition = {
  all: ConditionClause[];
};

type FieldValidation = {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  allowedValues?: string[];
};

export type PoaInputRequirementField = {
  key: string;
  label: string;
  semanticType: SemanticType;
  required: boolean;
  dataType: DataType;
  collectFrom: CollectFrom;
  defaultSource: DefaultSource;
  validation?: FieldValidation;
  helpText?: string;
  when?: Condition;
};

export type PoaInputRequirementSection = {
  key: string;
  title: string;
  presence: SectionPresence;
  repeatable: boolean;
  appliesToPaths: ExecutionPathKey[];
  fields: PoaInputRequirementField[];
};

export type PoaExecutionPath = {
  key: ExecutionPathKey;
  label: string;
  default: boolean;
  availability: ExecutionPathAvailability;
};

export type PoaDocumentOutput = {
  key: DocumentOutputKey;
  required: boolean;
  when?: Condition;
};

export type PoaRequirementNotice = {
  key: string;
  severity: NoticeSeverity;
  message: string;
};

export type PoaRequirementSourceTrace = {
  source: "poa_requirements";
  field: string;
  value: string | number | boolean | null;
};

export type PoaInputRequirements = {
  schemaVersion: string;
  jurisdiction: string;
  poaType: string;
  uiProfile: string;
  derivationMode: DerivationMode;
  reviewStatus: string;
  workflow: {
    executionPaths: PoaExecutionPath[];
    steps: string[];
    submissionChecks: string[];
  };
  sections: PoaInputRequirementSection[];
  documentOutputs: PoaDocumentOutput[];
  notices: PoaRequirementNotice[];
  sourceTrace: PoaRequirementSourceTrace[];
};

type DraftContext = {
  record: PoaRequirementRecord;
  executionPaths: PoaExecutionPath[];
  derivationMode: DerivationMode;
};

const buildEqualsCondition = (
  fact: ConditionFact,
  value: string,
): Condition => ({
  all: [
    {
      fact,
      operator: "equals",
      value,
    },
  ],
});

const hasExecutionPath = (
  executionPaths: PoaExecutionPath[],
  key: ExecutionPathKey,
) => {
  return executionPaths.some((path) => path.key === key);
};

const buildExecutionPaths = (record: PoaRequirementRecord): PoaExecutionPath[] => {
  if (
    record.ui_profile === "review_required" ||
    record.review_status === "needs_review"
  ) {
    return [
      {
        key: "manual_review",
        label: "Manual legal review required",
        default: true,
        availability: "manual_review",
      },
    ];
  }

  if (
    record.ui_profile === "notary_and_witness" ||
    record.witness_rule === "additional_to_notary"
  ) {
    return [
      {
        key: "notary_and_witness_execution",
        label: "Notary and witness execution",
        default: true,
        availability: "required",
      },
    ];
  }

  if (
    record.ui_profile === "notary_or_witness" ||
    record.notarization_rule === "alternative_to_witnesses" ||
    record.witness_rule === "alternative_to_notary"
  ) {
    return [
      {
        key: "notary_acknowledgment",
        label: "Sign before a notary",
        default: true,
        availability: "allowed",
      },
      {
        key: "witness_execution",
        label: "Use witnesses instead of a notary",
        default: false,
        availability: "allowed",
      },
    ];
  }

  if (
    record.ui_profile === "witness_only" ||
    (record.witness_rule === "required" && record.notarization_rule === "not_required")
  ) {
    return [
      {
        key: "witness_execution",
        label: "Witness execution",
        default: true,
        availability: "required",
      },
    ];
  }

  return [
    {
      key: "notary_acknowledgment",
      label: "Notary acknowledgment",
      default: true,
      availability: record.notarization_rule === "required" ? "required" : "allowed",
    },
  ];
};

const buildPrincipalSection = (
  context: DraftContext,
): PoaInputRequirementSection => {
  const fields: PoaInputRequirementField[] = [
    {
      key: "principal_full_name",
      label: "Principal full legal name",
      semanticType: "person_name",
      required: true,
      dataType: "string",
      collectFrom: "member",
      defaultSource: "user_profile",
      validation: {
        minLength: 2,
        maxLength: 120,
      },
    },
  ];

  if (context.record.requires_principal_signature) {
    fields.push({
      key: "principal_signature",
      label: "Principal signature",
      semanticType: "signature_mark",
      required: true,
      dataType: "string",
      collectFrom: "principal",
      defaultSource: "none",
    });
  }

  if (context.record.allows_proxy_signature) {
    fields.push({
      key: "proxy_signer_name",
      label: "Proxy signer full name",
      semanticType: "person_name",
      required: false,
      dataType: "string",
      collectFrom: "member",
      defaultSource: "none",
      helpText: "Collect only if the principal will sign through an authorized proxy.",
    });
  }

  return {
    key: "principal",
    title: "Principal",
    presence: hasExecutionPath(context.executionPaths, "manual_review")
      ? "manual_review"
      : "required",
    repeatable: false,
    appliesToPaths: context.executionPaths.map((path) => path.key),
    fields,
  };
};

const buildAgentSection = (
  context: DraftContext,
): PoaInputRequirementSection => ({
  key: "agent",
  title: "Agent",
  presence: hasExecutionPath(context.executionPaths, "manual_review")
    ? "manual_review"
    : "required",
  repeatable: false,
  appliesToPaths: context.executionPaths.map((path) => path.key),
  fields: [
    {
      key: "agent_full_name",
      label: "Agent full legal name",
      semanticType: "person_name",
      required: true,
      dataType: "string",
      collectFrom: "member",
      defaultSource: "none",
      validation: {
        minLength: 2,
        maxLength: 120,
      },
    },
  ],
});

const buildAuthorityScopeSection = (
  context: DraftContext,
): PoaInputRequirementSection => {
  const fields: PoaInputRequirementField[] = [];

  if (context.record.special_authority_rule === "required_for_certain_acts") {
    fields.push({
      key: "special_authorities",
      label: "Special authorities",
      semanticType: "enum_multi",
      required: true,
      dataType: "array",
      collectFrom: "member",
      defaultSource: "none",
      helpText:
        "Collect explicit authority selections for powers that require additional authorization.",
    });
  }

  if (context.record.jurisdiction === "US-FL") {
    fields.push({
      key: "special_authority_initials",
      label: "Principal initials for special authorities",
      semanticType: "initials",
      required: true,
      dataType: "string",
      collectFrom: "principal",
      defaultSource: "none",
    });
  }

  return {
    key: "authority_scope",
    title: "Authority scope",
    presence:
      fields.length > 0
        ? "required"
        : context.record.special_authority_rule === "varies_by_type"
          ? "manual_review"
          : "optional",
    repeatable: false,
    appliesToPaths: context.executionPaths.map((path) => path.key),
    fields,
  };
};

const buildDurabilitySection = (
  context: DraftContext,
): PoaInputRequirementSection => {
  const fields: PoaInputRequirementField[] = [];
  let presence: SectionPresence = "hidden";

  if (context.record.durability_rule === "requires_explicit_language") {
    presence = "required";
    fields.push({
      key: "durability_choice",
      label: "Durability selection",
      semanticType: "enum_single",
      required: true,
      dataType: "string",
      collectFrom: "member",
      defaultSource: "none",
      validation: {
        allowedValues: ["durable", "not_durable"],
      },
    });
  }

  if (context.record.durability_rule === "presumed_durable") {
    presence = "optional";
    fields.push({
      key: "durability_override",
      label: "Override default durability",
      semanticType: "boolean",
      required: false,
      dataType: "boolean",
      collectFrom: "member",
      defaultSource: "jurisdiction_default",
      helpText: "This jurisdiction treats the POA as durable unless the document states otherwise.",
    });
  }

  if (context.record.durability_rule === "not_durable_unless_stated") {
    presence = "optional";
    fields.push({
      key: "durability_override",
      label: "Add durability language",
      semanticType: "boolean",
      required: false,
      dataType: "boolean",
      collectFrom: "member",
      defaultSource: "jurisdiction_default",
      helpText: "This jurisdiction requires explicit language to make the POA durable.",
    });
  }

  if (context.record.durability_rule === "conditional") {
    presence = "required";
    fields.push({
      key: "recording_status",
      label: "Recording status",
      semanticType: "recording_status",
      required: true,
      dataType: "string",
      collectFrom: "member",
      defaultSource: "none",
      validation: {
        allowedValues: ["not_recorded", "recorded", "will_record"],
      },
      helpText: "Durability depends on whether the instrument is recorded.",
    });
  }

  return {
    key: "durability",
    title: "Durability",
    presence,
    repeatable: false,
    appliesToPaths: context.executionPaths.map((path) => path.key),
    fields,
  };
};

const buildEffectiveDateSection = (
  context: DraftContext,
): PoaInputRequirementSection => {
  const fields: PoaInputRequirementField[] = [];
  let presence: SectionPresence = "hidden";

  if (context.record.effective_date_rule === "upon_triggering_event") {
    presence = "required";
    fields.push(
      {
        key: "effective_date_choice",
        label: "When should the POA become effective?",
        semanticType: "enum_single",
        required: true,
        dataType: "string",
        collectFrom: "member",
        defaultSource: "jurisdiction_default",
        validation: {
          allowedValues: ["upon_execution", "upon_triggering_event"],
        },
      },
      {
        key: "trigger_description",
        label: "Triggering event description",
        semanticType: "text",
        required: true,
        dataType: "string",
        collectFrom: "member",
        defaultSource: "none",
        when: buildEqualsCondition("effective_date_rule", "upon_triggering_event"),
      },
    );
  }

  if (context.record.effective_date_rule === "upon_execution_unless_specified") {
    presence = "optional";
    fields.push({
      key: "effective_date_choice",
      label: "Effective date option",
      semanticType: "enum_single",
      required: false,
      dataType: "string",
      collectFrom: "member",
      defaultSource: "jurisdiction_default",
      validation: {
        allowedValues: ["upon_execution", "custom_specified"],
      },
    });
  }

  return {
    key: "effective_date",
    title: "Effective date",
    presence,
    repeatable: false,
    appliesToPaths: context.executionPaths.map((path) => path.key),
    fields,
  };
};

const buildExecutionChoiceSection = (
  context: DraftContext,
): PoaInputRequirementSection => ({
  key: "execution_choice",
  title: "Execution choice",
  presence: context.executionPaths.length > 1 ? "required" : "hidden",
  repeatable: false,
  appliesToPaths: context.executionPaths.map((path) => path.key),
  fields:
    context.executionPaths.length > 1
      ? [
          {
            key: "selected_execution_path",
            label: "Execution path",
            semanticType: "acknowledgment_choice",
            required: true,
            dataType: "string",
            collectFrom: "member",
            defaultSource: "jurisdiction_default",
            validation: {
              allowedValues: context.executionPaths
                .filter((path) => path.availability !== "manual_review")
                .map((path) => path.key),
            },
          },
        ]
      : [],
});

const buildWitnessSection = (
  context: DraftContext,
): PoaInputRequirementSection => {
  let presence: SectionPresence = "hidden";
  let appliesToPaths: ExecutionPathKey[] = [];

  if (hasExecutionPath(context.executionPaths, "witness_execution")) {
    presence = context.executionPaths.length > 1 ? "conditional" : "required";
    appliesToPaths = ["witness_execution"];
  }

  if (hasExecutionPath(context.executionPaths, "notary_and_witness_execution")) {
    presence = "required";
    appliesToPaths = ["notary_and_witness_execution"];
  }

  const fields: PoaInputRequirementField[] = [];

  if (presence !== "hidden") {
    fields.push({
      key: "witness_count",
      label: "Number of witnesses",
      semanticType: "witness_count",
      required: true,
      dataType: "integer",
      collectFrom: "member",
      defaultSource:
        typeof context.record.witness_count === "number" ? "jurisdiction_default" : "none",
      validation:
        typeof context.record.witness_count === "number"
          ? {
              min: context.record.witness_count,
              max: context.record.witness_count,
            }
          : {
              min: 1,
              max: 4,
            },
      ...(typeof context.record.witness_count === "number"
        ? {}
        : {
            helpText:
              "Witness count is not normalized for this jurisdiction yet and needs confirmation.",
          }),
    });
  }

  return {
    key: "witnesses",
    title: "Witnesses",
    presence,
    repeatable: true,
    appliesToPaths,
    fields,
  };
};

const buildNotarySection = (
  context: DraftContext,
): PoaInputRequirementSection => {
  let presence: SectionPresence = "hidden";
  let appliesToPaths: ExecutionPathKey[] = [];

  if (hasExecutionPath(context.executionPaths, "notary_acknowledgment")) {
    presence = context.executionPaths.length > 1 ? "conditional" : "required";
    appliesToPaths = ["notary_acknowledgment"];
  }

  if (hasExecutionPath(context.executionPaths, "notary_and_witness_execution")) {
    presence = "required";
    appliesToPaths = ["notary_and_witness_execution"];
  }

  if (
    presence === "hidden" &&
    context.record.requires_acknowledgment_certificate
  ) {
    presence = "required";
    appliesToPaths = context.executionPaths.map((path) => path.key);
  }

  return {
    key: "notary",
    title: "Notary acknowledgment",
    presence,
    repeatable: false,
    appliesToPaths,
    fields: [],
  };
};

const buildStatutoryNoticesSection = (
  context: DraftContext,
): PoaInputRequirementSection => {
  const fields: PoaInputRequirementField[] = [];

  if (context.record.statutory_form_rule !== "not_addressed") {
    fields.push({
      key: "statutory_form_notice_acknowledged",
      label: "Statutory form notice acknowledged",
      semanticType: "legal_notice_acceptance",
      required: false,
      dataType: "boolean",
      collectFrom: "member",
      defaultSource: "none",
    });
  }

  return {
    key: "statutory_notices",
    title: "Statutory notices",
    presence: fields.length > 0 ? "optional" : "hidden",
    repeatable: false,
    appliesToPaths: context.executionPaths.map((path) => path.key),
    fields,
  };
};

const buildDocumentOutputs = (context: DraftContext): PoaDocumentOutput[] => {
  const outputs: PoaDocumentOutput[] = [
    {
      key: "signed_poa_document",
      required: true,
    },
  ];

  if (context.record.requires_principal_signature) {
    outputs.push({
      key: "principal_signature",
      required: true,
    });
  }

  if (hasExecutionPath(context.executionPaths, "notary_acknowledgment")) {
    outputs.push({
      key: "notary_acknowledgment",
      required: context.executionPaths.length === 1,
      ...(context.executionPaths.length > 1
        ? { when: buildEqualsCondition("selected_execution_path", "notary_acknowledgment") }
        : {}),
    });
  }

  if (hasExecutionPath(context.executionPaths, "witness_execution")) {
    outputs.push({
      key: "witness_attestation",
      required: context.executionPaths.length === 1,
      ...(context.executionPaths.length > 1
        ? { when: buildEqualsCondition("selected_execution_path", "witness_execution") }
        : {}),
    });
  }

  if (hasExecutionPath(context.executionPaths, "notary_and_witness_execution")) {
    outputs.push(
      {
        key: "notary_acknowledgment",
        required: true,
      },
      {
        key: "witness_attestation",
        required: true,
      },
    );
  }

  if (context.record.special_authority_rule === "required_for_certain_acts") {
    outputs.push({
      key: "special_authority_initials",
      required: context.record.jurisdiction === "US-FL",
    });
  }

  if (context.record.durability_rule === "requires_explicit_language") {
    outputs.push({
      key: "durability_clause",
      required: true,
    });
  }

  if (context.record.durability_rule === "conditional") {
    outputs.push({
      key: "recording_confirmation",
      required: true,
    });
  }

  if (context.record.effective_date_rule === "upon_triggering_event") {
    outputs.push({
      key: "springing_trigger_clause",
      required: true,
    });
  }

  return outputs;
};

const buildNotices = (context: DraftContext): PoaRequirementNotice[] => {
  const notices: PoaRequirementNotice[] = [];

  if (context.record.competency_rule !== "not_addressed") {
    notices.push({
      key: "capacity_required",
      severity: "info",
      message: "The principal must have the required legal capacity at signing.",
    });
  }

  if (context.record.statutory_form_rule === "available") {
    notices.push({
      key: "statutory_form_available",
      severity: "info",
      message: "A statutory form exists for this jurisdiction and should be considered during drafting.",
    });
  }

  if (context.record.statutory_form_rule === "multiple_forms") {
    notices.push({
      key: "multiple_statutory_forms",
      severity: "warning",
      message: "This jurisdiction has multiple statutory forms. The document type should be confirmed before completion.",
    });
  }

  if (context.record.durability_rule === "conditional") {
    notices.push({
      key: "durability_depends_on_recording",
      severity: "warning",
      message: "Durability depends on recording status in this jurisdiction.",
    });
  }

  if (
    (context.record.witness_rule === "additional_to_notary" ||
      context.record.witness_rule === "required") &&
    context.record.witness_count === null
  ) {
    notices.push({
      key: "witness_count_needs_confirmation",
      severity: "blocking",
      message: "Witness count is not fully normalized for this jurisdiction and must be reviewed before completion.",
    });
  }

  if (hasExecutionPath(context.executionPaths, "manual_review")) {
    notices.push({
      key: "manual_review_required",
      severity: "blocking",
      message: "This jurisdiction still requires manual workflow review before the form can be finalized.",
    });
  }

  return notices;
};

const buildSourceTrace = (record: PoaRequirementRecord): PoaRequirementSourceTrace[] => {
  return [
    {
      source: "poa_requirements",
      field: "ui_profile",
      value: record.ui_profile,
    },
    {
      source: "poa_requirements",
      field: "notarization_rule",
      value: record.notarization_rule,
    },
    {
      source: "poa_requirements",
      field: "witness_rule",
      value: record.witness_rule,
    },
    {
      source: "poa_requirements",
      field: "witness_count",
      value: record.witness_count,
    },
    {
      source: "poa_requirements",
      field: "durability_rule",
      value: record.durability_rule,
    },
    {
      source: "poa_requirements",
      field: "statutory_form_rule",
      value: record.statutory_form_rule,
    },
    {
      source: "poa_requirements",
      field: "effective_date_rule",
      value: record.effective_date_rule,
    },
    {
      source: "poa_requirements",
      field: "competency_rule",
      value: record.competency_rule,
    },
    {
      source: "poa_requirements",
      field: "special_authority_rule",
      value: record.special_authority_rule,
    },
    {
      source: "poa_requirements",
      field: "requires_principal_signature",
      value: record.requires_principal_signature,
    },
    {
      source: "poa_requirements",
      field: "allows_proxy_signature",
      value: record.allows_proxy_signature,
    },
    {
      source: "poa_requirements",
      field: "requires_acknowledgment_certificate",
      value: record.requires_acknowledgment_certificate,
    },
  ];
};

const applyJurisdictionOverrides = (
  requirements: PoaInputRequirements,
  record: PoaRequirementRecord,
): PoaInputRequirements => {
  if (record.jurisdiction === "US-FL") {
    const executionPaths: PoaExecutionPath[] = [
      {
        key: "notary_and_witness_execution",
        label: "Notary and two witnesses required",
        default: true,
        availability: "required",
      },
    ];
    const overrideAppliesToPaths: ExecutionPathKey[] = [
      "notary_and_witness_execution",
    ];

    const sections = requirements.sections.map((section) => {
      if (section.key === "execution_choice") {
        return {
          ...section,
          presence: "hidden" as const,
          appliesToPaths: overrideAppliesToPaths,
          fields: [],
        };
      }

      if (section.key === "witnesses") {
        return {
          ...section,
          presence: "required" as const,
          appliesToPaths: overrideAppliesToPaths,
          fields: [
            {
              key: "witness_count",
              label: "Number of witnesses",
              semanticType: "witness_count" as const,
              required: true,
              dataType: "integer" as const,
              collectFrom: "member" as const,
              defaultSource: "jurisdiction_default" as const,
              validation: {
                min: 2,
                max: 2,
              },
            },
          ],
        };
      }

      if (section.key === "notary") {
        return {
          ...section,
          presence: "required" as const,
          appliesToPaths: overrideAppliesToPaths,
        };
      }

      return {
        ...section,
        appliesToPaths: overrideAppliesToPaths,
      };
    });

    const notices = requirements.notices.filter(
      (notice) => notice.key !== "witness_count_needs_confirmation",
    );

    return {
      ...requirements,
      derivationMode: "rules_plus_overrides",
      workflow: {
        ...requirements.workflow,
        executionPaths,
        submissionChecks: [
          "principal_signed",
          "required_witnesses_present",
          "required_notary_path_selected",
        ],
      },
      sections,
      documentOutputs: [
        {
          key: "signed_poa_document",
          required: true,
        },
        {
          key: "principal_signature",
          required: true,
        },
        {
          key: "notary_acknowledgment",
          required: true,
        },
        {
          key: "witness_attestation",
          required: true,
        },
        {
          key: "special_authority_initials",
          required: true,
        },
        {
          key: "durability_clause",
          required: true,
        },
      ],
      notices,
    };
  }

  return requirements;
};

export const derivePoaInputRequirements = (
  record: PoaRequirementRecord,
): PoaInputRequirements => {
  const executionPaths = buildExecutionPaths(record);
  const initialDerivationMode: DerivationMode =
    record.ui_profile === "review_required" || record.review_status === "needs_review"
      ? "manual_review"
      : "rules_only";

  const context: DraftContext = {
    record,
    executionPaths,
    derivationMode: initialDerivationMode,
  };

  const workflowSteps = [
    "principal_details",
    "agent_details",
    "authority_scope",
    "execution_requirements",
    "review",
  ];

  const submissionChecks = ["principal_signed"];

  if (executionPaths.length > 1) {
    submissionChecks.push("one_execution_path_selected");
  }

  if (hasExecutionPath(executionPaths, "notary_acknowledgment")) {
    submissionChecks.push("required_notary_path_selected");
  }

  if (
    hasExecutionPath(executionPaths, "witness_execution") ||
    hasExecutionPath(executionPaths, "notary_and_witness_execution")
  ) {
    submissionChecks.push("required_witnesses_present");
  }

  const requirements: PoaInputRequirements = {
    schemaVersion: INPUT_REQUIREMENTS_SCHEMA_VERSION,
    jurisdiction: record.jurisdiction,
    poaType: record.poa_type,
    uiProfile: record.ui_profile,
    derivationMode: context.derivationMode,
    reviewStatus: record.review_status ?? "draft",
    workflow: {
      executionPaths,
      steps: workflowSteps,
      submissionChecks,
    },
    sections: [
      buildPrincipalSection(context),
      buildAgentSection(context),
      buildAuthorityScopeSection(context),
      buildDurabilitySection(context),
      buildEffectiveDateSection(context),
      buildExecutionChoiceSection(context),
      buildWitnessSection(context),
      buildNotarySection(context),
      buildStatutoryNoticesSection(context),
    ],
    documentOutputs: buildDocumentOutputs(context),
    notices: buildNotices(context),
    sourceTrace: buildSourceTrace(record),
  };

  return applyJurisdictionOverrides(requirements, record);
};