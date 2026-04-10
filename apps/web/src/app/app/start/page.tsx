"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";
import { HelpTooltip } from "@/app/app/start/HelpTooltip";
import ProcessBand from "@/app/app/start/ProcessBand";
import {
  buildInitialMemberFormValues,
  computeFieldRuntime,
  getSectionLayoutMode,
  groupSectionFieldsByFamily,
  getVisibleSections,
  type MemberFormFamily,
} from "@/app/app/start/memberFormRuntime";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  DEFAULT_PHONE_COUNTRY_ISO2,
  PHONE_COUNTRY_CODE_OPTIONS,
  getPhoneCountryCodeByIso2,
  getMemberFieldControlKind,
  hasSigningTrustee,
  isTemporarilyHiddenCreateFlowField,
  isValidEmailFormat,
  isValidPhoneCountryCode,
  isValidPhoneFormat,
  parsePriorDocumentItems,
  parsePersonContact,
  parsePersonListItems,
  serializePriorDocumentItems,
  serializePersonContact,
  serializePersonListItems,
  type PersonListItem,
  type PriorDocumentItem,
} from "@/app/app/start/memberFormControls";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type JurisdictionOption = {
  code: string;
  label: string;
};

type ConditionOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "not_in"
  | "is_true"
  | "is_false";

type ConditionClause = {
  fact: string;
  operator: ConditionOperator;
  value?: unknown;
};

type Condition = {
  all: ConditionClause[];
};

type ConditionFactValue = string | string[] | boolean | null;
type FactContext = Record<string, ConditionFactValue>;

type MemberFacingFieldSource = {
  family: MemberFormFamily;
  document_type: string;
  section_key: string;
  field_key: string;
  original_label: string;
  original_required?: boolean;
  original_when?: Condition;
};

type MemberFacingField = {
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
  ui_group: "basic_info" | "people" | "authority" | "execution" | "documents" | "advanced";
};

type MemberFacingSection = {
  key: "basic_info" | "people" | "authority" | "execution" | "documents" | "advanced";
  title: string;
  fields: MemberFacingField[];
};

type MemberFacingFormContract = {
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

type FamilyContract = {
  family: MemberFormFamily;
  documentType: string;
  inputRequirements: unknown;
  factContext: FactContext;
};

type SourceConditionContext = {
  family: MemberFormFamily;
  documentType: string;
  sectionKey: string;
  fieldKey: string;
  facts: FactContext;
};

type MemberFormRulesContract = {
  jurisdiction: string;
  families: MemberFormFamily[];
  documentTypes: string[];
  aggregatedForm: MemberFacingFormContract;
  familyContracts: FamilyContract[];
  sourceConditionContexts: SourceConditionContext[];
};

type MemberFormJurisdictionsPayload = {
  jurisdictions?: JurisdictionOption[];
  message?: string;
};

type MemberFormPayload = {
  memberForm?: MemberFormRulesContract;
  message?: string;
  details?: Array<{
    family?: string;
    documentType?: string;
  }>;
};

type MissingRequirement = {
  family: string;
  documentType: string;
};

type FormValue = string | boolean | string[];
type FormStep = "people" | "authority";

type StartFormDraft = {
  currentFormStep: FormStep;
  formValues: Record<string, FormValue>;
};

const START_FORM_DRAFT_STORAGE_KEY_PREFIX = "darci:start-form-draft:v1";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isFormValue = (value: unknown): value is FormValue => {
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  );
};

const sanitizeStoredFormValues = (
  value: unknown,
): Record<string, FormValue> => {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: Record<string, FormValue> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!key.trim() || !isFormValue(candidate)) {
      continue;
    }

    sanitized[key] = candidate;
  }

  return sanitized;
};

const getStartFormDraftStorageKey = (jurisdictionCode: string) => {
  return `${START_FORM_DRAFT_STORAGE_KEY_PREFIX}:${jurisdictionCode}`;
};

const readStartFormDraft = (jurisdictionCode: string): StartFormDraft | null => {
  if (typeof window === "undefined" || !jurisdictionCode) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(
      getStartFormDraftStorageKey(jurisdictionCode),
    );
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const currentFormStep =
      parsed.currentFormStep === "authority" ? "authority" : "people";

    return {
      currentFormStep,
      formValues: sanitizeStoredFormValues(parsed.formValues),
    };
  } catch {
    return null;
  }
};

const writeStartFormDraft = (
  jurisdictionCode: string,
  draft: StartFormDraft,
) => {
  if (typeof window === "undefined" || !jurisdictionCode) {
    return;
  }

  try {
    window.localStorage.setItem(
      getStartFormDraftStorageKey(jurisdictionCode),
      JSON.stringify(draft),
    );
  } catch {
    // Swallow quota/private-mode errors to keep form editing uninterrupted.
  }
};

const priorDocumentTypeOptions = [
  "trust_agreement",
  "amendment",
  "restatement",
  "trust_certification",
  "power_of_attorney",
  "other",
] as const;

const fieldMicrocopyByCanonicalKey: Record<string, string> = {
  restatement_context_type:
    "Pick the option that best describes this filing so we can request the right supporting records.",
  prior_document_items:
    "Upload the trust documents to include in this filing.",
  trustee_powers:
    "Select every authority that should appear in the trustee powers section.",
  revocation_holders:
    "Choose who has revocation authority under the trust terms.",
  revocation_holders_custom_text:
    "Describe the exact revocation language if the standard options do not match.",
  special_instructions_text:
    "Keep this concise and directive. These instructions are copied into the final document package.",
};

const sectionMicrocopyByKey: Record<string, string> = {
  basic_info: "Start with your core details so your document is prepared correctly.",
  people: "List parties in execution order. Add each person as a separate row.",
  authority: "Confirm who may act, revoke, and sign. Trust-specific authority appears first.",
  execution: "Execution preferences for signatures, dates, and witness handling.",
  documents: "List documents to include and any supporting uploads needed for this filing.",
  advanced: "Optional edge-case inputs. Leave blank unless your case explicitly requires them.",
};

const formatLabel = (value: string) => {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const toTitleCaseWords = (value: string) => {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const formatJurisdictionDisplayLabel = (label: string | undefined, code: string) => {
  const raw =
    typeof label === "string" && label.trim().length > 0
      ? label
      : code;

  const withoutTrailingCode = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!withoutTrailingCode) {
    return toTitleCaseWords(code);
  }

  return toTitleCaseWords(withoutTrailingCode);
};

const getAllowedValues = (field: MemberFacingField) => {
  const validation = field.validation;
  if (!validation) {
    return [] as string[];
  }

  const raw = validation["allowed_values"] ?? validation["allowedValues"];
  if (!Array.isArray(raw)) {
    return [] as string[];
  }

  return raw.filter((value): value is string => typeof value === "string");
};

const getAllowedValueLabels = (field: MemberFacingField) => {
  const validation = field.validation;
  if (!validation) {
    return {} as Record<string, string>;
  }

  const raw = validation["allowed_value_labels"] ?? validation["allowedValueLabels"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {} as Record<string, string>;
  }

  const labels: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && key.trim().length > 0) {
      labels[key] = value;
    }
  }

  return labels;
};

const getNumberConstraint = (
  field: MemberFacingField,
  key: "min" | "max" | "minLength" | "maxLength",
) => {
  const validation = field.validation;
  if (!validation) {
    return undefined;
  }

  const value = validation[key];
  return typeof value === "number" ? value : undefined;
};

