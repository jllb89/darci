import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

export type MemberFieldLike = {
  canonical_key: string;
  data_type: "string" | "integer" | "boolean" | "date" | "array" | "object";
  semantic_type: string;
  validation?: Record<string, unknown>;
};

export type FormValue = string | boolean | string[];

export type PriorDocumentItem = {
  chronologyOrder: number;
  documentType: string;
  documentLabel: string;
  documentDate: string;
  attachmentReference: string;
};

export type PersonContact = {
  email: string;
  phoneCountryIso2: string;
  phoneCountryCode: string;
  phone: string;
};

export type PersonListItem = {
  fullName: string;
  email: string;
  phoneCountryIso2: string;
  phoneCountryCode: string;
  phone: string;
  isSigningTrustee: boolean;
};

export type PhoneCountryOption = {
  countryIso2: string;
  code: string;
  flag: string;
  label: string;
};

const regionNameFormatter =
  typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

const toCountryFlagEmoji = (countryIso2: string) => {
  if (!/^[A-Z]{2}$/.test(countryIso2)) {
    return "";
  }

  return countryIso2
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
};

const toCountryName = (countryIso2: CountryCode) => {
  const resolved = regionNameFormatter?.of(countryIso2);
  if (typeof resolved === "string" && resolved.trim().length > 0) {
    return resolved;
  }

  return countryIso2;
};

const buildPhoneCountryOptions = (): PhoneCountryOption[] => {
  const options = getCountries().map((countryIso2) => {
    const code = `+${getCountryCallingCode(countryIso2)}`;
    const countryName = toCountryName(countryIso2);
    const flag = toCountryFlagEmoji(countryIso2);

    return {
      countryIso2,
      code,
      flag,
      label: `${flag} ${countryName} (${code})`,
    };
  });

  options.sort((left, right) => {
    if (left.countryIso2 === "US") {
      return -1;
    }

    if (right.countryIso2 === "US") {
      return 1;
    }

    const byLabel = left.label.localeCompare(right.label);
    if (byLabel !== 0) {
      return byLabel;
    }

    return left.countryIso2.localeCompare(right.countryIso2);
  });

  return options;
};

export const PHONE_COUNTRY_CODE_OPTIONS = buildPhoneCountryOptions();

const phoneCountryOptionByIso2 = new Map(
  PHONE_COUNTRY_CODE_OPTIONS.map((option) => [option.countryIso2, option]),
);

const phoneCountryOptionByCode = new Map<string, PhoneCountryOption>();
for (const option of PHONE_COUNTRY_CODE_OPTIONS) {
  if (!phoneCountryOptionByCode.has(option.code)) {
    phoneCountryOptionByCode.set(option.code, option);
  }
}

const usPhoneCountryOption = phoneCountryOptionByIso2.get("US");

export const DEFAULT_PHONE_COUNTRY_ISO2 =
  usPhoneCountryOption?.countryIso2 ??
  PHONE_COUNTRY_CODE_OPTIONS[0]?.countryIso2 ??
  "US";

export const DEFAULT_PHONE_COUNTRY_CODE =
  usPhoneCountryOption?.code ?? PHONE_COUNTRY_CODE_OPTIONS[0]?.code ?? "+1";

const getPhoneCountryOptionFromIso2 = (value: string) => {
  return phoneCountryOptionByIso2.get(value.trim().toUpperCase());
};

const getPhoneCountryOptionFromDialCode = (value: string) => {
  return phoneCountryOptionByCode.get(value.trim());
};

export const getPhoneCountryCodeByIso2 = (value: string): string => {
  return getPhoneCountryOptionFromIso2(value)?.code ?? DEFAULT_PHONE_COUNTRY_CODE;
};

const normalizePhoneCountryIso2 = (
  value: unknown,
  fallbackDialCode?: string,
): string => {
  if (typeof value === "string") {
    const optionFromIso2 = getPhoneCountryOptionFromIso2(value);
    if (optionFromIso2) {
      return optionFromIso2.countryIso2;
    }
  }

  if (typeof fallbackDialCode === "string") {
    const optionFromDialCode = getPhoneCountryOptionFromDialCode(fallbackDialCode);
    if (optionFromDialCode) {
      return optionFromDialCode.countryIso2;
    }
  }

  return DEFAULT_PHONE_COUNTRY_ISO2;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizePhoneDigits = (value: string) => {
  return value.replace(/\D/g, "");
};

export const isValidEmailFormat = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return emailPattern.test(trimmed);
};

export const isValidPhoneCountryCode = (value: string): boolean => {
  return phoneCountryOptionByCode.has(value.trim());
};

export const isValidPhoneFormat = (value: string): boolean => {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 7 && digits.length <= 15;
};

export type MemberFieldControlKind =
  | "boolean"
  | "number"
  | "date"
  | "person-contact"
  | "select"
  | "checkbox-multi"
  | "repeatable-person-list"
  | "repeatable-text-list"
  | "repeatable-document-list"
  | "file-upload"
  | "textarea"
  | "text"
  | "object-placeholder";

