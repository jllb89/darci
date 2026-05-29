"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppToast } from "@/components/app/AppToastContext";
import { captureAppException, captureAppMessage } from "@/lib/clientTelemetry";
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
  formatPhoneInput,
  getPhoneCountryCodeByIso2,
  getMemberFieldControlKind,
  hasSigningTrustee,
  isValidEmailFormat,
  isValidPhoneCountryCode,
  isValidPhoneFormat,
  isTemporarilyHiddenCreateFlowField,
  parseMultilineArrayFormInput,
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
  productFlowModeKeys,
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
  DocumentSummary,
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
  isProductFlowStepKey,
  isTaxIdOwnerSelectionBoundToTrustmakers,
  isTrusteeListField,
  normalizeCanonicalKey,
  normalizeNameForComparison,
  normalizeSignatureAuthorityMode,
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

const parseCalendarDateValue = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatCalendarDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCalendarMonthStart = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const addCalendarMonths = (date: Date, amount: number) => {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
};

const addCalendarYears = (date: Date, amount: number) => {
  return new Date(date.getFullYear() + amount, date.getMonth(), 1);
};

const getCalendarDecadeStart = (year: number) => Math.floor(year / 10) * 10;

const getCalendarCenturyStart = (year: number) => Math.floor(year / 100) * 100;

const getCalendarDecadeOptions = (year: number) => {
  const centuryStart = getCalendarCenturyStart(year);
  return Array.from({ length: 12 }, (_, index) => centuryStart - 10 + index * 10);
};

const getCalendarYearOptions = (year: number) => {
  const decadeStart = getCalendarDecadeStart(year);
  return Array.from({ length: 12 }, (_, index) => decadeStart - 1 + index);
};

const calendarMonthOptions = Array.from({ length: 12 }, (_, index) => {
  const sampleDate = new Date(2026, index, 1);
  return {
    index,
    shortLabel: sampleDate.toLocaleDateString(undefined, { month: "short" }),
    longLabel: sampleDate.toLocaleDateString(undefined, { month: "long" }),
  };
});

type CalendarView = "days" | "decades" | "years" | "months";

const getCalendarPreviousLabel = (view: CalendarView) => {
  if (view === "decades") {
    return "Previous century";
  }

  if (view === "years") {
    return "Previous decade";
  }

  if (view === "months") {
    return "Previous year";
  }

  return "Previous month";
};

const getCalendarNextLabel = (view: CalendarView) => {
  if (view === "decades") {
    return "Next century";
  }

  if (view === "years") {
    return "Next decade";
  }

  if (view === "months") {
    return "Next year";
  }

  return "Next month";
};

const getCalendarDays = (visibleMonth: Date) => {
  const firstOfMonth = getCalendarMonthStart(visibleMonth);
  const firstVisibleDate = new Date(firstOfMonth);
  firstVisibleDate.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisibleDate);
    date.setDate(firstVisibleDate.getDate() + index);
    return date;
  });
};