const normalizeCanonicalKey = (canonicalKey: string) => {
  return canonicalKey.replace(/__\d+$/, "");
};

const getFieldMicrocopy = (canonicalKey: string) => {
  return fieldMicrocopyByCanonicalKey[normalizeCanonicalKey(canonicalKey)] ?? null;
};

const getSectionMicrocopy = (sectionKey: string) => {
  return sectionMicrocopyByKey[sectionKey] ?? null;
};

const toStringArrayValue = (value: FormValue | undefined) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
};

const repeatableAddLabelByCanonicalKey: Record<string, string> = {
  grantors: "Add grantor",
  successor_agents: "Add successor agent",
  successor_agent_list: "Add successor agent",
};

const repeatablePlaceholderByCanonicalKey: Record<string, string> = {
  grantors: "Grantor name",
  successor_agents: "Successor agent name",
  successor_agent_list: "Successor agent name",
};

const getRepeatableAddLabel = (canonicalKey: string) => {
  return repeatableAddLabelByCanonicalKey[normalizeCanonicalKey(canonicalKey)] ?? "Add entry";
};

const getRepeatablePlaceholder = (canonicalKey: string, index: number) => {
  return (
    repeatablePlaceholderByCanonicalKey[normalizeCanonicalKey(canonicalKey)] ??
    `Entry ${index + 1}`
  );
};

const isTrusteeListField = (canonicalKey: string) => {
  return normalizeCanonicalKey(canonicalKey) === "trustees";
};

const isSuccessorTrusteeListField = (canonicalKey: string) => {
  return normalizeCanonicalKey(canonicalKey) === "successor_trustees";
};

const hasPersonRowValue = (item: PersonListItem) => {
  return (
    item.fullName.trim().length > 0 ||
    item.email.trim().length > 0 ||
    item.phone.trim().length > 0
  );
};

const getFilledPersonRows = (items: PersonListItem[]) => {
  return items.filter((item) => hasPersonRowValue(item));
};

const getIncompletePersonRowCount = (items: PersonListItem[]) => {
  const filledRows = getFilledPersonRows(items);
  return filledRows.filter((item) => {
    return (
      item.fullName.trim().length === 0 ||
      item.email.trim().length === 0 ||
      item.phone.trim().length === 0
    );
  }).length;
};

const hasInvalidPersonRowFormat = (item: PersonListItem) => {
  if (!hasPersonRowValue(item)) {
    return false;
  }

  if (!isValidPhoneCountryCode(item.phoneCountryCode)) {
    return true;
  }

  if (!isValidEmailFormat(item.email)) {
    return true;
  }

  if (!isValidPhoneFormat(item.phone)) {
    return true;
  }

  return false;
};

const getInvalidPersonRowFormatCount = (items: PersonListItem[]) => {
  return getFilledPersonRows(items).filter((item) => hasInvalidPersonRowFormat(item)).length;
};

const validatePersonContact = (value: FormValue | undefined) => {
  const contact = parsePersonContact(value);

  const missingEmail = contact.email.trim().length === 0;
  const missingPhone = contact.phone.trim().length === 0;
  const invalidEmail = !missingEmail && !isValidEmailFormat(contact.email);
  const invalidPhone = !missingPhone && !isValidPhoneFormat(contact.phone);
  const invalidCountryCode = !isValidPhoneCountryCode(contact.phoneCountryCode);

  return {
    missingEmail,
    missingPhone,
    invalidEmail,
    invalidPhone,
    invalidCountryCode,
  };
};

const fetchWithTokenRefresh = async (
  url: string,
  accessToken: string,
): Promise<Response> => {
  const requestWithToken = (token: string) => {
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  };

  const response = await requestWithToken(accessToken);
  if (response.status !== 401) {
    return response;
  }

  try {
    const refreshed = await refreshStoredAuth();
    if (!refreshed?.accessToken) {
      return response;
    }

    return requestWithToken(refreshed.accessToken);
  } catch {
    return response;
  }
};

