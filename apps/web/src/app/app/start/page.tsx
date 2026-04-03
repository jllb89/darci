"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useStoredAuth } from "@/lib/auth";
import { HelpTooltip } from "@/app/app/start/HelpTooltip";
import {
  computeFieldRuntime,
  getVisibleSections,
  type MemberFormFamily,
} from "@/app/app/start/memberFormRuntime";

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

const formatLabel = (value: string) => {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

export default function StartDocumentPage() {
  const { accessToken } = useStoredAuth();
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("");

  const [memberForm, setMemberForm] = useState<MemberFormRulesContract | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({});

  const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(false);
  const [isLoadingMemberForm, setIsLoadingMemberForm] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingRequirements, setMissingRequirements] = useState<MissingRequirement[]>([]);

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
        const response = await fetch(`${apiBaseUrl}/rules/member-form`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

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

          return nextJurisdictions[0]?.code ?? "";
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
        const response = await fetch(`${apiBaseUrl}/rules/member-form/${selectedJurisdiction}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

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

        const nextValues: Record<string, FormValue> = {};
        for (const section of payload.memberForm.aggregatedForm.sections) {
          for (const field of section.fields) {
            if (field.canonical_key === "jurisdiction") {
              nextValues[field.canonical_key] = payload.memberForm.jurisdiction;
            }
          }
        }

        setFormValues(nextValues);
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
  }, [accessToken, selectedJurisdiction]);

  const fieldRuntime = useMemo(() => computeFieldRuntime(memberForm), [memberForm]);

  const visibleSections = useMemo(
    () => getVisibleSections(memberForm, fieldRuntime),
    [fieldRuntime, memberForm],
  );

  const sourceOnlyVisibleCount = useMemo(() => {
    return visibleSections.reduce((count, section) => {
      return (
        count +
        section.fields.filter((field) => field.condition_merge_mode === "source_only").length
      );
    }, 0);
  }, [visibleSections]);

  const handleJurisdictionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedJurisdiction(event.target.value);
  };

  const handleFieldChange = (key: string, value: FormValue) => {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const renderFieldLabel = (field: MemberFacingField, required: boolean) => {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-Color-Scheme-1-Text">
        <span>{field.label}</span>
        {required ? (
          <span className="rounded-full border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-Color-Neutral">
            Required
          </span>
        ) : null}
        {field.condition_merge_mode === "source_only" ? (
          <span className="inline-flex items-center rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-amber-800">
            Source-conditioned
          </span>
        ) : null}
        {field.help_text ? (
          <HelpTooltip label={`Explain ${field.label}`} content={field.help_text} />
        ) : null}
      </div>
    );
  };

  const renderFieldControl = (field: MemberFacingField) => {
    const fieldValue = formValues[field.canonical_key];
    const allowedValues = getAllowedValues(field);
    const baseInputClassName =
      "w-full rounded border border-Color-Scheme-1-Border/40 bg-white px-3 py-2 text-sm text-Color-Scheme-1-Text outline-none transition focus:border-Color-Scheme-1-Text";

    if (field.semantic_type === "signature_mark") {
      return (
        <div className="rounded border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-sm text-Color-Neutral">
          Signature capture occurs in a later step.
        </div>
      );
    }

    if (field.data_type === "object") {
      return (
        <div className="rounded border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-sm text-Color-Neutral">
          This input is captured through an upload or generated artifact step.
        </div>
      );
    }

    if (field.data_type === "boolean") {
      return (
        <label className="flex items-center gap-3 rounded border border-Color-Scheme-1-Border/40 bg-white px-3 py-3 text-sm text-Color-Scheme-1-Text">
          <input
            checked={Boolean(fieldValue)}
            className="h-4 w-4"
            onChange={(event) =>
              handleFieldChange(field.canonical_key, event.target.checked)
            }
            type="checkbox"
          />
          <span>{field.label}</span>
        </label>
      );
    }

    if (field.data_type === "integer") {
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

    if (field.data_type === "date") {
      return (
        <input
          className={baseInputClassName}
          onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
          type="date"
          value={typeof fieldValue === "string" ? fieldValue : ""}
        />
      );
    }

    if (field.data_type === "array") {
      if (allowedValues.length > 0) {
        const selectedValues = Array.isArray(fieldValue) ? fieldValue : [];

        return (
          <div className="space-y-2 rounded border border-Color-Scheme-1-Border/40 bg-white p-3">
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
                  <span>{formatLabel(value)}</span>
                </label>
              );
            })}
          </div>
        );
      }

      const textareaValue = Array.isArray(fieldValue)
        ? fieldValue.join("\n")
        : typeof fieldValue === "string"
          ? fieldValue
          : "";

      return (
        <textarea
          className={`${baseInputClassName} min-h-28`}
          onChange={(event) => {
            const nextValues = event.target.value
              .split("\n")
              .map((entry) => entry.trim())
              .filter(Boolean);

            handleFieldChange(field.canonical_key, nextValues);
          }}
          value={textareaValue}
        />
      );
    }

    if (allowedValues.length > 0) {
      return (
        <select
          className={baseInputClassName}
          onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
          value={typeof fieldValue === "string" ? fieldValue : ""}
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

    if (field.semantic_type.includes("text")) {
      return (
        <textarea
          className={`${baseInputClassName} min-h-28`}
          maxLength={getNumberConstraint(field, "maxLength")}
          onChange={(event) => handleFieldChange(field.canonical_key, event.target.value)}
          value={typeof fieldValue === "string" ? fieldValue : ""}
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

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-medium">Start a document</div>
        <div className="text-sm text-Color-Neutral">
          Load jurisdiction-specific intake requirements for POA (General) and Trust
          (RRR). Trust certification and IDN are generated downstream during rendering
          and execution.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "1. Jurisdiction",
            description: "Use jurisdictions available for both POA General and Trust RRR.",
          },
          {
            title: "2. Prepare",
            description: "Complete the merged intake fields required for that jurisdiction.",
          },
          {
            title: "3. Continue",
            description: "Generate POA and Trust outputs; IDN is produced during execution.",
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
          <div className="space-y-4 rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Jurisdiction</div>
                <div className="mt-1 text-xs text-Color-Neutral">
                  Intake profile is POA General + Trust RRR for every jurisdiction.
                </div>
              </div>
              {memberForm ? (
                <div className="inline-flex items-center gap-2">
                  <div className="rounded-full border border-Color-Scheme-1-Border/40 bg-white px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-Color-Neutral">
                    {memberForm.families.join(" + ")}
                  </div>
                  <HelpTooltip
                    label="Current contract composition"
                    content={`Document types: ${memberForm.documentTypes
                      .map((type) => formatLabel(type))
                      .join(", ")}`}
                  />
                </div>
              ) : null}
            </div>

            <div className="relative max-w-sm">
              <select
                className="w-full appearance-none rounded border border-Color-Scheme-1-Border/40 bg-white px-4 py-3 pr-12 text-sm text-Color-Scheme-1-Text outline-none transition focus:border-Color-Scheme-1-Text"
                disabled={isLoadingJurisdictions || jurisdictions.length === 0}
                onChange={handleJurisdictionChange}
                value={selectedJurisdiction}
              >
                {jurisdictions.length === 0 ? (
                  <option value="">
                    {isLoadingJurisdictions ? "Loading jurisdictions..." : "No jurisdictions"}
                  </option>
                ) : null}
                {jurisdictions.map((jurisdiction) => (
                  <option key={jurisdiction.code} value={jurisdiction.code}>
                    {jurisdiction.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4 text-Color-Neutral">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5.25 7.5 10 12.25 14.75 7.5" />
                </svg>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {missingRequirements.length > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Missing rules for: {missingRequirements
                  .map((entry) => `${entry.family} (${formatLabel(entry.documentType)})`)
                  .join(", ")}
              </div>
            ) : null}

            {sourceOnlyVisibleCount > 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {sourceOnlyVisibleCount} visible field
                {sourceOnlyVisibleCount > 1 ? "s are" : " is"} source-conditioned. Field
                visibility and requiredness are resolved using source-level conditions.
              </div>
            ) : null}

            <div>
              <div className="text-sm font-medium">Document details</div>
              <div className="mt-1 text-xs text-Color-Neutral">
                Complete fields that are active for the selected jurisdiction.
              </div>
            </div>

            {isLoadingMemberForm ? (
              <div className="text-sm text-Color-Neutral">Loading member form requirements...</div>
            ) : memberForm ? (
              <div className="space-y-4">
                {visibleSections.map((section) => (
                  <div
                    key={section.key}
                    className="space-y-3 rounded-lg border border-Color-Scheme-1-Border/30 bg-white p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-Color-Scheme-1-Text">
                        {section.title}
                      </div>
                      <div className="text-xs uppercase tracking-[0.12em] text-Color-Neutral">
                        {section.fields.length} field{section.fields.length > 1 ? "s" : ""}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {section.fields.map((field) => {
                        const fieldRenderKey = [
                          section.key,
                          field.canonical_key,
                          field.sources
                            .map(
                              (source) =>
                                `${source.family}:${source.document_type}:${source.section_key}:${source.field_key}`,
                            )
                            .join("|"),
                        ].join(":");
                        const runtime = fieldRuntime.get(field.canonical_key);
                        const required = runtime?.required ?? field.required;
                        const activeSourceSummary = (runtime?.activeSources ?? [])
                          .map(
                            (source) =>
                              `${source.family.toUpperCase()} ${formatLabel(
                                source.document_type,
                              )} / ${formatLabel(source.field_key)}`,
                          )
                          .join(" | ");

                        return (
                          <div key={fieldRenderKey} className="space-y-2">
                            {field.data_type === "boolean"
                              ? null
                              : renderFieldLabel(field, required)}
                            {renderFieldControl(field)}
                            {field.data_type === "boolean" ? (
                              <div>{renderFieldLabel(field, required)}</div>
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

                <details className="rounded-lg border border-Color-Scheme-1-Border/30 bg-white">
                  <summary className="cursor-pointer p-4 text-sm font-medium text-Color-Scheme-1-Text">
                    Source trace snapshot ({memberForm.aggregatedForm.source_trace.length})
                  </summary>
                  <div className="space-y-2 border-t border-Color-Scheme-1-Border/20 px-4 py-3 text-sm">
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
                </details>
              </div>
            ) : (
              <div className="text-sm text-Color-Neutral">
                Select a jurisdiction to load merged member-facing requirements.
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
