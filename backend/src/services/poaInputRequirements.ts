import {
  deriveInputRequirements,
  normalizePoaDocumentType,
  type Condition,
  type InputRequirementField,
  type InputRequirementNotice,
  type InputRequirementSection,
  type InputRequirementSourceTrace,
  type PoaDocumentType,
  type PoaInputRequirementsContract,
} from "./inputRequirements";
import type { PoaRequirementRecord } from "./poaService";

type ExecutionPathAvailability =
  | "required"
  | "allowed"
  | "not_allowed"
  | "manual_review";

export type ExecutionPathKey =
  | "notary_acknowledgment"
  | "witness_execution"
  | "notary_and_witness_execution"
  | "manual_review";

export type PoaExecutionPath = {
  key: ExecutionPathKey;
  label: string;
  default: boolean;
  availability: ExecutionPathAvailability;
};

export type PoaInputRequirementField = {
  key: string;
  label: string;
  semanticType: string;
  required: boolean;
  dataType: "string" | "integer" | "boolean" | "date" | "array" | "object";
  collectFrom: "member" | "principal" | "agent" | "notary" | "witness" | "system";
  defaultSource:
    | "none"
    | "user_profile"
    | "jurisdiction_default"
    | "system_derived"
    | "document_template"
    | "previous_document";
  validation?: Record<string, unknown>;
  helpText?: string;
  when?: Condition;
  derivationRule?: string;
};

export type PoaInputRequirementSection = {
  key: string;
  title: string;
  presence: "required" | "optional" | "conditional" | "hidden" | "manual_review";
  repeatable: boolean;
  appliesToPaths: ExecutionPathKey[];
  fields: PoaInputRequirementField[];
};

export type PoaDocumentOutput = {
  key: string;
  required: boolean;
  when?: Condition;
};

export type PoaRequirementNotice = InputRequirementNotice;
export type PoaRequirementSourceTrace = InputRequirementSourceTrace;

export type PoaInputRequirements = Omit<
  PoaInputRequirementsContract,
  "workflow" | "sections" | "document_outputs" | "source_trace"
> & {
  schemaVersion: string;
  poaType: PoaDocumentType;
  uiProfile: string;
  derivationMode: "rules_only" | "rules_plus_overrides" | "manual_review";
  reviewStatus: "draft" | "verified" | "needs_review";
  workflow: PoaInputRequirementsContract["workflow"] & {
    executionPaths: PoaExecutionPath[];
    requiredArtifacts: string[];
    submissionChecks: string[];
  };
  sections: PoaInputRequirementSection[];
  documentOutputs: PoaDocumentOutput[];
  notices: PoaRequirementNotice[];
  sourceTrace: PoaRequirementSourceTrace[];
};

const toLegacyField = (field: InputRequirementField): PoaInputRequirementField => {
  const legacy: PoaInputRequirementField = {
    key: field.key,
    label: field.label,
    semanticType: field.semantic_type,
    required: field.required,
    dataType: field.data_type,
    collectFrom: field.collect_from,
    defaultSource: field.default_source,
    ...(field.validation ? { validation: field.validation } : {}),
    ...(field.help_text ? { helpText: field.help_text } : {}),
    ...(field.when ? { when: field.when } : {}),
    ...(field.derivation_rule ? { derivationRule: field.derivation_rule } : {}),
  };

  return legacy;
};

const deriveExecutionPaths = (
  contract: PoaInputRequirementsContract,
): PoaExecutionPath[] => {
  const manualReviewRequired =
    contract.derivation_mode === "manual_review" ||
    contract.review_status === "needs_review";

  if (manualReviewRequired) {
    return [
      {
        key: "manual_review",
        label: "Manual legal review required",
        default: true,
        availability: "manual_review",
      },
    ];
  }

  switch (contract.classification.execution_model) {
    case "NOTARY_AND_WITNESSES":
      return [
        {
          key: "notary_and_witness_execution",
          label: "Notary and witness execution",
          default: true,
          availability: "required",
        },
      ];
    case "NOTARY_OR_WITNESSES":
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
    case "NOTARY_ONLY":
      return [
        {
          key: "notary_acknowledgment",
          label: "Notary acknowledgment",
          default: true,
          availability: "required",
        },
      ];
    case "WITNESSES_ONLY":
      return [
        {
          key: "witness_execution",
          label: "Witness execution",
          default: true,
          availability: "required",
        },
      ];
    default:
      return [
        {
          key: "manual_review",
          label: "Manual legal review required",
          default: true,
          availability: "manual_review",
        },
      ];
  }
};