const personContactFieldKeys = new Set([
  "principal_contact",
  "agent_contact",
]);

const structuredPersonListKeys = new Set([
  "grantors",
  "trustees",
  "successor_trustees",
]);

const repeatableTextListKeys = new Set([
  "successor_agents",
  "successor_agent_list",
]);

const uploadArtifactFieldKeys = new Set([
  "uploaded_document_file",
  "supporting_document_file",
  "trust_document_file",
]);

const temporarilyHiddenCreateFlowFieldKeys = new Set([
  // Create flow keeps a single general documents uploader in the right column.
  "restatement_context_type",
  "uploaded_document_file",
  "supporting_document_file",
  "trust_document_file",
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const normalizeCanonicalKey = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

export const isUploadArtifactField = (field: MemberFieldLike) => {
  return uploadArtifactFieldKeys.has(normalizeCanonicalKey(field.canonical_key));
};

export const isTemporarilyHiddenCreateFlowField = (canonicalKey: string) => {
  return temporarilyHiddenCreateFlowFieldKeys.has(normalizeCanonicalKey(canonicalKey));
};

export const isPersonContactField = (field: MemberFieldLike) => {
  return personContactFieldKeys.has(normalizeCanonicalKey(field.canonical_key));
};

export const isStructuredPersonListField = (field: MemberFieldLike) => {
  if (field.data_type !== "array") {
    return false;
  }

  return structuredPersonListKeys.has(normalizeCanonicalKey(field.canonical_key));
};

export const isRepeatableTextListField = (field: MemberFieldLike) => {
  if (field.data_type !== "array") {
    return false;
  }

  const normalizedKey = normalizeCanonicalKey(field.canonical_key);
  if (repeatableTextListKeys.has(normalizedKey)) {
    return true;
  }

  return field.semantic_type === "person_list";
};

export const isPriorDocumentItemsField = (field: MemberFieldLike) => {
  // Kept for dedicated documents-to-include handling in create flow.
  return normalizeCanonicalKey(field.canonical_key) === "prior_document_items";
};

export const getMemberFieldControlKind = (
  field: MemberFieldLike,
  allowedValues: string[],
): MemberFieldControlKind => {
  if (field.data_type === "boolean") {
    return "boolean";
  }

  if (field.data_type === "integer") {
    return "number";
  }

  if (field.data_type === "date") {
    return "date";
  }

  if (isPersonContactField(field)) {
    return "person-contact";
  }

  if (field.data_type === "object") {
    return isUploadArtifactField(field) ? "file-upload" : "object-placeholder";
  }

  if (isStructuredPersonListField(field)) {
    return "repeatable-person-list";
  }

  if (isPriorDocumentItemsField(field)) {
    return "repeatable-document-list";
  }

  if (field.data_type === "array") {
    if (allowedValues.length > 0) {
      return "checkbox-multi";
    }

    return isRepeatableTextListField(field) ? "repeatable-text-list" : "textarea";
  }

  if (allowedValues.length > 0) {
    return "select";
  }

  if (field.semantic_type === "textarea" || field.semantic_type.includes("text")) {
    return "textarea";
  }

  return "text";
};

const toPersonContact = (value: unknown): PersonContact | null => {
  if (!isRecord(value)) {
    return null;
  }

  const phoneCountryIso2 = normalizePhoneCountryIso2(
    value.phoneCountryIso2,
    typeof value.phoneCountryCode === "string" ? value.phoneCountryCode : undefined,
  );

  return {
    email: typeof value.email === "string" ? value.email : "",
    phoneCountryIso2,
    phoneCountryCode: getPhoneCountryCodeByIso2(phoneCountryIso2),
    phone: typeof value.phone === "string" ? value.phone : "",
  };
};

const toPersonListItem = (value: unknown): PersonListItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  const phoneCountryIso2 = normalizePhoneCountryIso2(
    value.phoneCountryIso2,
    typeof value.phoneCountryCode === "string" ? value.phoneCountryCode : undefined,
  );

  return {
    fullName: typeof value.fullName === "string" ? value.fullName : "",
    email: typeof value.email === "string" ? value.email : "",
    phoneCountryIso2,
    phoneCountryCode: getPhoneCountryCodeByIso2(phoneCountryIso2),
    phone: typeof value.phone === "string" ? value.phone : "",
    isSigningTrustee:
      typeof value.isSigningTrustee === "boolean" ? value.isSigningTrustee : false,
  };
};

export const parsePersonContact = (value: FormValue | undefined): PersonContact => {
  if (typeof value !== "string") {
    return {
      email: "",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "",
    };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return {
      email: "",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "",
    };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const contact = toPersonContact(parsed);
    if (contact) {
      return contact;
    }
  } catch {
    // Falls through to legacy single-string handling.
  }

  if (trimmed.includes("@")) {
    return {
      email: trimmed,
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "",
    };
  }

  return {
    email: "",
    phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
    phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
    phone: trimmed,
  };
};

export const serializePersonContact = (value: PersonContact): string => {
  const phoneCountryIso2 = normalizePhoneCountryIso2(
    value.phoneCountryIso2,
    value.phoneCountryCode,
  );

  const nextValue = {
    email: value.email.trim(),
    phoneCountryIso2,
    phoneCountryCode: getPhoneCountryCodeByIso2(phoneCountryIso2),
    phone: value.phone.trim(),
  };

  if (!nextValue.email && !nextValue.phone) {
    return "";
  }

  return JSON.stringify(nextValue);
};

export const parsePersonListItems = (value: FormValue | undefined): PersonListItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: PersonListItem[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    if (!entry.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(entry) as unknown;
      const item = toPersonListItem(parsed);
      if (item) {
        items.push(item);
        continue;
      }
    } catch {
      // Falls through to legacy single-string handling.
    }

    items.push({
      fullName: entry,
      email: "",
      phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
      phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
      phone: "",
      isSigningTrustee: false,
    });
  }

  return items;
};

