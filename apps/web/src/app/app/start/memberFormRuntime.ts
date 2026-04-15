export const DEFAULT_MEMBER_FORM_FAMILY_ORDER = ["poa", "trust", "idn"] as const;
export const INTAKE_MEMBER_FORM_FAMILY_ORDER = ["poa", "trust"] as const;

export type MemberFormFamily = (typeof DEFAULT_MEMBER_FORM_FAMILY_ORDER)[number];

type ConditionOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "is_true"
  | "is_false";

export type ConditionClause = {
  fact: string;
  operator: ConditionOperator;
  value?: unknown;
};

export type Condition = {
  all: ConditionClause[];
};

export type ConditionFactValue = string | string[] | boolean | null;
export type FactContext = Record<string, ConditionFactValue>;

export type MemberFacingFieldSource = {
  family: MemberFormFamily;
  document_type: string;
  section_key: string;
  field_key: string;
  original_label: string;
  original_required?: boolean;
  original_when?: Condition;
};

export type MemberFacingField = {
  canonical_key: string;
  label?: string;
  semantic_type?: string;
  data_type?: string;
  required: boolean;
  when?: Condition;
  condition_merge_mode?: "exact" | "source_only";
  sources: MemberFacingFieldSource[];
};

export type MemberFacingSection<TField extends MemberFacingField = MemberFacingField> = {
  fields: TField[];
} & Record<string, unknown>;

export type SourceConditionContext = {
  family: MemberFormFamily;
  documentType: string;
  sectionKey: string;
  fieldKey: string;
  facts: FactContext;
};

export type FamilyContract = {
  family: MemberFormFamily;
  documentType: string;
  factContext: FactContext;
};

export type MemberFormRulesContract<
  TField extends MemberFacingField = MemberFacingField,
  TSection extends MemberFacingSection<TField> = MemberFacingSection<TField>,
> = {
  aggregatedForm: {
    sections: TSection[];
  };
  familyContracts: FamilyContract[];
  sourceConditionContexts: SourceConditionContext[];
};

export type FieldRuntime = {
  visible: boolean;
  required: boolean;
  activeSources: MemberFacingFieldSource[];
};

export type MemberFormValue = string | boolean | string[];

export type BuildInitialMemberFormValuesOptions = {
  jurisdictionCode?: string;
  jurisdictionLabel?: string;
};

export type FieldFamilyScope = "trust" | "poa" | "shared" | "unknown";

export type SectionLayoutMode = "single-column" | "two-column";

export type FieldFamilyGroup<TField extends MemberFacingField = MemberFacingField> = {
  scope: FieldFamilyScope;
  label: string;
  fields: TField[];
};

const intakeFamilySet = new Set<MemberFormFamily>(INTAKE_MEMBER_FORM_FAMILY_ORDER);

const excludedCanonicalKeys = new Set([
  "jurisdiction",
  "document_title",
  "document_type",
  "poa_type",
]);

const excludedSourceKeys = new Set([
  "jurisdiction",
  "document_title",
  "document_type",
  "poa_type",
]);

const excludedSemanticTypes = new Set([
  "document_title",
  "document_type",
  "poa_type",
]);

const conditionalRequiredRules: Record<string, Condition> = {
  prior_document_items: {
    all: [
      {
        fact: "restatement_context_type",
        operator: "in",
        value: ["amendment", "restatement", "amendment_and_restatement"],
      },
    ],
  },
};

const familyGroupOrder: FieldFamilyScope[] = ["shared", "trust", "poa", "unknown"];

const peopleFieldOrder = [
  "principal_full_legal_name",
  "principal_full_name",
  "principal_address",
  "principal_contact",
  "agent_full_legal_name",
  "agent_full_name",
  "agent_address",
  "agent_contact",
  "successor_agents",
  "successor_agent_list",
  "grantors",
  "trustees",
  "successor_trustees",
] as const;

const authorityFieldOrder = [
  "trustee_signature_authority",
  "trustee_signature_authority_custom_text",
  "agent_signature_authority",
  "revocability_status",
  "revocation_holders",
  "revocation_holders_custom_text",
  "trustee_incapacity_standard",
  "trustee_powers",
  "asset_titling_format",
  "tax_id_owner",
  "authority_scope_selection",
  "special_instructions",
  "special_instructions_text",
] as const;