const mapSectionPaths = (
  sectionKey: string,
  paths: PoaExecutionPath[],
): ExecutionPathKey[] => {
  const pathKeys = paths.map((path) => path.key);

  if (sectionKey === "notary") {
    const notaryPaths = pathKeys.filter(
      (key) => key === "notary_acknowledgment" || key === "notary_and_witness_execution",
    );
    return notaryPaths.length ? notaryPaths : pathKeys;
  }

  if (sectionKey === "witnesses") {
    const witnessPaths = pathKeys.filter(
      (key) => key === "witness_execution" || key === "notary_and_witness_execution",
    );
    return witnessPaths.length ? witnessPaths : pathKeys;
  }

  return pathKeys;
};

const toLegacySection = (
  section: InputRequirementSection,
  paths: PoaExecutionPath[],
): PoaInputRequirementSection => {
  const legacySection: PoaInputRequirementSection = {
    key: section.key,
    title: section.title,
    presence: section.presence,
    repeatable: section.repeatable,
    appliesToPaths: mapSectionPaths(section.key, paths),
    fields: section.fields.map(toLegacyField),
  };

  return legacySection;
};

const hasExecutionPath = (
  paths: PoaExecutionPath[],
  key: ExecutionPathKey,
) => paths.some((path) => path.key === key);

const upsertField = (
  fields: PoaInputRequirementField[],
  candidate: PoaInputRequirementField,
) => {
  const index = fields.findIndex((field) => field.key === candidate.key);

  if (index >= 0) {
    fields[index] = {
      ...fields[index],
      ...candidate,
    };
    return;
  }

  fields.push(candidate);
};

