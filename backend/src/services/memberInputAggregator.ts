import type {
  Condition,
  InputRequirementsContract,
  InputRequirementField,
  InputRequirementSection,
  InputRequirementSourceTrace,
} from "./inputRequirements";

type UiGroupKey =
  | "basic_info"
  | "people"
  | "authority"
  | "execution"
  | "documents"
  | "advanced";

type Family = "trust" | "poa" | "idn";

const UI_GROUP_ORDER: UiGroupKey[] = [
  "basic_info",
  "people",
  "authority",
  "execution",
  "documents",
  "advanced",
];

const UI_GROUP_TITLES: Record<UiGroupKey, string> = {
  basic_info: "Basic Information",
  people: "People",
  authority: "Authority",
  execution: "Execution",
  documents: "Documents",
  advanced: "Advanced",
};

const FAMILY_ORDER: Family[] = ["trust", "poa", "idn"];

const SAFE_CANONICAL_FIELD_MAP: Readonly<Record<string, string>> = {
  jurisdiction: "jurisdiction",
  state: "jurisdiction",
  trust_state: "jurisdiction",
};

const CANONICAL_LABEL_MAP: Readonly<Record<string, string>> = {
  jurisdiction: "Jurisdiction",
};

const CANONICAL_UI_GROUP_MAP: Readonly<Record<string, UiGroupKey>> = {
  jurisdiction: "basic_info",
  trust_name: "basic_info",
  trust_date: "basic_info",
  principal_name: "people",
  agent_name: "people",
  trustee_name: "people",
  trustmaker_name: "people",
  successor_trustee_name: "people",
  successor_agent_name: "people",
  signing_authority: "authority",
  signature_authority: "authority",
  revocation_authority: "authority",
  revocability_status: "authority",
  incapacity_standard: "authority",
  trustee_incapacity_standard: "authority",
  tax_id_owner: "authority",
  asset_titling_format: "authority",
  execution_method: "execution",
  notarization_method: "execution",
  witness_method: "execution",
  uploaded_document_file: "documents",
  supporting_document_file: "documents",
  trust_document_file: "documents",
};

const FIELD_KEY_UI_GROUP_MAP: Readonly<Record<string, UiGroupKey>> = {
  document_type: "basic_info",
  poa_type: "basic_info",
  document_title: "basic_info",
  principal_full_name: "people",
  agent_full_name: "people",
  successor_agent_list: "people",
  grantors: "people",
  trustees: "people",
  successor_trustees: "people",
  authority_scope_selection: "authority",
  selected_execution_path: "execution",
  uploaded_document_file: "documents",
};

export type MemberFacingFieldSource = {
  family: "trust" | "poa" | "idn";
  document_type: string;
  section_key: string;
  field_key: string;
  original_label: string;
  original_required?: boolean;
  original_when?: Condition;
};

export type MemberFacingField = {
  // Internal identity key used by merge logic; incompatible variants may be suffixed (for example `__2`).
  canonical_key: string;
  label: string;
  semantic_type: string;
  data_type: "string" | "integer" | "boolean" | "date" | "array" | "object";
  required: boolean;
  repeatable: boolean;
  help_text?: string;
  validation?: Record<string, unknown>;
  // Top-level condition is only present when merged conditions are exact.
  when?: Condition;
  // When `source_only`, consumers must inspect source-level conditions in `sources[].original_when`.
  condition_merge_mode?: "exact" | "source_only";
  sources: MemberFacingFieldSource[];
  // Presentation grouping only; this is not a legal classification.
  ui_group: "basic_info" | "people" | "authority" | "execution" | "documents" | "advanced";
};

export type MemberFacingSection = {
  key: "basic_info" | "people" | "authority" | "execution" | "documents" | "advanced";
  title: string;
  fields: MemberFacingField[];
};

export type MemberFacingFormContract = {
  jurisdiction: string;
  families: Array<"trust" | "poa" | "idn">;
  document_types: Array<string>;
  sections: MemberFacingSection[];
  source_trace: InputRequirementSourceTrace[];
};

export type ExtractedMemberField = {
  family: Family;
  document_type: string;
  jurisdiction: string;
  section_key: string;
  section_title: string;
  field_key: string;
  label: string;
  semantic_type: string;
  data_type: "string" | "integer" | "boolean" | "date" | "array" | "object";
  required: boolean;
  repeatable: boolean;
  help_text?: string;
  validation?: Record<string, unknown>;
  when?: Condition;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const normalizeForComparison = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForComparison(item));
  }

  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));

    for (const key of keys) {
      normalized[key] = normalizeForComparison(value[key]);
    }

    return normalized;
  }

  return value;
};