const documentsFieldOrder = [
  "restatement_context_type",
  "prior_document_items",
  "uploaded_document_file",
  "supporting_document_file",
  "trust_document_file",
] as const;

const toOrderMap = (values: readonly string[]) => {
  return new Map(values.map((value, index) => [value, index]));
};

const peopleFieldOrderMap = toOrderMap(peopleFieldOrder);
const authorityFieldOrderMap = toOrderMap(authorityFieldOrder);
const documentsFieldOrderMap = toOrderMap(documentsFieldOrder);

const normalizeCanonicalKey = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

const toTitleCaseWords = (value: string) => {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const normalizeJurisdictionLabel = (value: string) => {
  const cleaned = value
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

  return toTitleCaseWords(cleaned);
};

const normalizeJurisdictionCode = (value: string) => {
  return toTitleCaseWords(value.trim());
};

const buildDefaultTrustName = (options: BuildInitialMemberFormValuesOptions) => {
  const label =
    typeof options.jurisdictionLabel === "string"
      ? normalizeJurisdictionLabel(options.jurisdictionLabel)
      : "";
  const code =
    typeof options.jurisdictionCode === "string"
      ? normalizeJurisdictionCode(options.jurisdictionCode)
      : "";

  const source = label || code;
  if (!source) {
    return "";
  }

  return `${source} Trust`;
};

const getSectionFieldRank = (
  sectionKey: string,
  canonicalKey: string,
) => {
  const normalizedCanonicalKey = normalizeCanonicalKey(canonicalKey);

  if (sectionKey === "people") {
    return peopleFieldOrderMap.get(normalizedCanonicalKey) ?? Number.MAX_SAFE_INTEGER;
  }

  if (sectionKey === "authority") {
    return authorityFieldOrderMap.get(normalizedCanonicalKey) ?? Number.MAX_SAFE_INTEGER;
  }

  if (sectionKey === "documents") {
    return documentsFieldOrderMap.get(normalizedCanonicalKey) ?? Number.MAX_SAFE_INTEGER;
  }

  return Number.MAX_SAFE_INTEGER;
};

const getFamilyGroupOrderForSection = (sectionKey: string) => {
  if (sectionKey === "people") {
    return ["poa", "trust", "shared", "unknown"] as const;
  }

  if (sectionKey === "authority") {
    return ["trust", "poa", "shared", "unknown"] as const;
  }

  return familyGroupOrder;
};

const isIntakeFamily = (family: MemberFormFamily): boolean => {
  return intakeFamilySet.has(family);
};

export const buildInitialMemberFormValues = <
  TField extends MemberFacingField,
  TSection extends MemberFacingSection<TField>,
>(
  memberForm: MemberFormRulesContract<TField, TSection> | null,
  options: BuildInitialMemberFormValuesOptions = {},
): Record<string, MemberFormValue> => {
  if (!memberForm) {
    return {};
  }

  const initialValues: Record<string, MemberFormValue> = {};
  const defaultTrustName = buildDefaultTrustName(options);

  for (const section of memberForm.aggregatedForm.sections) {
    for (const field of section.fields) {
      const canonicalKey = normalizeCanonicalKey(field.canonical_key);

      if (canonicalKey !== "trust_name") {
        continue;
      }

      if (!field.sources.some((source) => source.family === "trust")) {
        continue;
      }

      if (!defaultTrustName) {
        continue;
      }

      initialValues[field.canonical_key] = defaultTrustName;
    }
  }

  return initialValues;
};

export const getSectionLayoutMode = (sectionKey: string): SectionLayoutMode => {
  if (sectionKey === "basic_info" || sectionKey === "execution") {
    return "two-column";
  }

  return "single-column";
};

const toFactContext = (
  values: Record<string, MemberFormValue>,
): FactContext => {
  const factContext: FactContext = {};

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      factContext[key] = value;
      continue;
    }

    if (typeof value === "string" || typeof value === "boolean") {
      factContext[key] = value;
      continue;
    }
  }

  return factContext;
};

