"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";
import { HelpTooltip } from "@/app/app/start/HelpTooltip";
import ProductSelectionBand from "@/app/app/start/ProductSelectionBand";
import ProcessBand from "@/app/app/start/ProcessBand";
import { MockDataToggle } from "@/app/app/start/MockDataToggle";
import {
  buildInitialMemberFormValues,
  computeFieldRuntime,
  getSectionLayoutMode,
  groupSectionFieldsByFamily,
  getVisibleSections,
} from "@/app/app/start/memberFormRuntime";
import {
  DEFAULT_PHONE_COUNTRY_CODE,
  DEFAULT_PHONE_COUNTRY_ISO2,
  PHONE_COUNTRY_CODE_OPTIONS,
  getPhoneCountryCodeByIso2,
  getMemberFieldControlKind,
  hasSigningTrustee,
  isTemporarilyHiddenCreateFlowField,
  parsePriorDocumentItems,
  parsePersonContact,
  parsePersonListItems,
  serializePriorDocumentItems,
  serializePersonContact,
  serializePersonListItems,
  type PersonListItem,
  type PriorDocumentItem,
} from "@/app/app/start/memberFormControls";
import { buildMockFormValues } from "@/app/app/start/memberFormMockData";
import {
  priorDocumentTypeOptions,
  productFlowModesWithoutDocumentsColumn,
  productFlowStepFamilyScopes,
  productFlowStepLabels,
  productFlowStepOrderByMode,
  productFlowStepSectionKeys,
  productFlowUploadDefaultsByMode,
} from "@/app/app/start/startPageConstants";
import type {
  FormStep,
  FormValue,
  JurisdictionOption,
  MemberFacingField,
  MemberFacingSection,
  MemberFormJurisdictionsPayload,
  MemberFormPayload,
  MemberFormRulesContract,
  DocumentIntakeBootstrapResponsePayload,
  DocumentIntakeDraftResponsePayload,
  DocumentIntakeSubmitResponsePayload,
  MissingRequirement,
  ProductFlowModeDefinition,
  ProductFlowModesPayload,
  ProductFlowStepDefinition,
  ProductFlowModeKey,
} from "@/app/app/start/startPageTypes";
import {
  formatJurisdictionDisplayLabel,
  formatLabel,
  getAllowedValueLabels,
  getAllowedValues,
  getFieldMicrocopy,
  getFilledPersonRows,
  getFilledPriorDocumentRows,
  getIncompletePersonRowCount,
  getIncompletePriorDocumentRowCount,
  getInvalidPersonRowFormatCount,
  getNumberConstraint,
  getPriorDocumentChronologyOutOfOrderCount,
  getRepeatableAddLabel,
  getRepeatablePlaceholder,
  getSectionMicrocopy,
  hasOriginatingPriorDocumentType,
  isNameInList,
  isProductFlowModeKey,
  isProductFlowStepKey,
  isTaxIdOwnerSelectionBoundToTrustmakers,
  isTrusteeListField,
  normalizeCanonicalKey,
  normalizeNameForComparison,
  normalizeSignatureAuthorityMode,
  readStartFormDraft,
  sanitizeFormValuesRecord,
  toStringArrayValue,
  validatePersonContact,
  writeStartFormDraft,
} from "@/app/app/start/startPageUtils";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