const serializeForComparison = (value: unknown): string => {
  return JSON.stringify(normalizeForComparison(value));
};

const areConditionsEqual = (left: Condition | undefined, right: Condition | undefined) => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return serializeForComparison(left) === serializeForComparison(right);
};

const mergeConditionSafely = (
  left: Condition | undefined,
  right: Condition | undefined,
): Condition | undefined => {
  if (!left && !right) {
    return undefined;
  }

  if (left && right && areConditionsEqual(left, right)) {
    return left;
  }

  // Condition currently supports only `all`; we avoid inventing an unsafe OR merge.
  return undefined;
};

export const areFieldValidationsCompatible = (
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined,
): boolean => {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return serializeForComparison(left) === serializeForComparison(right);
};

const getContractFamilyAndDocumentType = (
  contract: InputRequirementsContract,
): { family: Family; document_type: string } => {
  if ("poa_type" in contract) {
    return {
      family: "poa",
      document_type: contract.poa_type,
    };
  }

  if ("trust_capabilities" in contract) {
    return {
      family: "trust",
      document_type: contract.document_type,
    };
  }

  return {
    family: "idn",
    document_type: contract.document_type,
  };
};

const toExtractedMemberField = (
  contract: InputRequirementsContract,
  section: InputRequirementSection,
  field: InputRequirementField,
): ExtractedMemberField => {
  const { family, document_type } = getContractFamilyAndDocumentType(contract);

  const extracted: ExtractedMemberField = {
    family,
    document_type,
    jurisdiction: contract.jurisdiction,
    section_key: section.key,
    section_title: section.title,
    field_key: field.key,
    label: field.label,
    semantic_type: field.semantic_type,
    data_type: field.data_type,
    required: field.required,
    repeatable: section.repeatable,
    ...(field.help_text ? { help_text: field.help_text } : {}),
    ...(field.validation ? { validation: field.validation } : {}),
    ...(field.when ? { when: field.when } : {}),
  };

  return extracted;
};

export const extractMemberFacingFields = (
  contracts: InputRequirementsContract[],
): ExtractedMemberField[] => {
  const extractedFields: ExtractedMemberField[] = [];

  for (const contract of contracts) {
    for (const section of contract.sections) {
      if (section.presence === "hidden" || section.presence === "manual_review") {
        continue;
      }

      for (const field of section.fields) {
        if (field.collect_from !== "member") {
          continue;
        }

        extractedFields.push(toExtractedMemberField(contract, section, field));
      }
    }
  }

  return extractedFields;
};

const inferRoleContext = (field: ExtractedMemberField): string => {
  const text = `${field.section_key} ${field.field_key} ${field.semantic_type}`.toLowerCase();

  if (SAFE_CANONICAL_FIELD_MAP[field.field_key]) {
    return "global";
  }

  if (text.includes("principal")) {
    return "principal";
  }

  if (text.includes("agent")) {
    return "agent";
  }

  if (text.includes("trustee")) {
    return "trustee";
  }

  if (text.includes("grantor") || text.includes("trustmaker")) {
    return "grantor";
  }

  if (text.includes("signer")) {
    return "signer";
  }

  if (text.includes("witness")) {
    return "witness";
  }

  return "generic";
};

const resolveCanonicalFieldKey = (field: ExtractedMemberField): string => {
  const mapped = SAFE_CANONICAL_FIELD_MAP[field.field_key];
  if (mapped) {
    return mapped;
  }

  return field.field_key;
};

export const buildCanonicalFieldIdentity = (field: ExtractedMemberField): string => {
  const canonicalKey = resolveCanonicalFieldKey(field);
  const roleContext = inferRoleContext(field);

  return [canonicalKey, field.semantic_type, field.data_type, roleContext].join("::");
};

const matchesAny = (text: string, keywords: readonly string[]) => {
  return keywords.some((keyword) => text.includes(keyword));
};

const stripCanonicalVariantSuffix = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

