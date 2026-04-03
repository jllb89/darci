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

const intakeFamilySet = new Set<MemberFormFamily>(INTAKE_MEMBER_FORM_FAMILY_ORDER);

const isIntakeFamily = (family: MemberFormFamily): boolean => {
  return intakeFamilySet.has(family);
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

  for (const section of memberForm.aggregatedForm.sections) {
    for (const field of section.fields) {
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
        const facts = resolveFactsForSource(source);

        if (field.condition_merge_mode === "source_only") {
          return evaluateCondition(source.original_when, facts);
        }

        return evaluateCondition(field.when, facts);
      });

      const visible = activeSources.length > 0;
      const required =
        visible &&
        activeSources.some((source) => {
          return source.original_required ?? field.required;
        });

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
    const visibleFields = section.fields.filter((field) => {
      const runtime = fieldRuntime.get(field.canonical_key);
      return runtime?.visible ?? false;
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
