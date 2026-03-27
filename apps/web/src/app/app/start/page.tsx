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
  createdAt: string;
  updatedAt: string;
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

export default function StartDocumentPage() {
  const { accessToken } = useStoredAuth();
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("");
  const [requirement, setRequirement] = useState<PoaRequirement | null>(null);
  const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(true);
  const [isLoadingRequirement, setIsLoadingRequirement] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    const loadJurisdictions = async () => {
      setIsLoadingJurisdictions(true);
      setErrorMessage(null);

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
        }
      } catch (error) {
        if (!cancelled) {
          setRequirement(null);
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

  const legalTextRows: Array<{ label: string; value: string | null }> = requirement
    ? [
        { label: "Governing law", value: requirement.legalText.governingLaw },
        {
          label: "Execution requirements",
          value: requirement.legalText.executionRequirements,
        },
        {
          label: "Acknowledgment / witnessing",
          value: requirement.legalText.acknowledgmentWitnessing,
        },
        { label: "Durability", value: requirement.legalText.durability },
        {
          label: "Special authority",
          value: requirement.legalText.specialAuthority,
        },
        { label: "Competency", value: requirement.legalText.competency },
        { label: "Statutory form", value: requirement.legalText.statutoryForm },
        { label: "Effective date", value: requirement.legalText.effectiveDate },
      ]
    : [];

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

          {errorMessage ? (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
            <div className="space-y-3 rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60 p-4">
              <div className="text-sm font-medium">Workflow requirements</div>
              {isLoadingRequirement ? (
                <div className="text-sm text-Color-Neutral">Loading POA requirements...</div>
              ) : requirement ? (
                <div className="space-y-2">
                  {decisionRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-start justify-between gap-4 border-b border-Color-Scheme-1-Border/20 pb-2 text-sm last:border-b-0 last:pb-0"
                    >
                      <div className="text-Color-Neutral">{row.label}</div>
                      <div className="text-right font-medium text-Color-Scheme-1-Text">
                        {formatDecisionValue(row.value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-Color-Neutral">
                  Select a state to load the current POA requirements.
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Statutory reference</div>
              {isLoadingRequirement ? (
                <div className="text-sm text-Color-Neutral">Loading legal references...</div>
              ) : requirement ? (
                <div className="space-y-3">
                  {legalTextRows.map((row) => (
                    <div key={row.label} className="space-y-1">
                      <div className="text-xs uppercase tracking-[0.12em] text-Color-Neutral">
                        {row.label}
                      </div>
                      <div className="text-sm leading-6 text-Color-Scheme-1-Text">
                        {row.value || "Not addressed"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-Color-Neutral">
                  The POA legal text will appear here after you select a state.
                </div>
              )}
            </div>
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