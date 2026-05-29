import type { MemberFormRulesContract } from "./memberFormRulesService";

export type MemberFormSubmissionValue = string | boolean | string[];

export type MemberFormValidationError = {
  code: string;
  field?: string;
  message: string;
};

export type MemberFormValidationResult = {
  valid: boolean;
  errors: MemberFormValidationError[];
};

type MemberFacingField = MemberFormRulesContract["aggregatedForm"]["sections"][number]["fields"][number];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type TrusteeRow = {
  fullName: string;
  isSigningTrustee: boolean;
  email: string | null;
};

type PriorDocumentRow = {
  documentType: string;
  title: string;
  date: string;
  recordingReference: string;
  chronologyOrder: number;
};

type SignatureAuthorityMode =
  | "all_trustees"
  | "any_one_trustee"
  | "named_signing_trustee"
  | "custom";

const normalizeCanonicalKey = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const normalizeNameForComparison = (value: string) => {
  return value.trim().toLowerCase();
};

const isNameInList = (value: string, options: string[]) => {
  const normalized = normalizeNameForComparison(value);
  if (!normalized) {
    return false;
  }

  return options.some((option) => normalizeNameForComparison(option) === normalized);
};

const toStringArray = (value: MemberFormSubmissionValue | undefined) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const tryExtractSerializedName = (value: string) => {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!isRecord(parsed)) {
      return value.trim();
    }

    const fullName = parsed.fullName;
    if (typeof fullName === "string" && fullName.trim().length > 0) {
      return fullName.trim();
    }

    const name = parsed.name;
    if (typeof name === "string" && name.trim().length > 0) {
      return name.trim();
    }

    const displayName = parsed.displayName;
    if (typeof displayName === "string" && displayName.trim().length > 0) {
      return displayName.trim();
    }
  } catch {
    return value.trim();
  }

  return value.trim();
};

const extractNameList = (value: MemberFormSubmissionValue | undefined) => {
  const uniqueNames: string[] = [];
  const seen = new Set<string>();

  for (const entry of toStringArray(value)) {
    const candidate = tryExtractSerializedName(entry);
    if (!candidate) {
      continue;
    }

    const normalized = normalizeNameForComparison(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    uniqueNames.push(candidate);
  }

  return uniqueNames;
};

const extractTrusteeRows = (value: MemberFormSubmissionValue | undefined) => {
  const rows: TrusteeRow[] = [];

  for (const entry of toStringArray(value)) {
    let fallbackName = entry;

    try {
      const parsed = JSON.parse(entry) as unknown;
      if (isRecord(parsed)) {
        const fullName =
          typeof parsed.fullName === "string" ? parsed.fullName.trim() : "";
        const isSigningTrustee = parsed.isSigningTrustee === true;
        const email =
          typeof parsed.email === "string" && emailPattern.test(parsed.email.trim())
            ? parsed.email.trim()
            : null;

        fallbackName = fullName || fallbackName;
        rows.push({
          fullName: fallbackName,
          isSigningTrustee,
          email,
        });
        continue;
      }
    } catch {
      // Falls through to legacy string parsing.
    }

    rows.push({
      fullName: fallbackName,
      isSigningTrustee: false,
      email: null,
    });
  }

  return rows;
};

const extractEmailFromContactValue = (value: MemberFormSubmissionValue | undefined) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (emailPattern.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const email = parsed.email;
    if (typeof email === "string" && emailPattern.test(email.trim())) {
      return email.trim();
    }
  } catch {
    return null;
  }

  return null;
};

const parsePositiveInteger = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

const extractPriorDocumentRows = (value: MemberFormSubmissionValue | undefined) => {
  return toStringArray(value)
    .map((entry, index): PriorDocumentRow => {
      try {
        const parsed = JSON.parse(entry) as unknown;
        if (isRecord(parsed)) {
          return {
            documentType:
              asTrimmedString(parsed.documentType) || asTrimmedString(parsed.document_type),
            title:
              asTrimmedString(parsed.documentLabel) ||
              asTrimmedString(parsed.title) ||
              asTrimmedString(parsed.name),
            date: asTrimmedString(parsed.documentDate) || asTrimmedString(parsed.date),
            recordingReference:
              asTrimmedString(parsed.attachmentReference) ||
              asTrimmedString(parsed.attachment_reference) ||
              asTrimmedString(parsed.recording_reference),
            chronologyOrder:
              parsePositiveInteger(parsed.chronologyOrder ?? parsed.chronology_order) ||
              index + 1,
          };
        }
      } catch {
        // Falls through to legacy single-string handling.
      }

      return {
        documentType: "",
        title: entry.trim(),
        date: "",
        recordingReference: "",
        chronologyOrder: index + 1,
      };
    })
    .sort((left, right) => left.chronologyOrder - right.chronologyOrder);
};