const fetchWithTokenRefresh = async (
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> => {
  const requestWithToken = (token: string) => {
    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(url, {
      ...init,
      headers,
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

const coerceDraftFormStep = (value: unknown): FormStep => {
  if (typeof value !== "string") {
    return "general_information";
  }

  const normalized = value.trim();
  if (isProductFlowStepKey(normalized)) {
    return normalized;
  }

  if (normalized === "authority") {
    return "trust_requirements";
  }

  return "general_information";
};

const buildDraftSignature = (
  currentFormStep: FormStep,
  formValues: Record<string, FormValue>,
) => {
  return JSON.stringify({
    currentFormStep,
    formValues,
  });
};

type LeaveAction =
  | { type: "href"; href: string }
  | { type: "history-back" }
  | { type: "reload" }
  | { type: "clear-product-selection" }
  | { type: "change-jurisdiction"; jurisdiction: string };

export default function StartDocumentPage() {
  const router = useRouter();
  const { accessToken } = useStoredAuth();
  const [productFlowModes, setProductFlowModes] = useState<ProductFlowModeDefinition[]>([]);
  const [selectedProductFlowMode, setSelectedProductFlowMode] = useState<
    ProductFlowModeKey | ""
  >("");
  const [resolvedProductFlowMode, setResolvedProductFlowMode] =
    useState<ProductFlowModeDefinition | null>(null);
  const [isLoadingProductFlowModes, setIsLoadingProductFlowModes] = useState(false);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("");
  const [isMockDataEnabled, setIsMockDataEnabled] = useState(true);
  const [isActiveSourceVisible, setIsActiveSourceVisible] = useState(false);

  const [memberForm, setMemberForm] = useState<MemberFormRulesContract | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({});

  const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(false);
  const [isLoadingMemberForm, setIsLoadingMemberForm] = useState(false);
  const [isValidatingMemberFormSubmission, setIsValidatingMemberFormSubmission] =
    useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submissionErrorMessage, setSubmissionErrorMessage] = useState<string | null>(null);
  const [missingRequirements, setMissingRequirements] = useState<MissingRequirement[]>([]);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<LeaveAction | null>(null);
  const [currentFormStep, setCurrentFormStep] = useState<FormStep>("general_information");
  const [activeDropzoneFieldKey, setActiveDropzoneFieldKey] = useState<string | null>(null);
  const [draftDocumentId, setDraftDocumentId] = useState<string | null>(null);
  const [draftRevision, setDraftRevision] = useState<number | null>(null);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSaveNotice, setDraftSaveNotice] = useState<string | null>(null);
  const allowLeavingRef = useRef(false);
  const hasPushedHistoryGuardRef = useRef(false);
  const lastServerDraftSignatureRef = useRef<string | null>(null);
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

  const selectedProductFlowModeDefinition = useMemo(() => {
    if (!selectedProductFlowMode) {
      return null;
    }

    const fromResolvedMode =
      resolvedProductFlowMode?.modeKey === selectedProductFlowMode
        ? resolvedProductFlowMode
        : null;

    return (
      fromResolvedMode ??
      productFlowModes.find((mode) => mode.modeKey === selectedProductFlowMode) ??
      null
    );
  }, [productFlowModes, resolvedProductFlowMode, selectedProductFlowMode]);

  const isMockDataToggleVisible = process.env.NODE_ENV !== "production";
  const isMockDataToggleDisabled =
    !selectedProductFlowMode ||
    !selectedJurisdiction ||
    isLoadingMemberForm ||
    !memberForm;
  const isActiveSourceToggleDisabled = isLoadingMemberForm || !memberForm;

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    const loadProductFlowModes = async () => {
      setIsLoadingProductFlowModes(true);
      setErrorMessage(null);

      try {
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/rules/product-flow-modes`,
          accessToken,
        );

        const payload = (await response.json().catch(() => null)) as
          | ProductFlowModesPayload
          | null;

        if (!response.ok || !payload?.modes) {
          throw new Error(payload?.message || "Failed to load product modes");
        }

        if (cancelled) {
          return;
        }

        const nextModes = payload.modes
          .filter((mode) => mode.isActive)
          .sort((left, right) => left.sortOrder - right.sortOrder);

        setProductFlowModes(nextModes);

        setSelectedProductFlowMode((current) => {
          if (current && nextModes.some((mode) => mode.modeKey === current)) {
            return current;
          }

          return "";
        });

        setResolvedProductFlowMode((current) => {
          if (!current) {
            return null;
          }

          return nextModes.find((mode) => mode.modeKey === current.modeKey) ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          setProductFlowModes([]);
          setSelectedProductFlowMode("");
          setResolvedProductFlowMode(null);
          setJurisdictions([]);
          setSelectedJurisdiction("");
          setMemberForm(null);
          setFormValues({});
          setDraftDocumentId(null);
          setDraftRevision(null);
          setDraftUpdatedAt(null);
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          lastServerDraftSignatureRef.current = null;
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load product modes",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProductFlowModes(false);
        }
      }
    };

    void loadProductFlowModes();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedProductFlowMode) {
      return;
    }

    let cancelled = false;

    const loadJurisdictions = async () => {
      setIsLoadingJurisdictions(true);
      setErrorMessage(null);
      setMissingRequirements([]);

      try {
        const query = new URLSearchParams({
          mode: selectedProductFlowMode,
        }).toString();
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/rules/member-form?${query}`,
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
        const modeFromPayload = payload.mode;
        setResolvedProductFlowMode(
          modeFromPayload ??
            productFlowModes.find((mode) => mode.modeKey === selectedProductFlowMode) ??
            null,
        );
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
          setDraftDocumentId(null);
          setDraftRevision(null);
          setDraftUpdatedAt(null);
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          lastServerDraftSignatureRef.current = null;
        }
      } catch (error) {
        if (!cancelled) {
          setJurisdictions([]);
          setSelectedJurisdiction("");
          setMemberForm(null);
          setFormValues({});
          setDraftDocumentId(null);
          setDraftRevision(null);
          setDraftUpdatedAt(null);
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          lastServerDraftSignatureRef.current = null;
          setResolvedProductFlowMode(
            productFlowModes.find((mode) => mode.modeKey === selectedProductFlowMode) ??
              null,
          );
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
  }, [accessToken, productFlowModes, selectedProductFlowMode]);

  useEffect(() => {
    if (!accessToken || !selectedProductFlowMode || !selectedJurisdiction) {
      return;
    }

    let cancelled = false;

    const loadMemberForm = async () => {
      setIsLoadingMemberForm(true);
      setErrorMessage(null);
      setMissingRequirements([]);

      try {
        const query = new URLSearchParams({
          mode: selectedProductFlowMode,
        }).toString();
        const response = await fetchWithTokenRefresh(
          `${apiBaseUrl}/rules/member-form/${selectedJurisdiction}?${query}`,
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

        if (payload.memberForm.productFlowMode) {
          setResolvedProductFlowMode(payload.memberForm.productFlowMode);
        }

        const initialValues = buildInitialMemberFormValues(payload.memberForm, {
          jurisdictionCode: selectedJurisdiction,
          jurisdictionLabel: selectedJurisdictionLabel,
        });

        const localDraft = readStartFormDraft(
          selectedProductFlowMode,
          selectedJurisdiction,
        );

        let bootstrapPayload: DocumentIntakeBootstrapResponsePayload | null = null;
        let bootstrapErrorMessage: string | null = null;

        try {
          const bootstrapResponse = await fetchWithTokenRefresh(
            `${apiBaseUrl}/documents/intake/bootstrap`,
            accessToken,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                productFlowMode: selectedProductFlowMode,
                jurisdiction: selectedJurisdiction,
                rulesSnapshotVersion: "member_form_rules_contract_v1",
              }),
            },
          );

          bootstrapPayload = (await bootstrapResponse.json().catch(() => null)) as
            | DocumentIntakeBootstrapResponsePayload
            | null;

          if (!bootstrapResponse.ok || !bootstrapPayload?.document?.id) {
            throw new Error(
              bootstrapPayload?.message ||
                "Failed to initialize intake draft persistence",
            );
          }
        } catch (error) {
          bootstrapErrorMessage =
            error instanceof Error
              ? error.message
              : "Failed to initialize intake draft persistence";
        }

        if (cancelled) {
          return;
        }

        setMemberForm(payload.memberForm);

        if (bootstrapPayload?.document?.id) {
          const remoteDraft = bootstrapPayload.draft;
          const remoteValues = sanitizeFormValuesRecord(remoteDraft?.answers ?? {});
          const nextFormValues = {
            ...initialValues,
            ...remoteValues,
          };
          const nextCurrentFormStep =
            selectedProductFlowMode === "trust_bundle"
              ? "general_information"
              : coerceDraftFormStep(remoteDraft?.currentStep);

          setFormValues(nextFormValues);
          setCurrentFormStep(nextCurrentFormStep);
          setDraftDocumentId(bootstrapPayload.document.id);
          setDraftRevision(
            typeof remoteDraft?.revision === "number" ? remoteDraft.revision : null,
          );
          setDraftUpdatedAt(
            typeof remoteDraft?.updatedAt === "string" ? remoteDraft.updatedAt : null,
          );
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          lastServerDraftSignatureRef.current = buildDraftSignature(
            nextCurrentFormStep,
            nextFormValues,
          );
        } else {
          const nextFormValues = {
            ...initialValues,
            ...(localDraft?.formValues ?? {}),
          };
          const nextCurrentFormStep =
            selectedProductFlowMode === "trust_bundle"
              ? "general_information"
              : (localDraft?.currentFormStep ?? "general_information");

          setFormValues(nextFormValues);
          setCurrentFormStep(nextCurrentFormStep);
          setDraftDocumentId(null);
          setDraftRevision(null);
          setDraftUpdatedAt(null);
          setIsSavingDraft(false);
          setDraftSaveNotice(
            bootstrapErrorMessage
              ? `Using local draft fallback: ${bootstrapErrorMessage}`
              : "Using local draft fallback",
          );
          lastServerDraftSignatureRef.current = null;
        }
      } catch (error) {
        if (!cancelled) {
          setMemberForm(null);
          setFormValues({});
          setDraftDocumentId(null);
          setDraftRevision(null);
          setDraftUpdatedAt(null);
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          lastServerDraftSignatureRef.current = null;
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
  }, [
    accessToken,
    selectedJurisdiction,
    selectedJurisdictionLabel,
    selectedProductFlowMode,
  ]);

  useEffect(() => {
    if (!isMockDataEnabled || !memberForm || !selectedJurisdiction || isLoadingMemberForm) {
      return;
    }

    setFormValues(
      buildMockFormValues(memberForm, {
        jurisdictionCode: selectedJurisdiction,
        jurisdictionLabel: selectedJurisdictionLabel,
      }),
    );
  }, [
    isLoadingMemberForm,
    isMockDataEnabled,
    memberForm,
    selectedJurisdiction,
    selectedJurisdictionLabel,
  ]);

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

  const configuredWizardStepKeys = useMemo<FormStep[]>(() => {
    const modeDefinition = selectedProductFlowModeDefinition ?? resolvedProductFlowMode;

    const configuredKeys = [...(modeDefinition?.ui ?? [])]
      .filter((entry) => entry.layoutMode === "wizard-step")
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((entry) => entry.groupKey)
      .filter((groupKey): groupKey is FormStep => isProductFlowStepKey(groupKey));

    if (configuredKeys.length > 0) {
      return [...new Set(configuredKeys)];
    }

    if (selectedProductFlowMode) {
      return productFlowStepOrderByMode[selectedProductFlowMode];
    }

    return productFlowStepOrderByMode.trust_bundle;
  }, [resolvedProductFlowMode, selectedProductFlowMode, selectedProductFlowModeDefinition]);

  const formStepDefinitions = useMemo<ProductFlowStepDefinition[]>(() => {
    return configuredWizardStepKeys
      .map((stepKey) => {
        const sectionKeys = productFlowStepSectionKeys[stepKey];
        const sections = primarySections.filter((section) => sectionKeys.includes(section.key));

        return {
          stepKey,
          label: productFlowStepLabels[stepKey],
          sectionKeys,
          sections,
        };
      })
      .filter((step) => step.sections.length > 0);
  }, [configuredWizardStepKeys, primarySections]);

  const activeFormStepIndex = useMemo(() => {
    const stepIndex = formStepDefinitions.findIndex(
      (stepDefinition) => stepDefinition.stepKey === currentFormStep,
    );

    return stepIndex >= 0 ? stepIndex : 0;
  }, [currentFormStep, formStepDefinitions]);

  const activeFormStep = formStepDefinitions[activeFormStepIndex] ?? null;

  const previousFormStep =
    activeFormStepIndex > 0 ? formStepDefinitions[activeFormStepIndex - 1] ?? null : null;

  const nextFormStep =
    activeFormStepIndex >= 0 && activeFormStepIndex < formStepDefinitions.length - 1
      ? formStepDefinitions[activeFormStepIndex + 1] ?? null
      : null;

  const documentsColumnFields = useMemo<MemberFacingField[]>(() => {
    return documentSections
      .flatMap((section) => section.fields)
      .filter((field) => !isTemporarilyHiddenCreateFlowField(field.canonical_key)) as MemberFacingField[];
  }, [documentSections]);

  const selectedModeKeyForLayout =
    selectedProductFlowMode || selectedProductFlowModeDefinition?.modeKey || "";
  const shouldHideDocumentsColumn =
    selectedModeKeyForLayout.length > 0 &&
    productFlowModesWithoutDocumentsColumn.has(
      selectedModeKeyForLayout as ProductFlowModeKey,
    );

  const uploadColumnBehavior = useMemo(() => {
    const modeKey = selectedProductFlowMode || selectedProductFlowModeDefinition?.modeKey;
    if (modeKey && productFlowModesWithoutDocumentsColumn.has(modeKey)) {
      return {
        showUploadColumn: false,
        uploadRequired: false,
      };
    }

    const fallbackBehavior = modeKey
      ? productFlowUploadDefaultsByMode[modeKey]
      : {
          showUploadColumn: false,
          uploadRequired: false,
        };

    const modeDefinition = selectedProductFlowModeDefinition ?? resolvedProductFlowMode;
    if (!modeDefinition || modeDefinition.ui.length === 0) {
      return fallbackBehavior;
    }

    return {
      showUploadColumn: modeDefinition.ui.some((entry) => entry.showUploadColumn),
      uploadRequired: modeDefinition.ui.some((entry) => entry.uploadRequired),
    };
  }, [resolvedProductFlowMode, selectedProductFlowMode, selectedProductFlowModeDefinition]);

  const shouldRenderDocumentsColumn = !shouldHideDocumentsColumn;

  const shouldShowUploadColumn = uploadColumnBehavior.showUploadColumn;
  const uploadRequiredByMode = uploadColumnBehavior.uploadRequired;

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

  const isDocumentsColumnComplete =
    !shouldShowUploadColumn || !uploadRequiredByMode || hasDocumentsUploadValue;

  const displayedPrimarySections = activeFormStep?.sections ?? [];

  const hasPreviousFormStep = previousFormStep !== null;
  const hasNextFormStep = nextFormStep !== null;

  useEffect(() => {
    setCurrentFormStep("general_information");
  }, [selectedJurisdiction]);

  useEffect(() => {
    if (formStepDefinitions.length === 0) {
      return;
    }

    if (!formStepDefinitions.some((stepDefinition) => stepDefinition.stepKey === currentFormStep)) {
      setCurrentFormStep(formStepDefinitions[0]?.stepKey ?? "general_information");
    }
  }, [currentFormStep, formStepDefinitions]);

  useEffect(() => {
    if (!selectedProductFlowMode || !selectedJurisdiction || !memberForm) {
      return;
    }

    writeStartFormDraft(selectedProductFlowMode, selectedJurisdiction, {
      currentFormStep,
      formValues,
    });
  }, [
    currentFormStep,
    formValues,
    memberForm,
    selectedJurisdiction,
    selectedProductFlowMode,
  ]);

  useEffect(() => {
    if (
      !accessToken ||
      !draftDocumentId ||
      !selectedProductFlowMode ||
      !selectedJurisdiction ||
      !memberForm ||
      isLoadingMemberForm ||
      isValidatingMemberFormSubmission
    ) {
      return;
    }

    const signature = buildDraftSignature(currentFormStep, formValues);
    if (lastServerDraftSignatureRef.current === signature) {
      return;
    }

    const saveTimer = window.setTimeout(() => {
      const persistDraft = async () => {
        setIsSavingDraft(true);

        try {
          const requestPayload: Record<string, unknown> = {
            currentStep: currentFormStep,
            rulesSnapshotVersion: "member_form_rules_contract_v1",
            answers: formValues,
          };

          if (typeof draftRevision === "number") {
            requestPayload.expectedRevision = draftRevision;
          }

          const response = await fetchWithTokenRefresh(
            `${apiBaseUrl}/documents/${draftDocumentId}/intake-draft`,
            accessToken,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestPayload),
            },
          );

          const payload = (await response.json().catch(() => null)) as
            | DocumentIntakeDraftResponsePayload
            | null;

          if (response.status === 409) {
            const currentRevision =
              typeof payload?.currentRevision === "number"
                ? payload.currentRevision
                : null;

            if (currentRevision !== null) {
              setDraftRevision(currentRevision);
            }

            const latestResponse = await fetchWithTokenRefresh(
              `${apiBaseUrl}/documents/${draftDocumentId}/intake-draft`,
              accessToken,
            );
            const latestPayload = (await latestResponse
              .json()
              .catch(() => null)) as DocumentIntakeDraftResponsePayload | null;

            if (latestResponse.ok && latestPayload?.draft) {
              const mergedFormValues = {
                ...formValues,
                ...sanitizeFormValuesRecord(latestPayload.draft.answers),
              };
              const syncedCurrentStep =
                selectedProductFlowMode === "trust_bundle"
                  ? "general_information"
                  : coerceDraftFormStep(latestPayload.draft.currentStep);

              setFormValues(mergedFormValues);
              setCurrentFormStep(syncedCurrentStep);
              setDraftRevision(latestPayload.draft.revision);
              setDraftUpdatedAt(latestPayload.draft.updatedAt);
              lastServerDraftSignatureRef.current = buildDraftSignature(
                syncedCurrentStep,
                mergedFormValues,
              );
            }

            setDraftSaveNotice(
              "Draft changed in another session. Loaded the latest saved version.",
            );

            return;
          }

          if (!response.ok || !payload?.draft) {
            throw new Error(payload?.message ?? "Failed to save draft");
          }

          setDraftRevision(payload.draft.revision);
          setDraftUpdatedAt(payload.draft.updatedAt);
          setDraftSaveNotice(null);
          lastServerDraftSignatureRef.current = signature;
        } catch (error) {
          setDraftSaveNotice(
            error instanceof Error ? error.message : "Failed to save draft",
          );
        } finally {
          setIsSavingDraft(false);
        }
      };

      void persistDraft();
    }, 750);

    return () => {
      window.clearTimeout(saveTimer);
    };
  }, [
    accessToken,
    currentFormStep,
    draftDocumentId,
    draftRevision,
    formValues,
    isLoadingMemberForm,
    isValidatingMemberFormSubmission,
    memberForm,
    selectedJurisdiction,
    selectedProductFlowMode,
  ]);

  const draftUpdatedAtLabel = useMemo(() => {
    if (!draftUpdatedAt) {
      return null;
    }

    const parsed = new Date(draftUpdatedAt);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed.toLocaleString();
  }, [draftUpdatedAt]);

  const draftStatusLabel = useMemo(() => {
    if (!selectedProductFlowMode || !selectedJurisdiction || !memberForm) {
      return null;
    }

    if (!draftDocumentId) {
      return "Saving draft locally in this browser.";
    }

    if (isSavingDraft) {
      return "Saving draft...";
    }

    if (draftUpdatedAtLabel) {
      return typeof draftRevision === "number"
        ? `Draft saved ${draftUpdatedAtLabel} (revision ${draftRevision}).`
        : `Draft saved ${draftUpdatedAtLabel}.`;
    }

    return "Draft sync is active.";
  }, [
    draftDocumentId,
    draftRevision,
    draftUpdatedAtLabel,
    isSavingDraft,
    memberForm,
    selectedJurisdiction,
    selectedProductFlowMode,
  ]);

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

  const trustmakerNames = useMemo(() => {
    const names = parsePersonListItems(formValues.grantors)
      .map((item) => item.fullName.trim())
      .filter((name) => name.length > 0);

    const uniqueNames: string[] = [];
    const seen = new Set<string>();

    for (const name of names) {
      const normalized = normalizeNameForComparison(name);
      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      uniqueNames.push(name);
    }

    return uniqueNames;
  }, [formValues.grantors]);

  const getResolvedAllowedValues = useCallback((field: MemberFacingField) => {
    if (isTaxIdOwnerSelectionBoundToTrustmakers(field) && trustmakerNames.length > 1) {
      return trustmakerNames;
    }

    return getAllowedValues(field);
  }, [trustmakerNames]);

  const getResolvedAllowedValueLabels = useCallback((
    field: MemberFacingField,
    allowedValues: string[],
  ) => {
    if (isTaxIdOwnerSelectionBoundToTrustmakers(field) && trustmakerNames.length > 1) {
      return Object.fromEntries(allowedValues.map((value) => [value, value])) as Record<
        string,
        string
      >;
    }

    return getAllowedValueLabels(field);
  }, [trustmakerNames]);

  const taxIdOwnerField = useMemo(() => {
    return visibleSections
      .flatMap((section) => section.fields)
      .find((field) => normalizeCanonicalKey(field.canonical_key) === "tax_id_owner");
  }, [visibleSections]);

  const taxIdOwnerValidation = useMemo(() => {
    if (!taxIdOwnerField) {
      return {
        requiresTrustmakerSelection: false,
        isValid: true,
      };
    }

    const requiresTrustmakerSelection =
      isTaxIdOwnerSelectionBoundToTrustmakers(taxIdOwnerField) && trustmakerNames.length > 1;

    if (!requiresTrustmakerSelection) {
      return {
        requiresTrustmakerSelection: false,
        isValid: true,
      };
    }

    const selectedTaxIdOwner =
      typeof formValues.tax_id_owner === "string" ? formValues.tax_id_owner.trim() : "";

    return {
      requiresTrustmakerSelection: true,
      isValid: isNameInList(selectedTaxIdOwner, trustmakerNames),
    };
  }, [formValues.tax_id_owner, taxIdOwnerField, trustmakerNames]);

  const trusteeSignatureAuthorityMode = useMemo(() => {
    return normalizeSignatureAuthorityMode(formValues.trustee_signature_authority);
  }, [formValues.trustee_signature_authority]);

  const requiresNamedSigningTrusteeSelection =
    trusteeSignatureAuthorityMode === "named_signing_trustee";

  useEffect(() => {
    if (requiresNamedSigningTrusteeSelection) {
      return;
    }

    const trusteeRows = parsePersonListItems(formValues.trustees);
    if (!trusteeRows.some((row) => row.isSigningTrustee)) {
      return;
    }

    const normalizedRows = trusteeRows.map((row) => ({
      ...row,
      isSigningTrustee: false,
    }));

    setFormValues((current) => ({
      ...current,
      trustees: serializePersonListItems(normalizedRows),
    }));
  }, [formValues.trustees, requiresNamedSigningTrusteeSelection]);

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
    const signingTrusteeCount = filledRows.filter(
      (item) => item.fullName.trim().length > 0 && item.isSigningTrustee,
    ).length;
    const missingNamedSigner =
      requiresNamedSigningTrusteeSelection &&
      filledRows.length > 0 &&
      signingTrusteeCount === 0;
    const multipleNamedSigners =
      requiresNamedSigningTrusteeSelection &&
      signingTrusteeCount > 1;
    const namedSignerModeConflict =
      !requiresNamedSigningTrusteeSelection && signingTrusteeCount > 0;

    return {
      hasRows: filledRows.length > 0,
      incompleteCount,
      invalidFormatCount,
      missingNamedSigner,
      multipleNamedSigners,
      namedSignerModeConflict,
    };
  }, [formValues, requiresNamedSigningTrusteeSelection]);

  const successorTrusteeValidation = useMemo(() => {
    const rows = parsePersonListItems(formValues.successor_trustees);
    const filledRows = getFilledPersonRows(rows);
    return {
      hasRows: filledRows.length > 0,
      incompleteCount: getIncompletePersonRowCount(rows),
      invalidFormatCount: getInvalidPersonRowFormatCount(rows),
    };
  }, [formValues]);

  const priorDocumentItemsValidation = useMemo(() => {
    if (!visibleCanonicalKeys.has("prior_document_items")) {
      return {
        hasRows: false,
        incompleteCount: 0,
        missingOriginatingDocument: false,
        chronologyOutOfOrderCount: 0,
      };
    }

    const items = parsePriorDocumentItems(formValues.prior_document_items);
    const filledRows = getFilledPriorDocumentRows(items);
    const incompleteCount = getIncompletePriorDocumentRowCount(items);
    const missingOriginatingDocument =
      filledRows.length > 0 && !hasOriginatingPriorDocumentType(filledRows[0]);
    const chronologyOutOfOrderCount =
      incompleteCount === 0 ? getPriorDocumentChronologyOutOfOrderCount(items) : 0;

    return {
      hasRows: filledRows.length > 0,
      incompleteCount,
      missingOriginatingDocument,
      chronologyOutOfOrderCount,
    };
  }, [formValues.prior_document_items, visibleCanonicalKeys]);

  const hasBlockingValidation =
    principalContactValidation.hasErrors ||
    agentContactValidation.hasErrors ||
    trusteeValidation.incompleteCount > 0 ||
    trusteeValidation.invalidFormatCount > 0 ||
    trusteeValidation.missingNamedSigner ||
    trusteeValidation.multipleNamedSigners ||
    trusteeValidation.namedSignerModeConflict ||
    priorDocumentItemsValidation.incompleteCount > 0 ||
    priorDocumentItemsValidation.missingOriginatingDocument ||
    priorDocumentItemsValidation.chronologyOutOfOrderCount > 0 ||
    !taxIdOwnerValidation.isValid ||
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
        const resolvedAllowedValues = getResolvedAllowedValues(field);
        const controlKind = getMemberFieldControlKind(field, resolvedAllowedValues);

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
            requiresNamedSigningTrusteeSelection &&
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
          const filledRows = getFilledPriorDocumentRows(items);

          if (filledRows.length === 0) {
            return false;
          }

          if (getIncompletePriorDocumentRowCount(items) > 0) {
            return false;
          }

          if (!hasOriginatingPriorDocumentType(filledRows[0])) {
            return false;
          }

          if (getPriorDocumentChronologyOutOfOrderCount(items) > 0) {
            return false;
          }

          return true;
        }

        if (controlKind === "file-upload") {
          return typeof fieldValue === "string" && fieldValue.trim().length > 0;
        }

        if (controlKind === "select") {
          if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
            return false;
          }

          if (
            isTaxIdOwnerSelectionBoundToTrustmakers(field) &&
            trustmakerNames.length > 1
          ) {
            return isNameInList(fieldValue, trustmakerNames);
          }

          return true;
        }

        if (
          controlKind === "number" ||
          controlKind === "date" ||
          controlKind === "textarea" ||
          controlKind === "text"
        ) {
          return typeof fieldValue === "string" && fieldValue.trim().length > 0;
        }

        return true;
      });
    });
  }, [
    fieldRuntime,
    formValues,
    getResolvedAllowedValues,
    requiresNamedSigningTrusteeSelection,
    trustmakerNames,
    visibleSections,
  ]);

  const hasUnsavedProgress = useMemo(() => {
    if (!selectedJurisdiction) {
      return false;
    }

    return Object.keys(formValues).length > 0;
  }, [formValues, selectedJurisdiction]);

  const leaveModalCopy = useMemo(() => {
    if (pendingLeaveAction?.type === "clear-product-selection") {
      return {
        title: "Clear selected product?",
        description:
          "You have in-progress details that could be lost if you clear this product selection.",
        confirmLabel: "Clear selection",
      };
    }

    if (pendingLeaveAction?.type === "change-jurisdiction") {
      return {
        title: "Change jurisdiction?",
        description:
          "You have in-progress details that could be lost if you switch jurisdictions now.",
        confirmLabel: "Switch jurisdiction",
      };
    }

    return {
      title: "Leave this page?",
      description: "You have in-progress details that could be lost if you leave now.",
      confirmLabel: "Leave page",
    };
  }, [pendingLeaveAction]);

  const openLeaveModal = (action: LeaveAction) => {
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

    if (action.type === "href" || action.type === "reload" || action.type === "history-back") {
      allowLeavingRef.current = true;
    }

    setIsLeaveModalOpen(false);
    setPendingLeaveAction(null);

    if (action.type === "clear-product-selection") {
      applyProductFlowModeSelection("");
      return;
    }

    if (action.type === "change-jurisdiction") {
      applyJurisdictionSelection(action.jurisdiction);
      return;
    }

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

  const continueToNextSectionGroup = () => {
    if (!nextFormStep) {
      return;
    }

    setCurrentFormStep(nextFormStep.stepKey);
  };

  const returnToPreviousSectionGroup = () => {
    if (!previousFormStep) {
      return;
    }

    setCurrentFormStep(previousFormStep.stepKey);
  };

  const submitMemberFormOnServer = useCallback(async () => {
    if (
      !accessToken ||
      !selectedProductFlowMode ||
      !selectedJurisdiction ||
      !memberForm ||
      !draftDocumentId
    ) {
      setSubmissionErrorMessage("Missing context to submit member form.");
      return false;
    }

    setIsValidatingMemberFormSubmission(true);
    setSubmissionErrorMessage(null);

    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${draftDocumentId}/intake-submit`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentStep: currentFormStep,
            rulesSnapshotVersion: "member_form_rules_contract_v1",
            answers: formValues,
            ...(typeof draftRevision === "number"
              ? { expectedRevision: draftRevision }
              : {}),
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | DocumentIntakeSubmitResponsePayload
        | null;

      if (response.status === 422 || payload?.valid === false) {
        const firstErrorMessage = payload?.errors?.find(
          (item) => typeof item.message === "string" && item.message.trim().length > 0,
        )?.message;

        setSubmissionErrorMessage(
          firstErrorMessage ??
            payload?.message ??
            "Member form validation failed. Review your entries and try again.",
        );
        return false;
      }

      if (response.status === 409) {
        if (typeof payload?.currentRevision === "number") {
          setDraftRevision(payload.currentRevision);
        }

        setSubmissionErrorMessage(
          payload?.message ??
            "Your draft changed before submission. Please review and submit again.",
        );
        return false;
      }

      if (!response.ok || !payload?.draft) {
        setSubmissionErrorMessage(
          payload?.message ?? "Failed to submit member form.",
        );
        return false;
      }

      setDraftRevision(payload.draft.revision);
      setDraftUpdatedAt(payload.draft.updatedAt);
      setDraftSaveNotice("Intake submitted and locked for generation.");
      setSubmissionErrorMessage(null);
      allowLeavingRef.current = true;
      router.push(`/app/documents/${draftDocumentId}`);

      return true;
    } catch (error) {
      setSubmissionErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to submit member form.",
      );
      return false;
    } finally {
      setIsValidatingMemberFormSubmission(false);
    }
  }, [
    accessToken,
    currentFormStep,
    draftDocumentId,
    draftRevision,
    formValues,
    memberForm,
    router,
    selectedJurisdiction,
    selectedProductFlowMode,
  ]);

  const handleFinalContinue = async () => {
    if (isContinueDisabled || hasNextFormStep) {
      return;
    }

    await submitMemberFormOnServer();
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

  const applyProductFlowModeSelection = (normalizedMode: ProductFlowModeKey | "") => {
    setSelectedProductFlowMode(normalizedMode);
    setResolvedProductFlowMode(
      normalizedMode
        ? productFlowModes.find((mode) => mode.modeKey === normalizedMode) ?? null
        : null,
    );
    setJurisdictions([]);
    setSelectedJurisdiction("");
    setIsMockDataEnabled(true);
    setMemberForm(null);
    setFormValues({});
    setCurrentFormStep("general_information");
    setMissingRequirements([]);
    setErrorMessage(null);
    setSubmissionErrorMessage(null);
  };

  const applyJurisdictionSelection = (nextJurisdiction: string) => {
    setSelectedJurisdiction(nextJurisdiction);

    if (!nextJurisdiction) {
      setIsMockDataEnabled(true);
      setMemberForm(null);
      setFormValues({});
      setCurrentFormStep("general_information");
      setMissingRequirements([]);
      setErrorMessage(null);
      setSubmissionErrorMessage(null);
    }
  };

  const handleClearSelectedProductFlowMode = () => {
    if (!hasUnsavedProgress || allowLeavingRef.current) {
      applyProductFlowModeSelection("");
      return;
    }

    openLeaveModal({ type: "clear-product-selection" });
  };

  const handleJurisdictionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextJurisdiction = event.target.value;

    if (nextJurisdiction === selectedJurisdiction) {
      return;
    }

    if (!hasUnsavedProgress || allowLeavingRef.current) {
      applyJurisdictionSelection(nextJurisdiction);
      return;
    }

    openLeaveModal({
      type: "change-jurisdiction",
      jurisdiction: nextJurisdiction,
    });
  };

  const handleMockDataToggleChange = (nextEnabled: boolean) => {
    setIsMockDataEnabled(nextEnabled);

    if (!memberForm || !selectedJurisdiction) {
      return;
    }

    if (!nextEnabled) {
      setFormValues(
        buildInitialMemberFormValues(memberForm, {
          jurisdictionCode: selectedJurisdiction,
          jurisdictionLabel: selectedJurisdictionLabel,
        }),
      );
      return;
    }

    setFormValues(
      buildMockFormValues(memberForm, {
        jurisdictionCode: selectedJurisdiction,
        jurisdictionLabel: selectedJurisdictionLabel,
      }),
    );
  };

  const handleFieldChange = (key: string, value: FormValue) => {
    setSubmissionErrorMessage(null);
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
    const allowedValues = getResolvedAllowedValues(field);
    const allowedValueLabels = getResolvedAllowedValueLabels(field, allowedValues);
    const controlKind = getMemberFieldControlKind(field, allowedValues);
    const baseInputClassName = "platform-control";
    const fieldLabelClassName =
      "flex flex-wrap items-center gap-2 text-sm font-medium text-Color-Scheme-1-Text";
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
      const {
        missingEmail,
        missingPhone,
        invalidEmail,
        invalidPhone,
        invalidCountryCode,
      } = validatePersonContact(fieldValue);
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
      const isTrustmakerListField = normalizedCanonicalKey === "grantors";

      return (
        <div className="space-y-2 border border-Color-Scheme-1-Border/40 bg-white p-3">
          {isTrustmakerListField ? (
            <div className="text-xs text-Color-Neutral">
              Add every Trustmaker exactly as named in your trust documents. Trustees are listed
              separately.
            </div>
          ) : null}

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
      const roleLabel = isTrusteeField ? "Acting trustee" : "Successor trustee";
      const addButtonLabel = isTrusteeField
        ? "Add acting trustee"
        : isSuccessorTrusteeField
          ? "Add successor trustee"
          : "Add person";

      const filledRows = getFilledPersonRows(items);
      const incompleteCount = getIncompletePersonRowCount(items);
      const invalidFormatCount = getInvalidPersonRowFormatCount(items);
      const signingTrusteeCount = filledRows.filter(
        (item) => item.fullName.trim().length > 0 && item.isSigningTrustee,
      ).length;
      const missingNamedSigner =
        isTrusteeField &&
        requiresNamedSigningTrusteeSelection &&
        filledRows.length > 0 &&
        signingTrusteeCount === 0;
      const multipleNamedSigners =
        isTrusteeField && requiresNamedSigningTrusteeSelection && signingTrusteeCount > 1;
      const namedSignerModeConflict =
        isTrusteeField && !requiresNamedSigningTrusteeSelection && signingTrusteeCount > 0;
      const showNamedSignerCheckbox =
        isTrusteeField && requiresNamedSigningTrusteeSelection;

      const updateItems = (nextItems: PersonListItem[]) => {
        handleFieldChange(field.canonical_key, serializePersonListItems(nextItems));
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
                  {showNamedSignerCheckbox ? (
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
                      This trustee is the named signing trustee
                    </label>
                  ) : isTrusteeField ? (
                    <div className="text-xs text-Color-Neutral">
                      Choose "Named signing trustee" in Signing Authority to select a specific signer.
                    </div>
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

          {missingNamedSigner ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Select exactly one trustee as the named signing trustee before continuing.
            </div>
          ) : null}

          {multipleNamedSigners ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Choose only one named signing trustee.
            </div>
          ) : null}

          {namedSignerModeConflict ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              Clear trustee signer selections or switch Signing Authority to "Named signing trustee".
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
      const filledRows = getFilledPriorDocumentRows(items);
      const incompleteCount = getIncompletePriorDocumentRowCount(items);
      const missingOriginatingDocument =
        filledRows.length > 0 && !hasOriginatingPriorDocumentType(filledRows[0]);
      const chronologyOutOfOrderCount =
        incompleteCount === 0 ? getPriorDocumentChronologyOutOfOrderCount(items) : 0;

      const updateItems = (nextItems: PriorDocumentItem[]) => {
        handleFieldChange(field.canonical_key, serializePriorDocumentItems(nextItems));
      };

      const handlePickedDocumentFile = (
        file: File | null | undefined,
        index: number,
      ) => {
        if (!file) {
          return;
        }

        const isPdfFile =
          file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

        if (!isPdfFile) {
          return;
        }

        const nextItems = [...items];
        const currentItem = nextItems[index];

        if (!currentItem) {
          return;
        }

        nextItems[index] = {
          ...currentItem,
          attachmentReference: file.name,
        };

        updateItems(nextItems);
      };

      return (
        <div className="space-y-4">
          {items.length > 0 ? (
            items.map((item, index) => (
              <div
                key={`${field.canonical_key}-document-${index}`}
                className="space-y-4 rounded-md bg-Color-Neutral-Lightest/35 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase tracking-[0.08em] text-Color-Neutral">
                    Document {index + 1}
                  </div>
                  {index === 0 ? (
                    <div className="text-[11px] text-Color-Neutral">Originating document</div>
                  ) : (
                    <div className="text-[11px] text-Color-Neutral">Amendment/supporting</div>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className={fieldLabelClassName}>
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
                  <div className="space-y-3">
                    <label className={fieldLabelClassName}>
                      Signed date
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
                <div className="space-y-3">
                  <label className={fieldLabelClassName}>
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
                    placeholder="Original trust agreement, amendment, affidavit, etc."
                    type="text"
                    value={item.documentLabel}
                  />
                </div>
                <div className="space-y-3">
                  <label className={fieldLabelClassName}>
                    Recording or attachment reference
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
                      placeholder="Book 20, Page 104 or agreement-2021.pdf"
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

                <label
                  className={`block rounded-md border border-dashed px-4 py-4 text-sm transition-colors ${
                    activeDropzoneFieldKey === `${field.canonical_key}__document__${index}`
                      ? "cursor-pointer border-black bg-white text-black"
                      : "cursor-pointer border-Color-Scheme-1-Border/50 bg-white text-Color-Scheme-1-Text hover:border-Color-Scheme-1-Border"
                  }`}
                  onDragEnter={(event: DragEvent<HTMLLabelElement>) => {
                    event.preventDefault();
                    setActiveDropzoneFieldKey(`${field.canonical_key}__document__${index}`);
                  }}
                  onDragOver={(event: DragEvent<HTMLLabelElement>) => {
                    event.preventDefault();
                    setActiveDropzoneFieldKey(`${field.canonical_key}__document__${index}`);
                  }}
                  onDragLeave={(event: DragEvent<HTMLLabelElement>) => {
                    const related = event.relatedTarget;
                    if (related instanceof Node && event.currentTarget.contains(related)) {
                      return;
                    }

                    setActiveDropzoneFieldKey((current) => {
                      return current === `${field.canonical_key}__document__${index}`
                        ? null
                        : current;
                    });
                  }}
                  onDrop={(event: DragEvent<HTMLLabelElement>) => {
                    event.preventDefault();
                    setActiveDropzoneFieldKey(null);
                    handlePickedDocumentFile(event.dataTransfer.files?.[0], index);
                  }}
                >
                  <div className="space-y-1">
                    <div className="font-medium">
                      Drop PDF attachment here or click to browse
                    </div>
                    <div className="text-xs text-Color-Neutral">PDF only</div>
                  </div>
                  <input
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      handlePickedDocumentFile(event.target.files?.[0], index);
                    }}
                    type="file"
                  />
                </label>
              </div>
            ))
          ) : (
            <div className="text-xs text-Color-Neutral">No documents to include listed yet.</div>
          )}

          {incompleteCount > 0 ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Complete type, date, document label, and recording/attachment reference for each listed document.
            </div>
          ) : null}

          {missingOriginatingDocument ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Document 1 must be either a Trust Agreement or Declaration of Trust.
            </div>
          ) : null}

          {chronologyOutOfOrderCount > 0 ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Keep document dates in chronological order from oldest to newest.
            </div>
          ) : null}

          <button
            className={subtleButtonClassName}
            onClick={() => {
              updateItems([
                ...items,
                {
                  chronologyOrder: items.length + 1,
                  documentType: items.length === 0 ? "trust_agreement" : "amendment",
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
      const isTrustmakerTaxIdSelection =
        normalizedCanonicalKey === "tax_id_owner" &&
        isTaxIdOwnerSelectionBoundToTrustmakers(field) &&
        trustmakerNames.length > 1;

      const selectPlaceholder = isTrustmakerTaxIdSelection
        ? "Select primary trustmaker"
        : "Select an option";

      const hasInvalidTrustmakerSelection =
        isTrustmakerTaxIdSelection &&
        typeof fieldValue === "string" &&
        fieldValue.trim().length > 0 &&
        !isNameInList(fieldValue, trustmakerNames);

      return (
        <div className="space-y-2">
          <div className="platform-select-wrap">
            <select
              className={baseInputClassName}
              onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
              value={typeof fieldValue === "string" ? fieldValue : ""}
            >
              <option value="">{selectPlaceholder}</option>
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

          {isTrustmakerTaxIdSelection ? (
            <div className="text-xs text-Color-Neutral">
              Select the Trustmaker whose tax ID is primary for this trust.
            </div>
          ) : null}

          {hasInvalidTrustmakerSelection ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Select a primary tax ID owner from the listed Trustmakers.
            </div>
          ) : null}
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
    const allowedFamilyScopes = productFlowStepFamilyScopes[currentFormStep] ?? [
      "shared",
      "poa",
      "trust",
      "unknown",
    ];
    const scopedFamilyGroups = familyGroups.filter((group) =>
      allowedFamilyScopes.includes(group.scope),
    );

    if (scopedFamilyGroups.length === 0) {
      return null;
    }
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
        {scopedFamilyGroups.map((group) => (
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
                    {isActiveSourceVisible && activeSourceSummary ? (
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
      </div>
    );
  };

  const isContinueDisabled =
    !selectedProductFlowMode ||
    isLoadingProductFlowModes ||
    hasBlockingValidation ||
    isValidatingMemberFormSubmission ||
    isLoadingMemberForm ||
    !memberForm ||
    !allRequiredVisibleFieldsComplete ||
    !isDocumentsColumnComplete ||
    hasNextFormStep;

  const isProductSelectionStep = !selectedProductFlowMode;
  const selectedProductLabel = useMemo(() => {
    if (!selectedProductFlowMode) {
      return null;
    }

    const selectedMode =
      selectedProductFlowModeDefinition ??
      resolvedProductFlowMode ??
      productFlowModes.find((mode) => mode.modeKey === selectedProductFlowMode) ??
      null;

    if (selectedMode) {
      return selectedMode.displayName;
    }

    return formatLabel(selectedProductFlowMode);
  }, [
    productFlowModes,
    resolvedProductFlowMode,
    selectedProductFlowMode,
    selectedProductFlowModeDefinition,
  ]);

  const startPageTitle = isProductSelectionStep
    ? "Choose your DARCi product"
    : "Create and secure your document";
  const startPageSubtitle = isProductSelectionStep
    ? "Select a product based on your needs."
    : "Fill in your details to generate your document. You\'ll review, sign and finalize it securely.";

  return (
    <div className="space-y-8">
      <div className="space-y-2 pb-2">
        <div className="text-2xl font-medium">{startPageTitle}</div>
        <div className="text-sm text-Color-Neutral">{startPageSubtitle}</div>
      </div>

      {isProductSelectionStep ? (
        <ProductSelectionBand
          productFlowModes={productFlowModes}
          isLoadingProductFlowModes={isLoadingProductFlowModes}
          onSelectModeAction={(modeKey) => {
            applyProductFlowModeSelection(modeKey);
          }}
        />
      ) : (
        <div className="space-y-6">
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ animation: "darciContentFadeIn 220ms ease-out both" }}
          >
            <div className="text-xs font-regular text-Color-Neutral">
              Selected product:
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-black px-3 py-1.5">
              <div className="text-xs font-medium text-white">
                {selectedProductLabel ?? "Selected product"}
              </div>
              <button
                type="button"
                aria-label="Clear selected product"
                onClick={() => {
                  handleClearSelectedProductFlowMode();
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-white transition hover:bg-white/15"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20">
                  <path
                    d="M6 6l8 8M14 6l-8 8"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div
            className="relative z-[500]"
            style={{ animation: "darciContentFadeIn 220ms ease-out both", animationDelay: "60ms" }}
          >
            <ProcessBand />
          </div>

          <div
            className="relative z-0 grid gap-6 lg:grid-cols-[2fr_1fr]"
            style={{ animation: "darciContentFadeIn 220ms ease-out both", animationDelay: "120ms" }}
          >
            <div className="space-y-6">
              <div
                id="contract-container"
                ref={contractContainerRef}
                className="relative z-0 space-y-4 bg-white p-4"
              >
                <div className="space-y-4 p-4">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-medium">New document details</div>
                      <div className="flex flex-col items-start gap-1 sm:items-end">
                        {isMockDataToggleVisible ? (
                          <MockDataToggle
                            checked={isMockDataEnabled}
                            disabled={isMockDataToggleDisabled}
                            onChange={handleMockDataToggleChange}
                          />
                        ) : null}
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-Color-Neutral">
                          <span>Show active sources</span>
                          <input
                            checked={isActiveSourceVisible}
                            className="h-4 w-4 accent-Color-Scheme-1-Text"
                            disabled={isActiveSourceToggleDisabled}
                            onChange={(event) => {
                              setIsActiveSourceVisible(event.target.checked);
                            }}
                            type="checkbox"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-Color-Neutral">
                      Answer each question in plain terms. If you&apos;re unsure, choose the closest option and continue.
                    </div>
                    {draftStatusLabel || draftSaveNotice ? (
                      <div
                        className={`mt-2 rounded-md border px-3 py-2 text-xs ${
                          draftSaveNotice
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : isSavingDraft
                              ? "border-sky-200 bg-sky-50 text-sky-800"
                              : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {draftSaveNotice ?? draftStatusLabel}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2 rounded-md bg-white p-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-Color-Neutral">
                      Step 1
                    </div>
                    <div className="text-sm font-medium">Jurisdiction</div>
                    <div className="text-xs text-Color-Neutral">
                      Jurisdiction determines which state law governs this document, including signing formalities, trustee authority language, and enforceability standards.
                    </div>

                    <div className="relative max-w-sm">
                      <div className="platform-select-wrap">
                        <select
                          className="platform-control"
                          disabled={
                            !selectedProductFlowMode ||
                            isLoadingProductFlowModes ||
                            isLoadingJurisdictions ||
                            jurisdictions.length === 0
                          }
                          onChange={handleJurisdictionChange}
                          value={selectedJurisdiction}
                        >
                          <option value="">
                            {!selectedProductFlowMode
                              ? "Select a product mode first"
                              : isLoadingJurisdictions
                                ? "Loading jurisdictions..."
                                : jurisdictions.length === 0
                                  ? "No jurisdictions"
                                  : "Select a jurisdiction"}
                          </option>
                          {jurisdictions.map((jurisdiction) => (
                            <option key={jurisdiction.code} value={jurisdiction.code}>
                              {formatJurisdictionDisplayLabel(jurisdiction.label, jurisdiction.code)}
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
                      {sourceOnlyVisibleCount} field{sourceOnlyVisibleCount > 1 ? "s" : ""} shown here appear only when needed for your selected setup.
                    </div>
                  ) : null}

                  {isLoadingMemberForm ? (
                    <div className="text-sm text-Color-Neutral">Loading member form requirements...</div>
                  ) : memberForm ? (
                    <div className="space-y-4">
                      {activeFormStep ? (
                        <div className="text-sm font-medium text-Color-Scheme-1-Text">
                          {activeFormStep.label}
                        </div>
                      ) : null}

                      {displayedPrimarySections.map((section) => renderSection(section))}

                      {hasPreviousFormStep || hasNextFormStep ? (
                        <div className="flex flex-wrap items-center gap-2 pt-2">
                          {hasPreviousFormStep ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 border border-Color-Scheme-1-Border/40 bg-white px-4 py-2 text-sm font-medium text-Color-Scheme-1-Text transition hover:bg-Color-Neutral-Lightest"
                              onClick={returnToPreviousSectionGroup}
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
                              Back to {previousFormStep?.label}
                            </button>
                          ) : null}

                          {hasNextFormStep ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Text px-4 py-2 text-sm font-medium text-white transition hover:bg-Color-Scheme-1-Text/90"
                              onClick={continueToNextSectionGroup}
                            >
                              Continue to {nextFormStep?.label}
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
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!shouldRenderDocumentsColumn ? (
                    <div className="space-y-4 pt-2">
                      {submissionErrorMessage ? (
                        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                          {submissionErrorMessage}
                        </div>
                      ) : null}

                      {selectedJurisdiction ? (
                        <button
                          onClick={() => {
                            void handleFinalContinue();
                          }}
                          className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition ${
                            isContinueDisabled
                              ? "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                              : "platform-btn-primary"
                          }`}
                          disabled={isContinueDisabled}
                        >
                          {isValidatingMemberFormSubmission
                            ? "Validating..."
                            : "Continue to generate documents"}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {shouldRenderDocumentsColumn ? (
              <div className="relative z-0 space-y-4 overflow-visible bg-white p-4 lg:sticky lg:top-20 lg:self-start">
              {!selectedJurisdiction ? (
                <div className="rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-xs text-Color-Neutral">
                  Select a jurisdiction first to unlock document uploads.
                </div>
              ) : isLoadingMemberForm ? (
                <div className="text-sm text-Color-Neutral">Loading document requirements...</div>
              ) : memberForm ? (
                <div className="space-y-4">
                  {shouldShowUploadColumn && documentsColumnFields.length > 0 ? (
                    documentsColumnFields.map((field) => {
                      const fieldMicrocopy = getFieldMicrocopy(field.canonical_key);

                      return (
                        <div key={`documents-column-${field.canonical_key}`} className="space-y-3">
                          {field.data_type === "boolean" ? null : renderFieldLabel(field)}
                          {renderFieldControl(field)}
                          {field.data_type === "boolean" ? <div>{renderFieldLabel(field)}</div> : null}
                          {fieldMicrocopy &&
                          normalizeCanonicalKey(field.canonical_key) !== "prior_document_items" ? (
                            <div className="text-xs text-Color-Neutral">{fieldMicrocopy}</div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : shouldShowUploadColumn ? (
                    <div className="text-xs text-Color-Neutral">
                      No document uploads are required for this jurisdiction.
                    </div>
                  ) : null}

                  {shouldShowUploadColumn && uploadRequiredByMode ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      At least one supporting document entry is required for this product mode.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-xs text-Color-Neutral">
                  No additional supporting document inputs are required for this jurisdiction.
                </div>
              )}

              {submissionErrorMessage ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {submissionErrorMessage}
                </div>
              ) : null}

              {selectedJurisdiction ? (
                <button
                  onClick={() => {
                    void handleFinalContinue();
                  }}
                  className={`w-full px-4 py-2 text-sm font-medium transition ${
                    isContinueDisabled
                      ? "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                      : "platform-btn-primary"
                  }`}
                  disabled={isContinueDisabled}
                >
                  {isValidatingMemberFormSubmission ? "Validating..." : "Continue"}
                </button>
              ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {isLeaveModalOpen ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 px-4">
          <div
            className="w-full max-w-md space-y-4 border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest p-5 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-start-modal-title"
          >
            <div className="space-y-1">
              <div id="leave-start-modal-title" className="text-base font-medium text-Color-Scheme-1-Text">
                {leaveModalCopy.title}
              </div>
              <div className="text-sm text-Color-Neutral">
                {leaveModalCopy.description}
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
                {leaveModalCopy.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
