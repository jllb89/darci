import {
  deriveInputRequirements,
  type TrustInputRequirementsContract,
} from "./inputRequirements";
import {
  trustDocumentTypes,
  type TrustDocumentType,
  type TrustRequirementRecord,
} from "./trustService";

const normalizeTrustDocumentType = (input: string): TrustDocumentType => {
  if ((trustDocumentTypes as readonly string[]).includes(input)) {
    return input as TrustDocumentType;
  }

  return "rrr";
};

export const deriveTrustInputRequirements = (
  record: TrustRequirementRecord,
): TrustInputRequirementsContract => {
  const documentType = normalizeTrustDocumentType(record.document_type);

  return deriveInputRequirements({
    family: "trust",
    documentType,
    record,
  }) as TrustInputRequirementsContract;
};