const hasPriorDocumentRowValue = (row: PriorDocumentRow) => {
  return (
    row.documentType.length > 0 ||
    row.title.length > 0 ||
    row.date.length > 0 ||
    row.recordingReference.length > 0
  );
};

const isPriorDocumentRowComplete = (row: PriorDocumentRow) => {
  return (
    row.documentType.length > 0 &&
    row.title.length > 0 &&
    row.date.length > 0 &&
    row.recordingReference.length > 0
  );
};

const countPriorDocumentChronologyErrors = (rows: PriorDocumentRow[]) => {
  let previousDate = "";
  let errorCount = 0;

  for (const row of rows.filter(isPriorDocumentRowComplete)) {
    if (previousDate && row.date < previousDate) {
      errorCount += 1;
    }

    previousDate = row.date;
  }

  return errorCount;
};

const flattenMemberFields = (contract: MemberFormRulesContract) => {
  return contract.aggregatedForm.sections.flatMap((section) => section.fields);
};

const MANDATORY_CONTACT_LIST_KEYS = new Set(["grantors", "trustees", "successor_trustees"]);
const MANDATORY_CONTACT_VALUE_KEYS = new Set(["principal_contact", "agent_contact"]);
const ORIGINATING_PRIOR_DOCUMENT_TYPES = new Set(["trust_agreement", "declaration_of_trust"]);
const MAX_TRUSTMAKER_COUNT = 2;

const asTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const getFieldByCanonicalKey = (
  contract: MemberFormRulesContract,
  canonicalKey: string,
): MemberFacingField | undefined => {
  return contract.aggregatedForm.sections
    .flatMap((section) => section.fields)
    .find((field) => normalizeCanonicalKey(field.canonical_key) === canonicalKey);
};

