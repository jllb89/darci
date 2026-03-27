import type { PoaRequirementRecord } from "./poaService";
type DerivationMode = "rules_only" | "rules_plus_overrides" | "manual_review";
type ExecutionPathAvailability = "required" | "allowed" | "not_allowed" | "manual_review";
type ExecutionPathKey = "notary_acknowledgment" | "witness_execution" | "notary_and_witness_execution" | "manual_review";
type SectionPresence = "required" | "optional" | "conditional" | "hidden" | "manual_review";
type SemanticType = "person_name" | "enum_single" | "enum_multi" | "boolean" | "date" | "text" | "initials" | "signature_mark" | "witness_count" | "acknowledgment_choice" | "legal_notice_acceptance" | "recording_status";
type DataType = "string" | "integer" | "boolean" | "date" | "array";
type CollectFrom = "member" | "principal" | "agent" | "notary" | "system";
type DefaultSource = "none" | "user_profile" | "document_template" | "jurisdiction_default" | "system_derived";
type ConditionFact = "selected_execution_path" | "durability_rule" | "specific_authority_rule" | "effective_date_rule" | "statutory_form_rule" | "review_status";
type ConditionOperator = "equals" | "not_equals" | "in" | "not_in";
type NoticeSeverity = "info" | "warning" | "blocking";
type DocumentOutputKey = "signed_poa_document" | "principal_signature" | "notary_acknowledgment" | "witness_attestation" | "special_authority_initials" | "durability_clause" | "springing_trigger_clause" | "recording_confirmation";
type ConditionClause = {
    fact: ConditionFact;
    operator: ConditionOperator;
    value: string;
};
type Condition = {
    all: ConditionClause[];
};
type FieldValidation = {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    allowedValues?: string[];
};
export type PoaInputRequirementField = {
    key: string;
    label: string;
    semanticType: SemanticType;
    required: boolean;
    dataType: DataType;
    collectFrom: CollectFrom;
    defaultSource: DefaultSource;
    validation?: FieldValidation;
    helpText?: string;
    when?: Condition;
};
export type PoaInputRequirementSection = {
    key: string;
    title: string;
    presence: SectionPresence;
    repeatable: boolean;
    appliesToPaths: ExecutionPathKey[];
    fields: PoaInputRequirementField[];
};
export type PoaExecutionPath = {
    key: ExecutionPathKey;
    label: string;
    default: boolean;
    availability: ExecutionPathAvailability;
};
export type PoaDocumentOutput = {
    key: DocumentOutputKey;
    required: boolean;
    when?: Condition;
};
export type PoaRequirementNotice = {
    key: string;
    severity: NoticeSeverity;
    message: string;
};
export type PoaRequirementSourceTrace = {
    source: "poa_requirements";
    field: string;
    value: string | number | boolean | null;
};
export type PoaInputRequirements = {
    schemaVersion: string;
    jurisdiction: string;
    poaType: string;
    uiProfile: string;
    derivationMode: DerivationMode;
    reviewStatus: string;
    workflow: {
        executionPaths: PoaExecutionPath[];
        steps: string[];
        submissionChecks: string[];
    };
    sections: PoaInputRequirementSection[];
    documentOutputs: PoaDocumentOutput[];
    notices: PoaRequirementNotice[];
    sourceTrace: PoaRequirementSourceTrace[];
};
export declare const derivePoaInputRequirements: (record: PoaRequirementRecord) => PoaInputRequirements;
export {};
//# sourceMappingURL=poaInputRequirements.d.ts.map