const isMemberUiExcludedField = (field: MemberFacingField) => {
  const normalizedCanonicalKey = normalizeCanonicalKey(field.canonical_key);
  if (excludedCanonicalKeys.has(normalizedCanonicalKey)) {
    return true;
  }

  if (field.semantic_type && excludedSemanticTypes.has(field.semantic_type)) {
    return true;
  }

  return field.sources.some((source) => {
    const sourceFieldKey = source.field_key;
    return excludedSourceKeys.has(sourceFieldKey);
  });
};

const resolveConditionalRequired = (
  canonicalKey: string,
  facts: FactContext,
): boolean | null => {
  const rule = conditionalRequiredRules[normalizeCanonicalKey(canonicalKey)];
  if (!rule) {
    return null;
  }

  return evaluateCondition(rule, facts);
};

const buildSourceKey = (
  family: string,
  documentType: string,
  sectionKey: string,
  fieldKey: string,
) => {
  return [family, documentType, sectionKey, fieldKey].join("|");
};

const buildFamilyKey = (family: string, documentType: string) => {
  return [family, documentType].join("|");
};

const normalizeConditionTargets = (value: unknown) => {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .flatMap((item) => item.split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "boolean") {
    return [value ? "true" : "false"];
  }

  return [];
};

const normalizeFactValues = (value: ConditionFactValue | undefined) => {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === "string") {
    return [value];
  }

  if (typeof value === "boolean") {
    return [value ? "true" : "false"];
  }

  return [];
};

const toBooleanFact = (value: ConditionFactValue | undefined) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "required", "allowed", "authorized"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "not_required", "not_allowed", "none"].includes(normalized)) {
      return false;
    }

    return null;
  }

  return null;
};

export const evaluateCondition = (condition: Condition | undefined, facts: FactContext) => {
  if (!condition) {
    return true;
  }

  return condition.all.every((clause) => {
    const actual = facts[clause.fact];
    const targets = normalizeConditionTargets(clause.value);
    const actualValues = normalizeFactValues(actual);

    switch (clause.operator) {
      case "equals":
        return (
          actualValues.length > 0 &&
          targets.some((target) => actualValues.includes(target))
        );
      case "not_equals":
        return (
          actualValues.length > 0 &&
          targets.every((target) => !actualValues.includes(target))
        );
      case "in":
        return (
          actualValues.length > 0 &&
          targets.some((target) => actualValues.includes(target))
        );
      case "not_in":
        return (
          actualValues.length > 0 &&
          targets.every((target) => !actualValues.includes(target))
        );
      case "is_true": {
        const boolValue = toBooleanFact(actual);
        return boolValue === true;
      }
      case "is_false": {
        const boolValue = toBooleanFact(actual);
        return boolValue === false;
      }
      default:
        return false;
    }
  });
};

export const computeFieldRuntime = <
  TField extends MemberFacingField,
  TSection extends MemberFacingSection<TField>,
>(
  memberForm: MemberFormRulesContract<TField, TSection> | null,
  formValues: Record<string, MemberFormValue> = {},
): Map<string, FieldRuntime> => {
  const map = new Map<string, FieldRuntime>();

  if (!memberForm) {
    return map;
  }

  const sourceContextByKey = new Map<string, SourceConditionContext>();
  for (const context of memberForm.sourceConditionContexts) {
    sourceContextByKey.set(
      buildSourceKey(
        context.family,
        context.documentType,
        context.sectionKey,
        context.fieldKey,
      ),
      context,
    );
  }

  const familyFactContextByKey = new Map<string, FactContext>();
  for (const familyContract of memberForm.familyContracts) {
    familyFactContextByKey.set(
      buildFamilyKey(familyContract.family, familyContract.documentType),
      familyContract.factContext,
    );
  }

  const resolveFactsForSource = (source: MemberFacingFieldSource): FactContext => {
    const scopedContext = sourceContextByKey.get(
      buildSourceKey(
        source.family,
        source.document_type,
        source.section_key,
        source.field_key,
      ),
    );

    if (scopedContext) {
      return scopedContext.facts;
    }

    return (
      familyFactContextByKey.get(buildFamilyKey(source.family, source.document_type)) ??
      {}
    );
  };

  const formFactContext = toFactContext(formValues);

  for (const section of memberForm.aggregatedForm.sections) {
    for (const field of section.fields) {
      if (isMemberUiExcludedField(field)) {
        map.set(field.canonical_key, {
          visible: false,
          required: false,
          activeSources: [],
        });
        continue;
      }

      const scopedSources = field.sources.filter((source) => isIntakeFamily(source.family));

      if (scopedSources.length === 0) {
        map.set(field.canonical_key, {
          visible: false,
          required: false,
          activeSources: [],
        });
        continue;
      }

      const activeSources = scopedSources.filter((source) => {
        const facts = {
          ...resolveFactsForSource(source),
          ...formFactContext,
        };

        if (field.condition_merge_mode === "source_only") {
          return evaluateCondition(source.original_when, facts);
        }

        return evaluateCondition(field.when, facts);
      });

      const visible = activeSources.length > 0;
      const baseRequired =
        visible &&
        activeSources.some((source) => {
          return source.original_required ?? field.required;
        });

      const conditionalRequired = resolveConditionalRequired(
        field.canonical_key,
        formFactContext,
      );

      const required =
        conditionalRequired === null
          ? baseRequired
          : visible && conditionalRequired;

      map.set(field.canonical_key, {
        visible,
        required,
        activeSources,
      });
    }
  }

  return map;
};