const getValidationString = (field: MemberFacingField, key: string) => {
  const validation = field.validation;
  if (!validation) {
    return null;
  }

  const value = validation[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const getValidationBoolean = (field: MemberFacingField, key: string) => {
  const validation = field.validation;
  if (!validation) {
    return false;
  }

  return validation[key] === true;
};

const SIGNATURE_AUTHORITY_MODE_VALUES: SignatureAuthorityMode[] = [
  "all_trustees",
  "any_one_trustee",
  "named_signing_trustee",
  "custom",
];

const SIGNATURE_AUTHORITY_MODE_SET = new Set<string>(
  SIGNATURE_AUTHORITY_MODE_VALUES,
);

const normalizeStructuredSignatureAuthorityMode = (
  value: string,
): SignatureAuthorityMode | null => {
  const normalized = value.trim().toLowerCase();
  if (!SIGNATURE_AUTHORITY_MODE_SET.has(normalized)) {
    return null;
  }

  return normalized as SignatureAuthorityMode;
};

const resolveSignatureAuthorityMode = (
  selectedAuthority: string,
  trusteeNames: string[],
): {
  mode: SignatureAuthorityMode | null;
  isLegacyNamedSigner: boolean;
} => {
  const structuredMode = normalizeStructuredSignatureAuthorityMode(selectedAuthority);
  if (structuredMode) {
    return {
      mode: structuredMode,
      isLegacyNamedSigner: false,
    };
  }

  if (selectedAuthority.length > 0 && isNameInList(selectedAuthority, trusteeNames)) {
    return {
      mode: "named_signing_trustee",
      isLegacyNamedSigner: true,
    };
  }

  return {
    mode: null,
    isLegacyNamedSigner: false,
  };
};

export const validateMemberFormSubmission = (
  contract: MemberFormRulesContract,
  formValues: Record<string, MemberFormSubmissionValue>,
): MemberFormValidationResult => {
  const errors: MemberFormValidationError[] = [];

  for (const field of flattenMemberFields(contract)) {
    const canonicalKey = normalizeCanonicalKey(field.canonical_key);
    if (!field.required) {
      continue;
    }

    if (MANDATORY_CONTACT_VALUE_KEYS.has(canonicalKey)) {
      const email = extractEmailFromContactValue(formValues[field.canonical_key]);
      if (!email) {
        errors.push({
          code: `${canonicalKey}_required`,
          field: field.canonical_key,
          message: `Enter a valid email for ${field.label}.`,
        });
      }
      continue;
    }

    if (MANDATORY_CONTACT_LIST_KEYS.has(canonicalKey)) {
      const trustees = extractTrusteeRows(formValues[field.canonical_key]).filter(
        (trustee) => trustee.fullName.trim().length > 0,
      );

      if (trustees.length === 0) {
        errors.push({
          code: `${canonicalKey}_required`,
          field: field.canonical_key,
          message: `Add at least one ${field.label.toLowerCase().replace(/\s+/g, " ")}.`,
        });
        continue;
      }

      const missingEmail = trustees.some((trustee) => !trustee.email);
      if (missingEmail) {
        errors.push({
          code: `${canonicalKey}_contact_email_required`,
          field: field.canonical_key,
          message: `Each ${field.label.toLowerCase()} entry must include a valid email address.`,
        });
      }

      if (canonicalKey === "grantors") {
        if (trustees.length > MAX_TRUSTMAKER_COUNT) {
          errors.push({
            code: "trustmakers_max_two",
            field: field.canonical_key,
            message: "Add no more than two Trustmakers.",
          });
        }

        const emails = trustees
          .map((trustee) => trustee.email?.trim().toLowerCase() ?? "")
          .filter((email) => email.length > 0);
        if (new Set(emails).size !== emails.length) {
          errors.push({
            code: "trustmakers_email_unique",
            field: field.canonical_key,
            message: "Each Trustmaker must use a unique email address.",
          });
        }
      }
    }

    if (canonicalKey === "prior_document_items") {
      const rows = extractPriorDocumentRows(formValues[field.canonical_key]);
      const filledRows = rows.filter(hasPriorDocumentRowValue);

      if (filledRows.length === 0) {
        errors.push({
          code: "prior_document_items_required",
          field: field.canonical_key,
          message: "Add at least one document to include before continuing.",
        });
        continue;
      }

      if (filledRows.some((row) => !isPriorDocumentRowComplete(row))) {
        errors.push({
          code: "prior_document_items_incomplete",
          field: field.canonical_key,
          message:
            "Each document to include must have a type, signed date, document label, and recording or attachment reference.",
        });
      }

      if (!ORIGINATING_PRIOR_DOCUMENT_TYPES.has(filledRows[0]?.documentType ?? "")) {
        errors.push({
          code: "prior_document_items_originating_document_required",
          field: field.canonical_key,
          message: "Document 1 must be a Trust Agreement or Declaration of Trust.",
        });
      }

      if (countPriorDocumentChronologyErrors(filledRows) > 0) {
        errors.push({
          code: "prior_document_items_chronology_order",
          field: field.canonical_key,
          message: "Documents to include must be listed in chronological order from oldest to newest.",
        });
      }
    }
  }

  if (!contract.families.includes("trust")) {
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  const taxIdOwnerField = getFieldByCanonicalKey(contract, "tax_id_owner");

  if (taxIdOwnerField) {
    const selectionSourceField = getValidationString(
      taxIdOwnerField,
      "selection_source_field",
    );
    const enforceSourceSelectionWhenMultiple = getValidationBoolean(
      taxIdOwnerField,
      "enforce_source_selection_when_multiple",
    );

    if (selectionSourceField && enforceSourceSelectionWhenMultiple) {
      const sourceNames = extractNameList(formValues[selectionSourceField]);
      const selectedTaxIdOwner =
        typeof formValues.tax_id_owner === "string"
          ? formValues.tax_id_owner.trim()
          : "";

      if (sourceNames.length > 1 && selectedTaxIdOwner.length === 0) {
        errors.push({
          code: "trust_tax_id_owner_required",
          field: "tax_id_owner",
          message:
            "Select a primary tax ID owner from the entered Trustmakers when multiple Trustmakers are listed.",
        });
      }

      if (
        sourceNames.length > 1 &&
        selectedTaxIdOwner.length > 0 &&
        !isNameInList(selectedTaxIdOwner, sourceNames)
      ) {
        errors.push({
          code: "trust_tax_id_owner_not_in_source_list",
          field: "tax_id_owner",
          message:
            "Primary tax ID owner must match one of the entered Trustmakers.",
        });
      }
    }
  }

  const trusteesField = getFieldByCanonicalKey(contract, "trustees");
  const trusteeSignatureAuthorityField = getFieldByCanonicalKey(
    contract,
    "trustee_signature_authority",
  );

  if (trusteesField && trusteeSignatureAuthorityField) {
    const trustees = extractTrusteeRows(formValues.trustees).filter(
      (trustee) => trustee.fullName.trim().length > 0,
    );

    if (trustees.length > 0) {
      const selectedAuthority =
        typeof formValues.trustee_signature_authority === "string"
          ? formValues.trustee_signature_authority.trim()
          : "";
      const customAuthorityText =
        typeof formValues.trustee_signature_authority_custom_text === "string"
          ? formValues.trustee_signature_authority_custom_text.trim()
          : "";

      const trusteeNames = trustees.map((trustee) => trustee.fullName);
      const signingTrustees = trustees.filter((trustee) => trustee.isSigningTrustee);

      if (selectedAuthority.length === 0) {
        errors.push({
          code: "trust_signature_authority_required",
          field: "trustee_signature_authority",
          message:
            "Select a trustee signature authority rule before continuing.",
        });
      }

      const { mode: signatureAuthorityMode, isLegacyNamedSigner } =
        resolveSignatureAuthorityMode(selectedAuthority, trusteeNames);

      if (selectedAuthority.length > 0 && !signatureAuthorityMode) {
        errors.push({
          code: "trust_signature_authority_invalid_mode",
          field: "trustee_signature_authority",
          message:
            "Trustee signature authority must be one of: all trustees, any one trustee, named signing trustee, or custom.",
        });
      }

      if (signatureAuthorityMode === "named_signing_trustee") {
        if (signingTrustees.length === 0) {
          errors.push({
            code: "trust_named_signing_trustee_required",
            field: "trustees",
            message:
              "Select one trustee as the named signing trustee when named signing authority is selected.",
          });
        }

        if (signingTrustees.length > 1) {
          errors.push({
            code: "trust_named_signing_trustee_multiple",
            field: "trustees",
            message:
              "Select only one named signing trustee.",
          });
        }

        if (isLegacyNamedSigner && signingTrustees.length === 1) {
          const selectedTrusteeName = signingTrustees[0]?.fullName ?? "";

          if (
            selectedTrusteeName.length > 0 &&
            !isNameInList(selectedAuthority, [selectedTrusteeName])
          ) {
            errors.push({
              code: "trust_named_signing_trustee_inconsistent",
              field: "trustee_signature_authority",
              message:
                "Named signing trustee must match the trustee row marked to sign.",
            });
          }
        }
      }

      if (
        signatureAuthorityMode &&
        signatureAuthorityMode !== "named_signing_trustee" &&
        signingTrustees.length > 0
      ) {
        errors.push({
          code: "trust_named_signing_trustee_mode_conflict",
          field: "trustees",
          message:
            "A named signing trustee can only be selected when signature authority is set to named signing trustee.",
        });
      }

      if (signatureAuthorityMode === "custom") {
        if (customAuthorityText.length === 0) {
          errors.push({
            code: "trust_custom_signing_authority_required",
            field: "trustee_signature_authority_custom_text",
            message:
              "Enter custom signing authority instructions when custom signature authority is selected.",
          });
        }

        if (customAuthorityText.length > 0 && customAuthorityText.length < 5) {
          errors.push({
            code: "trust_custom_signing_authority_too_short",
            field: "trustee_signature_authority_custom_text",
            message:
              "Custom signing authority instructions must be at least 5 characters.",
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
