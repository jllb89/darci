import {
  deriveInputRequirements,
  type IdnInputRequirementsContract,
} from "./inputRequirements";
import {
  idnDocumentTypes,
  type IdnDocumentType,
  type IdnRequirementRecord,
} from "./idnService";

const normalizeIdnDocumentType = (input: string): IdnDocumentType => {
  if ((idnDocumentTypes as readonly string[]).includes(input)) {
    return input as IdnDocumentType;
  }

  return "acknowledgment";
};

export const deriveIdnInputRequirements = (
  record: IdnRequirementRecord,
): IdnInputRequirementsContract => {
  const documentType = normalizeIdnDocumentType(record.document_type);

  return deriveInputRequirements({
    family: "idn",
    documentType,
    record,
  }) as IdnInputRequirementsContract;
};