const applyLegacySectionCompatibility = (
  sections: PoaInputRequirementSection[],
  record: PoaRequirementRecord,
): PoaInputRequirementSection[] => {
  const enhanced = sections.map((section) => {
    const nextFields = [...section.fields];

    if (section.key === "principal" && record.allows_proxy_signature) {
      upsertField(nextFields, {
        key: "proxy_signer_name",
        label: "Proxy signer full name",
        semanticType: "person_name",
        required: false,
        dataType: "string",
        collectFrom: "member",
        defaultSource: "none",
      });
    }

    if (
      section.key === "authority_scope" &&
      record.special_authority_rule === "required_for_certain_acts"
    ) {
      upsertField(nextFields, {
        key: "special_authorities",
        label: "Special authorities",
        semanticType: "enum_multi",
        required: true,
        dataType: "array",
        collectFrom: "member",
        defaultSource: "none",
      });
    }

    if (section.key === "durability" && record.durability_rule === "conditional") {
      upsertField(nextFields, {
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
      ...section,
      fields: nextFields,
    };
  });

  if (record.jurisdiction !== "US-FL") {
    return enhanced;
  }

  const overridePath: ExecutionPathKey[] = ["notary_and_witness_execution"];

  return enhanced.map((section) => {
    if (section.key === "execution_choice") {
      return {
        ...section,
        presence: "hidden",
        appliesToPaths: overridePath,
        fields: [],
      };
    }

    if (section.key === "witnesses") {
      return {
        ...section,
        presence: "required",
        appliesToPaths: overridePath,
        fields: [
          {
            key: "witness_count",
            label: "Number of witnesses",
            semanticType: "witness_count",
            required: true,
            dataType: "integer",
            collectFrom: "member",
            defaultSource: "jurisdiction_default",
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
        presence: "required",
        appliesToPaths: overridePath,
      };
    }

    return {
      ...section,
      appliesToPaths: overridePath,
    };
  });
};

const upsertOutput = (
  outputs: PoaDocumentOutput[],
  candidate: PoaDocumentOutput,
) => {
  const index = outputs.findIndex((output) => output.key === candidate.key);

  if (index >= 0) {
    outputs[index] = {
      ...outputs[index],
      ...candidate,
    };
    return;
  }

  outputs.push(candidate);
};

const applyLegacyOutputCompatibility = (
  outputs: PoaDocumentOutput[],
  record: PoaRequirementRecord,
  paths: PoaExecutionPath[],
): PoaDocumentOutput[] => {
  const nextOutputs = outputs.map((output) =>
    output.key === "generated_poa_document"
      ? {
          ...output,
          key: "signed_poa_document",
        }
      : output,
  );

  if (hasExecutionPath(paths, "notary_and_witness_execution")) {
    upsertOutput(nextOutputs, {
      key: "notary_acknowledgment",
      required: true,
    });
    upsertOutput(nextOutputs, {
      key: "witness_attestation",
      required: true,
    });
  } else {
    if (hasExecutionPath(paths, "notary_acknowledgment")) {
      upsertOutput(nextOutputs, {
        key: "notary_acknowledgment",
        required: paths.length === 1,
      });
    }

    if (hasExecutionPath(paths, "witness_execution")) {
      upsertOutput(nextOutputs, {
        key: "witness_attestation",
        required: paths.length === 1,
      });
    }
  }

  if (record.durability_rule === "conditional") {
    upsertOutput(nextOutputs, {
      key: "recording_confirmation",
      required: true,
    });
  }

  if (record.durability_rule === "requires_explicit_language") {
    upsertOutput(nextOutputs, {
      key: "durability_clause",
      required: true,
    });
  }

  if (record.effective_date_rule === "upon_triggering_event") {
    upsertOutput(nextOutputs, {
      key: "springing_trigger_clause",
      required: true,
    });
  }

  if (
    record.special_authority_rule === "required_for_certain_acts" &&
    record.jurisdiction === "US-FL"
  ) {
    upsertOutput(nextOutputs, {
      key: "special_authority_initials",
      required: true,
    });
  }

  return nextOutputs;
};

const applyLegacyNoticeCompatibility = (
  notices: PoaRequirementNotice[],
  record: PoaRequirementRecord,
): PoaRequirementNotice[] => {
  const nextNotices = [...notices];

  if (
    record.durability_rule === "conditional" &&
    !nextNotices.some((notice) => notice.key === "durability_depends_on_recording")
  ) {
    nextNotices.push({
      key: "durability_depends_on_recording",
      severity: "warning",
      message: "Durability depends on recording status in this jurisdiction.",
    });
  }

  if (
    (record.witness_rule === "additional_to_notary" ||
      record.witness_rule === "required") &&
    record.witness_count === null &&
    record.jurisdiction !== "US-FL" &&
    !nextNotices.some((notice) => notice.key === "witness_count_needs_confirmation")
  ) {
    nextNotices.push({
      key: "witness_count_needs_confirmation",
      severity: "blocking",
      message:
        "Witness count is not fully normalized for this jurisdiction and must be reviewed before completion.",
    });
  }

  return record.jurisdiction === "US-FL"
    ? nextNotices.filter((notice) => notice.key !== "witness_count_needs_confirmation")
    : nextNotices;
};

export const derivePoaInputRequirements = (
  record: PoaRequirementRecord,
): PoaInputRequirements => {
  const poaType = normalizePoaDocumentType(record.poa_type);
  const contract = deriveInputRequirements({
    family: "poa",
    record,
    documentType: poaType,
  }) as PoaInputRequirementsContract;

  const executionPaths =
    record.jurisdiction === "US-FL"
      ? [
          {
            key: "notary_and_witness_execution" as const,
            label: "Notary and two witnesses required",
            default: true,
            availability: "required" as const,
          },
        ]
      : deriveExecutionPaths(contract);

  const legacySections = applyLegacySectionCompatibility(
    contract.sections.map((section) => toLegacySection(section, executionPaths)),
    record,
  );

  const legacyOutputs = applyLegacyOutputCompatibility(
    contract.document_outputs.map((output) => ({
      key: output.key,
      required: output.required,
      ...(output.when ? { when: output.when } : {}),
    })),
    record,
    executionPaths,
  );

  const legacyNotices = applyLegacyNoticeCompatibility(contract.notices, record);

  const legacySubmissionChecks =
    record.jurisdiction === "US-FL"
      ? [
          "principal_signed",
          "required_witnesses_present",
          "required_notary_path_selected",
        ]
      : contract.workflow.submission_checks;

  return {
    ...contract,
    schemaVersion: contract.schema_version,
    poaType: contract.poa_type,
    uiProfile: contract.ui_profile,
    derivationMode:
      record.jurisdiction === "US-FL" ? "rules_plus_overrides" : contract.derivation_mode,
    reviewStatus: contract.review_status,
    workflow: {
      ...contract.workflow,
      executionPaths,
      requiredArtifacts: contract.workflow.required_artifacts,
      submissionChecks: legacySubmissionChecks,
    },
    sections: legacySections,
    documentOutputs: legacyOutputs,
    notices: legacyNotices,
    sourceTrace: contract.source_trace,
  };
};
