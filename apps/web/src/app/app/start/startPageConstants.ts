import type { FieldFamilyScope } from "@/app/app/start/memberFormRuntime";
import type {
  FormStep,
  MemberFacingSectionKey,
  ProductFlowModeKey,
  SignatureAuthorityMode,
} from "@/app/app/start/startPageTypes";

export const productFlowModeKeys = [
  "poa_only",
  "trust_bundle",
  "notarize_document",
] as const satisfies readonly ProductFlowModeKey[];

export const START_FORM_DRAFT_STORAGE_KEY_PREFIX = "darci:start-form-draft:v1";

export const productFlowStepLabels: Record<FormStep, string> = {
  general_information: "General Information",
  poa_requirements: "POA Requirements",
  trust_requirements: "Trust Requirements",
};

export const productFlowStepSectionKeys: Record<FormStep, MemberFacingSectionKey[]> = {
  general_information: ["basic_info"],
  poa_requirements: ["people", "authority", "execution"],
  trust_requirements: ["basic_info", "people", "authority", "advanced"],
};

export const productFlowStepFamilyScopes: Record<FormStep, FieldFamilyScope[]> = {
  general_information: ["shared", "poa", "trust", "unknown"],
  poa_requirements: ["shared", "poa", "unknown"],
  trust_requirements: ["shared", "trust", "unknown"],
};

export const productFlowStepOrderByMode: Record<ProductFlowModeKey, FormStep[]> = {
  poa_only: ["general_information", "poa_requirements"],
  trust_bundle: ["trust_requirements", "poa_requirements"],
  notarize_document: ["general_information"],
};

export const productFlowUploadDefaultsByMode: Record<
  ProductFlowModeKey,
  {
    showUploadColumn: boolean;
    uploadRequired: boolean;
  }
> = {
  poa_only: {
    showUploadColumn: false,
    uploadRequired: false,
  },
  trust_bundle: {
    showUploadColumn: true,
    uploadRequired: false,
  },
  notarize_document: {
    showUploadColumn: false,
    uploadRequired: false,
  },
};

export const productFlowModesWithoutDocumentsColumn = new Set<ProductFlowModeKey>([
  "poa_only",
  "notarize_document",
]);

export const priorDocumentTypeOptions = [
  "trust_agreement",
  "declaration_of_trust",
  "amendment",
  "restatement",
  "schedule_of_assets",
  "affidavit",
  "incapacity_letter",
  "trust_certification",
  "change_of_trustee",
  "power_of_attorney",
  "other",
] as const;

export const fieldMicrocopyByCanonicalKey: Record<string, string> = {
  grantors:
    "Trustmakers are the people who created the trust and own trust assets. They are distinct from Trustees.",
  trustees:
    "Trustees manage trust assets. Add all currently acting trustees and their contact details.",
  trustee_signature_authority:
    "Select whether all trustees must sign, any one trustee may sign, a named trustee will sign, or custom signing language applies.",
  trustee_signature_authority_custom_text:
    "Provide exact custom signing language when the standard trustee signing options do not apply.",
  agent_signature_authority:
    "If multiple agents are designated, choose whether they must act jointly or if any one agent may act separately.",
  tax_id_owner:
    "If more than one Trustmaker is listed, choose which Trustmaker's tax ID is primary.",
  restatement_context_type:
    "Pick the option that best describes this filing so we can request the right supporting records.",
  prior_document_items:
    "List each trust document in chronological order. Document 1 must be the originating trust agreement or declaration, followed by amendments and supporting records.",
  trustee_powers:
    "Select every authority that should appear in the trustee powers section.",
  revocation_holders:
    "Choose who has revocation authority under the trust terms.",
  revocation_holders_custom_text:
    "Describe the exact revocation language if the standard options do not match.",
  special_instructions_text:
    "Keep this concise and directive. These instructions are copied into the final document package.",
};

export const sectionMicrocopyByKey: Record<string, string> = {
  basic_info: "Start with your core details so your document is prepared correctly.",
  people: "List parties in execution order. Add each person as a separate row.",
  authority: "Confirm who may act, revoke, and sign. Trust-specific authority appears first.",
  execution: "Execution preferences for signatures, dates, and witness handling.",
  documents: "List documents to include and any supporting uploads needed for this filing.",
  advanced: "Optional edge-case inputs. Leave blank unless your case explicitly requires them.",
};

export const signatureAuthorityModes = [
  "all_trustees",
  "any_one_trustee",
  "named_signing_trustee",
  "custom",
] as const satisfies readonly SignatureAuthorityMode[];

export const repeatableAddLabelByCanonicalKey: Record<string, string> = {
  grantors: "Add trustmaker",
  successor_agents: "Add successor agent",
  successor_agent_list: "Add successor agent",
};

export const repeatablePlaceholderByCanonicalKey: Record<string, string> = {
  grantors: "Trustmaker name",
  successor_agents: "Successor agent name",
  successor_agent_list: "Successor agent name",
};

export const originatingPriorDocumentTypes = new Set([
  "trust_agreement",
  "declaration_of_trust",
]);
