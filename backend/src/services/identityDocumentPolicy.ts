export const identityDocumentPolicyVersion = "identity_document_v1";

export const identityDocumentTypeValues = [
  "state_driver_license",
  "state_identification_card",
  "passport",
  "passport_card",
  "military_id",
  "permanent_resident_card",
  "tribal_identification_card",
  "foreign_passport",
] as const;

export type IdentityDocumentType = (typeof identityDocumentTypeValues)[number];

const identityDocumentTypeLabels: Record<IdentityDocumentType, string> = {
  state_driver_license: "State driver license",
  state_identification_card: "State identification card",
  passport: "Passport",
  passport_card: "Passport card",
  military_id: "Military ID",
  permanent_resident_card: "Permanent resident card",
  tribal_identification_card: "Tribal identification card",
  foreign_passport: "Foreign passport",
};

export type IdentityDocumentPolicyInput = {
  documentType?: string | null | undefined;
  documentLast4?: string | null | undefined;
  documentNumberTail?: string | null | undefined;
  maskedIdentifier?: string | null | undefined;
  issuingJurisdiction?: string | null | undefined;
  documentExpirationDate?: string | null | undefined;
  evidenceArtifactIds?: string[] | null | undefined;
};

export type NormalizedIdentityDocument = {
  documentType: IdentityDocumentType;
  documentLabel: string;
  documentNumberTail: string | null;
  maskedIdentifier: string | null;
  issuingJurisdiction: string;
  documentExpirationDate: string;
  evidenceArtifactIds: string[];
};

export type IdentityDocumentValidationResult =
  | { ok: true; value: NormalizedIdentityDocument }
  | { ok: false; message: string; field: string };

const isIdentityDocumentType = (value: string): value is IdentityDocumentType => {
  return identityDocumentTypeValues.includes(value as IdentityDocumentType);
};

const normalizeOptionalText = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizeEvidenceArtifactIds = (value: string[] | null | undefined) => {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
};

const isValidCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [year, month, day] = parts as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

export const validateIdentityDocument = (
  input: IdentityDocumentPolicyInput,
): IdentityDocumentValidationResult => {
  const rawDocumentType = normalizeOptionalText(input.documentType);
  if (!rawDocumentType || !isIdentityDocumentType(rawDocumentType)) {
    return {
      ok: false,
      field: "documentType",
      message: "Select an official identity document type",
    };
  }

  const issuingJurisdiction = normalizeOptionalText(input.issuingJurisdiction);
  if (!issuingJurisdiction) {
    return {
      ok: false,
      field: "issuingJurisdiction",
      message: "Issuing jurisdiction is required",
    };
  }

  const documentExpirationDate = normalizeOptionalText(input.documentExpirationDate);
  if (!documentExpirationDate || !isValidCalendarDate(documentExpirationDate)) {
    return {
      ok: false,
      field: "documentExpirationDate",
      message: "Expiration date must use YYYY-MM-DD",
    };
  }

  const documentNumberTail = normalizeOptionalText(
    input.documentNumberTail ?? input.documentLast4,
  )?.toUpperCase() ?? null;
  const maskedIdentifier = normalizeOptionalText(input.maskedIdentifier)?.toUpperCase() ?? null;

  if (documentNumberTail && !/^[A-Z0-9]{2,4}$/.test(documentNumberTail)) {
    return {
      ok: false,
      field: "documentNumberTail",
      message: "Document number tail must be 2 to 4 letters or numbers",
    };
  }

  if (maskedIdentifier && (!/^[A-Z0-9*X\-\s]{4,64}$/.test(maskedIdentifier) || !/[X*]/.test(maskedIdentifier))) {
    return {
      ok: false,
      field: "maskedIdentifier",
      message: "Masked identifier must hide most digits with X or *",
    };
  }

  if (!documentNumberTail && !maskedIdentifier) {
    return {
      ok: false,
      field: "documentNumberTail",
      message: "Record either the document number tail or a masked identifier",
    };
  }

  return {
    ok: true,
    value: {
      documentType: rawDocumentType,
      documentLabel: identityDocumentTypeLabels[rawDocumentType],
      documentNumberTail,
      maskedIdentifier,
      issuingJurisdiction,
      documentExpirationDate,
      evidenceArtifactIds: normalizeEvidenceArtifactIds(input.evidenceArtifactIds),
    },
  };
};