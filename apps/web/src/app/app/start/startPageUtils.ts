import {
  isValidEmailFormat,
  isValidPhoneCountryCode,
  isValidPhoneFormat,
  parsePersonContact,
  type PersonListItem,
  type PriorDocumentItem,
} from "@/app/app/start/memberFormControls";
import {
  fieldMicrocopyByCanonicalKey,
  originatingPriorDocumentTypes,
  productFlowModeKeys,
  repeatableAddLabelByCanonicalKey,
  repeatablePlaceholderByCanonicalKey,
  sectionMicrocopyByKey,
  signatureAuthorityModes,
  START_FORM_DRAFT_STORAGE_KEY_PREFIX,
} from "@/app/app/start/startPageConstants";
import type {
  FormStep,
  FormValue,
  MemberFacingField,
  ProductFlowModeKey,
  SignatureAuthorityMode,
  StartFormDraft,
} from "@/app/app/start/startPageTypes";

export const isProductFlowModeKey = (value: string): value is ProductFlowModeKey => {
  return (productFlowModeKeys as readonly string[]).includes(value);
};

export const isProductFlowStepKey = (value: string): value is FormStep => {
  return (
    value === "general_information" ||
    value === "poa_requirements" ||
    value === "trust_requirements"
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isFormValue = (value: unknown): value is FormValue => {
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

const sanitizeStoredFormValues = (value: unknown): Record<string, FormValue> => {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: Record<string, FormValue> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!key.trim() || !isFormValue(candidate)) {
      continue;
    }

    sanitized[key] = candidate;
  }

  return sanitized;
};

export const getStartFormDraftStorageKey = (
  productFlowMode: ProductFlowModeKey,
  jurisdictionCode: string,
) => {
  return `${START_FORM_DRAFT_STORAGE_KEY_PREFIX}:${productFlowMode}:${jurisdictionCode}`;
};

export const readStartFormDraft = (
  productFlowMode: ProductFlowModeKey,
  jurisdictionCode: string,
): StartFormDraft | null => {
  if (typeof window === "undefined" || !productFlowMode || !jurisdictionCode) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      getStartFormDraftStorageKey(productFlowMode, jurisdictionCode),
    );
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const rawCurrentFormStep =
      typeof parsed.currentFormStep === "string" ? parsed.currentFormStep.trim() : "";

    const currentFormStep = isProductFlowStepKey(rawCurrentFormStep)
      ? rawCurrentFormStep
      : rawCurrentFormStep === "authority"
        ? "trust_requirements"
        : "general_information";

    return {
      currentFormStep,
      formValues: sanitizeStoredFormValues(parsed.formValues),
    };
  } catch {
    return null;
  }
};

export const writeStartFormDraft = (
  productFlowMode: ProductFlowModeKey,
  jurisdictionCode: string,
  draft: StartFormDraft,
) => {
  if (typeof window === "undefined" || !productFlowMode || !jurisdictionCode) {
    return;
  }

  try {
    window.localStorage.setItem(
      getStartFormDraftStorageKey(productFlowMode, jurisdictionCode),
      JSON.stringify(draft),
    );
  } catch {
    // Swallow quota/private-mode errors to keep form editing uninterrupted.
  }
};

export const formatLabel = (value: string) => {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const toTitleCaseWords = (value: string) => {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

export const formatJurisdictionDisplayLabel = (
  label: string | undefined,
  code: string,
) => {
  const raw = typeof label === "string" && label.trim().length > 0 ? label : code;

  const withoutTrailingCode = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!withoutTrailingCode) {
    return toTitleCaseWords(code);
  }

  return toTitleCaseWords(withoutTrailingCode);
};

export const normalizeCanonicalKey = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

export const getAllowedValues = (field: MemberFacingField) => {
  const validation = field.validation;
  if (!validation) {
    return [] as string[];
  }

  const raw = validation["allowed_values"] ?? validation["allowedValues"];
  if (!Array.isArray(raw)) {
    return [] as string[];
  }

  return raw.filter((value): value is string => typeof value === "string");
};

export const getAllowedValueLabels = (field: MemberFacingField) => {
  const validation = field.validation;
  if (!validation) {
    return {} as Record<string, string>;
  }

  const raw = validation["allowed_value_labels"] ?? validation["allowedValueLabels"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {} as Record<string, string>;
  }

  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && key.trim().length > 0) {
      labels[key] = value;
    }
  }

  return labels;
};

