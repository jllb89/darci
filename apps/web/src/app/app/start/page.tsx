"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type JurisdictionOption = {
  code: string;
  label: string;
};

type RequirementDecisionSet = {
  notarizationRule: string;
  witnessRule: string;
  witnessCount: number | null;
  durabilityRule: string;
  statutoryFormRule: string;
  effectiveDateRule: string;
  competencyRule: string;
  specialAuthorityRule: string;
  allowsAgentCertification: boolean;
  requiresPrincipalSignature: boolean;
  allowsProxySignature: boolean;
  requiresAcknowledgmentCertificate: boolean;
};

type RequirementLegalText = {
  governingLaw: string | null;
  executionRequirements: string | null;
  acknowledgmentWitnessing: string | null;
  durability: string | null;
  specialAuthority: string | null;
  competency: string | null;
  statutoryForm: string | null;
  effectiveDate: string | null;
};

type InputRequirementConditionClause = {
  fact:
    | "selected_execution_path"
    | "durability_rule"
    | "specific_authority_rule"
    | "effective_date_rule"
    | "statutory_form_rule"
    | "review_status";
  operator: "equals" | "not_equals" | "in" | "not_in";
  value: string;
};

type InputRequirementCondition = {
  all: InputRequirementConditionClause[];
};

type InputRequirementField = {
  key: string;
  label: string;
  semanticType:
    | "person_name"
    | "enum_single"
    | "enum_multi"
    | "boolean"
    | "date"
    | "text"
    | "initials"
    | "signature_mark"
    | "witness_count"
    | "acknowledgment_choice"
    | "legal_notice_acceptance"
    | "recording_status";
  required: boolean;
  dataType: "string" | "integer" | "boolean" | "date" | "array";
  collectFrom: "member" | "principal" | "agent" | "notary" | "system";
  defaultSource:
    | "none"
    | "user_profile"
    | "document_template"
    | "jurisdiction_default"
    | "system_derived";
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    allowedValues?: string[];
  };
  helpText?: string;
  when?: InputRequirementCondition;
};

type InputRequirementSection = {
  key: string;
  title: string;
  description?: string;
  presence: "required" | "optional" | "conditional" | "hidden" | "manual_review";
  repeatable: boolean;
  appliesToPaths: string[];
  fields: InputRequirementField[];
};

type ExecutionPath = {
  key: string;
  label: string;
  default: boolean;
  availability: "required" | "allowed" | "not_allowed" | "manual_review";
};

type InputRequirementNotice = {
  key: string;
  severity: "info" | "warning" | "blocking";
  message: string;
};

type InputRequirements = {
  schemaVersion: string;
  jurisdiction: string;
  poaType: string;
  uiProfile: string;
  derivationMode: "rules_only" | "rules_plus_overrides" | "manual_review";
  reviewStatus: string;
  workflow: {
    executionPaths: ExecutionPath[];
    steps: string[];
    submissionChecks: string[];
  };
  sections: InputRequirementSection[];
  documentOutputs: Array<{
    key: string;
    required: boolean;
    when?: InputRequirementCondition;
  }>;
  notices: InputRequirementNotice[];
};

type FormRules = {
  statutoryFormExists: boolean;
  statutoryFormRecommended: boolean;
  statutoryFormMandatoryForProduct: boolean;
  mustTrackStatutoryOrdering: boolean;
  mustTrackStatutoryHeadings: boolean;
  mustIncludeWarningToPrincipal: boolean;
  mustIncludeNoticeToAgent: boolean;
  specialAuthoritiesRenderMode:
    | "hidden"
    | "checklist"
    | "checklist_with_initials"
    | "checkboxes_from_statutory_form"
    | "freeform_text"
    | "hybrid"
    | "manual_review_only";
  freeformSpecialAuthorityTextAllowed: boolean;
  hybridRenderingAllowed: boolean;
  attorneyCustomizationRecommended: boolean;
  sourceCitation: string | null;
  sourceUrl: string | null;
  legalReviewStatus: "pending" | "reviewed" | "needs_update" | "blocked";
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
};

