import type { MemberFormFamily } from "@/app/app/start/memberFormRuntime";

export type JurisdictionOption = {
  code: string;
  label: string;
};

export type ProductFlowModeKey =
  | "poa_only"
  | "trust_bundle"
  | "notarize_document";

export type ProductFlowModeDefinition = {
  modeKey: ProductFlowModeKey;
  displayName: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  families: Array<{
    family: MemberFormFamily;
    defaultDocumentType: string;
    isRequired: boolean;
    sortOrder: number;
  }>;
  outputs: Array<{
    outputKey: string;
    outputLabel: string;
    isRequired: boolean;
    sortOrder: number;
    metadata: Record<string, unknown>;
  }>;
  ui: Array<{
    groupKey: string;
    layoutMode: "single-column" | "two-column" | "wizard-step";
    showUploadColumn: boolean;
    uploadRequired: boolean;
    sortOrder: number;
    metadata: Record<string, unknown>;
  }>;
};

export type ConditionOperator =
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

export type MemberFacingUiGroup =
  | "basic_info"
  | "people"
  | "authority"
  | "execution"
  | "documents"
  | "advanced";

export type MemberFacingSectionKey = MemberFacingUiGroup;

export type MemberFacingField = {
  canonical_key: string;
  label: string;
  semantic_type: string;
  data_type: "string" | "integer" | "boolean" | "date" | "array" | "object";
  required: boolean;
  repeatable: boolean;
  help_text?: string;
  validation?: Record<string, unknown>;
  when?: Condition;
  condition_merge_mode?: "exact" | "source_only";
  sources: MemberFacingFieldSource[];
  ui_group: MemberFacingUiGroup;
};

export type MemberFacingSection = {
  key: MemberFacingSectionKey;
  title: string;
  fields: MemberFacingField[];
};

export type MemberFacingFormContract = {
  jurisdiction: string;
  families: MemberFormFamily[];
  document_types: string[];
  sections: MemberFacingSection[];
  source_trace: Array<{
    source: string;
    field: string;
    value: string | number | boolean | null;
  }>;
};

export type FamilyContract = {
  family: MemberFormFamily;
  documentType: string;
  inputRequirements: unknown;
  factContext: FactContext;
};

export type SourceConditionContext = {
  family: MemberFormFamily;
  documentType: string;
  sectionKey: string;
  fieldKey: string;
  facts: FactContext;
};

export type MemberFormRulesContract = {
  jurisdiction: string;
  families: MemberFormFamily[];
  documentTypes: string[];
  productFlowMode?: ProductFlowModeDefinition;
  aggregatedForm: MemberFacingFormContract;
  familyContracts: FamilyContract[];
  sourceConditionContexts: SourceConditionContext[];
};

export type MemberFormJurisdictionsPayload = {
  mode?: ProductFlowModeDefinition;
  jurisdictions?: JurisdictionOption[];
  message?: string;
};

export type ProductFlowModesPayload = {
  modes?: ProductFlowModeDefinition[];
  message?: string;
};

export type MemberFormPayload = {
  memberForm?: MemberFormRulesContract;
  message?: string;
  details?: Array<{
    family?: string;
    documentType?: string;
  }>;
};

export type MemberFormValidationResponse = {
  valid?: boolean;
  message?: string;
  errors?: Array<{
    code?: string;
    field?: string;
    message?: string;
  }>;
};
 
export type DocumentSummary = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  productFlowMode?: ProductFlowModeKey;
  selectedFamilies?: string[];
  outputBundle?: Array<Record<string, unknown>>;
  createdAt: string;
};

export type DocumentIntakeDraft = {
  documentId: string;
  ownerId: string;
  productFlowMode: ProductFlowModeKey | string;
  jurisdiction: string;
  currentStep: string | null;
  rulesSnapshotVersion: string;
  answers: Record<string, unknown>;
  canonicalAnswers: Record<string, unknown>;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type DocumentIntakeDraftResponsePayload = {
  draft?: DocumentIntakeDraft | null;
  message?: string;
  currentRevision?: number;
};

export type DocumentIntakeBootstrapResponsePayload = {
  created?: boolean;
  document?: DocumentSummary;
  draft?: DocumentIntakeDraft;
  message?: string;
};

export type DocumentIntakeSubmitResponsePayload = {
  draft?: DocumentIntakeDraft;
  canonicalPayload?: Record<string, unknown>;
  valid?: boolean;
  message?: string;
  errors?: Array<{
    code?: string;
    field?: string;
    message?: string;
  }>;
  currentRevision?: number;
  intakeStatus?: string;
};

export type DocumentIntakePayloadResponsePayload = {
  documentId?: string;
  intakeStatus?: string;
  submittedAt?: string | null;
  payload?: {
    jurisdiction?: string;
    productFlowMode?: string;
    rulesSnapshotVersion?: string;
    revision?: number;
    canonicalAnswers?: Record<string, unknown>;
  };
  message?: string;
};

export type MissingRequirement = {
  family: string;
  documentType: string;
};

export type FormValue = string | boolean | string[];

export type FormStep =
  | "general_information"
  | "poa_requirements"
  | "trust_requirements";

export type ProductFlowStepDefinition = {
  stepKey: FormStep;
  label: string;
  sectionKeys: MemberFacingSectionKey[];
  sections: MemberFacingSection[];
};

export type StartFormDraft = {
  currentFormStep: FormStep;
  formValues: Record<string, FormValue>;
};

export type SignatureAuthorityMode =
  | "all_trustees"
  | "any_one_trustee"
  | "named_signing_trustee"
  | "custom";