const formatCalendarDateLabel = (value: string, placeholder: string) => {
  const parsed = parseCalendarDateValue(value);
  if (!parsed) {
    return placeholder;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatMissingInformationAlert = (messages: string[]) => {
  const uniqueMessages = Array.from(
    new Set(messages.map((message) => message.trim()).filter(Boolean)),
  );

  if (uniqueMessages.length === 0) {
    return "Complete the missing information before continuing.";
  }

  const visibleMessages = uniqueMessages.slice(0, 3);
  const remainingCount = uniqueMessages.length - visibleMessages.length;
  const suffix = remainingCount > 0 ? ` ${remainingCount} more item${remainingCount === 1 ? "" : "s"} below.` : "";

  return `Missing information: ${visibleMessages.join(" ")}${suffix}`;
};

const bulkSelectableCheckboxFieldKeys = new Set([
  "authority_scope_selection",
  "trustee_power_matrix",
  "trustee_powers",
]);

const IntakeDatePicker = ({
  value,
  onChange,
  className,
  placeholder = "Select date",
  ariaLabel = "Select date",
}: {
  value: string;
  onChange: (value: string) => void;
  className: string;
  placeholder?: string;
  ariaLabel?: string;
}) => {
  const selectedDate = parseCalendarDateValue(value);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarView>("days");
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getCalendarMonthStart(selectedDate ?? new Date()),
  );
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const days = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }

    const popoverWidth = 288;
    const leftBoundary = 16;
    const rightBoundary = window.innerWidth - popoverWidth - leftBoundary;
    setPopoverPosition({
      left: Math.max(leftBoundary, Math.min(triggerRect.left, rightBoundary)),
      top: triggerRect.bottom + 8,
    });
  }, []);

  useEffect(() => {
    const nextSelectedDate = parseCalendarDateValue(value);
    if (nextSelectedDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the calendar month aligned to the selected field date.
      setVisibleMonth(getCalendarMonthStart(nextSelectedDate));
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- measure trigger position after the calendar opens.
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const selectedKey = selectedDate ? formatCalendarDateKey(selectedDate) : null;
  const currentMonth = visibleMonth.getMonth();
  const currentYear = visibleMonth.getFullYear();
  const currentDecadeStart = getCalendarDecadeStart(currentYear);
  const currentCenturyStart = getCalendarCenturyStart(currentYear);
  const decadeOptions = useMemo(() => getCalendarDecadeOptions(currentYear), [currentYear]);
  const yearOptions = useMemo(() => getCalendarYearOptions(currentYear), [currentYear]);
  const monthName = visibleMonth.toLocaleDateString(undefined, { month: "long" });
  const portalTarget = typeof document === "undefined" ? null : document.body;
  const calendarPopover =
    isOpen && popoverPosition && portalTarget
      ? createPortal(
          <div
            className="fixed z-[120] w-72 rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-4 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White transition-colors hover:bg-Color-Neutral-Lightest/70"
                aria-label={getCalendarPreviousLabel(calendarView)}
                onClick={() => {
                  if (calendarView === "decades") {
                    setVisibleMonth((current) => addCalendarYears(current, -100));
                    return;
                  }

                  if (calendarView === "years") {
                    setVisibleMonth((current) => addCalendarYears(current, -10));
                    return;
                  }

                  if (calendarView === "months") {
                    setVisibleMonth((current) => addCalendarYears(current, -1));
                    return;
                  }

                  setVisibleMonth((current) => addCalendarMonths(current, -1));
                }}
              >
                <span aria-hidden="true" className="h-2 w-2 rotate-[135deg] border-b border-r border-Color-Neutral-Darkest" />
              </button>
              {calendarView === "days" ? (
                <div className="flex items-center gap-1 text-sm font-medium text-Color-Scheme-1-Text">
                  <button
                    type="button"
                    className="rounded-md px-1.5 py-1 transition-colors hover:bg-Color-White"
                    onClick={() => setCalendarView("months")}
                  >
                    {monthName}
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-1.5 py-1 transition-colors hover:bg-Color-White"
                    aria-label={`Select year, current year ${currentYear}`}
                    onClick={() => setCalendarView("decades")}
                  >
                    {currentYear}
                  </button>
                </div>
              ) : (
                <>
                  {calendarView === "decades" ? (
                    <div className="text-sm font-medium text-Color-Scheme-1-Text">
                      {currentCenturyStart - 10}-{currentCenturyStart + 109}
                    </div>
                  ) : null}
                  {calendarView === "years" ? (
                    <button
                      type="button"
                      className="rounded-md px-1.5 py-1 text-sm font-medium text-Color-Scheme-1-Text transition-colors hover:bg-Color-White"
                      onClick={() => setCalendarView("decades")}
                    >
                      {currentDecadeStart}-{currentDecadeStart + 9}
                    </button>
                  ) : null}
                  {calendarView === "months" ? (
                    <button
                      type="button"
                      className="rounded-md px-1.5 py-1 text-sm font-medium text-Color-Scheme-1-Text transition-colors hover:bg-Color-White"
                      onClick={() => setCalendarView("years")}
                    >
                      {currentYear}
                    </button>
                  ) : null}
                </>
              )}
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White transition-colors hover:bg-Color-Neutral-Lightest/70"
                aria-label={getCalendarNextLabel(calendarView)}
                onClick={() => {
                  if (calendarView === "decades") {
                    setVisibleMonth((current) => addCalendarYears(current, 100));
                    return;
                  }

                  if (calendarView === "years") {
                    setVisibleMonth((current) => addCalendarYears(current, 10));
                    return;
                  }

                  if (calendarView === "months") {
                    setVisibleMonth((current) => addCalendarYears(current, 1));
                    return;
                  }

                  setVisibleMonth((current) => addCalendarMonths(current, 1));
                }}
              >
                <span aria-hidden="true" className="h-2 w-2 -rotate-45 border-b border-r border-Color-Neutral-Darkest" />
              </button>
            </div>

            {calendarView === "decades" ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {decadeOptions.map((decadeStart) => {
                  const isCurrentDecade = decadeStart === currentDecadeStart;

                  return (
                    <button
                      key={decadeStart}
                      type="button"
                      className={`h-10 rounded-md border text-xs transition-colors ${
                        isCurrentDecade
                          ? "border-Color-Neutral-Darkest bg-Color-Neutral-Darkest text-Color-White"
                          : "border-transparent bg-Color-White/70 text-Color-Scheme-1-Text hover:border-Color-Scheme-1-Border/60 hover:bg-Color-White"
                      }`}
                      onClick={() => {
                        setVisibleMonth(new Date(decadeStart, currentMonth, 1));
                        setCalendarView("years");
                      }}
                    >
                      {decadeStart}-{decadeStart + 9}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {calendarView === "years" ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {yearOptions.map((year) => {
                  const isSelectedYear = selectedDate?.getFullYear() === year;
                  const isMuted = year < currentDecadeStart || year > currentDecadeStart + 9;

                  return (
                    <button
                      key={year}
                      type="button"
                      className={`h-10 rounded-md border text-xs transition-colors ${
                        isSelectedYear
                          ? "border-Color-Neutral-Darkest bg-Color-Neutral-Darkest text-Color-White"
                          : "border-transparent bg-Color-White/70 hover:border-Color-Scheme-1-Border/60 hover:bg-Color-White"
                      } ${isMuted ? "text-Color-Neutral" : "text-Color-Scheme-1-Text"}`}
                      onClick={() => {
                        setVisibleMonth(new Date(year, currentMonth, 1));
                        setCalendarView("months");
                      }}
                    >
                      {year}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {calendarView === "months" ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {calendarMonthOptions.map((month) => {
                  const isSelectedMonth = selectedDate?.getFullYear() === currentYear && selectedDate.getMonth() === month.index;
                  const isCurrentVisibleMonth = currentMonth === month.index;

                  return (
                    <button
                      key={month.index}
                      type="button"
                      className={`h-10 rounded-md border text-xs transition-colors ${
                        isSelectedMonth || isCurrentVisibleMonth
                          ? "border-Color-Neutral-Darkest bg-Color-Neutral-Darkest text-Color-White"
                          : "border-transparent bg-Color-White/70 text-Color-Scheme-1-Text hover:border-Color-Scheme-1-Border/60 hover:bg-Color-White"
                      }`}
                      aria-label={`Show ${month.longLabel} ${currentYear}`}
                      onClick={() => {
                        setVisibleMonth(new Date(currentYear, month.index, 1));
                        setCalendarView("days");
                      }}
                    >
                      {month.shortLabel}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {calendarView === "days" ? (
              <>
                <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase text-Color-Neutral">
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-7 gap-1.5">
                  {days.map((day) => {
                    const dayKey = formatCalendarDateKey(day);
                    const isSelected = dayKey === selectedKey;
                    const isMuted = day.getMonth() !== currentMonth;

                    return (
                      <button
                        key={dayKey}
                        type="button"
                        className={`h-8 rounded-md border text-xs transition-colors ${
                          isSelected
                            ? "border-Color-Neutral-Darkest bg-Color-Neutral-Darkest text-Color-White"
                            : "border-transparent bg-Color-White/70 hover:border-Color-Scheme-1-Border/60 hover:bg-Color-White"
                        } ${isMuted ? "text-Color-Neutral" : "text-Color-Scheme-1-Text"}`}
                        onClick={() => {
                          onChange(dayKey);
                          setIsOpen(false);
                          setCalendarView("days");
                          triggerRef.current?.blur();
                        }}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {value ? (
              <button
                type="button"
                className="mt-4 w-full rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-2 py-2 text-xs text-Color-Neutral-Darkest transition-colors hover:bg-Color-Neutral-Lightest/70"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                  setCalendarView("days");
                  triggerRef.current?.blur();
                }}
              >
                Clear date
              </button>
            ) : null}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${className} flex items-center justify-between gap-3 text-left`}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) {
            updatePopoverPosition();
            setCalendarView("days");
          }
          setIsOpen(!isOpen);
        }}
      >
        <span className={value ? undefined : "text-Color-Neutral"}>
          {formatCalendarDateLabel(value, placeholder)}
        </span>
        <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 border-b border-r border-Color-Neutral" />
      </button>
      {calendarPopover}
    </>
  );
};

const getDefaultFormStep = (
  productFlowMode?: ProductFlowModeKey | "" | null,
): FormStep => {
  return productFlowMode === "trust_bundle"
    ? "trust_requirements"
    : "general_information";
};

const coerceDraftFormStep = (
  value: unknown,
  productFlowMode?: ProductFlowModeKey | "" | null,
): FormStep => {
  const defaultFormStep = getDefaultFormStep(productFlowMode);

  if (typeof value !== "string") {
    return defaultFormStep;
  }

  const normalized = value.trim();

  if (normalized === "general_information" && productFlowMode === "trust_bundle") {
    return "trust_requirements";
  }

  if (isProductFlowStepKey(normalized)) {
    return normalized;
  }

  if (normalized === "authority") {
    return "trust_requirements";
  }

  return defaultFormStep;
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

type DraftSaveSnapshot = {
  accessToken: string;
  documentId: string;
  productFlowMode: ProductFlowModeKey;
  currentFormStep: FormStep;
  formValues: Record<string, FormValue>;
};

type DocumentResponsePayload = {
  document?: DocumentSummary;
  message?: string;
};

export default function StartDocumentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const resumeDocumentId = searchParams.get("documentId")?.trim() ?? "";
  const [productFlowModes, setProductFlowModes] = useState<ProductFlowModeDefinition[]>([]);
  const [selectedProductFlowMode, setSelectedProductFlowMode] = useState<
    ProductFlowModeKey | ""
  >("");
  const [resolvedProductFlowMode, setResolvedProductFlowMode] =
    useState<ProductFlowModeDefinition | null>(null);
  const [isLoadingProductFlowModes, setIsLoadingProductFlowModes] = useState(false);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [selectedJurisdiction, setSelectedJurisdiction] = useState("");
  const [isMockDataEnabled, setIsMockDataEnabled] = useState(false);
  const [isActiveSourceVisible, setIsActiveSourceVisible] = useState(false);

  const [memberForm, setMemberForm] = useState<MemberFormRulesContract | null>(null);
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({});

  const [isLoadingJurisdictions, setIsLoadingJurisdictions] = useState(false);
  const [isLoadingMemberForm, setIsLoadingMemberForm] = useState(false);
  const [isValidatingMemberFormSubmission, setIsValidatingMemberFormSubmission] =
    useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submissionErrorMessage, setSubmissionErrorMessage] = useState<string | null>(null);
  const [showContinueValidationDetails, setShowContinueValidationDetails] = useState(false);
  const [missingRequirements, setMissingRequirements] = useState<MissingRequirement[]>([]);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [pendingLeaveAction, setPendingLeaveAction] = useState<LeaveAction | null>(null);
  const [currentFormStep, setCurrentFormStep] = useState<FormStep>("general_information");
  const [activeDropzoneFieldKey, setActiveDropzoneFieldKey] = useState<string | null>(null);
  const [draftDocumentId, setDraftDocumentId] = useState<string | null>(null);
  const [, setDraftRevision] = useState<number | null>(null);
  const [, setDraftUpdatedAt] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [, setDraftSaveNotice] = useState<string | null>(null);
  const allowLeavingRef = useRef(false);
  const hasPushedHistoryGuardRef = useRef(false);
  const lastServerDraftSignatureRef = useRef<string | null>(null);
  const contractContainerRef = useRef<HTMLDivElement | null>(null);
  const draftDocumentIdRef = useRef<string | null>(null);
  const draftRevisionRef = useRef<number | null>(null);
  const draftSaveTimerRef = useRef<number | null>(null);
  const draftSaveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));

  const syncDraftDocumentId = useCallback((nextDraftDocumentId: string | null) => {
    draftDocumentIdRef.current = nextDraftDocumentId;
    setDraftDocumentId(nextDraftDocumentId);
  }, []);

  const syncDraftRevision = useCallback((nextDraftRevision: number | null) => {
    draftRevisionRef.current = nextDraftRevision;
    setDraftRevision(nextDraftRevision);
  }, []);

  const resetQueuedDraftSaves = useCallback(() => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    draftSaveQueueRef.current = Promise.resolve(true);
  }, []);

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
    if (!accessToken || !resumeDocumentId) {
      return;
    }

    let cancelled = false;

    const loadResumeTarget = async () => {
      try {
        const [documentResponse, draftResponse] = await Promise.all([
          fetchWithTokenRefresh(
            `${apiBaseUrl}/documents/${resumeDocumentId}`,
            accessToken,
            { cache: "no-store" },
          ),
          fetchWithTokenRefresh(
            `${apiBaseUrl}/documents/${resumeDocumentId}/intake-draft`,
            accessToken,
            { cache: "no-store" },
          ),
        ]);
        const documentPayload = (await documentResponse.json().catch(() => null)) as
          | DocumentResponsePayload
          | null;
        const draftPayload = (await draftResponse.json().catch(() => null)) as
          | DocumentIntakeDraftResponsePayload
          | null;

        if (!documentResponse.ok || !documentPayload?.document) {
          throw new Error(documentPayload?.message ?? "Failed to resume the existing draft.");
        }

        const nextModeRaw =
          typeof draftPayload?.draft?.productFlowMode === "string"
            ? draftPayload.draft.productFlowMode
            : documentPayload.document.productFlowMode ?? "";
        const nextJurisdiction =
          typeof draftPayload?.draft?.jurisdiction === "string"
            ? draftPayload.draft.jurisdiction
            : documentPayload.document.jurisdiction ?? "";
        const nextMode = productFlowModeKeys.includes(nextModeRaw as ProductFlowModeKey)
          ? (nextModeRaw as ProductFlowModeKey)
          : "";

        if (cancelled) {
          return;
        }

        setIsMockDataEnabled(false);

        if (nextMode) {
          setSelectedProductFlowMode(nextMode);
        }

        if (nextJurisdiction) {
          setSelectedJurisdiction(nextJurisdiction);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to resume the existing draft.";
        setErrorMessage(message);
        showToast({ tone: "error", message });
      }
    };

    void loadResumeTarget();

    return () => {
      cancelled = true;
    };
  }, [accessToken, resumeDocumentId, showToast]);

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

  const queueDraftSave = useCallback(
    (snapshot: DraftSaveSnapshot) => {
      const signature = buildDraftSignature(
        snapshot.currentFormStep,
        snapshot.formValues,
      );

      const queuedSave = draftSaveQueueRef.current.then(async () => {
        if (lastServerDraftSignatureRef.current === signature) {
          return true;
        }

        setIsSavingDraft(true);

        try {
          const requestPayload: Record<string, unknown> = {
            currentStep: snapshot.currentFormStep,
            rulesSnapshotVersion: "member_form_rules_contract_v1",
            answers: snapshot.formValues,
          };

          if (typeof draftRevisionRef.current === "number") {
            requestPayload.expectedRevision = draftRevisionRef.current;
          }

          const response = await fetchWithTokenRefresh(
            `${apiBaseUrl}/documents/${snapshot.documentId}/intake-draft`,
            snapshot.accessToken,
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

          if (draftDocumentIdRef.current !== snapshot.documentId) {
            return true;
          }

          if (response.status === 409) {
            if (typeof payload?.intakeStatus === "string" && payload.intakeStatus.length > 0) {
              const message =
                payload?.message ??
                "Intake is already submitted and can no longer be edited from the form.";
              setDraftSaveNotice(message);
              showToast({
                tone: "warning",
                message,
                durationMs: 5000,
              });
              router.push(`/app/review?documentId=${encodeURIComponent(snapshot.documentId)}`);
              return false;
            }

            const currentRevision =
              typeof payload?.currentRevision === "number"
                ? payload.currentRevision
                : null;

            if (currentRevision !== null) {
              syncDraftRevision(currentRevision);
            }

            const latestResponse = await fetchWithTokenRefresh(
              `${apiBaseUrl}/documents/${snapshot.documentId}/intake-draft`,
              snapshot.accessToken,
            );
            const latestPayload = (await latestResponse
              .json()
              .catch(() => null)) as DocumentIntakeDraftResponsePayload | null;

            if (
              draftDocumentIdRef.current === snapshot.documentId &&
              latestResponse.ok &&
              latestPayload?.draft
            ) {
              const mergedFormValues = {
                ...sanitizeFormValuesRecord(latestPayload.draft.answers),
                ...snapshot.formValues,
              };
              const syncedCurrentFormStep = coerceDraftFormStep(
                latestPayload.draft.currentStep,
                snapshot.productFlowMode,
              );

              setFormValues(mergedFormValues);
              setCurrentFormStep(syncedCurrentFormStep);
              syncDraftRevision(latestPayload.draft.revision);
              setDraftUpdatedAt(latestPayload.draft.updatedAt);
              lastServerDraftSignatureRef.current = buildDraftSignature(
                syncedCurrentFormStep,
                mergedFormValues,
              );
            }

            const message =
              "Draft changed in another session. Synced latest draft without overriding your current edits.";
            setDraftSaveNotice(message);
            showToast({
              tone: "warning",
              message,
              durationMs: 5000,
            });

            return false;
          }

          if (!response.ok || !payload?.draft) {
            throw new Error(payload?.message ?? "Failed to save draft");
          }

          syncDraftRevision(payload.draft.revision);
          setDraftUpdatedAt(payload.draft.updatedAt);
          setDraftSaveNotice(null);
          lastServerDraftSignatureRef.current = signature;

          return true;
        } catch (error) {
          if (draftDocumentIdRef.current !== snapshot.documentId) {
            return true;
          }

          const message =
            error instanceof Error ? error.message : "Failed to save draft";

          setDraftSaveNotice(message);
          showToast({
            tone: "error",
            message,
            durationMs: 5000,
          });

          return true;
        } finally {
          if (draftDocumentIdRef.current === snapshot.documentId) {
            setIsSavingDraft(false);
          }
        }
      });

      draftSaveQueueRef.current = queuedSave.catch(() => true);

      return queuedSave;
    },
    [router, showToast, syncDraftRevision],
  );

  const waitForQueuedDraftSaves = useCallback(async () => {
    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }

    return draftSaveQueueRef.current;
  }, []);

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
          syncDraftDocumentId(null);
          syncDraftRevision(null);
          setDraftUpdatedAt(null);
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          resetQueuedDraftSaves();
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
  }, [accessToken, resetQueuedDraftSaves, syncDraftDocumentId, syncDraftRevision]);

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
          syncDraftDocumentId(null);
          syncDraftRevision(null);
          setDraftUpdatedAt(null);
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          resetQueuedDraftSaves();
          lastServerDraftSignatureRef.current = null;
        }
      } catch (error) {
        if (!cancelled) {
          setJurisdictions([]);
          setSelectedJurisdiction("");
          setMemberForm(null);
          setFormValues({});
          syncDraftDocumentId(null);
          syncDraftRevision(null);
          setDraftUpdatedAt(null);
          setDraftSaveNotice(null);
          setIsSavingDraft(false);
          resetQueuedDraftSaves();
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
  }, [
    accessToken,
    productFlowModes,
    resetQueuedDraftSaves,
    selectedProductFlowMode,
    syncDraftDocumentId,
    syncDraftRevision,
  ]);

  useEffect(() => {
    if (!accessToken || !selectedProductFlowMode || !selectedJurisdiction) {
      return;
    }

    let cancelled = false;

    const loadMemberForm = async () => {
      setIsLoadingMemberForm(true);
      setErrorMessage(null);
      setMissingRequirements([]);
      resetQueuedDraftSaves();
      lastServerDraftSignatureRef.current = null;

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

        let bootstrapPayload: DocumentIntakeBootstrapResponsePayload | null = null;
        let resumeDraftPayload: DocumentIntakeDraftResponsePayload | null = null;
        let bootstrapErrorMessage: string | null = null;

        try {
          if (resumeDocumentId) {
            const draftResponse = await fetchWithTokenRefresh(
              `${apiBaseUrl}/documents/${resumeDocumentId}/intake-draft`,
              accessToken,
              {
                cache: "no-store",
              },
            );

            resumeDraftPayload = (await draftResponse.json().catch(() => null)) as
              | DocumentIntakeDraftResponsePayload
              | null;

            if (!draftResponse.ok) {
              throw new Error(
                resumeDraftPayload?.message ?? "Failed to load the existing intake draft",
              );
            }
          } else {
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
                  resumeLatestDraft: false,
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

        if (resumeDocumentId) {
          const remoteDraft = resumeDraftPayload?.draft;
          const remoteValues = sanitizeFormValuesRecord(remoteDraft?.answers ?? {});
          const nextFormValues = {
            ...initialValues,
            ...remoteValues,
          };
          const nextCurrentFormStep = coerceDraftFormStep(
            remoteDraft?.currentStep,
            selectedProductFlowMode,
          );

          setFormValues(nextFormValues);
          setCurrentFormStep(nextCurrentFormStep);
          syncDraftDocumentId(resumeDocumentId);
          syncDraftRevision(
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
        } else if (bootstrapPayload?.document?.id) {
          const remoteDraft = bootstrapPayload.draft;
          const remoteValues = sanitizeFormValuesRecord(remoteDraft?.answers ?? {});
          const nextFormValues = {
            ...initialValues,
            ...remoteValues,
          };
          const nextCurrentFormStep = coerceDraftFormStep(
            remoteDraft?.currentStep,
            selectedProductFlowMode,
          );

          setFormValues(nextFormValues);
          setCurrentFormStep(nextCurrentFormStep);
          syncDraftDocumentId(bootstrapPayload.document.id);
          syncDraftRevision(
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
          const fallbackNotice = bootstrapErrorMessage
            ? `Draft persistence unavailable: ${bootstrapErrorMessage}. Starting with a fresh form.`
            : "Draft persistence unavailable. Starting with a fresh form.";
          const nextFormValues = {
            ...initialValues,
          };
          const nextCurrentFormStep = getDefaultFormStep(selectedProductFlowMode);

          setFormValues(nextFormValues);
          setCurrentFormStep(nextCurrentFormStep);
          syncDraftDocumentId(null);
          syncDraftRevision(null);
          setDraftUpdatedAt(null);
          setIsSavingDraft(false);
          setDraftSaveNotice(fallbackNotice);
          lastServerDraftSignatureRef.current = null;
          showToast({
            tone: "warning",
            message: fallbackNotice,
            durationMs: 5000,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setMemberForm(null);
          setFormValues({});
          syncDraftDocumentId(null);
          syncDraftRevision(null);
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
    resetQueuedDraftSaves,
    selectedJurisdiction,
    selectedJurisdictionLabel,
    selectedProductFlowMode,
    resumeDocumentId,
    showToast,
    syncDraftDocumentId,
    syncDraftRevision,
  ]);

  useEffect(() => {
    if (
      !isMockDataEnabled ||
      !memberForm ||
      !selectedJurisdiction ||
      isLoadingMemberForm ||
      resumeDocumentId
    ) {
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
    resumeDocumentId,
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
    const fallbackStepOrder = selectedProductFlowMode
      ? productFlowStepOrderByMode[selectedProductFlowMode]
      : productFlowStepOrderByMode.trust_bundle;

    const configuredKeys = [...(modeDefinition?.ui ?? [])]
      .filter((entry) => entry.layoutMode === "wizard-step")
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((entry) => entry.groupKey)
      .filter((groupKey): groupKey is FormStep => isProductFlowStepKey(groupKey));

    if (selectedProductFlowMode === "trust_bundle") {
      return fallbackStepOrder;
    }

    if (configuredKeys.length > 0) {
      return [...new Set(configuredKeys)];
    }

    return fallbackStepOrder;
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
  const documentsColumnHasPriorDocumentItems = documentsColumnFields.some(
    (field) => normalizeCanonicalKey(field.canonical_key) === "prior_document_items",
  );

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
    const items = parsePriorDocumentItems(formValues.prior_document_items);
    return getFilledPriorDocumentRows(items).length > 0;
  }, [formValues.prior_document_items]);

  const isDocumentsColumnComplete =
    !shouldShowUploadColumn || !uploadRequiredByMode || hasDocumentsUploadValue;

  const displayedPrimarySections = activeFormStep?.sections ?? [];

  const hasPreviousFormStep = previousFormStep !== null;
  const hasNextFormStep = nextFormStep !== null;

  useEffect(() => {
    setCurrentFormStep(getDefaultFormStep(selectedProductFlowMode));
  }, [selectedJurisdiction, selectedProductFlowMode]);

  useEffect(() => {
    if (formStepDefinitions.length === 0) {
      return;
    }

    if (!formStepDefinitions.some((stepDefinition) => stepDefinition.stepKey === currentFormStep)) {
      setCurrentFormStep(
        formStepDefinitions[0]?.stepKey ?? getDefaultFormStep(selectedProductFlowMode),
      );
    }
  }, [currentFormStep, formStepDefinitions, selectedProductFlowMode]);

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

    draftSaveTimerRef.current = window.setTimeout(() => {
      draftSaveTimerRef.current = null;

      void queueDraftSave({
        accessToken,
        documentId: draftDocumentId,
        productFlowMode: selectedProductFlowMode,
        currentFormStep,
        formValues,
      });
    }, 750);

    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = null;
      }
    };
  }, [
    accessToken,
    currentFormStep,
    draftDocumentId,
    formValues,
    isLoadingMemberForm,
    isValidatingMemberFormSubmission,
    memberForm,
    queueDraftSave,
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
    if (isTaxIdOwnerSelectionBoundToTrustmakers(field) && trustmakerNames.length > 0) {
      return trustmakerNames;
    }

    return getAllowedValues(field);
  }, [trustmakerNames]);

  const getResolvedAllowedValueLabels = useCallback((
    field: MemberFacingField,
    allowedValues: string[],
  ) => {
    if (isTaxIdOwnerSelectionBoundToTrustmakers(field) && trustmakerNames.length > 0) {
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
      isTaxIdOwnerSelectionBoundToTrustmakers(taxIdOwnerField) && trustmakerNames.length > 0;

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

  const trustmakerValidation = useMemo(() => {
    const rows = parsePersonListItems(formValues.grantors);
    const filledRows = getFilledPersonRows(rows);
    const emails = filledRows
      .map((item) => item.email.trim().toLowerCase())
      .filter((email) => email.length > 0);

    return {
      filledCount: filledRows.length,
      tooMany: filledRows.length > 2,
      duplicateEmailCount: emails.length - new Set(emails).size,
    };
  }, [formValues.grantors]);

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

  const requiredVisibleFieldMessages = useMemo(() => {
    const messages: string[] = [];
    const addMessage = (message: string) => {
      if (!messages.includes(message)) {
        messages.push(message);
      }
    };
    const getPersonRoleLabel = (canonicalKey: string) => {
      const normalizedKey = normalizeCanonicalKey(canonicalKey);
      if (normalizedKey === "grantors") {
        return "Trustmaker";
      }

      if (normalizedKey === "trustees") {
        return "Trustee";
      }

      if (normalizedKey === "successor_trustees") {
        return "Successor trustee";
      }

      return "Person";
    };

    for (const section of visibleSections) {
      for (const field of section.fields) {
        if (isTemporarilyHiddenCreateFlowField(field.canonical_key)) {
          continue;
        }

        const runtime = fieldRuntime.get(field.canonical_key);
        if (!runtime?.visible || !runtime.required) {
          continue;
        }

        const fieldValue = formValues[field.canonical_key];
        const resolvedAllowedValues = getResolvedAllowedValues(field);
        const controlKind = getMemberFieldControlKind(field, resolvedAllowedValues);
        const fieldLabel = field.label || formatLabel(normalizeCanonicalKey(field.canonical_key));

        if (controlKind === "boolean") {
          if (typeof fieldValue !== "boolean") {
            addMessage(`${fieldLabel}: choose yes or no.`);
          }

          continue;
        }

        if (controlKind === "person-contact") {
          const validation = validatePersonContact(fieldValue);
          if (validation.missingEmail) {
            addMessage(`${fieldLabel}: email is required.`);
          }

          if (validation.missingPhone) {
            addMessage(`${fieldLabel}: phone number is required.`);
          }

          if (validation.invalidEmail) {
            addMessage(`${fieldLabel}: enter a valid email address.`);
          }

          if (validation.invalidPhone || validation.invalidCountryCode) {
            addMessage(`${fieldLabel}: enter a valid phone country code and phone number.`);
          }

          continue;
        }

        if (controlKind === "repeatable-person-list") {
          const items = parsePersonListItems(fieldValue);
          const filledRows = getFilledPersonRows(items);
          const roleLabel = getPersonRoleLabel(field.canonical_key);

          if (filledRows.length === 0 && items.length === 0) {
            addMessage(`${fieldLabel}: add at least one ${roleLabel.toLowerCase()}.`);
            continue;
          }

          items.forEach((item, index) => {
            const rowHasValue =
              item.fullName.trim().length > 0 ||
              item.email.trim().length > 0 ||
              item.phone.trim().length > 0;

            if (!rowHasValue && filledRows.length > 0) {
              return;
            }

            const rowLabel = `${roleLabel} ${index + 1}`;
            const missingParts: string[] = [];
            if (item.fullName.trim().length === 0) {
              missingParts.push("full name");
            }

            if (item.email.trim().length === 0) {
              missingParts.push("email");
            }

            if (item.phone.trim().length === 0) {
              missingParts.push("phone number");
            }

            if (missingParts.length > 0) {
              addMessage(`${rowLabel}: ${missingParts.join(", ")} required.`);
            }

            if (item.email.trim().length > 0 && !isValidEmailFormat(item.email)) {
              addMessage(`${rowLabel}: enter a valid email address.`);
            }

            if (
              item.phone.trim().length > 0 &&
              (!isValidPhoneCountryCode(item.phoneCountryCode) || !isValidPhoneFormat(item.phone))
            ) {
              addMessage(`${rowLabel}: enter a valid phone country code and phone number.`);
            }
          });

          if (filledRows.length === 0 && items.length > 0) {
            addMessage(`${fieldLabel}: complete at least one ${roleLabel.toLowerCase()} row.`);
          }

          if (
            isTrusteeListField(field.canonical_key) &&
            requiresNamedSigningTrusteeSelection &&
            !hasSigningTrustee(filledRows.filter((item) => item.fullName.trim().length > 0))
          ) {
            addMessage("Trustees: select exactly one named signing trustee.");
          }

          continue;
        }

        if (controlKind === "checkbox-multi" || controlKind === "repeatable-text-list") {
          if (!toStringArrayValue(fieldValue).some((item) => item.trim().length > 0)) {
            addMessage(`${fieldLabel}: add at least one entry.`);
          }

          continue;
        }

        if (controlKind === "repeatable-document-list") {
          const items = parsePriorDocumentItems(fieldValue);
          const filledRows = getFilledPriorDocumentRows(items);

          if (filledRows.length === 0 && items.length === 0) {
            addMessage(`${fieldLabel}: add at least one document.`);
            continue;
          }

          items.forEach((item, index) => {
            const rowHasValue =
              item.documentType.trim().length > 0 ||
              item.documentLabel.trim().length > 0 ||
              item.documentDate.trim().length > 0 ||
              item.attachmentReference.trim().length > 0;

            if (!rowHasValue && filledRows.length > 0) {
              return;
            }

            const missingParts: string[] = [];
            if (item.documentType.trim().length === 0) {
              missingParts.push("type");
            }

            if (item.documentDate.trim().length === 0) {
              missingParts.push("signed date");
            }

            if (item.documentLabel.trim().length === 0) {
              missingParts.push("document label");
            }

            if (item.attachmentReference.trim().length === 0) {
              missingParts.push("recording or attachment reference");
            }

            if (missingParts.length > 0) {
              addMessage(`Document ${index + 1}: ${missingParts.join(", ")} required.`);
            }
          });

          if (!hasOriginatingPriorDocumentType(filledRows[0])) {
            addMessage(
              "Document 1: type must be Trust Agreement or Declaration of Trust.",
            );
          }

          if (getPriorDocumentChronologyOutOfOrderCount(items) > 0) {
            addMessage("Documents: signed dates must be chronological from oldest to newest.");
          }

          continue;
        }

        if (controlKind === "file-upload") {
          if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
            addMessage(`${fieldLabel}: upload a file.`);
          }

          continue;
        }

        if (controlKind === "select") {
          if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
            addMessage(`${fieldLabel}: select an option.`);
            continue;
          }

          if (
            isTaxIdOwnerSelectionBoundToTrustmakers(field) &&
            trustmakerNames.length > 0 &&
            !isNameInList(fieldValue, trustmakerNames)
          ) {
            addMessage(`${fieldLabel}: select one of the listed Trustmakers.`);
          }

          continue;
        }

        if (
          controlKind === "number" ||
          controlKind === "date" ||
          controlKind === "textarea" ||
          controlKind === "text"
        ) {
          if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) {
            addMessage(`${fieldLabel}: this field is required.`);
          }
        }

      }
    }

    return messages;
  }, [
    fieldRuntime,
    formValues,
    getResolvedAllowedValues,
    requiresNamedSigningTrusteeSelection,
    trustmakerNames,
    visibleSections,
  ]);

  const blockingValidationMessages = useMemo(() => {
    const messages: string[] = [];
    const addMessage = (message: string) => {
      if (!messages.includes(message)) {
        messages.push(message);
      }
    };

    const addContactMessages = (
      label: string,
      validation: typeof principalContactValidation,
    ) => {
      if (!("missingEmail" in validation)) {
        return;
      }

      if (validation.missingEmail) {
        addMessage(`${label}: email is required.`);
      }

      if (validation.missingPhone) {
        addMessage(`${label}: phone number is required.`);
      }

      if (validation.invalidEmail) {
        addMessage(`${label}: enter a valid email address.`);
      }

      if (validation.invalidPhone || validation.invalidCountryCode) {
        addMessage(`${label}: enter a valid phone country code and phone number.`);
      }
    };

    addContactMessages("Principal contact", principalContactValidation);
    addContactMessages("Agent contact", agentContactValidation);

    if (trustmakerValidation.tooMany) {
      addMessage("Trustmakers: add no more than two Trustmakers.");
    }

    if (trustmakerValidation.duplicateEmailCount > 0) {
      addMessage("Trustmakers: each Trustmaker must use a unique email address.");
    }

    if (trusteeValidation.incompleteCount > 0) {
      addMessage("Trustees: complete name, email, and phone for each started trustee row.");
    }

    if (trusteeValidation.invalidFormatCount > 0) {
      addMessage("Trustees: use valid email and phone formats.");
    }

    if (trusteeValidation.missingNamedSigner) {
      addMessage("Trustees: select exactly one named signing trustee.");
    }

    if (trusteeValidation.multipleNamedSigners) {
      addMessage("Trustees: choose only one named signing trustee.");
    }

    if (trusteeValidation.namedSignerModeConflict) {
      addMessage(
        "Trustees: clear named signer selections or switch Signing Authority to Named signing trustee.",
      );
    }

    if (successorTrusteeValidation.incompleteCount > 0) {
      addMessage(
        "Successor trustees: complete name, email, and phone for each started successor trustee row.",
      );
    }

    if (successorTrusteeValidation.invalidFormatCount > 0) {
      addMessage("Successor trustees: use valid email and phone formats.");
    }

    if (priorDocumentItemsValidation.incompleteCount > 0) {
      addMessage(
        "Documents: complete type, signed date, document label, and recording or attachment reference for each started document row.",
      );
    }

    if (priorDocumentItemsValidation.missingOriginatingDocument) {
      addMessage("Document 1: type must be Trust Agreement or Declaration of Trust.");
    }

    if (priorDocumentItemsValidation.chronologyOutOfOrderCount > 0) {
      addMessage("Documents: signed dates must be chronological from oldest to newest.");
    }

    if (!taxIdOwnerValidation.isValid) {
      addMessage("Tax ID owner: select one of the listed Trustmakers.");
    }

    return messages;
  }, [
    agentContactValidation,
    principalContactValidation,
    priorDocumentItemsValidation,
    successorTrusteeValidation,
    taxIdOwnerValidation.isValid,
    trustmakerValidation,
    trusteeValidation,
  ]);

  const continueValidationMessages = useMemo(() => {
    const messages = [...requiredVisibleFieldMessages, ...blockingValidationMessages];

    if (!isDocumentsColumnComplete) {
      messages.push("Supporting documents: add at least one document entry.");
    }

    if (hasNextFormStep) {
      messages.push(`Continue through ${nextFormStep?.label ?? "the remaining step"} first.`);
    }

    return Array.from(new Set(messages));
  }, [
    blockingValidationMessages,
    hasNextFormStep,
    isDocumentsColumnComplete,
    nextFormStep,
    requiredVisibleFieldMessages,
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
    if (formStepDefinitions.length === 0) {
      return;
    }

    const currentIndex = formStepDefinitions.findIndex(
      (stepDefinition) => stepDefinition.stepKey === currentFormStep,
    );

    if (currentIndex < 0 || currentIndex >= formStepDefinitions.length - 1) {
      return;
    }

    setCurrentFormStep(formStepDefinitions[currentIndex + 1]!.stepKey);
    setSubmissionErrorMessage(null);
    setShowContinueValidationDetails(false);
  };

  const returnToPreviousSectionGroup = () => {
    if (formStepDefinitions.length === 0) {
      return;
    }

    const currentIndex = formStepDefinitions.findIndex(
      (stepDefinition) => stepDefinition.stepKey === currentFormStep,
    );

    if (currentIndex <= 0) {
      return;
    }

    setCurrentFormStep(formStepDefinitions[currentIndex - 1]!.stepKey);
    setSubmissionErrorMessage(null);
    setShowContinueValidationDetails(false);
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
      const draftSaveReady = await waitForQueuedDraftSaves();

      if (!draftSaveReady) {
        setSubmissionErrorMessage(
          "Your draft changed before submission. Review the latest saved version and submit again.",
        );
        return false;
      }

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
            ...(typeof draftRevisionRef.current === "number"
              ? { expectedRevision: draftRevisionRef.current }
              : {}),
          }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | DocumentIntakeSubmitResponsePayload
        | null;

      if (response.status === 422 || payload?.valid === false) {
        const validationMessages = (payload?.errors ?? [])
          .map((item) => (typeof item.message === "string" ? item.message.trim() : ""))
          .filter((message) => message.length > 0);

        captureAppMessage("Member form submission validation failed", {
          level: "warning",
          tags: {
            feature: "member_form",
            document_id: draftDocumentId,
            product_flow_mode: selectedProductFlowMode,
            jurisdiction: selectedJurisdiction,
            current_step: currentFormStep,
          },
          contexts: {
            member_form_submission: {
              documentId: draftDocumentId,
              status: response.status,
              currentStep: currentFormStep,
              errorCount: payload?.errors?.length ?? 0,
              errors: (payload?.errors ?? []).map((item) => ({
                code: item.code,
                field: item.field,
                message: item.message,
              })),
            },
          },
          fingerprint: ["member_form_submit", "validation_failed"],
        });

        setSubmissionErrorMessage(
          validationMessages.length > 0
            ? formatMissingInformationAlert(validationMessages)
            : payload?.message ??
              "Member form validation failed. Review your entries and try again.",
        );
        return false;
      }

      if (response.status === 409) {
        if (typeof payload?.intakeStatus === "string") {
          const message =
            payload.message ??
            "Intake is already submitted and can no longer be edited from this form.";
          setSubmissionErrorMessage(message);
          showToast({
            tone: "warning",
            message,
            durationMs: 5000,
          });
          router.push(`/app/review?documentId=${encodeURIComponent(draftDocumentId)}`);
          return false;
        }

        if (typeof payload?.currentRevision === "number") {
          syncDraftRevision(payload.currentRevision);
        }

        captureAppMessage("Member form submission revision conflict", {
          level: "warning",
          tags: {
            feature: "member_form",
            document_id: draftDocumentId,
            product_flow_mode: selectedProductFlowMode,
            jurisdiction: selectedJurisdiction,
          },
          contexts: {
            member_form_submission: {
              documentId: draftDocumentId,
              status: response.status,
              currentStep: currentFormStep,
              currentRevision: payload?.currentRevision ?? null,
            },
          },
          fingerprint: ["member_form_submit", "revision_conflict"],
        });

        setSubmissionErrorMessage(
          payload?.message ??
            "Your draft changed before submission. Please review and submit again.",
        );
        return false;
      }

      if (!response.ok || !payload?.draft) {
        captureAppMessage("Member form submission request failed", {
          level: "error",
          tags: {
            feature: "member_form",
            document_id: draftDocumentId,
            product_flow_mode: selectedProductFlowMode,
            jurisdiction: selectedJurisdiction,
          },
          contexts: {
            member_form_submission: {
              documentId: draftDocumentId,
              status: response.status,
              currentStep: currentFormStep,
              message: payload?.message ?? null,
            },
          },
          fingerprint: ["member_form_submit", "request_failed"],
        });

        setSubmissionErrorMessage(
          payload?.message ?? "Failed to submit member form.",
        );
        return false;
      }

      syncDraftRevision(payload.draft.revision);
      setDraftUpdatedAt(payload.draft.updatedAt);
      setDraftSaveNotice("Intake submitted and locked for generation.");
      lastServerDraftSignatureRef.current = buildDraftSignature(
        currentFormStep,
        formValues,
      );
      showToast({
        tone: "success",
        message: "Intake submitted and locked for generation.",
      });
      setSubmissionErrorMessage(null);
      allowLeavingRef.current = true;
      router.push(`/app/review?documentId=${draftDocumentId}&submitted=1`);

      return true;
    } catch (error) {
      captureAppException(error, {
        level: "error",
        tags: {
          feature: "member_form",
          document_id: draftDocumentId,
          product_flow_mode: selectedProductFlowMode,
          jurisdiction: selectedJurisdiction,
        },
        contexts: {
          member_form_submission: {
            documentId: draftDocumentId,
            currentStep: currentFormStep,
          },
        },
        fingerprint: ["member_form_submit", "exception"],
      });

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
    formValues,
    memberForm,
    router,
    selectedJurisdiction,
    selectedProductFlowMode,
    showToast,
    syncDraftRevision,
    waitForQueuedDraftSaves,
  ]);

  const handleFinalContinue = async () => {
    setShowContinueValidationDetails(true);

    if (isContinueUnavailable) {
      return;
    }

    if (continueValidationMessages.length > 0) {
      setSubmissionErrorMessage(formatMissingInformationAlert(continueValidationMessages));
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

      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
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
    setIsMockDataEnabled(false);
    setMemberForm(null);
    setFormValues({});
    setCurrentFormStep(getDefaultFormStep(normalizedMode));
    setMissingRequirements([]);
    setErrorMessage(null);
    setSubmissionErrorMessage(null);
    setShowContinueValidationDetails(false);
  };

  const applyJurisdictionSelection = (nextJurisdiction: string) => {
    setSelectedJurisdiction(nextJurisdiction);

    if (!nextJurisdiction) {
      setIsMockDataEnabled(false);
      setMemberForm(null);
      setFormValues({});
      setCurrentFormStep(getDefaultFormStep(selectedProductFlowMode));
      setMissingRequirements([]);
      setErrorMessage(null);
      setSubmissionErrorMessage(null);
      setShowContinueValidationDetails(false);
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
    setShowContinueValidationDetails(false);
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const renderFieldLabel = (field: MemberFacingField) => {
    const allowedValues = getResolvedAllowedValues(field);
    const normalizedCanonicalKey = normalizeCanonicalKey(field.canonical_key);
    const shouldShowSelectAll =
      bulkSelectableCheckboxFieldKeys.has(normalizedCanonicalKey) &&
      getMemberFieldControlKind(field, allowedValues) === "checkbox-multi" &&
      allowedValues.length > 0;
    const selectedValues = shouldShowSelectAll
      ? toStringArrayValue(formValues[field.canonical_key])
      : [];
    const areAllValuesSelected =
      shouldShowSelectAll && allowedValues.every((value) => selectedValues.includes(value));

    return (
      <div className="flex w-full flex-wrap items-center gap-2 text-sm font-medium text-Color-Scheme-1-Text">
        <span>{field.label}</span>
        {field.help_text ? (
          <HelpTooltip label={`Explain ${field.label}`} content={field.help_text} />
        ) : null}
        {shouldShowSelectAll ? (
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-Color-Neutral-Darkest">
            <input
              checked={areAllValuesSelected}
              className="h-3.5 w-3.5 accent-Color-Scheme-1-Text"
              onChange={(event) => {
                handleFieldChange(
                  field.canonical_key,
                  event.target.checked ? [...allowedValues] : [],
                );
              }}
              type="checkbox"
            />
            <span>Select all</span>
          </label>
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
          <div className="space-y-2">
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
            <div className="grid gap-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
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
                        phone: formatPhoneInput(contact.phone, nextPhoneCountryIso2),
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
                      phone: formatPhoneInput(event.target.value, contact.phoneCountryIso2),
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
        <IntakeDatePicker
          className={baseInputClassName}
          onChange={(value) => handleFieldChange(field.canonical_key, value)}
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
      const values = toStringArrayValue(fieldValue, { trim: false });
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
      const isGrantorField = normalizedCanonicalKey === "grantors";
      const isSuccessorTrusteeField = normalizedCanonicalKey === "successor_trustees";
      const roleLabel = isTrusteeField
        ? "Acting trustee"
        : isGrantorField
          ? "Trustmaker"
          : "Successor trustee";
      const addButtonLabel = isTrusteeField
        ? "Add acting trustee"
        : isGrantorField
          ? "Add trustmaker"
        : isSuccessorTrusteeField
          ? "Add successor trustee"
          : "Add person";

      const filledRows = getFilledPersonRows(items);
      const canAddAnotherPerson = !isGrantorField || filledRows.length < 2;
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
                <div className="space-y-2">
                  <div className="grid gap-2 md:grid-cols-2">
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
                  </div>
                  <div className="grid gap-2 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
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
                            phone: formatPhoneInput(item.phone, nextPhoneCountryIso2),
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
                          phone: formatPhoneInput(event.target.value, item.phoneCountryIso2),
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
                      Choose &quot;Named signing trustee&quot; in Signing Authority to select a specific signer.
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
              Clear trustee signer selections or switch Signing Authority to &quot;Named signing trustee&quot;.
            </div>
          ) : null}

          {canAddAnotherPerson ? (
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
          ) : (
            <p className="text-xs text-Color-Neutral">A trust package supports up to two Trustmakers.</p>
          )}
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
                    <IntakeDatePicker
                      className={baseInputClassName}
                      onChange={(value) => {
                        const nextItems = [...items];
                        nextItems[index] = {
                          ...item,
                          documentDate: value,
                        };
                        updateItems(nextItems);
                      }}
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
        trustmakerNames.length > 0;

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
              const nextValues = parseMultilineArrayFormInput(event.target.value);
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
    !selectedJurisdiction ||
    isLoadingProductFlowModes ||
    isValidatingMemberFormSubmission ||
    isLoadingMemberForm ||
    !memberForm;

  const isContinueUnavailable = isContinueDisabled;
  const isContinueBlocked = continueValidationMessages.length > 0;
  const shouldStyleContinueAsBlocked = isContinueUnavailable || isContinueBlocked;

  const continueValidationPanel =
    showContinueValidationDetails && continueValidationMessages.length > 0 ? (
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <div className="font-medium">Missing information</div>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {continueValidationMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
    ) : null;

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

          <div aria-hidden className="h-px w-full" />
          <div
            className="sticky top-[-4rem] z-[500]"
            data-process-band-sticky-host
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
                aria-busy={isSavingDraft || isLoadingMemberForm}
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
                    <div className="text-sm text-Color-Neutral">Loading requirements...</div>
                  ) : memberForm ? (
                    <div className="space-y-4">
                      {activeFormStep ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-Color-Scheme-1-Text">
                            {activeFormStep.label}
                          </div>
                          {selectedModeKeyForLayout === "trust_bundle" &&
                          activeFormStep.stepKey === "poa_requirements" ? (
                            <div className="text-xs text-Color-Neutral">
                              These POA details apply to the companion power of attorney included with this trust package.
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {displayedPrimarySections.map((section) => renderSection(section))}

                      {hasPreviousFormStep || hasNextFormStep ? (
                        <div
                          className={`flex flex-wrap items-center gap-2 pt-2 ${
                            hasPreviousFormStep ? "justify-between" : "justify-end"
                          }`}
                        >
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
                              {hasPreviousFormStep ? `Continue to ${nextFormStep?.label}` : "Continue"}
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

                      {continueValidationPanel}

                      {selectedJurisdiction ? (
                        <button
                          onClick={() => {
                            void handleFinalContinue();
                          }}
                          className={`inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition ${
                            shouldStyleContinueAsBlocked
                              ? isContinueUnavailable
                                ? "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                                : "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                              : "platform-btn-primary"
                          }`}
                          aria-disabled={shouldStyleContinueAsBlocked}
                          disabled={isContinueUnavailable}
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
              <div
                className="relative z-0 space-y-4 overflow-visible bg-white p-4 lg:sticky lg:self-start"
                style={{ top: "var(--darci-process-band-follow-offset, 5rem)" }}
              >
              {!selectedJurisdiction ? (
                <div className="rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-xs text-Color-Neutral">
                  Select a jurisdiction first to unlock document uploads.
                </div>
              ) : isLoadingMemberForm ? (
                <div className="text-sm text-Color-Neutral">Loading document requirements...</div>
              ) : memberForm ? (
                <div className="space-y-4">
                  {documentsColumnHasPriorDocumentItems ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                      Documents to Include is required before review. Start with the originating trust agreement or declaration, then add amendments and supporting records in date order.
                    </div>
                  ) : null}

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

              {continueValidationPanel}

              {selectedJurisdiction ? (
                <button
                  onClick={() => {
                    void handleFinalContinue();
                  }}
                  className={`w-full px-4 py-2 text-sm font-medium transition ${
                    shouldStyleContinueAsBlocked
                      ? isContinueUnavailable
                        ? "cursor-not-allowed bg-Color-Neutral-Lighter text-Color-Neutral"
                        : "border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                      : "platform-btn-primary"
                  }`}
                  aria-disabled={shouldStyleContinueAsBlocked}
                  disabled={isContinueUnavailable}
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