type GlossaryTerm = {
  key: string;
  genericLabel: string;
  stateSpecificLabel: string | null;
  label: string;
  productDescription: string;
  whyUserNeedsThis: string | null;
  sourceCitation: string | null;
  sourceUrl: string | null;
  isMateriallyStateSpecific: boolean;
  legalReviewStatus: "pending" | "reviewed" | "needs_update" | "blocked";
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  sortOrder: number;
};

type SpecialAuthority = {
  key: string;
  label: string;
  canonicalLabel: string;
  description: string;
  category: string | null;
  sortOrder: number;
  isCoreNationalKey: boolean;
  explicitlyRequired: boolean;
  requirementType:
    | "express_grant"
    | "specific_language"
    | "separate_initials"
    | "statutory_form_checkbox"
    | "not_required"
    | "unclear";
  appliesToGeneralFinancialPoa: boolean;
  statutoryFormOnly: boolean;
  customLanguageRequired: boolean;
  initialsRequired: boolean;
  checkboxRequired: boolean;
  freeformTextAllowed: boolean;
  statutoryTextExcerpt: string | null;
  exactStatuteCitation: string | null;
  sourceUrl: string | null;
  plainEnglishRule: string;
  confidence: "high" | "medium" | "low";
  legalReviewStatus: "pending" | "reviewed" | "needs_update" | "blocked";
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  rendererMetadata: Record<string, unknown>;
};

type PoaRequirement = {
  id: string;
  jurisdiction: string;
  poaType: string;
  uiProfile: string;
  reviewStatus: string;
  reviewedAt: string | null;
  requirements: RequirementDecisionSet;
  legalText: RequirementLegalText;
  source: {
    citation: string | null;
    url: string | null;
    notes: string | null;
  };
  formRules: FormRules | null;
  glossary: GlossaryTerm[];
  specialAuthorities: SpecialAuthority[];
  inputRequirements?: InputRequirements | null;
  createdAt: string;
  updatedAt: string;
};

type FormValue = string | boolean | string[];
type StatutoryReferenceRow = {
  label: string;
  value: string;
  url: string | null;
};