export default function StartDocumentPage() {
  const router = useRouter();
  const { accessToken } = useStoredAuth();
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("");

  const [memberForm, setMemberForm] = useState<MemberFormRulesContract | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({});

  const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(false);
  const [isLoadingMemberForm, setIsLoadingMemberForm] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingRequirements, setMissingRequirements] = useState<MissingRequirement[]>([]);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<
    { type: "href"; href: string } | { type: "history-back" } | { type: "reload" } | null
  >(null);
  const [currentFormStep, setCurrentFormStep] = useState<FormStep>("people");
  const [activeDropzoneFieldKey, setActiveDropzoneFieldKey] = useState<string | null>(null);
  const allowLeavingRef = useRef(false);
  const hasPushedHistoryGuardRef = useRef(false);
  const contractContainerRef = useRef<HTMLDivElement | null>(null);

  const selectedJurisdictionLabel = useMemo(() => {
    const selected = jurisdictions.find(
      (jurisdiction) => jurisdiction.code === selectedJurisdiction,
    );

    if (!selected) {
      return undefined;
    }

    return formatJurisdictionDisplayLabel(selected.label, selected.code);
  }, [jurisdictions, selectedJurisdiction]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    const loadJurisdictions = async () => {
      setIsLoadingJurisdictions(true);
      setErrorMessage(null);
      setMissingRequirements([]);

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/rules/member-form`,
          accessToken,
        );

        const payload = (await response.json().catch(() => null)) as
          | MemberFormJurisdictionsPayload
          | null;

        if (!response.ok || !payload?.jurisdictions) {
          throw new Error(payload?.message || "Failed to load jurisdictions");
        }

        if (cancelled) {
          return;
        }

        const nextJurisdictions = payload.jurisdictions;
        setJurisdictions(nextJurisdictions);
        setSelectedJurisdiction((current) => {
          if (nextJurisdictions.some((jurisdiction) => jurisdiction.code === current)) {
            return current;
          }

          return "";
        });

        if (nextJurisdictions.length === 0) {
          setMemberForm(null);
          setFormValues({});
        }
      } catch (error) {
        if (!cancelled) {
          setJurisdictions([]);
          setSelectedJurisdiction("");
          setMemberForm(null);
          setFormValues({});
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load jurisdictions",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingJurisdictions(false);
        }
      }
    };

    void loadJurisdictions();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedJurisdiction) {
      return;
    }

    let cancelled = false;

    const loadMemberForm = async () => {
      setIsLoadingMemberForm(true);
      setErrorMessage(null);
      setMissingRequirements([]);

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/rules/member-form/${selectedJurisdiction}`,
          accessToken,
        );

        const payload = (await response.json().catch(() => null)) as MemberFormPayload | null;

        if (!response.ok || !payload?.memberForm) {
          if (response.status === 404) {
            const details = (payload?.details ?? [])
              .filter(
                (detail): detail is { family: string; documentType: string } =>
                  typeof detail.family === "string" &&
                  typeof detail.documentType === "string",
              )
              .map((detail) => ({
                family: detail.family,
                documentType: detail.documentType,
              }));

            if (!cancelled) {
              setMissingRequirements(details);
            }
          }

          throw new Error(payload?.message || "Failed to load member form requirements");
        }

        if (cancelled) {
          return;
        }

        setMemberForm(payload.memberForm);
        const initialValues = buildInitialMemberFormValues(payload.memberForm, {
          jurisdictionCode: selectedJurisdiction,
          jurisdictionLabel: selectedJurisdictionLabel,
        });
        const draft = readStartFormDraft(selectedJurisdiction);

        setFormValues({
          ...initialValues,
          ...(draft?.formValues ?? {}),
        });
        setCurrentFormStep(draft?.currentFormStep ?? "people");
      } catch (error) {
        if (!cancelled) {
          setMemberForm(null);
          setFormValues({});
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to load member form requirements",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMemberForm(false);
        }
      }
    };

    void loadMemberForm();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedJurisdiction, selectedJurisdictionLabel]);

  const fieldRuntime = useMemo(
    () => computeFieldRuntime(memberForm, formValues),
    [formValues, memberForm],
  );

  const visibleSections = useMemo(
    () => getVisibleSections(memberForm, fieldRuntime),
    [fieldRuntime, memberForm],
  );

  const primarySections = useMemo(() => {
    return visibleSections.filter((section) => section.key !== "documents");
  }, [visibleSections]);

  const documentSections = useMemo(() => {
    return visibleSections.filter((section) => section.key === "documents");
  }, [visibleSections]);

  const documentsColumnFields = useMemo<MemberFacingField[]>(() => {
    return documentSections
      .flatMap((section) => section.fields)
      .filter((field) => !isTemporarilyHiddenCreateFlowField(field.canonical_key)) as MemberFacingField[];
  }, [documentSections]);

  const requiresDocumentsUpload = useMemo(() => {
    return documentsColumnFields.some(
      (field) => normalizeCanonicalKey(field.canonical_key) === "prior_document_items",
    );
  }, [documentsColumnFields]);

  const hasDocumentsUploadValue = useMemo(() => {
    const value = formValues.prior_document_items;
    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    if (Array.isArray(value)) {
      return value.some((item) => typeof item === "string" && item.trim().length > 0);
    }

    return false;
  }, [formValues.prior_document_items]);

  const isDocumentsColumnComplete = !requiresDocumentsUpload || hasDocumentsUploadValue;

  const peopleStepSections = useMemo(() => {
    return primarySections.filter(
      (section) => section.key !== "authority" && section.key !== "advanced",
    );
  }, [primarySections]);

  const authorityStepSections = useMemo(() => {
    return primarySections.filter(
      (section) => section.key === "authority" || section.key === "advanced",
    );
  }, [primarySections]);

  const displayedPrimarySections = useMemo(() => {
    return currentFormStep === "people" ? peopleStepSections : authorityStepSections;
  }, [authorityStepSections, currentFormStep, peopleStepSections]);

  const hasAuthoritySection = useMemo(() => {
    return authorityStepSections.length > 0;
  }, [authorityStepSections]);

  useEffect(() => {
    setCurrentFormStep("people");
  }, [selectedJurisdiction]);

  useEffect(() => {
    if (!hasAuthoritySection && currentFormStep !== "people") {
      setCurrentFormStep("people");
    }
  }, [currentFormStep, hasAuthoritySection]);

  useEffect(() => {
    if (!selectedJurisdiction || !memberForm) {
      return;
    }

    writeStartFormDraft(selectedJurisdiction, {
      currentFormStep,
      formValues,
    });
  }, [currentFormStep, formValues, memberForm, selectedJurisdiction]);

  const sourceOnlyVisibleCount = useMemo(() => {
    return visibleSections.reduce((count, section) => {
      return (
        count +
        section.fields.filter((field) => field.condition_merge_mode === "source_only").length
      );
    }, 0);
  }, [visibleSections]);

  const visibleCanonicalKeys = useMemo(() => {
    return new Set(
      visibleSections.flatMap((section) =>
        section.fields.map((field) => normalizeCanonicalKey(field.canonical_key)),
      ),
    );
  }, [visibleSections]);

  const principalContactValidation = useMemo(() => {
    if (!visibleCanonicalKeys.has("principal_contact")) {
      return {
        hasErrors: false,
      };
    }

    const validation = validatePersonContact(formValues.principal_contact);

    return {
      ...validation,
      hasErrors:
        validation.missingEmail ||
        validation.missingPhone ||
        validation.invalidEmail ||
        validation.invalidPhone ||
        validation.invalidCountryCode,
    };
  }, [formValues.principal_contact, visibleCanonicalKeys]);

  const agentContactValidation = useMemo(() => {
    if (!visibleCanonicalKeys.has("agent_contact")) {
      return {
        hasErrors: false,
      };
    }

    const validation = validatePersonContact(formValues.agent_contact);

    return {
      ...validation,
      hasErrors:
        validation.missingEmail ||
        validation.missingPhone ||
        validation.invalidEmail ||
        validation.invalidPhone ||
        validation.invalidCountryCode,
    };
  }, [formValues.agent_contact, visibleCanonicalKeys]);

  const trusteeValidation = useMemo(() => {
    const trusteeRows = parsePersonListItems(formValues.trustees);
    const filledRows = getFilledPersonRows(trusteeRows);
    const incompleteCount = getIncompletePersonRowCount(trusteeRows);
    const invalidFormatCount = getInvalidPersonRowFormatCount(trusteeRows);
    const missingSigner =
      filledRows.length > 0 &&
      !hasSigningTrustee(
        filledRows.filter((item) => item.fullName.trim().length > 0),
      );

    return {
      hasRows: filledRows.length > 0,
      incompleteCount,
      invalidFormatCount,
      missingSigner,
    };
  }, [formValues]);

  const successorTrusteeValidation = useMemo(() => {
    const rows = parsePersonListItems(formValues.successor_trustees);
    const filledRows = getFilledPersonRows(rows);
    return {
      hasRows: filledRows.length > 0,
      incompleteCount: getIncompletePersonRowCount(rows),
      invalidFormatCount: getInvalidPersonRowFormatCount(rows),
    };
  }, [formValues]);

  const hasBlockingValidation =
    principalContactValidation.hasErrors ||
    agentContactValidation.hasErrors ||
    trusteeValidation.incompleteCount > 0 ||
    trusteeValidation.invalidFormatCount > 0 ||
    trusteeValidation.missingSigner ||
    successorTrusteeValidation.incompleteCount > 0 ||
    successorTrusteeValidation.invalidFormatCount > 0;

  const allRequiredVisibleFieldsComplete = useMemo(() => {
    return visibleSections.every((section) => {
      return section.fields.every((field) => {
        if (isTemporarilyHiddenCreateFlowField(field.canonical_key)) {
          return true;
        }

        const runtime = fieldRuntime.get(field.canonical_key);
        if (!runtime?.visible || !runtime.required) {
          return true;
        }

        const fieldValue = formValues[field.canonical_key];
        const controlKind = getMemberFieldControlKind(field, getAllowedValues(field));

        if (controlKind === "boolean") {
          return typeof fieldValue === "boolean";
        }

        if (controlKind === "person-contact") {
          const validation = validatePersonContact(fieldValue);
          return (
            !validation.missingEmail &&
            !validation.missingPhone &&
            !validation.invalidEmail &&
            !validation.invalidPhone &&
            !validation.invalidCountryCode
          );
        }

        if (controlKind === "repeatable-person-list") {
          const items = parsePersonListItems(fieldValue);
          const filledRows = getFilledPersonRows(items);

          if (filledRows.length === 0) {
            return false;
          }

          if (
            getIncompletePersonRowCount(items) > 0 ||
            getInvalidPersonRowFormatCount(items) > 0
          ) {
            return false;
          }

          if (
            isTrusteeListField(field.canonical_key) &&
            !hasSigningTrustee(filledRows.filter((item) => item.fullName.trim().length > 0))
          ) {
            return false;
          }

          return true;
        }

        if (controlKind === "checkbox-multi" || controlKind === "repeatable-text-list") {
          return toStringArrayValue(fieldValue).some((item) => item.trim().length > 0);
        }

        if (controlKind === "repeatable-document-list") {
          const items = parsePriorDocumentItems(fieldValue);
          return items.some((item) => {
            return (
              item.documentType.trim().length > 0 ||
              item.documentLabel.trim().length > 0 ||
              item.documentDate.trim().length > 0 ||
              item.attachmentReference.trim().length > 0
            );
          });
        }

        if (controlKind === "file-upload") {
          return typeof fieldValue === "string" && fieldValue.trim().length > 0;
        }

        if (
          controlKind === "number" ||
          controlKind === "date" ||
          controlKind === "select" ||
          controlKind === "textarea" ||
          controlKind === "text"
        ) {
          return typeof fieldValue === "string" && fieldValue.trim().length > 0;
        }

        return true;
      });
    });
  }, [fieldRuntime, formValues, visibleSections]);

  const hasUnsavedProgress = useMemo(() => {
    if (!selectedJurisdiction) {
      return false;
    }

    return Object.keys(formValues).length > 0;
  }, [formValues, selectedJurisdiction]);

  const openLeaveModal = (
    action: { type: "href"; href: string } | { type: "history-back" } | { type: "reload" },
  ) => {
    setPendingLeaveAction(action);
    setIsLeaveModalOpen(true);
  };

  const closeLeaveModal = () => {
    setIsLeaveModalOpen(false);
    setPendingLeaveAction(null);
  };

  const confirmLeaveModal = () => {
    const action = pendingLeaveAction;
    if (!action) {
      closeLeaveModal();
      return;
    }

    allowLeavingRef.current = true;
    setIsLeaveModalOpen(false);
    setPendingLeaveAction(null);

    if (action.type === "href") {
      router.push(action.href);
      return;
    }

    if (action.type === "reload") {
      window.location.reload();
      return;
    }

    window.history.go(-2);
  };

  const scrollToContractContainerTop = () => {
    contractContainerRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const continueToAuthorityScope = () => {
    setCurrentFormStep("authority");

    window.requestAnimationFrame(() => {
      scrollToContractContainerTop();
    });
  };

  const returnToFirstSection = () => {
    setCurrentFormStep("people");

    window.requestAnimationFrame(() => {
      scrollToContractContainerTop();
    });
  };

  useEffect(() => {
    if (!hasUnsavedProgress) {
      hasPushedHistoryGuardRef.current = false;
      return;
    }

    if (!hasPushedHistoryGuardRef.current) {
      window.history.pushState({ startPageLeaveGuard: true }, "", window.location.href);
      hasPushedHistoryGuardRef.current = true;
    }

    const handlePopState = () => {
      if (allowLeavingRef.current) {
        return;
      }

      window.history.pushState({ startPageLeaveGuard: true }, "", window.location.href);
      openLeaveModal({ type: "history-back" });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [hasUnsavedProgress]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!hasUnsavedProgress || allowLeavingRef.current || isLeaveModalOpen) {
        return;
      }

      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) {
        return;
      }

      const anchor = eventTarget.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) {
        return;
      }

      if (anchor.target && anchor.target !== "_self") {
        return;
      }

      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.href === currentUrl.href) {
        return;
      }

      event.preventDefault();
      openLeaveModal({
        type: "href",
        href: `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
      });
    };

    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedProgress, isLeaveModalOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!hasUnsavedProgress || allowLeavingRef.current || isLeaveModalOpen) {
        return;
      }

      const key = event.key.toLowerCase();
      const isMacRefresh = event.metaKey && key === "r";
      const isWindowsRefresh = event.ctrlKey && key === "r";
      const isFunctionRefresh = event.key === "F5";

      if (!isMacRefresh && !isWindowsRefresh && !isFunctionRefresh) {
        return;
      }

      event.preventDefault();
      openLeaveModal({ type: "reload" });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasUnsavedProgress, isLeaveModalOpen]);

  const handleJurisdictionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextJurisdiction = event.target.value;
    setSelectedJurisdiction(nextJurisdiction);

    if (!nextJurisdiction) {
      setMemberForm(null);
      setFormValues({});
      setCurrentFormStep("people");
      setMissingRequirements([]);
      setErrorMessage(null);
    }
  };

  const handleFieldChange = (key: string, value: FormValue) => {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const renderFieldLabel = (field: MemberFacingField) => {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-Color-Scheme-1-Text">
        <span>{field.label}</span>
        {field.help_text ? (
          <HelpTooltip label={`Explain ${field.label}`} content={field.help_text} />
        ) : null}
      </div>
    );
  };

  const renderFieldControl = (field: MemberFacingField) => {
    const fieldValue = formValues[field.canonical_key];
    const allowedValues = getAllowedValues(field);
    const allowedValueLabels = getAllowedValueLabels(field);
    const controlKind = getMemberFieldControlKind(field, allowedValues);
    const baseInputClassName = "platform-control";
    const secondaryButtonClassName = "platform-btn-secondary px-3 py-2";
    const subtleButtonClassName = "platform-btn-subtle px-3 py-1.5";
    const normalizedCanonicalKey = normalizeCanonicalKey(field.canonical_key);

    if (field.semantic_type === "signature_mark") {
      return (
        <div className="border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-sm text-Color-Neutral">
          Signature capture occurs in a later step.
        </div>
      );
    }

    if (controlKind === "object-placeholder") {
      return (
        <div className="border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-sm text-Color-Neutral">
          This input is captured through an upload or generated artifact step.
        </div>
      );
    }

    if (controlKind === "person-contact") {
      const contact = parsePersonContact(fieldValue);
      const missingEmail = contact.email.trim().length === 0;
      const missingPhone = contact.phone.trim().length === 0;
      const invalidEmail = !missingEmail && !isValidEmailFormat(contact.email);
      const invalidPhone = !missingPhone && !isValidPhoneFormat(contact.phone);
      const invalidCountryCode = !isValidPhoneCountryCode(contact.phoneCountryCode);
      const hasFormatError = invalidCountryCode || invalidEmail || invalidPhone;

      return (
        <div className="space-y-2 border border-Color-Scheme-1-Border/40 bg-white p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              className={baseInputClassName}
              onChange={(event) => {
                handleFieldChange(
                  field.canonical_key,
                  serializePersonContact({
                    ...contact,
                    email: event.target.value,
                  }),
                );
              }}
              placeholder="Email"
              type="email"
              value={contact.email}
            />
            <div className="grid grid-cols-[190px_1fr] gap-2">
              <div className="platform-select-wrap">
                <select
                  className={baseInputClassName}
                  onChange={(event) => {
                    const nextPhoneCountryIso2 = event.target.value;
                    handleFieldChange(
                      field.canonical_key,
                      serializePersonContact({
                        ...contact,
                        phoneCountryIso2: nextPhoneCountryIso2,
                        phoneCountryCode: getPhoneCountryCodeByIso2(nextPhoneCountryIso2),
                      }),
                    );
                  }}
                  value={contact.phoneCountryIso2 || DEFAULT_PHONE_COUNTRY_ISO2}
                >
                  {PHONE_COUNTRY_CODE_OPTIONS.map((option) => (
                    <option key={option.countryIso2} value={option.countryIso2}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <svg className="platform-select-icon" fill="none" viewBox="0 0 20 20">
                  <path
                    d="M5.5 7.75 10 12.25l4.5-4.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <input
                className={baseInputClassName}
                onChange={(event) => {
                  handleFieldChange(
                    field.canonical_key,
                    serializePersonContact({
                      ...contact,
                      phone: event.target.value,
                    }),
                  );
                }}
                placeholder="Phone"
                type="tel"
                value={contact.phone}
              />
            </div>
          </div>

          {hasFormatError ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {invalidCountryCode
                ? "Select a valid country code."
                : invalidEmail
                  ? "Enter a valid email address."
                  : invalidPhone
                    ? "Enter a valid phone number."
                    : null}
            </div>
          ) : null}

          {!hasFormatError && (missingEmail || missingPhone) ? (
            <div className="text-xs text-Color-Neutral">Email and phone are required.</div>
          ) : null}

          <div className="text-xs text-Color-Neutral">
            Select the country flag and dialing code, then add the direct phone number.
          </div>
        </div>
      );
    }

    if (controlKind === "file-upload") {
      const selectedFileName = typeof fieldValue === "string" ? fieldValue : "";
      const isUploadDisabled = !selectedJurisdiction;
      const isDocumentsToIncludeUpload = normalizedCanonicalKey === "prior_document_items";
      const isDropzoneActive =
        !isUploadDisabled && activeDropzoneFieldKey === field.canonical_key;

      const handlePickedFile = (file: File | null | undefined) => {
        if (!file) {
          return;
        }

        const isPdfFile =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (!isPdfFile) {
          return;
        }

        handleFieldChange(field.canonical_key, file.name);
      };

      return (
        <div className="space-y-2">
          <label
            className={`block rounded-md border border-dashed px-4 py-5 text-sm transition-colors ${
              isUploadDisabled
                ? "cursor-not-allowed border-Color-Scheme-1-Border/30 bg-Color-Neutral-Lightest text-Color-Neutral"
                : isDropzoneActive
                  ? "cursor-pointer border-black bg-white text-black"
                  : "cursor-pointer border-Color-Scheme-1-Border/50 bg-white text-Color-Scheme-1-Text hover:border-Color-Scheme-1-Border"
            }`}
            onDragEnter={(event: DragEvent<HTMLLabelElement>) => {
              if (isUploadDisabled) {
                return;
              }

              event.preventDefault();
              setActiveDropzoneFieldKey(field.canonical_key);
            }}
            onDragOver={(event: DragEvent<HTMLLabelElement>) => {
              if (isUploadDisabled) {
                return;
              }

              event.preventDefault();
              setActiveDropzoneFieldKey(field.canonical_key);
            }}
            onDragLeave={(event: DragEvent<HTMLLabelElement>) => {
              if (isUploadDisabled) {
                return;
              }

              const related = event.relatedTarget;
              if (related instanceof Node && event.currentTarget.contains(related)) {
                return;
              }

              setActiveDropzoneFieldKey((current) => {
                return current === field.canonical_key ? null : current;
              });
            }}
            onDrop={(event: DragEvent<HTMLLabelElement>) => {
              if (isUploadDisabled) {
                return;
              }

              event.preventDefault();
              setActiveDropzoneFieldKey(null);
              handlePickedFile(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="space-y-1">
              <div className="font-medium">
                {isDocumentsToIncludeUpload
                  ? "Drop documents to include here or click to browse"
                  : "Drop PDF here or click to browse"}
              </div>
              <div className={`text-xs ${isDropzoneActive ? "text-black" : "text-Color-Neutral"}`}>
                {isUploadDisabled
                  ? "Select a jurisdiction first to unlock uploads."
                  : "PDF only"}
              </div>
            </div>
            <input
              accept=".pdf,application/pdf"
              className="hidden"
              disabled={isUploadDisabled}
              onChange={(event) => {
                handlePickedFile(event.target.files?.[0]);
              }}
              type="file"
            />
          </label>
          <div className={`text-xs ${selectedFileName ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"}`}>
            {selectedFileName ? (
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{`Selected file: ${selectedFileName}`}</span>
                <button
                  aria-label={`Clear selected file ${selectedFileName}`}
                  className="inline-flex h-5 w-5 items-center justify-center text-xs text-Color-Neutral transition hover:text-Color-Scheme-1-Text"
                  onClick={() => {
                    handleFieldChange(field.canonical_key, "");
                  }}
                  type="button"
                >
                  x
                </button>
              </div>
            ) : isDocumentsToIncludeUpload ? (
              "No documents to include selected yet."
            ) : (
              "No file selected yet."
            )}
          </div>
        </div>
      );
    }

    if (controlKind === "boolean") {
      return (
        <label className="flex items-center gap-3 border border-Color-Scheme-1-Border/40 bg-white px-3 py-3 text-sm text-Color-Scheme-1-Text">
          <input
            checked={Boolean(fieldValue)}
            className="h-4 w-4 accent-Color-Scheme-1-Text"
            onChange={(event) =>
              handleFieldChange(field.canonical_key, event.target.checked)
            }
            type="checkbox"
          />
          <span>{field.label}</span>
        </label>
      );
    }

    if (controlKind === "number") {
      return (
        <input
          className={baseInputClassName}
          max={getNumberConstraint(field, "max")}
          min={getNumberConstraint(field, "min")}
          onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
          type="number"
          value={typeof fieldValue === "string" ? fieldValue : ""}
        />
      );
    }

    if (controlKind === "date") {
      return (
        <input
          className={`${baseInputClassName} platform-date-input`}
          onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
          type="date"
          value={typeof fieldValue === "string" ? fieldValue : ""}
        />
      );
    }

    if (controlKind === "checkbox-multi") {
      const selectedValues = toStringArrayValue(fieldValue);
      const selectedLabels = selectedValues.map(
        (value) => allowedValueLabels[value] ?? formatLabel(value),
      );

      return (
        <div className="space-y-2 border border-Color-Scheme-1-Border/40 bg-white p-3">
          {allowedValues.map((value) => {
            const checked = selectedValues.includes(value);

            return (
              <label
                key={value}
                className="flex items-center gap-2 text-sm text-Color-Scheme-1-Text"
              >
                <input
                  checked={checked}
                  className="h-4 w-4"
                  onChange={(event) => {
                    const nextValues = event.target.checked
                      ? [...selectedValues, value]
                      : selectedValues.filter((item) => item !== value);

                    handleFieldChange(field.canonical_key, nextValues);
                  }}
                  type="checkbox"
                />
                <span>{allowedValueLabels[value] ?? formatLabel(value)}</span>
              </label>
            );
          })}

          {normalizedCanonicalKey === "trustee_powers" && selectedLabels.length > 0 ? (
            <div className="border border-Color-Scheme-1-Border/30 bg-Color-Neutral-Lightest/60 px-3 py-2 text-xs text-Color-Neutral-Darkest">
              Selected trustee powers: {selectedLabels.join(", ")}
            </div>
          ) : null}
        </div>
      );
    }

    if (controlKind === "repeatable-text-list") {
      const values = toStringArrayValue(fieldValue);

      return (
        <div className="space-y-2 border border-Color-Scheme-1-Border/40 bg-white p-3">
          {values.length > 0 ? (
            values.map((value, index) => (
              <div key={`${field.canonical_key}-${index}`} className="flex items-center gap-2">
                <input
                  className={baseInputClassName}
                  onChange={(event) => {
                    const nextValues = [...values];
                    nextValues[index] = event.target.value;
                    handleFieldChange(field.canonical_key, nextValues);
                  }}
                  placeholder={getRepeatablePlaceholder(field.canonical_key, index)}
                  type="text"
                  value={value}
                />
                <button
                  className={secondaryButtonClassName}
                  onClick={() => {
                    const nextValues = values.filter((_, itemIndex) => itemIndex !== index);
                    handleFieldChange(field.canonical_key, nextValues);
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <div className="text-xs text-Color-Neutral">No entries yet.</div>
          )}
          <button
            className={subtleButtonClassName}
            onClick={() => {
              handleFieldChange(field.canonical_key, [...values, ""]);
            }}
            type="button"
          >
            {getRepeatableAddLabel(field.canonical_key)}
          </button>
        </div>
      );
    }

    if (controlKind === "repeatable-person-list") {
      const items = parsePersonListItems(fieldValue);
      const isTrusteeField = normalizedCanonicalKey === "trustees";
      const isSuccessorTrusteeField = normalizedCanonicalKey === "successor_trustees";
      const roleLabel = isTrusteeField ? "Trustee" : "Successor trustee";
      const addButtonLabel = isTrusteeField
        ? "Add trustee"
        : isSuccessorTrusteeField
          ? "Add successor trustee"
          : "Add person";

      const filledRows = getFilledPersonRows(items);
      const incompleteCount = getIncompletePersonRowCount(items);
      const invalidFormatCount = getInvalidPersonRowFormatCount(items);
      const missingSigner =
        isTrusteeField &&
        filledRows.length > 0 &&
        !hasSigningTrustee(filledRows.filter((item) => item.fullName.trim().length > 0));

      const updateItems = (nextItems: PersonListItem[]) => {
        handleFieldChange(field.canonical_key, serializePersonListItems(nextItems));

        if (isTrusteeField) {
          const signer = nextItems.find((item) => {
            return item.isSigningTrustee && item.fullName.trim().length > 0;
          });

          handleFieldChange(
            "trustee_signature_authority",
            signer ? signer.fullName.trim() : "",
          );
        }
      };

      return (
        <div className="space-y-3 border border-Color-Scheme-1-Border/40 bg-white p-3">
          {items.length > 0 ? (
            items.map((item, index) => (
              <div
                key={`${field.canonical_key}-person-${index}`}
                className="space-y-2 border border-Color-Scheme-1-Border/30 p-3"
              >
                <div className="grid gap-2 md:grid-cols-3">
                  <input
                    className={baseInputClassName}
                    onChange={(event) => {
                      const nextItems = [...items];
                      nextItems[index] = {
                        ...item,
                        fullName: event.target.value,
                      };
                      updateItems(nextItems);
                    }}
                    placeholder={`${roleLabel} full name`}
                    type="text"
                    value={item.fullName}
                  />
                  <input
                    className={baseInputClassName}
                    onChange={(event) => {
                      const nextItems = [...items];
                      nextItems[index] = {
                        ...item,
                        email: event.target.value,
                      };
                      updateItems(nextItems);
                    }}
                    placeholder="Email"
                    type="email"
                    value={item.email}
                  />
                  <div className="grid grid-cols-[190px_1fr] gap-2">
                    <div className="platform-select-wrap">
                      <select
                        className={baseInputClassName}
                        onChange={(event) => {
                          const nextPhoneCountryIso2 = event.target.value;
                          const nextItems = [...items];
                          nextItems[index] = {
                            ...item,
                            phoneCountryIso2: nextPhoneCountryIso2,
                            phoneCountryCode: getPhoneCountryCodeByIso2(nextPhoneCountryIso2),
                          };
                          updateItems(nextItems);
                        }}
                        value={item.phoneCountryIso2 || DEFAULT_PHONE_COUNTRY_ISO2}
                      >
                        {PHONE_COUNTRY_CODE_OPTIONS.map((option) => (
                          <option key={option.countryIso2} value={option.countryIso2}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <svg className="platform-select-icon" fill="none" viewBox="0 0 20 20">
                        <path
                          d="M5.5 7.75 10 12.25l4.5-4.5"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                    <input
                      className={baseInputClassName}
                      onChange={(event) => {
                        const nextItems = [...items];
                        nextItems[index] = {
                          ...item,
                          phone: event.target.value,
                        };
                        updateItems(nextItems);
                      }}
                      placeholder="Phone"
                      type="tel"
                      value={item.phone}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  {isTrusteeField ? (
                    <label className="flex items-center gap-2 text-xs text-Color-Scheme-1-Text">
                      <input
                        checked={Boolean(item.isSigningTrustee)}
                        className="h-4 w-4 accent-Color-Scheme-1-Text"
                        onChange={(event) => {
                          const isChecked = event.target.checked;
                          const nextItems = items.map((currentItem, itemIndex) => {
                            if (itemIndex !== index) {
                              return {
                                ...currentItem,
                                isSigningTrustee: false,
                              };
                            }

                            return {
                              ...currentItem,
                              isSigningTrustee: isChecked,
                            };
                          });

                          updateItems(nextItems);
                        }}
                        type="checkbox"
                      />
                      This trustee will sign
                    </label>
                  ) : (
                    <div className="text-xs text-Color-Neutral">Email and phone are required.</div>
                  )}

                  <button
                    className={secondaryButtonClassName}
                    onClick={() => {
                      const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
                      updateItems(nextItems);
                    }}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-Color-Neutral">No entries yet.</div>
          )}

          {incompleteCount > 0 ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Complete name, email, and phone for every {roleLabel.toLowerCase()} entry.
            </div>
          ) : null}

          {invalidFormatCount > 0 ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Use valid email and phone formats for every {roleLabel.toLowerCase()} entry.
            </div>
          ) : null}

          {missingSigner ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Select exactly one signing trustee before continuing.
            </div>
          ) : null}

          <button
            className={subtleButtonClassName}
            onClick={() => {
              updateItems([
                ...items,
                {
                  fullName: "",
                  email: "",
                  phoneCountryIso2: DEFAULT_PHONE_COUNTRY_ISO2,
                  phoneCountryCode: DEFAULT_PHONE_COUNTRY_CODE,
                  phone: "",
                  isSigningTrustee: false,
                },
              ]);
            }}
            type="button"
          >
            {addButtonLabel}
          </button>
        </div>
      );
    }

    if (controlKind === "repeatable-document-list") {
      const items = parsePriorDocumentItems(fieldValue);

      const updateItems = (nextItems: PriorDocumentItem[]) => {
        handleFieldChange(field.canonical_key, serializePriorDocumentItems(nextItems));
      };

      return (
        <div className="space-y-3 border border-Color-Scheme-1-Border/40 bg-white p-3">
          {items.length > 0 ? (
            items.map((item, index) => (
              <div
                key={`${field.canonical_key}-document-${index}`}
                className="space-y-2 border border-Color-Scheme-1-Border/30 p-3"
              >
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-[0.08em] text-Color-Neutral">
                      Type
                    </label>
                    <div className="platform-select-wrap">
                      <select
                        className={baseInputClassName}
                        onChange={(event) => {
                          const nextItems = [...items];
                          nextItems[index] = {
                            ...item,
                            documentType: event.target.value,
                          };
                          updateItems(nextItems);
                        }}
                        value={item.documentType}
                      >
                        <option value="">Select type</option>
                        {priorDocumentTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {formatLabel(option)}
                          </option>
                        ))}
                      </select>
                      <svg className="platform-select-icon" fill="none" viewBox="0 0 20 20">
                        <path
                          d="M5.5 7.75 10 12.25l4.5-4.5"
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-[0.08em] text-Color-Neutral">
                      Date
                    </label>
                    <input
                      className={`${baseInputClassName} platform-date-input`}
                      onChange={(event) => {
                        const nextItems = [...items];
                        nextItems[index] = {
                          ...item,
                          documentDate: event.target.value,
                        };
                        updateItems(nextItems);
                      }}
                      type="date"
                      value={item.documentDate}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.08em] text-Color-Neutral">
                    Document label
                  </label>
                  <input
                    className={baseInputClassName}
                    onChange={(event) => {
                      const nextItems = [...items];
                      nextItems[index] = {
                        ...item,
                        documentLabel: event.target.value,
                      };
                      updateItems(nextItems);
                    }}
                    placeholder="Original trust agreement"
                    type="text"
                    value={item.documentLabel}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.08em] text-Color-Neutral">
                    Attachment reference
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      className={baseInputClassName}
                      onChange={(event) => {
                        const nextItems = [...items];
                        nextItems[index] = {
                          ...item,
                          attachmentReference: event.target.value,
                        };
                        updateItems(nextItems);
                      }}
                      placeholder="agreement-2021.pdf"
                      type="text"
                      value={item.attachmentReference}
                    />
                    <button
                      className={secondaryButtonClassName}
                      onClick={() => {
                        const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
                        updateItems(nextItems);
                      }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
              <div className="text-xs text-Color-Neutral">No documents to include listed yet.</div>
          )}

          <button
            className={subtleButtonClassName}
            onClick={() => {
              updateItems([
                ...items,
                {
                  documentType: "other",
                  documentLabel: "",
                  documentDate: "",
                  attachmentReference: "",
                },
              ]);
            }}
            type="button"
          >
              Add document to include
          </button>
        </div>
      );
    }

    if (controlKind === "select") {
      return (
        <div className="platform-select-wrap">
          <select
            className={baseInputClassName}
            onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
            value={typeof fieldValue === "string" ? fieldValue : ""}
          >
            <option value="">Select an option</option>
            {allowedValues.map((value) => (
              <option key={value} value={value}>
                {allowedValueLabels[value] ?? formatLabel(value)}
              </option>
            ))}
          </select>
          <svg className="platform-select-icon" fill="none" viewBox="0 0 20 20">
            <path
              d="M5.5 7.75 10 12.25l4.5-4.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      );
    }

    if (controlKind === "textarea") {
      const textareaValue = Array.isArray(fieldValue)
        ? fieldValue.join("\n")
        : typeof fieldValue === "string"
          ? fieldValue
          : "";

      return (
        <textarea
          className={`${baseInputClassName} min-h-28`}
          maxLength={getNumberConstraint(field, "maxLength")}
          onChange={(event) => {
            if (field.data_type === "array") {
              const nextValues = event.target.value
                .split("\n")
                .map((entry) => entry.trim())
                .filter(Boolean);
              handleFieldChange(field.canonical_key, nextValues);
              return;
            }

            handleFieldChange(field.canonical_key, event.target.value);
          }}
          value={textareaValue}
        />
      );
    }

    return (
      <input
        className={baseInputClassName}
        maxLength={getNumberConstraint(field, "maxLength")}
        minLength={getNumberConstraint(field, "minLength")}
        onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
        type="text"
        value={typeof fieldValue === "string" ? fieldValue : ""}
      />
    );
  };

  const renderSection = (section: MemberFacingSection) => {
    const filteredSection: MemberFacingSection = {
      ...section,
      fields: section.fields.filter(
        (field) => !isTemporarilyHiddenCreateFlowField(field.canonical_key),
      ),
    };

    if (filteredSection.fields.length === 0) {
      return null;
    }

    const familyGroups = groupSectionFieldsByFamily<MemberFacingField>(
      filteredSection,
      fieldRuntime,
    );
    const sectionLayoutMode = getSectionLayoutMode(String(section.key));
    const sectionMicrocopy = getSectionMicrocopy(String(section.key));
    const groupGridClassName =
      sectionLayoutMode === "two-column" ? "grid gap-4 md:grid-cols-2" : "space-y-4";

    const sectionHeader = (
      <div>
        <div className="text-sm font-medium text-Color-Scheme-1-Text">{section.title}</div>
        {sectionMicrocopy ? (
          <div className="mt-1 text-xs text-Color-Neutral">{sectionMicrocopy}</div>
        ) : null}
      </div>
    );

    const sectionContent = (
      <div className="space-y-4">
        {familyGroups.map((group) => (
          <div key={`${section.key}-${group.scope}`} className="space-y-3">
            <div className={groupGridClassName}>
              {group.fields.map((field) => {
                const fieldRenderKey = [
                  section.key,
                  group.scope,
                  field.canonical_key,
                  field.sources
                    .map(
                      (source) =>
                        `${source.family}:${source.document_type}:${source.section_key}:${source.field_key}`,
                    )
                    .join("|"),
                ].join(":");
                const runtime = fieldRuntime.get(field.canonical_key);
                const activeSourceSummary = (runtime?.activeSources ?? [])
                  .map(
                    (source) =>
                      `${source.family.toUpperCase()} ${formatLabel(
                        source.document_type,
                      )} / ${formatLabel(source.field_key)}`,
                  )
                  .join(" | ");
                const fieldMicrocopy = getFieldMicrocopy(field.canonical_key);

                return (
                  <div key={fieldRenderKey} className="space-y-2">
                    {field.data_type === "boolean" ? null : renderFieldLabel(field)}
                    {renderFieldControl(field)}
                    {field.data_type === "boolean" ? <div>{renderFieldLabel(field)}</div> : null}
                    {fieldMicrocopy ? (
                      <div className="text-xs text-Color-Neutral">{fieldMicrocopy}</div>
                    ) : null}
                    {activeSourceSummary ? (
                      <div className="text-[11px] text-Color-Neutral">
                        Active source: {activeSourceSummary}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );

    if (section.key === "advanced") {
      return (
        <details key={section.key} className="group bg-Color-Neutral-Lightest/40">
          <summary className="list-none cursor-pointer p-4 [&::-webkit-details-marker]:hidden">
            <div className="flex items-start justify-between gap-3">
              {sectionHeader}
              <svg
                className="mt-0.5 h-4 w-4 text-Color-Neutral transition-transform duration-200 group-open:rotate-180"
                fill="none"
                viewBox="0 0 20 20"
              >
                <path
                  d="M5.5 7.75 10 12.25l4.5-4.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </summary>
          <div className="px-4 py-4">{sectionContent}</div>
        </details>
      );
    }

    return (
      <div
        key={section.key}
        id={section.key === "authority" ? "authority-scope-section" : undefined}
        className="space-y-3 bg-Color-Neutral-Lightest/40 p-4"
      >
        {sectionHeader}
        {sectionContent}
        {section.key === "people" && hasAuthoritySection ? (
          <div className="pt-2">
            <button
              type="button"
                className="inline-flex items-center gap-2 border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Text px-4 py-2 text-sm font-medium text-white transition hover:bg-Color-Scheme-1-Text/90"
              onClick={continueToAuthorityScope}
            >
              Continue to Authority Scope
              <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                <path
                  d="m7.5 5.5 5 4.5-5 4.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const isContinueDisabled =
    hasBlockingValidation ||
    isLoadingMemberForm ||
    !memberForm ||
    !allRequiredVisibleFieldsComplete ||
    !isDocumentsColumnComplete ||
    (hasAuthoritySection && currentFormStep === "people");

  return (
    <div className="space-y-8">
      <div className="space-y-2 pb-2">
        <div className="text-2xl font-medium">Create and secure your document</div>
        <div className="text-sm text-Color-Neutral">
          Fill in your details to generate your document.
          You’ll review, sign and finalize it securely.
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <ProcessBand />

          <div id="contract-container" ref={contractContainerRef} className="space-y-4 bg-white p-4">
            <div className="space-y-4 p-4">
              <div>
                <div className="text-sm font-medium">New document details</div>
                <div className="mt-1 text-xs text-Color-Neutral">
                  Answer each question in plain terms. If you're unsure, choose the closest option
                  and continue.
                </div>
              </div>

              <div className="space-y-2 rounded-md  bg-white p-3">
                <div className="text-sm font-medium">Jurisdiction</div>
                <div className="text-xs text-Color-Neutral">
                  Jurisdiction determines which state law governs this document, including signing
                  formalities, trustee authority language, and enforceability standards.
                </div>

                <div className="relative max-w-sm">
                  <div className="platform-select-wrap">
                    <select
                      className="platform-control"
                      disabled={isLoadingJurisdictions || jurisdictions.length === 0}
                      onChange={handleJurisdictionChange}
                      value={selectedJurisdiction}
                    >
                      <option value="">
                        {isLoadingJurisdictions
                          ? "Loading jurisdictions..."
                          : jurisdictions.length === 0
                            ? "No jurisdictions"
                            : "Select a jurisdiction"}
                      </option>
                      {jurisdictions.map((jurisdiction) => (
                        <option key={jurisdiction.code} value={jurisdiction.code}>
                          {formatJurisdictionDisplayLabel(
                            jurisdiction.label,
                            jurisdiction.code,
                          )}
                        </option>
                      ))}
                    </select>
                    <svg className="platform-select-icon" fill="none" viewBox="0 0 20 20">
                      <path
                        d="M5.5 7.75 10 12.25l4.5-4.5"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {errorMessage ? (
                <div className="bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
              ) : null}

              {missingRequirements.length > 0 ? (
                <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Missing rules for: {missingRequirements
                    .map((entry) => `${entry.family} (${formatLabel(entry.documentType)})`)
                    .join(", ")}
                </div>
              ) : null}

              {sourceOnlyVisibleCount > 0 ? (
                <div className="bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  {sourceOnlyVisibleCount} field{sourceOnlyVisibleCount > 1 ? "s" : ""} shown
                  here appear only when needed for your selected setup.
                </div>
              ) : null}

              {isLoadingMemberForm ? (
                <div className="text-sm text-Color-Neutral">Loading member form requirements...</div>
              ) : memberForm ? (
                  <div className="space-y-4">
                    {displayedPrimarySections.map((section) => renderSection(section))}

                    {currentFormStep === "authority" && hasAuthoritySection ? (
                      <div className="pt-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 border border-Color-Scheme-1-Border/40 bg-white px-4 py-2 text-sm font-medium text-Color-Scheme-1-Text transition hover:bg-Color-Neutral-Lightest"
                          onClick={returnToFirstSection}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 20 20">
                            <path
                              d="m12.5 5.5-5 4.5 5 4.5"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                            />
                          </svg>
                          Back to first section
                        </button>
                      </div>
                    ) : null}

                  {/* <details className="bg-Color-Neutral-Lightest/40">
                    <summary className="cursor-pointer p-4 text-sm font-medium text-Color-Scheme-1-Text">
                      Source trace snapshot ({memberForm.aggregatedForm.source_trace.length})
                    </summary>
                    <div className="space-y-2 px-4 py-3 text-sm">
                      {memberForm.aggregatedForm.source_trace.slice(0, 20).map((item) => (
                        <div
                          key={`${item.source}:${item.field}:${String(item.value)}`}
                          className="flex items-start justify-between gap-4"
                        >
                          <div className="text-Color-Neutral">{item.field}</div>
                          <div className="text-right font-medium text-Color-Scheme-1-Text">
                            {String(item.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details> */}
                </div>
              ) : null}
            </div>
          </div>
        </div>

          <div className="space-y-4 overflow-visible border border-Color-Scheme-1-Border/40 bg-white p-4 lg:sticky lg:top-20 lg:self-start">
          {!selectedJurisdiction ? (
            <div className="rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-xs text-Color-Neutral">
              Select a jurisdiction first to unlock document uploads.
            </div>
          ) : isLoadingMemberForm ? (
            <div className="text-sm text-Color-Neutral">Loading document requirements...</div>
            ) : memberForm ? (
              <div className="space-y-4">
                {documentsColumnFields.length > 0 ? (
                  documentsColumnFields.map((field) => {
                    const fieldMicrocopy = getFieldMicrocopy(field.canonical_key);

                    return (
                      <div key={`documents-column-${field.canonical_key}`} className="space-y-2">
                        {field.data_type === "boolean" ? null : renderFieldLabel(field)}
                        {renderFieldControl(field)}
                        {field.data_type === "boolean" ? <div>{renderFieldLabel(field)}</div> : null}
                        {fieldMicrocopy ? (
                          <div className="text-xs text-Color-Neutral">{fieldMicrocopy}</div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-Color-Neutral">
                    No document uploads are required for this jurisdiction.
                  </div>
                )}
              </div>
          ) : (
            <div className="text-xs text-Color-Neutral">
              No additional supporting document inputs are required for this jurisdiction.
            </div>
          )}

          {selectedJurisdiction ? (
            <button
              className={`w-full px-4 py-2 text-sm font-medium transition ${
                isContinueDisabled
                  ? "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                  : "platform-btn-primary"
              }`}
                disabled={isContinueDisabled}
            >
              Continue
            </button>
          ) : null}
        </div>
      </div>

      {isLeaveModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4">
          <div
            className="w-full max-w-md space-y-4 border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-start-modal-title"
          >
            <div className="space-y-1">
              <div id="leave-start-modal-title" className="text-base font-medium text-Color-Scheme-1-Text">
                Leave this page?
              </div>
              <div className="text-sm text-Color-Neutral">
                You have in-progress details that could be lost if you leave now.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="platform-btn-secondary px-3 py-2"
                onClick={closeLeaveModal}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="platform-btn-primary px-3 py-2"
                onClick={confirmLeaveModal}
              >
                Leave page
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
