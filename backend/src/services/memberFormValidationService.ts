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

type TrusteeRow = {
  fullName: string;
  isSigningTrustee: boolean;
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

        fallbackName = fullName || fallbackName;
        rows.push({
          fullName: fallbackName,
          isSigningTrustee,
        });
        continue;
      }
    } catch {
      // Falls through to legacy string parsing.
    }

    rows.push({
      fullName: fallbackName,
      isSigningTrustee: false,
    });
  }

  return rows;
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

  if (!contract.families.includes("trust")) {
    return {
      valid: true,
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