const formatLabel = (value: string) => {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatDecisionValue = (value: string | boolean | number | null) => {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (!value) {
    return "Not available";
  }

  return formatLabel(value);
};

const getSeverityStyles = (severity: InputRequirementNotice["severity"]) => {
  if (severity === "blocking") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (severity === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
};

type HelpTooltipProps = {
  label: string;
  content: string;
  align?: "left" | "right";
};

function HelpTooltip({ label, content, align = "left" }: HelpTooltipProps) {
  const alignmentClassName = align === "right" ? "right-0" : "left-0";

  return (
    <span className="group relative inline-flex items-center gap-2">
      <button
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-Color-Scheme-1-Border/40 bg-white text-[11px] font-medium text-Color-Neutral"
        type="button"
      >
        ?
      </button>
      <span
        className={`pointer-events-none absolute top-full z-20 mt-2 hidden w-[min(32rem,calc(100vw-4rem))] max-w-xl rounded-lg border border-Color-Scheme-1-Border/40 bg-white p-4 text-left text-sm leading-6 text-Color-Scheme-1-Text shadow-lg group-hover:block group-focus-within:block ${alignmentClassName}`}
      >
        {content}
      </span>
    </span>
  );
}

export default function StartDocumentPage() {
  const { accessToken } = useStoredAuth();
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("");
  const [requirement, setRequirement] = useState<PoaRequirement | null>(null);
  const [selectedExecutionPath, setSelectedExecutionPath] = useState("");
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({});
  const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(true);
  const [isLoadingRequirement, setIsLoadingRequirement] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [compatibilityMessage, setCompatibilityMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    const loadJurisdictions = async () => {
      setIsLoadingJurisdictions(true);
      setErrorMessage(null);
      setCompatibilityMessage(null);

      try {
        const response = await fetch(`${apiBaseUrl}/rules/poa?type=general`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = (await response.json().catch(() => null)) as
          | { jurisdictions?: JurisdictionOption[]; message?: string }
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
          if (current) {
            return current;
          }

          return nextJurisdictions[0]?.code ?? "";
        });
      } catch (error) {
        if (!cancelled) {
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

    const loadRequirement = async () => {
      setIsLoadingRequirement(true);
      setErrorMessage(null);
      setCompatibilityMessage(null);

      try {
        const response = await fetch(
          `${apiBaseUrl}/rules/poa/${selectedJurisdiction}?type=general`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        const payload = (await response.json().catch(() => null)) as
          | { requirement?: PoaRequirement; message?: string }
          | null;

        if (!response.ok || !payload?.requirement) {
          throw new Error(payload?.message || "Failed to load POA requirements");
        }

        if (!cancelled) {
          setRequirement(payload.requirement);
          const inputRequirements = payload.requirement.inputRequirements ?? null;

          if (!inputRequirements) {
            setSelectedExecutionPath("");
            setFormValues({});
            setCompatibilityMessage(
              "The running backend returned POA requirements without generated inputRequirements. Restart the API on the latest code so the selected state can render actual UI fields.",
            );
            return;
          }

          const defaultExecutionPath =
            inputRequirements.workflow.executionPaths.find(
              (path) => path.default,
            )?.key ?? inputRequirements.workflow.executionPaths[0]?.key ?? "";

          setSelectedExecutionPath(defaultExecutionPath);
          setFormValues(
            defaultExecutionPath
              ? { selected_execution_path: defaultExecutionPath }
              : {},
          );
        }
      } catch (error) {
        if (!cancelled) {
          setRequirement(null);
          setSelectedExecutionPath("");
          setFormValues({});
          setCompatibilityMessage(null);
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load POA requirements",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRequirement(false);
        }
      }
    };

    void loadRequirement();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedJurisdiction]);

  const handleJurisdictionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedJurisdiction(event.target.value);
  };

  const handleFieldChange = (key: string, value: FormValue) => {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === "selected_execution_path" && typeof value === "string") {
      setSelectedExecutionPath(value);
    }
  };

  const evaluateCondition = (condition?: InputRequirementCondition) => {
    if (!condition || !requirement) {
      return true;
    }

    const factValues: Record<InputRequirementConditionClause["fact"], string> = {
      selected_execution_path: selectedExecutionPath,
      durability_rule: requirement.requirements.durabilityRule,
      specific_authority_rule: requirement.requirements.specialAuthorityRule,
      effective_date_rule: requirement.requirements.effectiveDateRule,
      statutory_form_rule: requirement.requirements.statutoryFormRule,
      review_status: requirement.reviewStatus,
    };

    return condition.all.every((clause) => {
      const actualValue = factValues[clause.fact] ?? "";

      switch (clause.operator) {
        case "equals":
          return actualValue === clause.value;
        case "not_equals":
          return actualValue !== clause.value;
        case "in":
          return clause.value.split(",").includes(actualValue);
        case "not_in":
          return !clause.value.split(",").includes(actualValue);
        default:
          return true;
      }
    });
  };

  const visibleSections = requirement
    ? (requirement.inputRequirements?.sections ?? []).filter((section) => {
        if (section.presence === "hidden") {
          return false;
        }

        if (
          section.appliesToPaths.length > 0 &&
          selectedExecutionPath &&
          !section.appliesToPaths.includes(selectedExecutionPath)
        ) {
          return false;
        }

        return (
          section.fields.some((field) => evaluateCondition(field.when)) ||
          section.fields.length === 0
        );
      })
    : [];

  const inputRequirements = requirement?.inputRequirements ?? null;
  const specialAuthorityByKey = new Map(
    (requirement?.specialAuthorities ?? []).map((authority) => [authority.key, authority]),
  );

  const statutoryReferenceRows: StatutoryReferenceRow[] = requirement
    ? [
        requirement.formRules?.sourceCitation
          ? {
              label: "Form rules",
              value: requirement.formRules.sourceCitation,
              url: requirement.formRules.sourceUrl,
            }
          : null,
        ...(requirement.specialAuthorities ?? [])
          .filter((authority) => Boolean(authority.exactStatuteCitation))
          .map((authority) => ({
            label: authority.label,
            value: authority.exactStatuteCitation ?? "",
            url: authority.sourceUrl ?? null,
          })),
      ].filter((row): row is StatutoryReferenceRow => row !== null)
    : [];

  const decisionRows: Array<{ label: string; value: string | boolean | number | null }> = requirement
    ? [
        { label: "Notarization rule", value: requirement.requirements.notarizationRule },
        { label: "Witness rule", value: requirement.requirements.witnessRule },
        { label: "Witness count", value: requirement.requirements.witnessCount },
        { label: "Durability rule", value: requirement.requirements.durabilityRule },
        { label: "Statutory form", value: requirement.requirements.statutoryFormRule },
        { label: "Effective date", value: requirement.requirements.effectiveDateRule },
        { label: "Competency", value: requirement.requirements.competencyRule },
        { label: "Special authority", value: requirement.requirements.specialAuthorityRule },
        {
          label: "Acknowledgment certificate",
          value: requirement.requirements.requiresAcknowledgmentCertificate,
        },
        {
          label: "Proxy signature allowed",
          value: requirement.requirements.allowsProxySignature,
        },
      ]
    : [];

  const getFieldDescription = (field: InputRequirementField) => {
    return field.helpText ?? null;
  };

  const getSectionDescription = (section: InputRequirementSection) => {
    return section.description ?? null;
  };

  const getValueDescription = (value: string) => {
    return specialAuthorityByKey.get(value)?.plainEnglishRule ?? null;
  };

  const workflowSnapshotTooltip = [
    requirement?.formRules?.reviewNotes ?? null,
    requirement?.formRules?.sourceCitation
      ? `Source: ${requirement.formRules.sourceCitation}`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const getSpecialAuthorityTooltip = (authority: SpecialAuthority) => {
    return [
      authority.plainEnglishRule,
      authority.description,
      authority.exactStatuteCitation
        ? `Source: ${authority.exactStatuteCitation}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const renderFieldLabel = (field: InputRequirementField) => {
    const description = getFieldDescription(field);

    return (
      <div className="flex items-center gap-2 text-sm font-medium text-Color-Scheme-1-Text">
        <span>{field.label}</span>
        {description ? <HelpTooltip label={`Explain ${field.label}`} content={description} /> : null}
        {field.required ? (
          <span className="text-xs uppercase tracking-[0.12em] text-Color-Neutral">Required</span>
        ) : null}
      </div>
    );
  };

  const renderAllowedValueGlossary = (field: InputRequirementField) => {
    const describedValues = (field.validation?.allowedValues ?? []).filter((value) =>
      Boolean(getValueDescription(value)),
    );

    if (!describedValues.length) {
      return null;
    }

    return (
      <div className="flex flex-wrap gap-2 text-xs text-Color-Neutral">
        {describedValues.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-2 rounded-full border border-Color-Scheme-1-Border/30 bg-Color-Neutral-Lightest px-2 py-1"
          >
            <span>{formatLabel(value)}</span>
            <HelpTooltip label={`Explain ${formatLabel(value)}`} content={getValueDescription(value) ?? ""} />
          </span>
        ))}
      </div>
    );
  };

  const renderField = (field: InputRequirementField) => {
    if (!evaluateCondition(field.when)) {
      return null;
    }

    const baseInputClassName =
      "w-full rounded border border-Color-Scheme-1-Border/40 bg-white px-3 py-2 text-sm text-Color-Scheme-1-Text outline-none transition focus:border-Color-Scheme-1-Text";
    const fieldValue = formValues[field.key];
    const allowedValues = field.validation?.allowedValues ?? [];

    if (field.key === "selected_execution_path" && inputRequirements) {
      return (
        <select
          className={baseInputClassName}
          value={typeof fieldValue === "string" ? fieldValue : selectedExecutionPath}
          onChange={(event) => handleFieldChange(field.key, event.target.value)}
        >
          {inputRequirements.workflow.executionPaths
            .filter((path) => path.availability !== "manual_review")
            .map((path) => (
              <option key={path.key} value={path.key}>
                {path.label}
              </option>
            ))}
        </select>
      );
    }

    if (
      field.semanticType === "enum_single" ||
      field.semanticType === "acknowledgment_choice" ||
      field.semanticType === "recording_status"
    ) {
      return (
        <select
          className={baseInputClassName}
          value={typeof fieldValue === "string" ? fieldValue : ""}
          onChange={(event) => handleFieldChange(field.key, event.target.value)}
        >
          <option value="">Select an option</option>
          {allowedValues.map((value) => (
            <option key={value} value={value}>
              {formatLabel(value)}
            </option>
          ))}
        </select>
      );
    }

    if (field.semanticType === "enum_multi") {
      const renderMode = requirement?.formRules?.specialAuthoritiesRenderMode ?? "hidden";
      const specialAuthorityOptions =
        field.key === "special_authorities" &&
        renderMode !== "freeform_text" &&
        renderMode !== "manual_review_only"
          ? requirement?.specialAuthorities ?? []
          : [];

      if (specialAuthorityOptions.length > 0) {
        const selectedValues = Array.isArray(fieldValue) ? fieldValue : [];

        return (
          <div className="space-y-2 rounded border border-Color-Scheme-1-Border/40 bg-white p-3">
            {specialAuthorityOptions.map((authority) => {
              const checked = selectedValues.includes(authority.key);

              return (
                <label
                  key={authority.key}
                  className="flex items-center gap-2 text-sm text-Color-Scheme-1-Text"
                >
                  <input
                    checked={checked}
                    className="h-4 w-4"
                    onChange={(event) => {
                      const nextValues = event.target.checked
                        ? [...selectedValues, authority.key]
                        : selectedValues.filter((item) => item !== authority.key);

                      handleFieldChange(field.key, nextValues);
                    }}
                    type="checkbox"
                  />
                  <span className="inline-flex items-center gap-2">
                    <span>{authority.label}</span>
                    <HelpTooltip
                      label={`Explain ${authority.label}`}
                      content={getSpecialAuthorityTooltip(authority)}
                    />
                  </span>
                </label>
              );
            })}
          </div>
        );
      }

      if (allowedValues.length > 0) {
        const selectedValues = Array.isArray(fieldValue) ? fieldValue : [];

        return (
          <div className="space-y-2 rounded border border-Color-Scheme-1-Border/40 bg-white p-3">
            {allowedValues.map((value) => {
              const checked = selectedValues.includes(value);

              return (
                <label key={value} className="flex items-center gap-2 text-sm text-Color-Scheme-1-Text">
                  <input
                    checked={checked}
                    className="h-4 w-4"
                    onChange={(event) => {
                      const nextValues = event.target.checked
                        ? [...selectedValues, value]
                        : selectedValues.filter((item) => item !== value);

                      handleFieldChange(field.key, nextValues);
                    }}
                    type="checkbox"
                  />
                  <span className="inline-flex items-center gap-2">
                    <span>{formatLabel(value)}</span>
                    {getValueDescription(value) ? (
                      <HelpTooltip
                        label={`Explain ${formatLabel(value)}`}
                        content={getValueDescription(value) ?? ""}
                      />
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        );
      }

      return (
        <textarea
          className={`${baseInputClassName} min-h-28`}
          onChange={(event) => handleFieldChange(field.key, event.target.value)}
          placeholder="Enter one authority per line"
          value={typeof fieldValue === "string" ? fieldValue : ""}
        />
      );
    }

    if (
      field.semanticType === "boolean" ||
      field.semanticType === "legal_notice_acceptance"
    ) {
      const description = getFieldDescription(field);

      return (
        <label className="flex items-center gap-3 rounded border border-Color-Scheme-1-Border/40 bg-white px-3 py-3 text-sm text-Color-Scheme-1-Text">
          <input
            checked={Boolean(fieldValue)}
            className="h-4 w-4"
            onChange={(event) => handleFieldChange(field.key, event.target.checked)}
            type="checkbox"
          />
          <span className="inline-flex items-center gap-2">
            <span>{field.label}</span>
            {description ? (
              <HelpTooltip label={`Explain ${field.label}`} content={description} />
            ) : null}
          </span>
        </label>
      );
    }

    if (field.semanticType === "signature_mark") {
      return (
        <div className="rounded border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-sm text-Color-Neutral">
          This signature is required and will be captured later in the signing step.
        </div>
      );
    }

    if (field.dataType === "integer" || field.semanticType === "witness_count") {
      return (
        <input
          className={baseInputClassName}
          max={field.validation?.max}
          min={field.validation?.min}
          onChange={(event) => handleFieldChange(field.key, event.target.value)}
          type="number"
          value={typeof fieldValue === "string" ? fieldValue : ""}
        />
      );
    }

    if (field.dataType === "date") {
      return (
        <input
          className={baseInputClassName}
          onChange={(event) => handleFieldChange(field.key, event.target.value)}
          type="date"
          value={typeof fieldValue === "string" ? fieldValue : ""}
        />
      );
    }

    if (field.semanticType === "text") {
      return (
        <textarea
          className={`${baseInputClassName} min-h-28`}
          onChange={(event) => handleFieldChange(field.key, event.target.value)}
          value={typeof fieldValue === "string" ? fieldValue : ""}
        />
      );
    }

    return (
      <input
        className={baseInputClassName}
        maxLength={field.validation?.maxLength}
        minLength={field.validation?.minLength}
        onChange={(event) => handleFieldChange(field.key, event.target.value)}
        type="text"
        value={typeof fieldValue === "string" ? fieldValue : ""}
      />
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-medium">Start a document</div>
        <div className="text-sm text-Color-Neutral">
          Select the jurisdiction and inspect the live POA requirements before upload.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "1. Jurisdiction",
            description: "Load the state-specific POA requirements from DARCi rules.",
          },
          {
            title: "2. Upload",
            description: "Add the document that will be notarized.",
          },
          {
            title: "3. Prepare",
            description: "Review details, then move to signing and submission.",
          },
        ].map((step) => (
          <div
            key={step.title}
            className="rounded-lg border border-Color-Scheme-1-Border/40 p-4"
          >
            <div className="text-sm font-medium">{step.title}</div>
            <div className="mt-2 text-xs text-Color-Neutral">{step.description}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Jurisdiction</div>
              <div className="mt-1 text-xs text-Color-Neutral">
                Select a state to inspect POA requirements from the backend rules table.
              </div>
            </div>
            {requirement ? (
              <div className="rounded-full border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-1 text-xs uppercase tracking-[0.12em] text-Color-Neutral">
                {formatLabel(requirement.uiProfile)}
              </div>
            ) : null}
          </div>

          <div className="relative max-w-sm">
            <select
              className="w-full appearance-none rounded border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-4 py-3 pr-12 text-sm text-Color-Scheme-1-Text outline-none transition focus:border-Color-Scheme-1-Text"
              value={selectedJurisdiction}
              onChange={handleJurisdictionChange}
              disabled={isLoadingJurisdictions || !jurisdictions.length}
            >
              {!jurisdictions.length ? (
                <option value="">
                  {isLoadingJurisdictions ? "Loading states..." : "No states available"}
                </option>
              ) : null}
              {jurisdictions.map((jurisdiction) => (
                <option key={jurisdiction.code} value={jurisdiction.code}>
                  {jurisdiction.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-Color-Neutral">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                <path d="M5.25 7.5 10 12.25 14.75 7.5" />
              </svg>
            </div>
          </div>

          <div className="text-xs text-Color-Neutral">
            <div className="group relative inline-flex items-center gap-2">
              <span className="font-medium text-Color-Scheme-1-Text">Statutory reference</span>
              {statutoryReferenceRows.length ? (
                <span className="group relative inline-flex items-center gap-2">
                  <button
                    aria-label="View statutory reference"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-Color-Scheme-1-Border/40 bg-white text-[11px] font-medium text-Color-Neutral"
                    type="button"
                  >
                    ?
                  </button>
                  <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-[min(32rem,calc(100vw-4rem))] max-w-xl rounded-lg border border-Color-Scheme-1-Border/40 bg-white p-4 text-left shadow-lg group-hover:block group-focus-within:block">
                    <span className="block space-y-3">
                      {statutoryReferenceRows.map((row) => (
                        <span key={`${row.label}-${row.value}`} className="block space-y-1">
                          <span className="block text-[11px] uppercase tracking-[0.12em] text-Color-Neutral">
                            {row.label}
                          </span>
                          <span className="block text-sm leading-6 text-Color-Scheme-1-Text">
                            {row.value}
                          </span>
                          {row.url ? (
                            <span className="block break-all text-xs text-Color-Neutral">
                              {row.url}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </span>
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <div className="text-xs text-Color-Neutral">
            <div className="inline-flex items-center gap-2">
              <span className="font-medium text-Color-Scheme-1-Text">Workflow logic snapshot</span>
              {workflowSnapshotTooltip ? (
                <HelpTooltip
                  label="View workflow logic snapshot help"
                  content={workflowSnapshotTooltip}
                />
              ) : null}
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-4 rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60 p-4">
              <div>
                <div className="text-sm font-medium">Required inputs</div>
                <div className="mt-1 text-xs text-Color-Neutral">
                  These fields are rendered from the backend `inputRequirements` contract for the selected jurisdiction.
                </div>
              </div>
              {isLoadingRequirement ? (
                <div className="text-sm text-Color-Neutral">Loading POA requirements...</div>
              ) : requirement ? (
                <div className="space-y-4">
                  {inputRequirements?.notices.length ? (
                    <div className="space-y-2">
                      {inputRequirements.notices.map((notice) => (
                        <div
                          key={notice.key}
                          className={`rounded border px-3 py-3 text-sm ${getSeverityStyles(notice.severity)}`}
                        >
                          {notice.message}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {compatibilityMessage ? (
                    <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {compatibilityMessage}
                    </div>
                  ) : null}

                  {visibleSections.map((section) => (
                    <div
                      key={section.key}
                      className="space-y-3 rounded-lg border border-Color-Scheme-1-Border/30 bg-white p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium text-Color-Scheme-1-Text">
                            <span>{section.title}</span>
                            {getSectionDescription(section) ? (
                              <HelpTooltip
                                label={`Explain ${section.title}`}
                                content={getSectionDescription(section) ?? ""}
                              />
                            ) : null}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.12em] text-Color-Neutral">
                            {formatLabel(section.presence)}
                          </div>
                        </div>
                        {section.repeatable ? (
                          <div className="text-xs uppercase tracking-[0.12em] text-Color-Neutral">
                            Repeatable
                          </div>
                        ) : null}
                      </div>

                      {section.fields.length ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          {section.fields.map((field) => {
                            const fieldControl = renderField(field);

                            if (!fieldControl) {
                              return null;
                            }

                            return (
                              <div key={field.key} className="space-y-2">
                                {field.semanticType === "boolean" ||
                                field.semanticType === "legal_notice_acceptance"
                                  ? null
                                  : renderFieldLabel(field)}
                                {fieldControl}
                                <div className="flex flex-wrap gap-2 text-xs text-Color-Neutral">
                                  <span>From {formatLabel(field.collectFrom)}</span>
                                  {field.defaultSource !== "none" ? (
                                    <span>Default: {formatLabel(field.defaultSource)}</span>
                                  ) : null}
                                </div>
                                {renderAllowedValueGlossary(field)}
                                {field.helpText ? (
                                  <div className="text-xs text-Color-Neutral">{field.helpText}</div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-sm text-Color-Neutral">
                          No direct data entry is required in this section, but the workflow still applies.
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="rounded-lg border border-Color-Scheme-1-Border/30 bg-white p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-Color-Scheme-1-Text">
                      <span>Workflow logic snapshot</span>
                      {workflowSnapshotTooltip ? (
                        <HelpTooltip
                          label="Explain workflow logic snapshot"
                          content={workflowSnapshotTooltip}
                        />
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-2 text-sm">
                      {decisionRows.map((row) => (
                        <div key={row.label} className="flex items-start justify-between gap-4">
                          <div className="text-Color-Neutral">{row.label}</div>
                          <div className="text-right font-medium text-Color-Scheme-1-Text">
                            {formatDecisionValue(row.value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-Color-Neutral">
                  Select a state to load the generated POA input requirements.
                </div>
              )}
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-Color-Scheme-1-Border/40 p-4">
          <div className="text-sm font-medium">Upload</div>
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest text-xs text-Color-Neutral">
            Drag and drop PDF or click to browse
          </div>
          <button className="w-full rounded bg-Green px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}