export const inferUiGroup = (
  field: ExtractedMemberField | MemberFacingField,
): MemberFacingSection["key"] => {
  const canonicalLookupKey =
    "field_key" in field
      ? resolveCanonicalFieldKey(field)
      : stripCanonicalVariantSuffix(field.canonical_key);

  const explicitCanonicalGroup = CANONICAL_UI_GROUP_MAP[canonicalLookupKey];
  if (explicitCanonicalGroup) {
    return explicitCanonicalGroup;
  }

  const fieldLookupKey = "field_key" in field ? field.field_key : field.sources[0]?.field_key;
  if (fieldLookupKey) {
    const explicitFieldGroup = FIELD_KEY_UI_GROUP_MAP[fieldLookupKey];
    if (explicitFieldGroup) {
      return explicitFieldGroup;
    }
  }

  const text = `${canonicalLookupKey} ${fieldLookupKey ?? ""} ${field.semantic_type}`.toLowerCase();

  if (matchesAny(text, ["jurisdiction", "state", "document_type", "poa_type", "trust_name", "trust_date"])) {
    return "basic_info";
  }

  if (matchesAny(text, ["principal", "agent", "trustee", "grantor", "trustmaker", "signer", "person", "party"])) {
    return "people";
  }

  if (matchesAny(text, ["authority", "power", "durability", "revocation", "incapacity"])) {
    return "authority";
  }

  if (matchesAny(text, ["execution", "notary", "witness", "acknowledgment", "effective_date", "signature"])) {
    return "execution";
  }

  if (matchesAny(text, ["upload", "attachment", "document", "file"])) {
    return "documents";
  }

  if (matchesAny(text, ["special", "custom", "advanced", "override"])) {
    return "advanced";
  }

  return "advanced";
};

const toMemberFacingSource = (field: ExtractedMemberField): MemberFacingFieldSource => {
  return {
    family: field.family,
    document_type: field.document_type,
    section_key: field.section_key,
    field_key: field.field_key,
    original_label: field.label,
    original_required: field.required,
    ...(field.when ? { original_when: field.when } : {}),
  };
};

const toMergedField = (
  field: ExtractedMemberField,
  canonicalKey: string,
): MemberFacingField => {
  const mappedLabel = CANONICAL_LABEL_MAP[canonicalKey];

  return {
    canonical_key: canonicalKey,
    label: mappedLabel ?? field.label,
    semantic_type: field.semantic_type,
    data_type: field.data_type,
    required: field.required,
    repeatable: field.repeatable,
    ...(field.help_text ? { help_text: field.help_text } : {}),
    ...(field.validation ? { validation: field.validation } : {}),
    ...(field.when
      ? {
          when: field.when,
          condition_merge_mode: "exact" as const,
        }
      : {}),
    sources: [toMemberFacingSource(field)],
    ui_group: inferUiGroup(field),
  };
};

const canMergeFieldIntoVariant = (
  variant: MemberFacingField,
  field: ExtractedMemberField,
): boolean => {
  if (variant.semantic_type !== field.semantic_type) {
    return false;
  }

  if (variant.data_type !== field.data_type) {
    return false;
  }

  if (variant.repeatable !== field.repeatable) {
    return false;
  }

  if (variant.ui_group !== inferUiGroup(field)) {
    return false;
  }

  return areFieldValidationsCompatible(variant.validation, field.validation);
};

const mergeIntoVariant = (
  variant: MemberFacingField,
  field: ExtractedMemberField,
): MemberFacingField => {
  const {
    when: _previousWhen,
    condition_merge_mode: _previousConditionMergeMode,
    ...variantWithoutConditionFields
  } = variant;

  const hasConditionConflict = !areConditionsEqual(variant.when, field.when);
  const mergedWhen = mergeConditionSafely(variant.when, field.when);
  const useSourceOnlyConditions =
    variant.condition_merge_mode === "source_only" || hasConditionConflict;

  const merged: MemberFacingField = {
    ...variantWithoutConditionFields,
    required: variant.required || field.required,
    sources: [...variant.sources, toMemberFacingSource(field)],
    ...(useSourceOnlyConditions
      ? { condition_merge_mode: "source_only" as const }
      : mergedWhen
        ? {
            when: mergedWhen,
            condition_merge_mode: "exact" as const,
          }
        : {}),
  };

  if (!merged.help_text && field.help_text) {
    merged.help_text = field.help_text;
  }

  return merged;
};

const compareExtracted = (left: ExtractedMemberField, right: ExtractedMemberField) => {
  const leftKey = [
    left.family,
    left.document_type,
    left.section_key,
    left.field_key,
    left.label,
  ].join("|");
  const rightKey = [
    right.family,
    right.document_type,
    right.section_key,
    right.field_key,
    right.label,
  ].join("|");

  return leftKey.localeCompare(rightKey);
};

const deduplicateExtractedFields = (
  fields: ExtractedMemberField[],
): MemberFacingField[] => {
  const groupedByIdentity = new Map<string, MemberFacingField[]>();

  const sortedFields = [...fields].sort(compareExtracted);

  for (const field of sortedFields) {
    const identity = buildCanonicalFieldIdentity(field);
    const canonicalKey = resolveCanonicalFieldKey(field);
    const variants = groupedByIdentity.get(identity) ?? [];

    const compatibleIndex = variants.findIndex((variant) =>
      canMergeFieldIntoVariant(variant, field),
    );

    if (compatibleIndex >= 0) {
      const compatibleVariant = variants[compatibleIndex];
      if (!compatibleVariant) {
        continue;
      }

      variants[compatibleIndex] = mergeIntoVariant(compatibleVariant, field);
      groupedByIdentity.set(identity, variants);
      continue;
    }

    const variantKey =
      variants.length === 0 ? canonicalKey : `${canonicalKey}__${variants.length + 1}`;

    variants.push(toMergedField(field, variantKey));
    groupedByIdentity.set(identity, variants);
  }

  const deduped = [...groupedByIdentity.values()].flat();

  return deduped.sort((left, right) =>
    left.canonical_key.localeCompare(right.canonical_key),
  );
};