export const serializePersonListItems = (items: PersonListItem[]): string[] => {
  return items
    .map((item) => {
      const phoneCountryIso2 = normalizePhoneCountryIso2(
        item.phoneCountryIso2,
        item.phoneCountryCode,
      );

      return {
        fullName: item.fullName.trim(),
        email: item.email.trim(),
        phoneCountryIso2,
        phoneCountryCode: getPhoneCountryCodeByIso2(phoneCountryIso2),
        phone: item.phone.trim(),
        isSigningTrustee: Boolean(item.isSigningTrustee),
      };
    })
    .map((item) => JSON.stringify(item));
};

export const hasSigningTrustee = (items: PersonListItem[]): boolean => {
  return items.some((item) => item.isSigningTrustee);
};

const toPriorDocumentItem = (value: unknown): PriorDocumentItem | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rawChronologyOrder =
    typeof value.chronologyOrder === "number"
      ? value.chronologyOrder
      : typeof value.chronology_order === "number"
        ? value.chronology_order
        : typeof value.chronologyOrder === "string"
          ? Number.parseInt(value.chronologyOrder, 10)
          : typeof value.chronology_order === "string"
            ? Number.parseInt(value.chronology_order, 10)
            : Number.NaN;

  const chronologyOrder =
    Number.isFinite(rawChronologyOrder) && rawChronologyOrder > 0
      ? Math.floor(rawChronologyOrder)
      : 0;

  return {
    chronologyOrder,
    documentType:
      typeof value.documentType === "string"
        ? value.documentType
        : typeof value.document_type === "string"
          ? value.document_type
          : "",
    documentLabel:
      typeof value.documentLabel === "string"
        ? value.documentLabel
        : typeof value.title === "string"
          ? value.title
          : "",
    documentDate:
      typeof value.documentDate === "string"
        ? value.documentDate
        : typeof value.date === "string"
          ? value.date
          : "",
    attachmentReference:
      typeof value.attachmentReference === "string"
        ? value.attachmentReference
        : typeof value.attachment_reference === "string"
          ? value.attachment_reference
          : typeof value.recording_reference === "string"
            ? value.recording_reference
            : "",
  };
};

export const parsePriorDocumentItems = (value: FormValue | undefined): PriorDocumentItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const items: PriorDocumentItem[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    if (!entry.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(entry) as unknown;
      const item = toPriorDocumentItem(parsed);
      if (item) {
        items.push({
          ...item,
          chronologyOrder: item.chronologyOrder > 0 ? item.chronologyOrder : items.length + 1,
        });
        continue;
      }
    } catch {
      // Falls through to legacy single-string handling.
    }

    items.push({
      chronologyOrder: items.length + 1,
      documentType: "",
      documentLabel: entry,
      documentDate: "",
      attachmentReference: "",
    });
  }

  return items
    .sort((left, right) => left.chronologyOrder - right.chronologyOrder)
    .map((item, index) => ({
      ...item,
      chronologyOrder: index + 1,
    }));
};

export const serializePriorDocumentItems = (items: PriorDocumentItem[]): string[] => {
  return items
    .map((item, index) => {
      const documentType = item.documentType.trim();
      const documentLabel = item.documentLabel.trim();
      const documentDate = item.documentDate;
      const attachmentReference = item.attachmentReference.trim();

      return {
        chronology_order: index + 1,
        document_type: documentType,
        title: documentLabel,
        date: documentDate,
        recording_reference: attachmentReference,
        documentType,
        documentLabel,
        documentDate,
        attachmentReference,
      };
    })
    .filter((item) => {
      return (
        item.document_type.length > 0 ||
        item.title.length > 0 ||
        item.date.length > 0 ||
        item.recording_reference.length > 0
      );
    })
    .map((item) => JSON.stringify(item));
};