const getValidationString = (
  field: { validation?: Record<string, unknown> },
  key: string,
) => {
  const validation = field.validation;
  if (!validation) {
    return null;
  }

  const value = validation[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const getValidationBoolean = (
  field: { validation?: Record<string, unknown> },
  key: string,
) => {
  const validation = field.validation;
  if (!validation) {
    return false;
  }

  return validation[key] === true;
};

export const isTaxIdOwnerSelectionBoundToTrustmakers = (field: {
  canonical_key: string;
  validation?: Record<string, unknown>;
}) => {
  if (normalizeCanonicalKey(field.canonical_key) !== "tax_id_owner") {
    return false;
  }

  return (
    getValidationString(field, "selection_source_field") === "grantors" &&
    getValidationBoolean(field, "enforce_source_selection_when_multiple")
  );
};

export const getNumberConstraint = (
  field: MemberFacingField,
  key: "min" | "max" | "minLength" | "maxLength",
) => {
  const validation = field.validation;
  if (!validation) {
    return undefined;
  }

  const value = validation[key];
  return typeof value === "number" ? value : undefined;
};

export const getFieldMicrocopy = (canonicalKey: string) => {
  return fieldMicrocopyByCanonicalKey[normalizeCanonicalKey(canonicalKey)] ?? null;
};

export const getSectionMicrocopy = (sectionKey: string) => {
  return sectionMicrocopyByKey[sectionKey] ?? null;
};

export const toStringArrayValue = (value: FormValue | undefined) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
};

export const normalizeNameForComparison = (value: string) => {
  return value.trim().toLowerCase();
};

export const isNameInList = (value: string, options: string[]) => {
  const normalized = normalizeNameForComparison(value);
  if (!normalized) {
    return false;
  }

  return options.some((option) => normalizeNameForComparison(option) === normalized);
};

export const isSignatureAuthorityMode = (
  value: string,
): value is SignatureAuthorityMode => {
  return (signatureAuthorityModes as readonly string[]).includes(value);
};

export const normalizeSignatureAuthorityMode = (
  value: FormValue | undefined,
): SignatureAuthorityMode | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!isSignatureAuthorityMode(normalized)) {
    return null;
  }

  return normalized;
};

export const getRepeatableAddLabel = (canonicalKey: string) => {
  return repeatableAddLabelByCanonicalKey[normalizeCanonicalKey(canonicalKey)] ?? "Add entry";
};

export const getRepeatablePlaceholder = (canonicalKey: string, index: number) => {
  return (
    repeatablePlaceholderByCanonicalKey[normalizeCanonicalKey(canonicalKey)] ??
    `Entry ${index + 1}`
  );
};

export const isTrusteeListField = (canonicalKey: string) => {
  return normalizeCanonicalKey(canonicalKey) === "trustees";
};

const hasPriorDocumentRowValue = (item: PriorDocumentItem) => {
  return (
    item.documentType.trim().length > 0 ||
    item.documentLabel.trim().length > 0 ||
    item.documentDate.trim().length > 0 ||
    item.attachmentReference.trim().length > 0
  );
};

export const getFilledPriorDocumentRows = (items: PriorDocumentItem[]) => {
  return items.filter((item) => hasPriorDocumentRowValue(item));
};

const hasCompletePriorDocumentRow = (item: PriorDocumentItem) => {
  return (
    item.documentType.trim().length > 0 &&
    item.documentLabel.trim().length > 0 &&
    item.documentDate.trim().length > 0 &&
    item.attachmentReference.trim().length > 0
  );
};

export const getIncompletePriorDocumentRowCount = (items: PriorDocumentItem[]) => {
  return getFilledPriorDocumentRows(items).filter(
    (item) => !hasCompletePriorDocumentRow(item),
  ).length;
};

export const hasOriginatingPriorDocumentType = (item: PriorDocumentItem | undefined) => {
  if (!item) {
    return false;
  }

  return originatingPriorDocumentTypes.has(item.documentType.trim());
};

export const getPriorDocumentChronologyOutOfOrderCount = (
  items: PriorDocumentItem[],
) => {
  const filledRows = getFilledPriorDocumentRows(items).filter((item) =>
    hasCompletePriorDocumentRow(item),
  );
  let previousDate = "";
  let outOfOrderCount = 0;

  for (const item of filledRows) {
    const currentDate = item.documentDate.trim();
    if (!currentDate) {
      continue;
    }

    if (previousDate && currentDate < previousDate) {
      outOfOrderCount += 1;
    }

    previousDate = currentDate;
  }

  return outOfOrderCount;
};

const hasPersonRowValue = (item: PersonListItem) => {
  return (
    item.fullName.trim().length > 0 ||
    item.email.trim().length > 0 ||
    item.phone.trim().length > 0
  );
};

export const getFilledPersonRows = (items: PersonListItem[]) => {
  return items.filter((item) => hasPersonRowValue(item));
};

export const getIncompletePersonRowCount = (items: PersonListItem[]) => {
  const filledRows = getFilledPersonRows(items);
  return filledRows.filter((item) => {
    return (
      item.fullName.trim().length === 0 ||
      item.email.trim().length === 0 ||
      item.phone.trim().length === 0
    );
  }).length;
};

const hasInvalidPersonRowFormat = (item: PersonListItem) => {
  if (!hasPersonRowValue(item)) {
    return false;
  }

  if (!isValidPhoneCountryCode(item.phoneCountryCode)) {
    return true;
  }

  if (!isValidEmailFormat(item.email)) {
    return true;
  }

  if (!isValidPhoneFormat(item.phone)) {
    return true;
  }

  return false;
};

export const getInvalidPersonRowFormatCount = (items: PersonListItem[]) => {
  return getFilledPersonRows(items).filter((item) => hasInvalidPersonRowFormat(item)).length;
};

export const validatePersonContact = (value: FormValue | undefined) => {
  const contact = parsePersonContact(value);

  const missingEmail = contact.email.trim().length === 0;
  const missingPhone = contact.phone.trim().length === 0;
  const invalidEmail = !missingEmail && !isValidEmailFormat(contact.email);
  const invalidPhone = !missingPhone && !isValidPhoneFormat(contact.phone);
  const invalidCountryCode = !isValidPhoneCountryCode(contact.phoneCountryCode);

  return {
    missingEmail,
    missingPhone,
    invalidEmail,
    invalidPhone,
    invalidCountryCode,
  };
};
