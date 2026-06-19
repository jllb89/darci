"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAppToast } from "@/components/app/AppToastContext";
import { useStoredAuth } from "@/lib/auth";
import {
  addFeatureBreadcrumb,
  captureDomainException,
  getResponseRequestId,
} from "@/lib/clientTelemetry";
import {
  buildRealtimeEqualsFilter,
  requestRealtimeBroadcastEvent,
  useRequestRealtimeInvalidation,
  type RequestRealtimeTarget,
} from "@/lib/requestRealtime";
import {
  fetchWithTokenRefresh,
  formatStatusLabel,
  notaryApiBaseUrl,
  readApiErrorMessage,
  type EvidenceGeolocationSample,
  type NotaryRequestContext,
} from "@/lib/notaryWorkspace";
import {
  defaultIdentityDocumentType,
  getIdentityDocumentOption,
  type IdentityDocumentType,
} from "../identityDocument";

type ReviewDecision = "approved" | "changes_requested" | "rejected";

type ContextResponse = {
  context: NotaryRequestContext | null;
};

type ClaimByIdnResponse = {
  context?: NotaryRequestContext | null;
};

type BrowserGeolocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitudeMeters?: number;
  sampleKind: "device_gps";
};

type NotaryProfileSummary = {
  jurisdiction: string | null;
  serviceAreaKind: string | null;
  serviceAreaName: string | null;
  commissionNumber: string | null;
  commissionExpiresAt: string | null;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  updatedAt: string;
};

type SamePlaceAutomationState = "idle" | "waiting" | "capturing" | "evaluating" | "blocked" | "passed";

type IdentityDocumentTypeOption = {
  value: IdentityDocumentType;
  label: string;
  sortOrder: number;
};

type IdentityDocumentFieldSchema = {
  fieldKey: "issuingJurisdiction" | "documentExpirationDate" | "documentNumberTail" | "maskedIdentifier";
  label: string;
  placeholder: string | null;
  inputKind: "text" | "date";
  required: boolean;
  minLength: number | null;
  maxLength: number | null;
  pattern: string | null;
  sortOrder: number;
};

type IdentityDocumentSchemaResponse = {
  documentTypes: IdentityDocumentTypeOption[];
  selectedType: {
    value: IdentityDocumentType;
    label: string;
    sortOrder: number;
    fields: IdentityDocumentFieldSchema[];
  };
};

type IdentityTypeSelectOption = {
  value: string;
  label: string;
};

const countrySelectOptions: IdentityTypeSelectOption[] = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Democratic People's Republic of Korea",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Holy See",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Lao People's Democratic Republic",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine, State of",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Republic of Korea",
  "Republic of Moldova",
  "Romania",
  "Russian Federation",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syrian Arab Republic",
  "Tajikistan",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United Republic of Tanzania",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Venezuela",
  "Viet Nam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
].map((country) => ({
  value: country,
  label: country,
}));

const usStateSelectOptions: IdentityTypeSelectOption[] = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
].map((state) => ({
  value: state,
  label: state,
}));

type CalendarView = "days" | "decades" | "years" | "months";

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