export const getVisibleSections = <
  TField extends MemberFacingField,
  TSection extends MemberFacingSection<TField>,
>(
  memberForm: MemberFormRulesContract<TField, TSection> | null,
  fieldRuntime: Map<string, FieldRuntime>,
): Array<TSection & { fields: TField[] }> => {
  if (!memberForm) {
    return [];
  }

  const sections: Array<TSection & { fields: TField[] }> = [];

  for (const section of memberForm.aggregatedForm.sections) {
    const visibleFields = section.fields
      .filter((field) => {
        const runtime = fieldRuntime.get(field.canonical_key);
        return runtime?.visible ?? false;
      })
      .sort((left, right) => {
        const leftRank = getSectionFieldRank(String(section.key), left.canonical_key);
        const rightRank = getSectionFieldRank(String(section.key), right.canonical_key);

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return left.canonical_key.localeCompare(right.canonical_key);
      });

    if (visibleFields.length === 0) {
      continue;
    }

    sections.push({
      ...section,
      fields: visibleFields,
    });
  }

  return sections;
};

const getScopeLabel = (scope: FieldFamilyScope) => {
  if (scope === "trust") {
    return "Trust";
  }

  if (scope === "poa") {
    return "POA";
  }

  if (scope === "shared") {
    return "Shared";
  }

  return "Mixed";
};

export const getFieldFamilyScope = (
  field: MemberFacingField,
  runtime?: FieldRuntime,
): FieldFamilyScope => {
  const sources = runtime?.activeSources.length
    ? runtime.activeSources
    : field.sources.filter((source) => isIntakeFamily(source.family));

  const families = new Set(
    sources
      .filter((source) => isIntakeFamily(source.family))
      .map((source) => source.family),
  );

  if (families.has("poa") && families.has("trust")) {
    return "shared";
  }

  if (families.has("trust")) {
    return "trust";
  }

  if (families.has("poa")) {
    return "poa";
  }

  return "unknown";
};

export const groupSectionFieldsByFamily = <
  TField extends MemberFacingField,
>(
  section: { key?: string; fields: TField[] },
  fieldRuntime: Map<string, FieldRuntime>,
): FieldFamilyGroup<TField>[] => {
  const grouped = new Map<FieldFamilyScope, TField[]>();

  const familyOrder = getFamilyGroupOrderForSection(String(section.key ?? ""));

  for (const scope of familyOrder) {
    grouped.set(scope, []);
  }

  for (const field of section.fields) {
    const runtime = fieldRuntime.get(field.canonical_key);
    const scope = getFieldFamilyScope(field, runtime);
    const fields = grouped.get(scope);

    if (!fields) {
      continue;
    }

    fields.push(field);
  }

  const groups: FieldFamilyGroup<TField>[] = [];

  for (const scope of familyOrder) {
    const fields = grouped.get(scope) ?? [];
    if (fields.length === 0) {
      continue;
    }

    groups.push({
      scope,
      label: getScopeLabel(scope),
      fields,
    });
  }

  return groups;
};