const mergeSourceTrace = (
  contracts: InputRequirementsContract[],
): InputRequirementSourceTrace[] => {
  const unique = new Map<string, InputRequirementSourceTrace>();

  for (const contract of contracts) {
    for (const item of contract.source_trace) {
      const key = `${item.source}|${item.field}|${String(item.value)}`;

      if (!unique.has(key)) {
        unique.set(key, item);
      }
    }
  }

  return [...unique.values()].sort((left, right) => {
    const leftKey = `${left.source}|${left.field}|${String(left.value)}`;
    const rightKey = `${right.source}|${right.field}|${String(right.value)}`;

    return leftKey.localeCompare(rightKey);
  });
};

const buildSections = (fields: MemberFacingField[]): MemberFacingSection[] => {
  const byGroup = new Map<UiGroupKey, MemberFacingField[]>();

  for (const group of UI_GROUP_ORDER) {
    byGroup.set(group, []);
  }

  for (const field of fields) {
    const groupFields = byGroup.get(field.ui_group);
    if (!groupFields) {
      continue;
    }

    groupFields.push(field);
  }

  const sections: MemberFacingSection[] = [];

  for (const group of UI_GROUP_ORDER) {
    const groupFields = byGroup.get(group) ?? [];
    if (groupFields.length === 0) {
      continue;
    }

    sections.push({
      key: group,
      title: UI_GROUP_TITLES[group],
      fields: [...groupFields].sort((left, right) =>
        left.canonical_key.localeCompare(right.canonical_key),
      ),
    });
  }

  return sections;
};

const ensureSingleJurisdiction = (contracts: InputRequirementsContract[]): string => {
  if (contracts.length === 0) {
    throw new Error("At least one contract is required to derive a member-facing form.");
  }

  const firstContract = contracts[0];
  if (!firstContract) {
    throw new Error("At least one contract is required to derive a member-facing form.");
  }

  const jurisdiction = firstContract.jurisdiction;

  for (const contract of contracts) {
    if (contract.jurisdiction !== jurisdiction) {
      throw new Error(
        `All contracts must share the same jurisdiction. Received ${jurisdiction} and ${contract.jurisdiction}.`,
      );
    }
  }

  return jurisdiction;
};

const getFamilies = (contracts: InputRequirementsContract[]): Family[] => {
  const uniqueFamilies = new Set<Family>();

  for (const contract of contracts) {
    uniqueFamilies.add(getContractFamilyAndDocumentType(contract).family);
  }

  return FAMILY_ORDER.filter((family) => uniqueFamilies.has(family));
};

const getDocumentTypes = (contracts: InputRequirementsContract[]): string[] => {
  const uniqueDocumentTypes = new Set<string>();

  for (const contract of contracts) {
    const { document_type } = getContractFamilyAndDocumentType(contract);
    uniqueDocumentTypes.add(document_type);
  }

  return [...uniqueDocumentTypes].sort((left, right) => left.localeCompare(right));
};

export const deriveMemberFacingFormContract = (
  contracts: InputRequirementsContract[],
): MemberFacingFormContract => {
  const jurisdiction = ensureSingleJurisdiction(contracts);
  const extractedFields = extractMemberFacingFields(contracts);
  const deduplicatedFields = deduplicateExtractedFields(extractedFields);

  return {
    jurisdiction,
    families: getFamilies(contracts),
    document_types: getDocumentTypes(contracts),
    sections: buildSections(deduplicatedFields),
    source_trace: mergeSourceTrace(contracts),
  };
};

export const explainMemberFieldMerge = (
  contracts: InputRequirementsContract[],
): Array<{
  canonical_key: string;
  merged_from: MemberFacingFieldSource[];
  ui_group: string;
}> => {
  const form = deriveMemberFacingFormContract(contracts);

  return form.sections
    .flatMap((section) =>
      section.fields.map((field) => ({
        canonical_key: field.canonical_key,
        merged_from: field.sources,
        ui_group: field.ui_group,
      })),
    )
    .sort((left, right) => left.canonical_key.localeCompare(right.canonical_key));
};