function NotaryDatePicker({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
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
    if (!isOpen) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(updatePopoverPosition);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
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
                  <button type="button" className="rounded px-1 hover:bg-Color-White" onClick={() => setCalendarView("months")}>
                    {monthName}
                  </button>
                  <button type="button" className="rounded px-1 hover:bg-Color-White" onClick={() => setCalendarView("decades")}>
                    {currentYear}
                  </button>
                </div>
              ) : calendarView === "decades" ? (
                <button type="button" className="rounded px-2 py-1 text-sm font-medium text-Color-Scheme-1-Text hover:bg-Color-White" onClick={() => setCalendarView("days")}>
                  {currentCenturyStart} - {currentCenturyStart + 99}
                </button>
              ) : calendarView === "years" ? (
                <button type="button" className="rounded px-2 py-1 text-sm font-medium text-Color-Scheme-1-Text hover:bg-Color-White" onClick={() => setCalendarView("decades")}>
                  {currentDecadeStart} - {currentDecadeStart + 9}
                </button>
              ) : (
                <button type="button" className="rounded px-2 py-1 text-sm font-medium text-Color-Scheme-1-Text hover:bg-Color-White" onClick={() => setCalendarView("years")}>
                  {currentYear}
                </button>
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
                  const isSelected = currentDecadeStart === decadeStart;
                  return (
                    <button
                      key={decadeStart}
                      type="button"
                      className={`rounded-md px-2 py-2 text-xs transition ${isSelected ? "bg-Green text-Color-Neutral-Darkest" : "bg-Color-White text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest/70"}`}
                      onClick={() => {
                        setVisibleMonth((current) => new Date(decadeStart, current.getMonth(), 1));
                        setCalendarView("years");
                      }}
                    >
                      {decadeStart}s
                    </button>
                  );
                })}
              </div>
            ) : null}

            {calendarView === "years" ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {yearOptions.map((year) => {
                  const isSelected = currentYear === year;
                  return (
                    <button
                      key={year}
                      type="button"
                      className={`rounded-md px-2 py-2 text-xs transition ${isSelected ? "bg-Green text-Color-Neutral-Darkest" : "bg-Color-White text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest/70"}`}
                      onClick={() => {
                        setVisibleMonth((current) => new Date(year, current.getMonth(), 1));
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
                  const isSelected = month.index === currentMonth;
                  return (
                    <button
                      key={month.index}
                      type="button"
                      className={`rounded-md px-2 py-2 text-xs transition ${isSelected ? "bg-Green text-Color-Neutral-Darkest" : "bg-Color-White text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest/70"}`}
                      onClick={() => {
                        setVisibleMonth((current) => new Date(current.getFullYear(), month.index, 1));
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
              <div className="mt-4">
                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-Color-Neutral">
                  {"SMTWTFS".split("").map((day, index) => (
                    <span key={`${day}-${index}`}>{day}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day) => {
                    const dayKey = formatCalendarDateKey(day);
                    const isCurrentMonth = day.getMonth() === currentMonth;
                    const isSelected = selectedKey === dayKey;
                    return (
                      <button
                        key={dayKey}
                        type="button"
                        className={`h-8 rounded-md text-xs transition ${isSelected ? "bg-Green font-medium text-Color-Neutral-Darkest" : isCurrentMonth ? "bg-Color-White text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest/70" : "bg-Color-Neutral-Lightest/70 text-Color-Neutral"}`}
                        onClick={() => {
                          onChange(dayKey);
                          setIsOpen(false);
                          setCalendarView("days");
                        }}
                      >
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-between">
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-Color-Neutral hover:bg-Color-White"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                  setCalendarView("days");
                }}
              >
                Clear
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-Color-Scheme-1-Text hover:bg-Color-White"
                onClick={() => {
                  setIsOpen(false);
                  setCalendarView("days");
                }}
              >
                Done
              </button>
            </div>
          </div>,
          portalTarget,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-left text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)] transition hover:bg-Color-White"
        onClick={() => {
          if (!isOpen) {
            updatePopoverPosition();
          }
          setIsOpen((current) => !current);
        }}
      >
        <span className="flex items-center justify-between gap-3">
          <span className={selectedDate ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"}>
            {formatCalendarDateLabel(value, placeholder)}
          </span>
          <span aria-hidden="true" className={`h-1.5 w-1.5 border-b border-r border-Color-Neutral transition-transform ${isOpen ? "rotate-[225deg]" : "rotate-45"}`} />
        </span>
      </button>
      {calendarPopover}
    </>
  );
}

function IdentityTypeSelectControl({
  value,
  options,
  placeholder,
  disabled = false,
  searchable = false,
  searchPlaceholder = "Search",
  onChange,
}: {
  value: string;
  options: IdentityTypeSelectOption[];
  placeholder: string;
  disabled?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onChange: (value: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    if (!searchable) {
      return options;
    }

    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, searchable, searchTerm]);

  const updatePosition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const width = Math.max(rect.width, 300);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    setPosition({ left, top: rect.bottom + 8, width });
  }, []);

  useEffect(() => {
    if (!isOpen || disabled) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [disabled, isOpen, updatePosition]);

  const portalTarget = typeof document === "undefined" ? null : document.body;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-left text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)] transition hover:bg-Color-White disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={() => {
          setIsOpen((current) => {
            if (current) {
              setSearchTerm("");
            }
            return !current;
          });
        }}
      >
        <span className="flex items-center justify-between gap-3">
          <span>{selectedOption?.label ?? placeholder}</span>
          <span aria-hidden="true" className="text-xs text-Color-Neutral">{isOpen ? "Close" : "Open"}</span>
        </span>
      </button>
      {isOpen && !disabled && position && portalTarget
        ? createPortal(
            <div
              className="fixed z-[120] max-h-72 overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-2 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
              style={{ left: position.left, top: position.top, width: position.width }}
            >
              {searchable ? (
                <input
                  className="mb-2 w-full rounded-md bg-Color-White px-3 py-2 text-xs outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder={searchPlaceholder}
                  type="text"
                  value={searchTerm}
                />
              ) : null}
              {filteredOptions.length === 0 ? (
                <div className="rounded-md px-3 py-2 text-xs text-Color-Neutral">No matching options.</div>
              ) : null}
              {filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors ${
                      isSelected
                        ? "bg-Green text-Color-Neutral-Darkest"
                        : "text-Color-Scheme-1-Text hover:bg-Color-White"
                    }`}
                    onClick={() => {
                      onChange(option.value);
                      setSearchTerm("");
                      setIsOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <span aria-hidden="true">Selected</span> : null}
                  </button>
                );
              })}
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}

const decisionLabels: Record<ReviewDecision, string> = {
  approved: "Approve",
  changes_requested: "Request corrections",
  rejected: "Reject",
};

const decisionHelp: Record<ReviewDecision, string> = {
  approved: "DARCi will share contact details with both parties for the in-person session.",
  changes_requested: "Send the package back for member-side corrections.",
  rejected: "Member will be emailed and asked to select a different illuminotary.",
};

const decisionSuccessMessage: Record<ReviewDecision, string> = {
  approved: "Review approved. Contact details were sent to both parties.",
  changes_requested: "Corrections requested. The member was notified.",
  rejected: "Request rejected. The member was notified to select another illuminotary.",
};

const resolveWorkspaceStatus = (context: NotaryRequestContext) => {
  return context.request.queueStatus ?? context.workflow?.latestStatus ?? context.workflow?.status ?? context.request.status;
};

const isUnopenedReviewStatus = (status: string | null | undefined) => {
  return status === "pending" || status === "submitted" || status === "code_delivered";
};

const previewPanelHeightClass = "h-[72vh] min-h-[560px]";

const getCurrentGeolocationSample = async (): Promise<BrowserGeolocationSample | null> => {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
          altitudeMeters:
            typeof position.coords.altitude === "number" && Number.isFinite(position.coords.altitude)
              ? position.coords.altitude
              : undefined,
          sampleKind: "device_gps",
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  });
};

const formatProductLabel = (documentType: string | null | undefined) => {
  const label = formatStatusLabel(documentType);
  return label === "Not set" ? "Document" : label;
};

const formatCompactReviewDocumentLabel = (
  document: { fileName: string | null; label: string; isFinal: boolean },
  index: number,
  documentType: string | null | undefined,
) => {
  const text = `${document.fileName ?? ""} ${document.label} ${documentType ?? ""}`.toLowerCase();

  if (text.includes("registration")) {
    return "Trust registration";
  }

  if (text.includes("certification")) {
    return "Trust certification";
  }

  if (text.includes("amendment")) {
    return "Trust amendment";
  }

  const trustmakerMatch = text.match(/trust\s*maker\s*(\d+)/) ?? text.match(/trustmaker[-_\s]*(\d+)/);
  if (trustmakerMatch?.[1]) {
    return `POA trustmaker ${trustmakerMatch[1]}`;
  }

  if (text.includes("trustmaker") || text.includes("trust maker") || text.includes("trust")) {
    return `POA trustmaker ${index + 1}`;
  }

  if (text.includes("power") || text.includes("attorney") || text.includes("poa") || text.includes("ddpoa")) {
    return "POA";
  }

  return formatProductLabel(documentType);
};

const isAcknowledgedReviewDocument = (document: { fileName: string | null; label: string }) => {
  const text = `${document.fileName ?? ""} ${document.label}`.toLowerCase();
  return text.includes("acknowledged");
};

const getReviewDocumentStatusLabel = (document: { fileName: string | null; label: string; isFinal: boolean }) => {
  if (document.isFinal) {
    return "Final package";
  }

  if (isAcknowledgedReviewDocument(document)) {
    return "Acknowledgment appended";
  }

  return "Ready";
};

const jurisdictionToVenueState = (jurisdiction: string | null | undefined) => {
  const trimmed = jurisdiction?.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("US-") ? trimmed.slice(3) : trimmed;
};

const samePlaceFreshnessWindowSeconds = 15 * 60;
const samePlaceFallbackRefreshInitialDelayMs = 2_500;
const samePlaceFallbackRefreshIntervalMs = 5_000;

const formatMeters = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Pending";
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} km`;
  }

  return `${Math.round(value)} m`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const isCommissionExpirationCurrent = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return false;
  }

  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T23:59:59.999Z` : trimmed);
  const expirationTime = parsed.getTime();
  return Number.isFinite(expirationTime) && expirationTime >= Date.now();
};

const getLatestSampleForRole = (
  context: NotaryRequestContext | null,
  participantRole: "member" | "notary",
) => {
  const participantId = context?.meeting?.participants.find(
    (participant) => participant.participantRole === participantRole,
  )?.id;
  if (!participantId) {
    return null;
  }

  return context.evidence.geolocationSamples
    .filter((sample) => sample.meetingParticipantId === participantId)
    .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime())[0] ?? null;
};

type VenueCapture = {
  state: string;
  county: string;
  city?: string;
  addressLine1?: string;
  locationLabel?: string;
  completedAt?: string;
};

type VenueFieldKey = "state" | "county" | "city" | "addressLine1" | "locationLabel";

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type VenueAddressValues = Partial<Record<VenueFieldKey, string>>;

type VenuePrefillSource = "gps_reverse_geocode" | "google_place_select" | "manual";

const normalizeCountyLabel = (value: string) => value.replace(/\s+County$/i, "").trim();

const findAddressComponent = (
  components: GoogleAddressComponent[],
  type: string,
) => components.find((component) => Array.isArray(component.types) && component.types.includes(type));

const mapVenueFromAddressComponents = (
  components: GoogleAddressComponent[],
  formattedAddress?: string | null,
  placeName?: string | null,
): VenueAddressValues => {
  const stateComponent = findAddressComponent(components, "administrative_area_level_1");
  const countyComponent = findAddressComponent(components, "administrative_area_level_2");
  const localityComponent =
    findAddressComponent(components, "locality") ??
    findAddressComponent(components, "postal_town") ??
    findAddressComponent(components, "sublocality_level_1") ??
    findAddressComponent(components, "administrative_area_level_3");
  const streetNumberComponent = findAddressComponent(components, "street_number");
  const routeComponent = findAddressComponent(components, "route");

  const streetNumber = streetNumberComponent?.long_name?.trim() ?? "";
  const route = routeComponent?.long_name?.trim() ?? "";
  const addressLine1 = `${streetNumber} ${route}`.trim() || formattedAddress?.split(",")[0]?.trim() || "";
  const county = countyComponent?.long_name?.trim() ? normalizeCountyLabel(countyComponent.long_name) : "";

  return {
    state: stateComponent?.long_name?.trim() || stateComponent?.short_name?.trim() || "",
    county,
    city: localityComponent?.long_name?.trim() || "",
    addressLine1,
    locationLabel: (placeName ?? "").trim(),
  };
};

const loadGoogleMapsScript = async (apiKey: string) => {
  if (typeof window === "undefined") {
    return false;
  }

  const runtimeWindow = window as Window & {
    __darciGoogleMapsLoadPromise?: Promise<boolean>;
    google?: {
      maps?: {
        places?: {
          Autocomplete?: new (
            input: HTMLInputElement,
            options: Record<string, unknown>,
          ) => {
            addListener: (eventName: string, callback: () => void) => void;
            getPlace: () => {
              address_components?: GoogleAddressComponent[];
              formatted_address?: string;
              name?: string;
            };
          };
        };
      };
    };
  };

  if (runtimeWindow.google?.maps?.places?.Autocomplete) {
    return true;
  }

  if (runtimeWindow.__darciGoogleMapsLoadPromise) {
    return runtimeWindow.__darciGoogleMapsLoadPromise;
  }

  runtimeWindow.__darciGoogleMapsLoadPromise = new Promise<boolean>((resolve) => {
    const scriptId = "darci-google-maps-script";
    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(true), { once: true });
      existingScript.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.addEventListener("load", () => resolve(true), { once: true });
    script.addEventListener("error", () => resolve(false), { once: true });
    document.head.appendChild(script);
  });

  const result = await runtimeWindow.__darciGoogleMapsLoadPromise;
  return result;
};

const readVenueText = (value: unknown) => {
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const getVenueFromArtifactMetadata = (metadata: Record<string, unknown>): VenueCapture | null => {
  const venue = metadata.venue;
  if (!venue || typeof venue !== "object" || Array.isArray(venue)) {
    return null;
  }

  const values = venue as Record<string, unknown>;
  const state = readVenueText(values.state);
  const county = readVenueText(values.county);
  if (!state || !county) {
    return null;
  }

  return {
    state,
    county,
    city: readVenueText(values.city) ?? undefined,
    addressLine1: readVenueText(values.addressLine1) ?? undefined,
    locationLabel: readVenueText(values.locationLabel) ?? undefined,
    completedAt: readVenueText(values.completedAt) ?? undefined,
  };
};

const getLatestVenueCapture = (context: NotaryRequestContext | null) => {
  const venueArtifact = context?.evidence.artifacts
    .slice()
    .reverse()
    .find((artifact) => artifact.artifactKind === "venue_capture" || artifact.artifactKind === "acknowledgment_venue");

  return venueArtifact ? getVenueFromArtifactMetadata(venueArtifact.metadata) : null;
};

const getLatestProximityEvaluation = (context: NotaryRequestContext | null) => {
  return context?.evidence.proximityEvaluations.at(-1) ?? null;
};

const getSampleAgeSeconds = (sample: EvidenceGeolocationSample | null) => {
  if (!sample) {
    return null;
  }

  const capturedAtMs = new Date(sample.capturedAt).getTime();
  if (!Number.isFinite(capturedAtMs)) {
    return null;
  }

  return Math.max(0, Math.round((Date.now() - capturedAtMs) / 1000));
};

const isSampleFreshEnoughForEvaluation = (sample: EvidenceGeolocationSample | null) => {
  const ageSeconds = getSampleAgeSeconds(sample);
  return ageSeconds !== null && ageSeconds <= samePlaceFreshnessWindowSeconds;
};

function ChevronLeftIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function CompletionStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-Color-White px-3 py-2 text-xs shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      <span className="text-Color-Neutral-Darkest">{label}</span>
      <span className={done ? "font-medium text-emerald-700" : "text-Color-Neutral"}>{done ? "Done" : "Pending"}</span>
    </div>
  );
}

function SessionTimeline({ steps }: { steps: Array<{ description: string; done: boolean; label: string }> }) {
  const firstPendingIndex = steps.findIndex((step) => !step.done);
  const currentIndex = firstPendingIndex === -1 ? steps.length - 1 : firstPendingIndex;
  const currentStep = steps[currentIndex];
  const previousStep = currentIndex > 0 ? steps[currentIndex - 1] ?? null : null;
  const nextStep = steps.slice(currentIndex + 1, currentIndex + 2)[0] ?? null;
  const completedCount = steps.filter((step) => step.done).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);
  const isComplete = completedCount === steps.length;

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-black py-3 text-xs text-white">
      <div className="space-y-2 px-4">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white">
              <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
                {!isComplete ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-Green opacity-30" /> : null}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-Green" />
              </span>
              {currentStep.label}
            </span>
            <span className="min-w-0 truncate text-[11px] leading-4 text-white">
              {currentStep.description}
            </span>
            <span className="ml-auto text-[11px] font-medium text-white/70">
              {completedCount}/{steps.length}
            </span>
          </div>
          <div className="mb-3 mt-6 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-Green transition-all duration-700 ease-out" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="flex items-start justify-between gap-4">
            {previousStep ? (
              <div className="shrink-0 rounded-full bg-white/5 px-3 pb-0.5 pt-1.5 text-left text-[10px] leading-4 text-white/72">
                <div className="font-medium text-white">Previous: {previousStep.label}</div>
                <div className="text-white/58">{previousStep.description}</div>
              </div>
            ) : (
              <div />
            )}
            {nextStep ? (
              <div className="shrink-0 rounded-full bg-white/5 px-3 pb-0.5 pt-1.5 text-right text-[10px] leading-4 text-white/72">
                <div className="font-medium text-white">Next: {nextStep.label}</div>
                <div className="text-white/58">{nextStep.description}</div>
              </div>
            ) : null}
          </div>
      </div>
    </div>
  );
}

function ActionButton({
  active,
  children,
  disabled,
  loadingLabel,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  loadingLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      className="w-full rounded-lg bg-Color-White px-4 py-3 text-left text-sm font-medium text-Color-Scheme-1-Text shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)] transition hover:bg-Color-Neutral-Lightest disabled:cursor-not-allowed disabled:opacity-55"
      disabled={disabled || active}
      onClick={onClick}
      type="button"
    >
      {active ? loadingLabel : children}
    </button>
  );
}

export default function NotaryRequestWorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useAppToast();
  const requestId = typeof params?.id === "string" ? params.id : "";
  const { accessToken, refreshToken } = useStoredAuth();
  const [context, setContext] = useState<NotaryRequestContext | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>("approved");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [identitySubjectName, setIdentitySubjectName] = useState("");
  const [identityDocumentType, setIdentityDocumentType] = useState<IdentityDocumentType>(defaultIdentityDocumentType);
  const [identityDocumentTypeOptions, setIdentityDocumentTypeOptions] = useState<IdentityDocumentTypeOption[]>([]);
  const [identityDocumentFields, setIdentityDocumentFields] = useState<IdentityDocumentFieldSchema[]>([]);
  const [isLoadingIdentityDocumentSchema, setIsLoadingIdentityDocumentSchema] = useState(false);
  const [identityDocumentSchemaError, setIdentityDocumentSchemaError] = useState<string | null>(null);
  const [identityIssuingJurisdiction, setIdentityIssuingJurisdiction] = useState("");
  const [identityDocumentExpirationDate, setIdentityDocumentExpirationDate] = useState("");
  const [identityDocumentNumberTail, setIdentityDocumentNumberTail] = useState("");
  const [identityMaskedIdentifier, setIdentityMaskedIdentifier] = useState("");
  const [venueState, setVenueState] = useState("");
  const [venueCounty, setVenueCounty] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueAddressLine1, setVenueAddressLine1] = useState("");
  const [venueLocationLabel, setVenueLocationLabel] = useState("");
  const [venueFieldTouched, setVenueFieldTouched] = useState<Record<VenueFieldKey, boolean>>({
    state: false,
    county: false,
    city: false,
    addressLine1: false,
    locationLabel: false,
  });
  const [venuePrefillStatus, setVenuePrefillStatus] = useState<string | null>(null);
  const [venuePrefillSource, setVenuePrefillSource] = useState<VenuePrefillSource>("manual");
  const [venuePrefillPlaceId, setVenuePrefillPlaceId] = useState<string | null>(null);
  const [venuePrefillFormattedAddress, setVenuePrefillFormattedAddress] = useState<string | null>(null);
  const [venuePrefillCoords, setVenuePrefillCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isVenuePrefilling, setIsVenuePrefilling] = useState(false);
  const [notarialNotes, setNotarialNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notaryProfile, setNotaryProfile] = useState<NotaryProfileSummary | null>(null);
  const [samePlaceAutomationState, setSamePlaceAutomationState] = useState<SamePlaceAutomationState>("idle");
  const [samePlaceAutomationMessage, setSamePlaceAutomationMessage] = useState("Waiting for live location signals.");
  const previewDocumentSourceRef = useRef<{ id: string; downloadUrl: string | null } | null>(null);
  const hasShownRealtimeFallbackToastRef = useRef(false);
  const lastAutoNotarySampleRefreshRef = useRef<string | null>(null);
  const lastAutoProximityEvaluationRef = useRef<string | null>(null);
  const samePlaceFallbackRefreshInFlightRef = useRef(false);
  const venueAddressInputRef = useRef<HTMLInputElement | null>(null);
  const venueAutocompleteRef = useRef<{ getPlace: () => { address_components?: GoogleAddressComponent[]; formatted_address?: string; name?: string; place_id?: string } } | null>(null);
  const venuePrefillGeocodeKeyRef = useRef<string | null>(null);

  const handleIdentityDocumentTypeChange = useCallback((nextType: IdentityDocumentType) => {
    setIdentityDocumentType(nextType);
    setIdentityDocumentFields([]);
    setIdentityDocumentSchemaError(null);
    setIdentityIssuingJurisdiction("");
    setIdentityDocumentExpirationDate("");
    setIdentityDocumentNumberTail("");
    setIdentityMaskedIdentifier("");
  }, []);

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const isGoogleAutocompleteEnabled =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_AUTOCOMPLETE_ENABLED !== "false" &&
    googleMapsApiKey.length > 0;

  const updateVenueField = useCallback((fieldKey: VenueFieldKey, nextValue: string) => {
    setVenueFieldTouched((current) => ({ ...current, [fieldKey]: true }));
    setVenuePrefillSource("manual");
    setVenuePrefillPlaceId(null);
    setVenuePrefillFormattedAddress(null);
    setVenuePrefillCoords(null);
    if (fieldKey === "state") {
      setVenueState(nextValue);
    } else if (fieldKey === "county") {
      setVenueCounty(nextValue);
    } else if (fieldKey === "city") {
      setVenueCity(nextValue);
    } else if (fieldKey === "addressLine1") {
      setVenueAddressLine1(nextValue);
    } else if (fieldKey === "locationLabel") {
      setVenueLocationLabel(nextValue);
    }
  }, []);

  const applyVenueValues = useCallback((input: VenueAddressValues, options: {
    sourceMessage: string;
    overwriteFilled: boolean;
    skipTouched: boolean;
  }) => {
    const applyValue = (
      fieldKey: VenueFieldKey,
      value: string | undefined,
      currentValue: string,
      setValue: (nextValue: string) => void,
    ) => {
      const nextValue = (value ?? "").trim();
      if (!nextValue) {
        return;
      }

      if (options.skipTouched && venueFieldTouched[fieldKey]) {
        return;
      }

      if (!options.overwriteFilled && currentValue.trim().length > 0) {
        return;
      }

      setValue(nextValue);
    };

    applyValue("state", input.state, venueState, setVenueState);
    applyValue("county", input.county, venueCounty, setVenueCounty);
    applyValue("city", input.city, venueCity, setVenueCity);
    applyValue("addressLine1", input.addressLine1, venueAddressLine1, setVenueAddressLine1);
    applyValue("locationLabel", input.locationLabel, venueLocationLabel, setVenueLocationLabel);
    setVenuePrefillStatus(options.sourceMessage);
  }, [venueAddressLine1, venueCity, venueCounty, venueFieldTouched, venueLocationLabel, venueState]);

  const loadNotaryProfile = useCallback(async () => {
    if (!accessToken) {
      setNotaryProfile(null);
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-profile`, accessToken, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load notary profile."));
      }

      const payload = (await response.json()) as { profile: NotaryProfileSummary | null };
      setNotaryProfile(payload.profile ?? null);
    } catch {
      setNotaryProfile(null);
    }
  }, [accessToken]);

  const loadIdentityDocumentSchema = useCallback(async (documentType: IdentityDocumentType) => {
    if (!accessToken) {
      return;
    }

    setIsLoadingIdentityDocumentSchema(true);
    setIdentityDocumentSchemaError(null);
    try {
      const query = new URLSearchParams({ documentType }).toString();
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/identity-document-types?${query}`,
        accessToken,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load identity document schema."));
      }

      const payload = (await response.json()) as IdentityDocumentSchemaResponse;
      const nextOptions = (payload.documentTypes ?? []).slice().sort((left, right) => left.sortOrder - right.sortOrder);
      setIdentityDocumentTypeOptions(nextOptions);
      setIdentityDocumentFields((payload.selectedType?.fields ?? []).slice().sort((left, right) => left.sortOrder - right.sortOrder));
      if (payload.selectedType?.value && payload.selectedType.value !== identityDocumentType) {
        setIdentityDocumentType(payload.selectedType.value);
      }
    } catch (error) {
      setIdentityDocumentSchemaError(error instanceof Error ? error.message : "Unable to load identity document schema.");
    } finally {
      setIsLoadingIdentityDocumentSchema(false);
    }
  }, [accessToken, identityDocumentType]);

  const loadContext = useCallback(async () => {
    if (!accessToken || !requestId) {
      setContext(null);
      return;
    }

    setIsLoading(true);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: "context.fetch_started",
      data: { requestId },
    });

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(requestId)}/context`,
        accessToken,
        { cache: "no-store" },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load notary request."));
      }

      const payload = (await response.json()) as ContextResponse;
      let nextContext = payload.context;

      if (nextContext && isUnopenedReviewStatus(resolveWorkspaceStatus(nextContext)) && nextContext.document.idn) {
        const claimResponse = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/notary/idn/resolve`, accessToken, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idn: nextContext.document.idn }),
        });
        requestIdHeader = getResponseRequestId(claimResponse) ?? requestIdHeader;

        if (!claimResponse.ok) {
          throw new Error(await readApiErrorMessage(claimResponse, "Unable to open this review request."));
        }

        const claimPayload = (await claimResponse.json()) as ClaimByIdnResponse;
        nextContext = claimPayload.context ?? nextContext;
      }

      setContext(nextContext);
      setSelectedDocumentId((current) => {
        if (current && nextContext?.document.reviewDocuments.some((document) => document.id === current)) {
          return current;
        }

        return nextContext?.document.reviewDocuments[0]?.id ?? null;
      });
      setErrorMessage(null);
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "context.fetch_completed",
        data: {
          requestId,
          requestIdHeader,
          queueStatus: nextContext ? resolveWorkspaceStatus(nextContext) : null,
          reviewDocumentCount: nextContext?.document.reviewDocuments.length ?? 0,
        },
      });
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "context.fetch_failed",
        level: "error",
        data: { requestId, requestIdHeader },
      });
      captureDomainException(error, {
        level: "error",
        operation: "notary_workspace.fetch_context",
        errorCode: "WEB_NOTARY_CONTEXT_FETCH_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: requestId,
        },
        contexts: {
          notary_workspace: {
            requestId,
            stage: "fetch_context",
          },
        },
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to load notary request.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, requestId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    void loadNotaryProfile();
  }, [loadNotaryProfile]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    void loadIdentityDocumentSchema(identityDocumentType);
  }, [accessToken, identityDocumentType, loadIdentityDocumentSchema]);

  useEffect(() => {
    if (identitySubjectName.trim().length > 0) {
      return;
    }

    const memberIdentityName = context?.owner?.displayName?.trim() || context?.owner?.email?.trim() || "";
    if (!memberIdentityName) {
      return;
    }

    setIdentitySubjectName(memberIdentityName);
  }, [context?.owner?.displayName, context?.owner?.email, identitySubjectName]);

  const realtimeTargets: RequestRealtimeTarget[] = [
    { table: "notarization_requests", filter: buildRealtimeEqualsFilter("id", requestId) },
    { table: "illuminotarization_workflows", filter: buildRealtimeEqualsFilter("id", context?.request.workflowId) },
    { table: "workflow_status_history", filter: buildRealtimeEqualsFilter("workflow_id", context?.request.workflowId) },
    { table: "meetings", filter: buildRealtimeEqualsFilter("request_id", requestId) },
    { table: "meeting_participants", filter: buildRealtimeEqualsFilter("meeting_id", context?.meeting?.meetingId) },
    { table: "meeting_checkins", filter: buildRealtimeEqualsFilter("meeting_id", context?.meeting?.meetingId) },
    { table: "geolocation_samples", filter: buildRealtimeEqualsFilter("meeting_id", context?.meeting?.meetingId) },
    { table: "proximity_evaluations", filter: buildRealtimeEqualsFilter("meeting_id", context?.meeting?.meetingId) },
    { table: "identity_verification_events", filter: buildRealtimeEqualsFilter("meeting_id", context?.meeting?.meetingId) },
    { table: "meeting_artifacts", filter: buildRealtimeEqualsFilter("meeting_id", context?.meeting?.meetingId) },
    { table: "document_versions", filter: buildRealtimeEqualsFilter("document_id", context?.document.id) },
    { table: "finalization_status_history", filter: buildRealtimeEqualsFilter("document_id", context?.document.id) },
    { table: "document_hash_records", filter: buildRealtimeEqualsFilter("document_id", context?.document.id) },
  ];

  const realtimeState = useRequestRealtimeInvalidation({
    enabled: Boolean(accessToken && requestId),
    accessToken,
    refreshToken,
    channelName: `request:${requestId}`,
    targets: realtimeTargets,
    broadcastTargets: [{ event: requestRealtimeBroadcastEvent, private: true }],
    tableChangeTargetsEnabled: false,
    onInvalidate: loadContext,
    pollIntervalMs: null,
  });

  useEffect(() => {
    setVenueState((current) => current.trim() || jurisdictionToVenueState(notaryProfile?.jurisdiction));
  }, [notaryProfile?.jurisdiction]);

  useEffect(() => {
    const venue = getLatestVenueCapture(context);
    if (!venue) {
      return;
    }

    setVenueState((current) => current.trim() || venue.state);
    setVenueCounty((current) => current.trim() || venue.county);
    setVenueCity((current) => current.trim() || (venue.city ?? ""));
    setVenueAddressLine1((current) => current.trim() || (venue.addressLine1 ?? ""));
    setVenueLocationLabel((current) => current.trim() || (venue.locationLabel ?? ""));
  }, [context]);

  useEffect(() => {
    if (!isGoogleAutocompleteEnabled || !venueAddressInputRef.current || venueAutocompleteRef.current) {
      return;
    }

    let isDisposed = false;

    const attachAutocomplete = async () => {
      const loaded = await loadGoogleMapsScript(googleMapsApiKey);
      if (!loaded || isDisposed || !venueAddressInputRef.current) {
        if (!loaded) {
          setVenuePrefillStatus("Google address lookup is unavailable. Enter venue manually.");
        }
        return;
      }

      const runtimeGoogle = (window as Window & {
        google?: {
          maps?: {
            places?: {
              Autocomplete?: new (
                input: HTMLInputElement,
                options: Record<string, unknown>,
              ) => {
                addListener: (eventName: string, callback: () => void) => void;
                getPlace: () => {
                  address_components?: GoogleAddressComponent[];
                  formatted_address?: string;
                  name?: string;
                  place_id?: string;
                };
              };
            };
          };
        };
      }).google;
      const AutocompleteCtor = runtimeGoogle?.maps?.places?.Autocomplete;
      if (!AutocompleteCtor) {
        setVenuePrefillStatus("Google address lookup is unavailable. Enter venue manually.");
        return;
      }

      const autocomplete = new AutocompleteCtor(venueAddressInputRef.current, {
        fields: ["address_components", "formatted_address", "name", "place_id"],
        types: ["address"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        const components = Array.isArray(place.address_components)
          ? place.address_components
          : [];
        const mapped = mapVenueFromAddressComponents(
          components,
          place.formatted_address,
          place.name,
        );
        applyVenueValues(mapped, {
          sourceMessage: "Address applied from selected place.",
          overwriteFilled: true,
          skipTouched: true,
        });
        setVenuePrefillSource("google_place_select");
        setVenuePrefillPlaceId(place.place_id ?? null);
        setVenuePrefillFormattedAddress(place.formatted_address ?? null);
        setVenuePrefillCoords(null);
      });

      venueAutocompleteRef.current = autocomplete;
    };

    void attachAutocomplete();

    return () => {
      isDisposed = true;
    };
  }, [applyVenueValues, googleMapsApiKey, isGoogleAutocompleteEnabled]);

  useEffect(() => {
    if (!context?.meeting || !requestId || !accessToken) {
      return;
    }

    const participantId = context.meeting.participants.find(
      (participant) => participant.participantRole === "notary",
    )?.id;
    if (!participantId) {
      return;
    }

    const sample = context.evidence.geolocationSamples
      .filter((item) => item.meetingParticipantId === participantId)
      .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime())[0];

    if (!sample) {
      setVenuePrefillStatus("Current location unavailable. Enter venue manually.");
      return;
    }

    const geocodeKey = `${sample.latitude.toFixed(5)}:${sample.longitude.toFixed(5)}`;
    if (venuePrefillGeocodeKeyRef.current === geocodeKey) {
      return;
    }
    venuePrefillGeocodeKeyRef.current = geocodeKey;

    let isDisposed = false;

    const prefillFromGeocode = async () => {
      setIsVenuePrefilling(true);
      setVenuePrefillStatus("Prefilling venue from current location...");
      try {
        const response = await fetchWithTokenRefresh(
          `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(requestId)}/meeting/reverse-geocode`,
          accessToken,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              latitude: sample.latitude,
              longitude: sample.longitude,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(await readApiErrorMessage(response, "Geocode request failed"));
        }

        const payload = (await response.json()) as {
          venue?: {
            state?: string;
            county?: string;
            city?: string;
            addressLine1?: string;
            locationLabel?: string;
          };
          formattedAddress?: string;
        };

        if (!payload.venue) {
          throw new Error("No geocode result");
        }

        if (isDisposed) {
          return;
        }

        applyVenueValues(payload.venue, {
          sourceMessage: "Prefilled from current location.",
          overwriteFilled: false,
          skipTouched: true,
        });
        setVenuePrefillSource("gps_reverse_geocode");
        setVenuePrefillPlaceId(null);
        setVenuePrefillFormattedAddress(
          typeof payload.formattedAddress === "string" ? payload.formattedAddress : null,
        );
        setVenuePrefillCoords({ lat: sample.latitude, lng: sample.longitude });
      } catch {
        if (!isDisposed) {
          setVenuePrefillStatus("Could not prefill automatically. Enter venue manually.");
        }
      } finally {
        if (!isDisposed) {
          setIsVenuePrefilling(false);
        }
      }
    };

    void prefillFromGeocode();

    return () => {
      isDisposed = true;
    };
  }, [applyVenueValues, context, accessToken, requestId]);

  const submitDecision = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken || !context) {
      setErrorMessage("Sign in again to record a review decision.");
      return;
    }

    const submitter =
      (event.nativeEvent as { submitter?: { value?: unknown } } | undefined)?.submitter ?? null;
    const selectedDecision =
      (typeof submitter?.value === "string" ? submitter.value : null) as ReviewDecision | null;
    const nextDecision = selectedDecision ?? decision;

    const body: {
      decision: ReviewDecision;
      summary?: string;
      decisionNotes?: string;
    } = { decision: nextDecision };
    if (summary.trim()) {
      body.summary = summary.trim();
      body.decisionNotes = summary.trim();
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: "review_decision.started",
      data: { requestId: context.request.id, decision: nextDecision },
    });

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(context.request.id)}/review-decision`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to record review decision."));
      }

      setSuccessMessage(decisionSuccessMessage[nextDecision]);
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "review_decision.completed",
        data: { requestId: context.request.id, requestIdHeader, decision: nextDecision },
      });
      router.push("/app/notary");
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "review_decision.failed",
        level: "error",
        data: { requestId: context.request.id, requestIdHeader, decision: nextDecision },
      });
      captureDomainException(error, {
        level: "error",
        operation: "notary_workspace.review_decision",
        errorCode: "WEB_NOTARY_REVIEW_DECISION_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: context.request.id,
        },
        contexts: {
          notary_workspace: {
            requestId: context.request.id,
            decision: nextDecision,
          },
        },
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to record review decision.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startInPersonSession = async () => {
    if (!accessToken || !context) {
      setErrorMessage("Sign in again to start the in-person session.");
      return;
    }

    setIsStartingSession(true);
    setErrorMessage(null);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: "meeting.start_started",
      data: { requestId: context.request.id },
    });

    try {
      const geolocation = await getCurrentGeolocationSample();
      if (!geolocation) {
        throw new Error("Location permission is needed to start the in-person session.");
      }

      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(context.request.id)}/meeting/start`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ geolocation }),
        },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to start the in-person session."));
      }

      setSuccessMessage(null);
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "meeting.start_completed",
        data: { requestId: context.request.id, requestIdHeader },
      });
      await loadContext();
      return true;
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: "meeting.start_failed",
        level: "error",
        data: { requestId: context.request.id, requestIdHeader },
      });
      captureDomainException(error, {
        level: "error",
        operation: "notary_workspace.start_meeting",
        errorCode: "WEB_NOTARY_MEETING_START_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: context.request.id,
        },
      });
      setErrorMessage(error instanceof Error ? error.message : "Unable to start the in-person session.");
    } finally {
      setIsStartingSession(false);
    }
  };

  const postRequestAction = useCallback(async (
    actionKey: string,
    path: string,
    body: Record<string, unknown>,
    fallbackMessage: string,
    success: string | null,
  ) => {
    if (!accessToken || !context) {
      setErrorMessage("Sign in again to continue this notary request.");
      return false;
    }

    setActiveAction(actionKey);
    setErrorMessage(null);
    setSuccessMessage(null);
    let requestIdHeader: string | null = null;
    addFeatureBreadcrumb({
      feature: "notary_workspace",
      action: `${actionKey}.started`,
      data: { requestId: context.request.id, path },
    });

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/notary/requests/${encodeURIComponent(context.request.id)}${path}`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      requestIdHeader = getResponseRequestId(response);

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, fallbackMessage));
      }

      if (success) {
        setSuccessMessage(success);
      }
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: `${actionKey}.completed`,
        data: { requestId: context.request.id, requestIdHeader, path },
      });
      await loadContext();
      return true;
    } catch (error) {
      addFeatureBreadcrumb({
        feature: "notary_workspace",
        action: `${actionKey}.failed`,
        level: "error",
        data: { requestId: context.request.id, requestIdHeader, path },
      });
      captureDomainException(error, {
        level: "error",
        operation: `notary_workspace.${actionKey}`,
        errorCode: "WEB_NOTARY_ACTION_FAILED",
        errorFamily: "notarization",
        requestId: requestIdHeader,
        tags: {
          feature: "notary_workspace",
          notary_request_id: context.request.id,
          notary_action: actionKey,
        },
        contexts: {
          notary_workspace: {
            requestId: context.request.id,
            actionKey,
            path,
          },
        },
      });
      setErrorMessage(error instanceof Error ? error.message : fallbackMessage);
      if (actionKey === "submit" || actionKey === "advance-session") {
        await loadContext();
      }
      return false;
    } finally {
      setActiveAction(null);
    }
  }, [accessToken, context, loadContext]);

  const recordProximity = useCallback(async ({ automatic = false }: { automatic?: boolean } = {}) => {
    return postRequestAction(
      automatic ? "auto-proximity" : "proximity",
      "/meeting/proximity-evaluation",
      {
        thresholdMeters: 100,
        evaluatedAt: new Date().toISOString(),
        notes: automatic
          ? "Same-place evaluation automatically recorded when both live location samples were ready."
          : "Same-place evaluation recorded from in-person session samples.",
      },
      "Unable to evaluate same-place evidence.",
      automatic ? null : "Same-place evidence recorded.",
    );
  }, [postRequestAction]);

  const refreshNotaryLocationSample = useCallback(async ({ automatic = false }: { automatic?: boolean } = {}) => {
    const geolocation = await getCurrentGeolocationSample();
    if (!geolocation) {
      const message = "Location permission is needed so DARCi can confirm same-place evidence automatically.";
      if (automatic) {
        setSamePlaceAutomationState("blocked");
        setSamePlaceAutomationMessage(message);
      } else {
        setErrorMessage(message);
      }
      return false;
    }

    return postRequestAction(
      automatic ? "auto-notary-location" : "refresh-notary-location",
      "/meeting/check-in",
      {
        participantRole: "notary",
        checkinKind: "proximity",
        recordedAt: new Date().toISOString(),
        notes: automatic
          ? "Illuminotary proximity location captured automatically from the notary workspace."
          : "Illuminotary proximity location refreshed from the notary workspace.",
        geolocation: {
          ...geolocation,
          captureStage: "proximity_validation",
        },
      },
      "Unable to refresh illuminotary location.",
      automatic ? null : "Illuminotary location refreshed.",
    );
  }, [postRequestAction]);

  const recordIdentity = async () => {
    if (!identityValidation.isValid) {
      setErrorMessage(identityValidation.firstError ?? "Complete identity verification details.");
      return;
    }

    const subjectName = identitySubjectName.trim() || context?.owner?.displayName || undefined;
    const evidenceArtifactIds: string[] = [];
    await postRequestAction(
      "identity",
      "/meeting/identity-verification",
      {
        participantRole: "member",
        verificationMethod: "in_person_document",
        status: "verified",
        verifiedAt: new Date().toISOString(),
        subjectName,
        documentType: identityDocumentType,
        issuingJurisdiction: identityIssuingJurisdiction.trim(),
        documentExpirationDate: identityDocumentExpirationDate.trim(),
        ...(identityDocumentNumberTail.trim()
          ? { documentNumberTail: identityDocumentNumberTail.trim() }
          : {}),
        ...(identityMaskedIdentifier.trim()
          ? { maskedIdentifier: identityMaskedIdentifier.trim() }
          : {}),
        ...(evidenceArtifactIds.length ? { evidenceArtifactIds } : {}),
      },
      "Unable to record identity verification.",
      "Identity recorded.",
    );
  };

  const recordVenue = async () => {
    const completedAt = new Date().toISOString();
    const venue = {
      state: venueState.trim(),
      county: venueCounty.trim(),
      city: venueCity.trim() || undefined,
      addressLine1: venueAddressLine1.trim() || undefined,
      locationLabel: venueLocationLabel.trim() || undefined,
      completedAt,
    };

    if (!venue.state || !venue.county) {
      setErrorMessage("State and county are required to capture venue.");
      return;
    }

    await postRequestAction(
      "venue",
      "/meeting/venue-capture",
      {
        participantRole: "notary",
        venue,
        prefillMetadata: {
          prefillSource: venuePrefillSource,
          ...(venuePrefillPlaceId ? { placeId: venuePrefillPlaceId } : {}),
          ...(venuePrefillFormattedAddress ? { formattedAddress: venuePrefillFormattedAddress } : {}),
          ...(venuePrefillCoords ? { prefillLat: venuePrefillCoords.lat, prefillLng: venuePrefillCoords.lng } : {}),
        },
      },
      "Unable to record acknowledgment venue.",
      "Venue captured.",
    );
  };

  const buildAcknowledgmentPayload = () => {
    const completedAt = new Date().toISOString();
    const venue = venueState.trim() && venueCounty.trim()
      ? {
          state: venueState.trim(),
          county: venueCounty.trim(),
          city: venueCity.trim() || undefined,
          addressLine1: venueAddressLine1.trim() || undefined,
          locationLabel: venueLocationLabel.trim() || undefined,
          completedAt,
        }
      : null;
    const latestVenueCapture = getLatestVenueCapture(context);
    const resolvedNotarialFields = {
      documentIdn: context?.document.idn ?? null,
      memberName: context?.owner?.displayName ?? null,
      meetingId: context?.meeting?.meetingId ?? null,
      venueState: venue?.state ?? latestVenueCapture?.state ?? null,
      venueCounty: venue?.county ?? latestVenueCapture?.county ?? null,
      venueCity: venue?.city ?? latestVenueCapture?.city ?? null,
      venueAddressLine1: venue?.addressLine1 ?? latestVenueCapture?.addressLine1 ?? null,
      venueLocationLabel: venue?.locationLabel ?? latestVenueCapture?.locationLabel ?? null,
      venueCompletedAt: completedAt,
      notaryName: context?.notary?.displayName ?? null,
      notaryJurisdiction: notaryProfile?.jurisdiction ?? null,
      notaryServiceAreaKind: notaryProfile?.serviceAreaKind ?? null,
      notaryServiceAreaName: notaryProfile?.serviceAreaName ?? null,
      notaryCommissionNumber: notaryProfile?.commissionNumber ?? null,
      notaryCommissionExpiresAt: notaryProfile?.commissionExpiresAt ?? null,
      notaryProfileUpdatedAt: notaryProfile?.updatedAt ?? null,
      hasNotarySignature: Boolean(notaryProfile?.signatureDataUrl),
      hasNotarySeal: Boolean(notaryProfile?.sealDataUrl),
    };

    const resolvedSealLabel = notaryProfile?.jurisdiction?.trim()
      ? `${notaryProfile.jurisdiction.trim()} notary seal`
      : "DARCi illuminotary seal";
    const resolvedSignatureLabel = context?.notary?.displayName?.trim() || "Illuminotary signature";

    return {
      ...(venue ? { venue } : {}),
      acknowledgment: {
        signerAppeared: true,
        signerAcknowledged: true,
      },
      notarialFields: resolvedNotarialFields,
      sealLabel: resolvedSealLabel,
      signatureLabel: resolvedSignatureLabel,
      notes: notarialNotes.trim() || undefined,
    };
  };

  const signAcknowledgment = async () => {
    await postRequestAction(
      "sign",
      "/sign",
      buildAcknowledgmentPayload(),
      "Unable to sign the notarial acknowledgment.",
      "Notarial acknowledgment appended. Document preview is updated.",
    );
  };

  const advanceSession = async () => {
    const body: Record<string, unknown> = {
      notes: notarialNotes.trim() || undefined,
    };

    if (!hasPassedProximity) {
      body.thresholdMeters = 100;
      body.evaluatedAt = new Date().toISOString();
    } else if (!hasAcknowledgment) {
      Object.assign(body, buildAcknowledgmentPayload());
    } else if (!isMeetingCompleted) {
      body.advancedAt = new Date().toISOString();
    }

    await postRequestAction(
      "advance-session",
      "/session/advance",
      body,
      "Unable to advance the in-person session.",
      "In-person session advanced.",
    );
  };

  const submitFinalPackage = async () => {
    await postRequestAction(
      "submit",
      "/submit",
      {
        notes: notarialNotes.trim() || undefined,
      },
      "Unable to submit the final notarized package.",
      "Final notarized package submitted.",
    );
  };

  const selectedDocument =
    context?.document.reviewDocuments.find((document) => document.id === selectedDocumentId) ??
    context?.document.reviewDocuments[0] ??
    null;
  if (!selectedDocument) {
    previewDocumentSourceRef.current = null;
  } else if (previewDocumentSourceRef.current?.id !== selectedDocument.id || !previewDocumentSourceRef.current.downloadUrl) {
    previewDocumentSourceRef.current = {
      id: selectedDocument.id,
      downloadUrl: selectedDocument.downloadUrl,
    };
  }
  const previewDocumentSource = previewDocumentSourceRef.current;

  const isSessionInProgress = context?.meeting?.status === "in_progress";
  const isMeetingCompleted = context?.meeting?.status === "completed";
  const hasMemberCheckin = Boolean(context?.evidence.checkins.some((checkin) => checkin.participantRole === "member"));
  const hasSessionStart = Boolean(
    isSessionInProgress ||
    isMeetingCompleted ||
    context?.evidence.checkins.some(
      (checkin) => checkin.participantRole === "notary" && checkin.checkinKind === "meeting_start",
    ),
  );
  const hasVerifiedIdentity = Boolean(context?.evidence.identityVerifications.some((event) => event.status === "verified"));
  const hasPassedProximity = Boolean(
    context?.meeting?.samePlaceStatus === "passed" ||
      context?.evidence.proximityEvaluations.some((event) => event.status === "passed"),
  );
  const memberSample = getLatestSampleForRole(context, "member");
  const notarySample = getLatestSampleForRole(context, "notary");
  const latestProximityEvaluation = getLatestProximityEvaluation(context);
  const hasFreshMemberSample = isSampleFreshEnoughForEvaluation(memberSample);
  const hasFreshNotarySample = isSampleFreshEnoughForEvaluation(notarySample);
  const hasAcknowledgment = Boolean(
    context?.finalization.history.some((event) => event.status === "acknowledgment_appended"),
  );
  const hasFinalWatermark = Boolean(
    context?.finalization.isWatermarked || context?.finalization.history.some((event) => event.status === "watermark_applied"),
  );
  const hasHashRecorded = Boolean(
    context?.finalization.isHashRecorded || context?.finalization.hash || context?.finalization.history.some((event) => event.status === "hash_recorded"),
  );
  const isAnchored = Boolean(context?.finalization.isAnchored);
  const hasLedgerFailure = Boolean(
    context?.finalization.anchorAttempt?.status === "failed" || context?.finalization.latestStatus === "failed",
  );
  const isVerificationReady = Boolean(
    context?.capabilities.canOpenVerification || (context?.finalization.publicVerifyPath && isAnchored),
  );
  const recentFinalizationHistory = context?.finalization.history.slice(-4).reverse() ?? [];
  const hasRunningAction = activeAction !== null;
  const canStartSession = Boolean(context?.capabilities.canManageMeeting && !isSessionInProgress && !isMeetingCompleted);
  const hasProfileJurisdiction = Boolean(notaryProfile?.jurisdiction?.trim());
  const hasProfileServiceArea = Boolean(notaryProfile?.serviceAreaName?.trim());
  const hasProfileCommissionNumber = Boolean(notaryProfile?.commissionNumber?.trim());
  const hasProfileCommissionExpirationValue = Boolean(notaryProfile?.commissionExpiresAt?.trim());
  const hasCurrentProfileCommissionExpiration = isCommissionExpirationCurrent(notaryProfile?.commissionExpiresAt);
  const hasProfileSignature = Boolean(notaryProfile?.signatureDataUrl);
  const hasProfileSeal = Boolean(notaryProfile?.sealDataUrl);
  const hasNotaryProfileReadyForCompletion =
    hasProfileJurisdiction &&
    hasProfileServiceArea &&
    hasProfileCommissionNumber &&
    hasCurrentProfileCommissionExpiration &&
    hasProfileSignature &&
    hasProfileSeal;
  const latestVenueCapture = getLatestVenueCapture(context);
  const hasAcknowledgmentVenue = Boolean(
    (venueState.trim() && venueCounty.trim()) || latestVenueCapture,
  );
  const missingProfileFields = [
    !hasProfileJurisdiction ? "jurisdiction" : null,
    !hasProfileServiceArea ? "service area" : null,
    !hasProfileCommissionNumber ? "commission number" : null,
    !hasProfileCommissionExpirationValue ? "commission expiration" : null,
    hasProfileCommissionExpirationValue && !hasCurrentProfileCommissionExpiration ? "current commission expiration" : null,
    !hasProfileSignature ? "signature" : null,
    !hasProfileSeal ? "seal" : null,
  ].filter((field): field is string => field !== null);
  const samePlaceDisabledReason = !hasSessionStart
    ? "Start the in-person session before evaluating same-place evidence."
    : !hasMemberCheckin
      ? "Member check-in is required before evaluating same-place evidence."
      : !hasFreshMemberSample
        ? "Member location needs a fresh member-device check-in from the member request page."
        : !hasFreshNotarySample
          ? "DARCi is capturing a fresh illuminotary location sample."
          : null;
  const sealAcknowledgmentDisabledReason = hasAcknowledgment
    ? "The acknowledgment has already been sealed for this request."
    : !hasPassedProximity
      ? "Same-place evidence must pass before sealing the acknowledgment."
      : !hasVerifiedIdentity
        ? "Record verified identity before sealing the acknowledgment."
        : missingProfileFields.length > 0
          ? `Complete the notary profile: ${missingProfileFields.join(", ")}.`
          : !hasAcknowledgmentVenue
            ? "Record the acknowledgment venue state and county before sealing."
            : null;
  const advanceSessionDisabledReason = !context?.meeting
    ? "Start the in-person session before advancing."
    : !hasPassedProximity
      ? samePlaceDisabledReason
      : !hasAcknowledgment
        ? sealAcknowledgmentDisabledReason
        : !isMeetingCompleted
          ? null
          : isAnchored
            ? "Final package is already anchored."
            : !context.capabilities.canFinalizeDocument
              ? "Final package is not ready for submission."
              : null;
  const showRealtimeFallbackNotice = realtimeState.status === "degraded" && realtimeState.isPollingFallbackActive;
  const sessionTimelineSteps = [
    { description: "Start the live meeting.", done: hasSessionStart, label: "Start session" },
    { description: "Capture member presence and location.", done: hasMemberCheckin, label: "Check in member" },
    { description: "Keep both live locations within threshold.", done: hasPassedProximity, label: "Pass same-place" },
    { description: "Verify the identity document.", done: hasVerifiedIdentity, label: "Verify identity" },
    { description: "Capture state and county venue details.", done: hasAcknowledgmentVenue, label: "Capture venue" },
    { description: "Seal the acknowledgment page.", done: hasAcknowledgment, label: "Seal acknowledgment" },
    { description: "Close the in-person meeting.", done: isMeetingCompleted, label: "Complete session" },
    { description: "Finalize as verification-ready.", done: isAnchored, label: "Anchor package" },
  ];
  const operatorPanelStep = !context?.meeting
    ? "start"
    : isAnchored
      ? "done"
      : isMeetingCompleted
        ? "finalize"
        : !isSessionInProgress
          ? "start"
          : !hasPassedProximity
            ? "same-place"
            : !hasVerifiedIdentity
              ? "identity"
              : !hasAcknowledgmentVenue
                ? "venue"
              : !hasAcknowledgment
                ? "seal"
                : "complete";
  const operatorPanelTitle = operatorPanelStep === "start"
    ? "Start meeting"
    : operatorPanelStep === "same-place"
      ? "Same-place check"
      : operatorPanelStep === "identity"
      ? "Identity verification"
      : operatorPanelStep === "venue"
        ? "Venue capture"
        : operatorPanelStep === "seal"
          ? "Seal acknowledgment"
          : operatorPanelStep === "complete"
            ? "Complete meeting"
            : operatorPanelStep === "finalize"
              ? "Final package"
              : "Verification ready";
  const samePlaceAutomationClass = samePlaceAutomationState === "blocked"
    ? "border-red-200 bg-red-50 text-red-700"
    : samePlaceAutomationState === "passed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-Color-Scheme-1-Border/30 bg-Color-White text-Color-Neutral";
  const isPreMeetingReview = Boolean(context?.capabilities.canReviewRequest);
  const pageTitle = isPreMeetingReview
    ? `Notarial request - ${context?.owner?.displayName ?? context?.owner?.email ?? "Member"}`
    : `In-person meeting – ${context?.owner?.displayName ?? context?.owner?.email ?? "Member"}`;
  const shouldShowPreviewToolbar = !isPreMeetingReview || context?.document.reviewDocuments.length !== 1;
  const shouldRunSamePlaceFallbackRefresh = Boolean(
    accessToken &&
      requestId &&
      isSessionInProgress &&
      operatorPanelStep === "same-place" &&
      !hasPassedProximity,
  );
  const pageNotificationMessage = errorMessage ?? successMessage;
  const pageNotificationPrefix = errorMessage ? "Action failed" : "Update";
  const fallbackIdentityOption = getIdentityDocumentOption(identityDocumentType);
  const effectiveIdentityDocumentOptions =
    identityDocumentTypeOptions.length > 0
      ? identityDocumentTypeOptions
      : [{ value: fallbackIdentityOption.value, label: fallbackIdentityOption.label, sortOrder: 10 }];
  const effectiveIdentityDocumentFields =
    identityDocumentFields.length > 0
      ? identityDocumentFields
      : [
          {
            fieldKey: "issuingJurisdiction" as const,
            label: fallbackIdentityOption.jurisdictionLabel,
            placeholder: fallbackIdentityOption.jurisdictionLabel,
            inputKind: "text" as const,
            required: true,
            minLength: 1,
            maxLength: 255,
            pattern: null,
            sortOrder: 10,
          },
          {
            fieldKey: "documentExpirationDate" as const,
            label: "Expiration date",
            placeholder: "Expiration date",
            inputKind: "date" as const,
            required: true,
            minLength: 10,
            maxLength: 10,
            pattern: null,
            sortOrder: 20,
          },
          {
            fieldKey: "documentNumberTail" as const,
            label: fallbackIdentityOption.identifierLabel,
            placeholder: fallbackIdentityOption.identifierLabel,
            inputKind: "text" as const,
            required: true,
            minLength: 2,
            maxLength: 4,
            pattern: "^[A-Za-z0-9]{2,4}$",
            sortOrder: 30,
          },
        ];
  const identityFieldValueByKey = {
    issuingJurisdiction: identityIssuingJurisdiction,
    documentExpirationDate: identityDocumentExpirationDate,
    documentNumberTail: identityDocumentNumberTail,
    maskedIdentifier: identityMaskedIdentifier,
  };
  const identityFieldErrors = effectiveIdentityDocumentFields
    .map((field) => {
      const rawValue = identityFieldValueByKey[field.fieldKey] ?? "";
      const value = rawValue.trim();

      if (field.required && value.length === 0) {
        return `${field.label} is required.`;
      }

      if (!value) {
        return null;
      }

      if (field.inputKind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${field.label} must use YYYY-MM-DD.`;
      }

      if (field.minLength !== null && value.length < field.minLength) {
        return `${field.label} must be at least ${field.minLength} characters.`;
      }

      if (field.maxLength !== null && value.length > field.maxLength) {
        return `${field.label} must be ${field.maxLength} characters or fewer.`;
      }

      if (field.pattern) {
        try {
          const regex = new RegExp(field.pattern);
          if (!regex.test(value)) {
            return `${field.label} format is invalid.`;
          }
        } catch {
          return null;
        }
      }

      return null;
    })
    .filter((error): error is string => Boolean(error));
  const identityValidation = {
    isValid: identityFieldErrors.length === 0,
    firstError: identityFieldErrors[0] ?? null,
  };
  const isVenueStepValid = venueState.trim().length > 0 && venueCounty.trim().length > 0;

  useEffect(() => {
    if (!showRealtimeFallbackNotice) {
      hasShownRealtimeFallbackToastRef.current = false;
      return;
    }

    if (hasShownRealtimeFallbackToastRef.current) {
      return;
    }

    hasShownRealtimeFallbackToastRef.current = true;
    showToast({
      tone: "warning",
      message: "Live updates are reconnecting. This workspace is refreshing automatically.",
      durationMs: 6000,
    });
  }, [showRealtimeFallbackNotice, showToast]);

  useEffect(() => {
    if (!context?.meeting || !isSessionInProgress) {
      setSamePlaceAutomationState("idle");
      setSamePlaceAutomationMessage("Waiting for the in-person meeting to start.");
      return;
    }

    if (hasPassedProximity) {
      setSamePlaceAutomationState("passed");
      setSamePlaceAutomationMessage("Same-place evidence passed.");
      return;
    }

    if (!hasSessionStart) {
      setSamePlaceAutomationState("waiting");
      setSamePlaceAutomationMessage("Waiting for the notary to come online.");
      return;
    }

    if (!hasMemberCheckin || !memberSample) {
      setSamePlaceAutomationState("waiting");
      setSamePlaceAutomationMessage("Waiting for the member check-in. This panel is refreshing automatically.");
      return;
    }

    if (!hasFreshMemberSample) {
      setSamePlaceAutomationState("waiting");
      setSamePlaceAutomationMessage("Waiting for a fresh member location sample.");
      return;
    }

    if (activeAction) {
      return;
    }

    if (!hasFreshNotarySample || !notarySample) {
      const refreshKey = `${context.request.id}:${context.meeting.meetingId}:${memberSample.id}:${notarySample?.id ?? "missing"}`;
      setSamePlaceAutomationState("capturing");
      setSamePlaceAutomationMessage("Capturing notary location automatically.");

      if (lastAutoNotarySampleRefreshRef.current !== refreshKey) {
        lastAutoNotarySampleRefreshRef.current = refreshKey;
        void refreshNotaryLocationSample({ automatic: true });
      }
      return;
    }

    const evaluationKey = `${context.request.id}:${context.meeting.meetingId}:${memberSample.id}:${notarySample.id}`;
    setSamePlaceAutomationState("evaluating");
    setSamePlaceAutomationMessage("Checking same-place evidence automatically.");

    if (lastAutoProximityEvaluationRef.current !== evaluationKey) {
      lastAutoProximityEvaluationRef.current = evaluationKey;
      void recordProximity({ automatic: true });
    }
  }, [
    activeAction,
    context?.meeting,
    context?.request.id,
    hasFreshMemberSample,
    hasFreshNotarySample,
    hasMemberCheckin,
    hasPassedProximity,
    hasSessionStart,
    isSessionInProgress,
    memberSample,
    notarySample,
    recordProximity,
    refreshNotaryLocationSample,
  ]);

  useEffect(() => {
    if (!shouldRunSamePlaceFallbackRefresh || activeAction) {
      return;
    }

    let isDisposed = false;
    let timeoutId: number | null = null;

    const scheduleRefresh = (delayMs: number) => {
      timeoutId = window.setTimeout(async () => {
        if (isDisposed) {
          return;
        }

        if (globalThis.document?.visibilityState === "hidden") {
          scheduleRefresh(samePlaceFallbackRefreshIntervalMs);
          return;
        }

        if (!samePlaceFallbackRefreshInFlightRef.current) {
          samePlaceFallbackRefreshInFlightRef.current = true;
          try {
            await loadContext();
          } finally {
            samePlaceFallbackRefreshInFlightRef.current = false;
          }
        }

        if (!isDisposed) {
          scheduleRefresh(samePlaceFallbackRefreshIntervalMs);
        }
      }, delayMs);
    };

    scheduleRefresh(samePlaceFallbackRefreshInitialDelayMs);

    return () => {
      isDisposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeAction, loadContext, shouldRunSamePlaceFallbackRefresh]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Link className="inline-flex items-center gap-1 text-sm font-medium text-Color-Neutral transition hover:text-Color-Scheme-1-Text" href="/app/notary">
            <ChevronLeftIcon />
            <span>Back to queue</span>
          </Link>
          <div className="text-2xl font-medium">{pageTitle}</div>
        </div>
        {context ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-Color-Neutral-Darkest">
            <span className="rounded-full bg-Color-Neutral-Lightest px-3 py-1 font-medium text-Color-Scheme-1-Text">
              {formatProductLabel(context.document.documentType)}
            </span>
            <span className="rounded-full bg-Color-Neutral-Lightest px-3 py-1 font-medium">
              {context.document.idn ?? "IDN pending"}
            </span>
          </div>
        ) : null}
      </div>

      {pageNotificationMessage ? (
        <div className="border-t-4 border-black bg-black px-4 py-3 text-sm text-white shadow-[0_8px_20px_rgba(0,0,0,0.18)]">
          <span className="font-medium">{pageNotificationPrefix}:</span> {pageNotificationMessage}
        </div>
      ) : null}

      {!context ? (
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-4 py-8 text-sm text-Color-Neutral">
          {isLoading ? "Loading request context." : "No request context loaded."}
        </div>
      ) : (
        <div className="mt-12 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.52fr)]">
          <section className="space-y-4">
            {previewDocumentSource?.downloadUrl ? (
              <object
                key={previewDocumentSource.id}
                className={`${previewPanelHeightClass} w-full rounded-[20px] bg-[#f3f6f8] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]`}
                data={previewDocumentSource.downloadUrl}
                type="application/pdf"
              >
                <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-Color-Neutral">
                  Open the PDF in a new tab if your browser does not render inline previews here.
                </div>
              </object>
            ) : (
              <div className={`flex ${previewPanelHeightClass} items-center justify-center rounded-[20px] bg-[#f7f9fb] px-6 text-center text-sm leading-6 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]`}>
                Select a document to preview it here.
              </div>
            )}

            {shouldShowPreviewToolbar ? (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {context.document.reviewDocuments.length > 1 ? (
                  context.document.reviewDocuments.map((document, index) => {
                    const isSelected = selectedDocument?.id === document.id;
                    return (
                      <button
                        className={`min-w-24 rounded-md px-3 py-2 text-left text-xs transition ${
                          isSelected
                            ? "bg-Color-Neutral-Lightest shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)]"
                            : "bg-Color-White shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] hover:bg-Color-Neutral-Lightest"
                        }`}
                        key={document.id}
                        onClick={() => setSelectedDocumentId(document.id)}
                        type="button"
                      >
                        <div className="font-medium text-Color-Scheme-1-Text">
                          {formatCompactReviewDocumentLabel(document, index, context.document.documentType)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-Color-Neutral">{getReviewDocumentStatusLabel(document)}</div>
                      </button>
                    );
                  })
                ) : context.document.reviewDocuments.length === 0 ? (
                  <div className="rounded-lg bg-Color-Neutral-Lightest px-4 py-3 text-sm leading-6 text-Color-Neutral">
                    This request is missing its generated PDF package and cannot be reviewed. Ask the member to regenerate the document and send it to the notary again.
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {context.capabilities.canReviewRequest ? (
          <section className="rounded-lg bg-Color-Neutral-Lightest p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
            <div className="text-sm font-medium text-Color-Scheme-1-Text">Review decision</div>
            <form className="mt-4 space-y-4" onSubmit={submitDecision}>
              <div className="text-xs leading-5 text-Color-Neutral">
                <div>Approve: {decisionHelp.approved}</div>
                <div className="mt-1">Reject: {decisionHelp.rejected}</div>
              </div>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Decision summary</span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg bg-Color-White px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] transition focus:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.32)]"
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder="Optional note to include in the member notification"
                  value={summary}
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  className="w-full rounded-lg bg-black px-5 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  onClick={() => setDecision("rejected")}
                  type="submit"
                  value="rejected"
                >
                  {isSubmitting && decision === "rejected" ? "Recording" : decisionLabels.rejected}
                </button>
                <button
                  className="w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSubmitting}
                  onClick={() => setDecision("approved")}
                  type="submit"
                  value="approved"
                >
                  {isSubmitting && decision === "approved" ? "Recording" : decisionLabels.approved}
                </button>
              </div>
            </form>
          </section>
          ) : (
          <div className="space-y-4">
          <SessionTimeline steps={sessionTimelineSteps} />
          <section className="rounded-lg bg-Color-Neutral-Lightest p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Operator step</div>
                <div className="mt-1 text-lg font-medium text-Color-Scheme-1-Text">{operatorPanelTitle}</div>
              </div>
              <span className="rounded-full bg-Color-White px-3 py-1 text-xs font-medium text-Color-Neutral-Darkest">
                {formatStatusLabel(context.meeting?.status ?? context.nextAction ?? resolveWorkspaceStatus(context))}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {operatorPanelStep === "start" ? (
                <div className="space-y-3">
                  <div className="rounded-lg bg-Color-White px-3 py-3 text-sm leading-6 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    Start the live meeting. DARCi captures the notary location as part of session start.
                  </div>
                <button
                  className="w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isStartingSession || !canStartSession}
                  onClick={() => void startInPersonSession()}
                  type="button"
                >
                  {isStartingSession ? "Starting" : "Start in-person session"}
                </button>
                {!canStartSession && !context.meeting ? (
                <div className="text-xs leading-5 text-Color-Neutral">
                  The in-person session can start after approval contact exchange is ready.
                </div>
                ) : null}
                </div>
              ) : null}

              {operatorPanelStep === "same-place" ? (
                <div className="space-y-3">
                  <div className={`rounded-lg border px-3 py-3 text-sm leading-6 ${samePlaceAutomationClass}`}>
                    <div className="font-medium">{hasPassedProximity ? "Passed" : "Live same-place check"}</div>
                    <div className="mt-1">{samePlaceAutomationMessage}</div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                    <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                      <div className="font-medium text-Color-Scheme-1-Text">Member</div>
                      <div>{hasMemberCheckin ? "Checked in" : "Waiting"}</div>
                    </div>
                    <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                      <div className="font-medium text-Color-Scheme-1-Text">Notary</div>
                      <div>{hasSessionStart ? "Online" : "Waiting"}</div>
                    </div>
                    <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                      <div className="font-medium text-Color-Scheme-1-Text">Distance</div>
                      <div>{formatMeters(latestProximityEvaluation?.observedDistanceMeters)}</div>
                    </div>
                  </div>
                  {samePlaceDisabledReason ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      {samePlaceDisabledReason}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {operatorPanelStep === "identity" ? (
                <div className="space-y-3 rounded-lg bg-Color-White p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  <div className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-xs leading-5 text-Color-Neutral">
                    Verify the member&apos;s identity document exactly as presented. Required fields must be complete before recording identity.
                  </div>
                  <input
                    className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                    onChange={(event) => setIdentitySubjectName(event.target.value)}
                    placeholder={context.owner?.displayName ?? "Member name"}
                    value={identitySubjectName}
                  />
                  <IdentityTypeSelectControl
                    disabled={isLoadingIdentityDocumentSchema || effectiveIdentityDocumentOptions.length === 0}
                    onChange={(value) => handleIdentityDocumentTypeChange(value as IdentityDocumentType)}
                    options={effectiveIdentityDocumentOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    placeholder="Select identity document type"
                    value={identityDocumentType}
                  />
                  {effectiveIdentityDocumentFields.map((field) => {
                    const currentValue = identityFieldValueByKey[field.fieldKey] ?? "";
                    const placeholder = field.placeholder?.trim() || field.label;
                    const maxLength = field.maxLength ?? undefined;

                    if (field.inputKind === "date") {
                      return (
                        <NotaryDatePicker
                          key={field.fieldKey}
                          onChange={(nextValue) => {
                            if (field.fieldKey === "documentExpirationDate") {
                              setIdentityDocumentExpirationDate(nextValue);
                            }
                          }}
                          placeholder={`${placeholder}${field.required ? " *" : ""}`}
                          value={currentValue}
                        />
                      );
                    }

                    const fieldDescriptor = `${field.label} ${placeholder}`;
                    const looksLikeCountryField = /country/i.test(fieldDescriptor);
                    const looksLikeStateField = /issuing\s+state|state/i.test(fieldDescriptor);
                    if (field.fieldKey === "issuingJurisdiction" && looksLikeCountryField) {
                      return (
                        <IdentityTypeSelectControl
                          key={field.fieldKey}
                          onChange={(nextValue) => setIdentityIssuingJurisdiction(nextValue)}
                          options={countrySelectOptions}
                          placeholder={`${placeholder}${field.required ? " *" : ""}`}
                          searchable
                          searchPlaceholder="Search country"
                          value={currentValue}
                        />
                      );
                    }

                    if (field.fieldKey === "issuingJurisdiction" && looksLikeStateField) {
                      return (
                        <IdentityTypeSelectControl
                          key={field.fieldKey}
                          onChange={(nextValue) => setIdentityIssuingJurisdiction(nextValue)}
                          options={usStateSelectOptions}
                          placeholder={`${placeholder}${field.required ? " *" : ""}`}
                          searchable
                          searchPlaceholder="Search state"
                          value={currentValue}
                        />
                      );
                    }

                    return (
                      <input
                        key={field.fieldKey}
                        className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                        maxLength={maxLength}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          if (field.fieldKey === "issuingJurisdiction") {
                            setIdentityIssuingJurisdiction(nextValue);
                          } else if (field.fieldKey === "documentNumberTail") {
                            setIdentityDocumentNumberTail(nextValue);
                          } else if (field.fieldKey === "maskedIdentifier") {
                            setIdentityMaskedIdentifier(nextValue);
                          }
                        }}
                        placeholder={`${placeholder}${field.required ? " *" : ""}`}
                        type="text"
                        value={currentValue}
                      />
                    );
                  })}
                  {identityDocumentSchemaError ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      {identityDocumentSchemaError}
                    </div>
                  ) : null}
                  {!identityValidation.isValid ? (
                    <div className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                      {identityValidation.firstError}
                    </div>
                  ) : null}
                  <button
                    className={`w-full rounded-lg px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed ${identityValidation.isValid ? "bg-Green text-Color-Neutral-Darkest hover:brightness-95" : "bg-Color-Neutral text-Color-White/90"}`}
                    disabled={hasRunningAction || !identityValidation.isValid}
                    onClick={() => void recordIdentity()}
                    type="button"
                  >
                    {activeAction === "identity" ? "Recording identity" : "Record identity"}
                  </button>
                </div>
              ) : null}

              {operatorPanelStep === "venue" ? (
                <div className="space-y-3 rounded-lg bg-Color-White p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  <div className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Acknowledgment venue</div>
                  {isVenuePrefilling ? (
                    <div className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-xs leading-5 text-Color-Neutral">
                      Prefilling venue from current location...
                    </div>
                  ) : null}
                  {venuePrefillStatus && !isVenuePrefilling ? (
                    <div className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-xs leading-5 text-Color-Neutral">
                      {venuePrefillStatus}
                    </div>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => updateVenueField("state", event.target.value)}
                      placeholder="State"
                      value={venueState}
                    />
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => updateVenueField("county", event.target.value)}
                      placeholder="County"
                      value={venueCounty}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    <input
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => updateVenueField("city", event.target.value)}
                      placeholder="City"
                      value={venueCity}
                    />
                    <input
                      ref={venueAddressInputRef}
                      className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                      onChange={(event) => updateVenueField("addressLine1", event.target.value)}
                      placeholder="Address or place"
                      value={venueAddressLine1}
                    />
                  </div>
                  <input
                    className="w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)]"
                    onChange={(event) => updateVenueField("locationLabel", event.target.value)}
                    placeholder="Location label"
                    value={venueLocationLabel}
                  />
                  {!hasAcknowledgmentVenue ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      State and county are required to capture venue.
                    </div>
                  ) : null}
                  <button
                    className={`w-full rounded-lg px-5 py-3 text-sm font-medium transition disabled:cursor-not-allowed ${isVenueStepValid ? "bg-Green text-Color-Neutral-Darkest hover:brightness-95" : "bg-Color-Neutral text-Color-White/90"}`}
                    disabled={hasRunningAction || !isVenueStepValid}
                    onClick={() => void recordVenue()}
                    type="button"
                  >
                    {activeAction === "venue" ? "Capturing venue" : "Capture venue"}
                  </button>
                </div>
              ) : null}

              {operatorPanelStep === "seal" ? (
                <div className="space-y-3 rounded-lg bg-Color-White p-3 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                <label className="block">
                  <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Notarial notes</span>
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.10)] transition focus:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.24)]"
                    onChange={(event) => setNotarialNotes(event.target.value)}
                    placeholder="Optional note for seal preview and final submission"
                    value={notarialNotes}
                  />
                </label>
                  {!hasNotaryProfileReadyForCompletion ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      Complete notary profile fields before sealing: {missingProfileFields.join(", ")}.
                    </div>
                  ) : null}
                  <ActionButton
                    active={activeAction === "sign"}
                    disabled={
                      hasRunningAction ||
                      Boolean(sealAcknowledgmentDisabledReason)
                    }
                    loadingLabel="Appending acknowledgment"
                    onClick={() => void signAcknowledgment()}
                  >
                    Seal acknowledgment
                  </ActionButton>
                  {sealAcknowledgmentDisabledReason ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      {sealAcknowledgmentDisabledReason}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {operatorPanelStep === "complete" ? (
                <div className="space-y-3 rounded-lg bg-Color-White p-3 text-sm leading-6 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  <div>Meeting evidence is ready. Complete the session and submit the final package in one move.</div>
                  <ActionButton
                    active={activeAction === "advance-session"}
                    disabled={hasRunningAction || Boolean(advanceSessionDisabledReason)}
                    loadingLabel="Completing meeting"
                    onClick={() => void advanceSession()}
                  >
                    Complete and submit package
                  </ActionButton>
                  {advanceSessionDisabledReason ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      {advanceSessionDisabledReason}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {operatorPanelStep === "finalize" || operatorPanelStep === "done" ? (
              <div className="space-y-3">
                {operatorPanelStep === "finalize" ? (
                  <ActionButton
                    active={activeAction === "submit"}
                    disabled={
                      hasRunningAction ||
                      !isMeetingCompleted ||
                      !hasAcknowledgment ||
                      !hasVerifiedIdentity ||
                      !hasPassedProximity ||
                      isAnchored ||
                      !context.capabilities.canFinalizeDocument
                    }
                    loadingLabel="Submitting final package"
                    onClick={() => void submitFinalPackage()}
                  >
                    Submit final notarized package
                  </ActionButton>
                ) : (
                  <div className="rounded-lg bg-emerald-50 px-3 py-3 text-sm leading-6 text-emerald-800">
                    Final package is anchored. Verification is ready for the member record.
                  </div>
                )}
                {context?.finalization ? (
                  <div className="rounded-lg bg-Color-White px-3 py-3 text-xs leading-5 text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="font-medium text-Color-Scheme-1-Text">Final package status</div>
                      <div className={hasLedgerFailure ? "font-medium text-red-700" : "text-Color-Neutral"}>
                        {formatStatusLabel(context.finalization.latestStatus)}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <CompletionStep done={hasFinalWatermark} label="Watermarked" />
                      <CompletionStep done={hasHashRecorded} label="Hash recorded" />
                      <CompletionStep done={isAnchored} label="Ledger anchored" />
                      <CompletionStep done={isVerificationReady} label="Verification ready" />
                    </div>
                    <div className="mt-3 grid gap-1 break-words">
                      <div>Hash: {context.finalization.hash ?? "-"}</div>
                      <div>Ledger TX: {context.finalization.ledgerTxId ?? "-"}</div>
                      <div>Anchored: {formatDateTime(context.finalization.anchoredAt)}</div>
                      <div>Last checked: {formatDateTime(context.finalization.lastCheckedAt)}</div>
                    </div>
                    {context.finalization.publicVerifyPath ? (
                      <Link
                        className="mt-3 inline-flex rounded-lg border border-Color-Scheme-1-Border/40 px-3 py-2 text-xs font-medium text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lightest"
                        href={context.finalization.publicVerifyPath}
                      >
                        Open public verification
                      </Link>
                    ) : null}
                    {hasLedgerFailure ? (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-700">
                        Ledger anchoring failed{context.finalization.anchorAttempt?.errorMessage ? `: ${context.finalization.anchorAttempt.errorMessage}` : "."} Retry final package submission after the ledger provider is available.
                      </div>
                    ) : null}
                    {recentFinalizationHistory.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {recentFinalizationHistory.map((event) => (
                          <div key={event.id} className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2">
                            {formatStatusLabel(event.status)} · {formatDateTime(event.createdAt)}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            </div>
          </section>
          </div>
          )}
        </div>
      )}
    </div>
  );
}