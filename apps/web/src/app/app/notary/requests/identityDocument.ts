export const identityDocumentOptions = [
  {
    value: "state_driver_license",
    label: "State driver license",
    jurisdictionLabel: "Issuing state",
    identifierLabel: "License tail",
  },
  {
    value: "state_identification_card",
    label: "State identification card",
    jurisdictionLabel: "Issuing state",
    identifierLabel: "ID tail",
  },
  {
    value: "passport",
    label: "Passport",
    jurisdictionLabel: "Issuing country",
    identifierLabel: "Passport number",
  },
  {
    value: "passport_card",
    label: "Passport card",
    jurisdictionLabel: "Issuing country",
    identifierLabel: "Passport card number",
  },
  {
    value: "military_id",
    label: "Military ID",
    jurisdictionLabel: "Issuing authority",
    identifierLabel: "ID tail",
  },
  {
    value: "permanent_resident_card",
    label: "Permanent resident card",
    jurisdictionLabel: "Issuing country",
    identifierLabel: "Card tail",
  },
  {
    value: "tribal_identification_card",
    label: "Tribal identification card",
    jurisdictionLabel: "Issuing tribe or jurisdiction",
    identifierLabel: "ID tail",
  },
  {
    value: "foreign_passport",
    label: "Foreign passport",
    jurisdictionLabel: "Issuing country",
    identifierLabel: "Passport number",
  },
] as const;

export type IdentityDocumentType = (typeof identityDocumentOptions)[number]["value"];

export type IdentityDocumentFormState = {
  documentType: string;
  issuingJurisdiction: string;
  documentExpirationDate: string;
  documentNumberTail: string;
  maskedIdentifier: string;
};

export const defaultIdentityDocumentType: IdentityDocumentType = "state_driver_license";

export const getIdentityDocumentOption = (documentType: string) => {
  return identityDocumentOptions.find((option) => option.value === documentType) ?? identityDocumentOptions[0];
};

export const parseEvidenceArtifactIds = (value: string) => {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
};

const hasValidCalendarDateFormat = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());

export const validateIdentityDocumentForm = (state: IdentityDocumentFormState) => {
  const errors: Partial<Record<keyof IdentityDocumentFormState, string>> = {};

  if (!identityDocumentOptions.some((option) => option.value === state.documentType)) {
    errors.documentType = "Select an official identity document type.";
  }

  if (!state.issuingJurisdiction.trim()) {
    errors.issuingJurisdiction = "Issuing jurisdiction is required.";
  }

  if (!hasValidCalendarDateFormat(state.documentExpirationDate)) {
    errors.documentExpirationDate = "Expiration date must use YYYY-MM-DD.";
  }

  const tail = state.documentNumberTail.trim();
  const maskedIdentifier = state.maskedIdentifier.trim();
  if (tail && !/^[A-Za-z0-9]{2,4}$/.test(tail)) {
    errors.documentNumberTail = "Document number tail must be 2 to 4 letters or numbers.";
  }

  if (maskedIdentifier && !/^[A-Za-z0-9\-\s]{4,64}$/.test(maskedIdentifier)) {
    errors.maskedIdentifier = "Document number must be 4 to 64 letters, numbers, spaces, or hyphens.";
  }

  if (!tail && !maskedIdentifier) {
    errors.documentNumberTail = "Record a document number tail or masked identifier.";
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    firstError: Object.values(errors)[0] ?? null,
  };
};