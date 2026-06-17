"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAppToast } from "@/components/app/AppToastContext";
import { useStoredAuth, useStoredUser } from "@/lib/auth";
import { fetchWithTokenRefresh, notaryApiBaseUrl, readApiErrorMessage } from "@/lib/notaryWorkspace";
import type { JurisdictionOption, MemberFormJurisdictionsPayload } from "@/app/app/start/startPageTypes";

type NotaryServiceAreaKind =
  | "county"
  | "parish"
  | "borough"
  | "district"
  | "city"
  | "metro"
  | "region"
  | "state";

type NotaryApplication = {
  id: string;
  userId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  commissionNumber: string | null;
  commissionExpiresAt: string | null;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotaryProfile = {
  id: string;
  userId: string;
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  commissionNumber: string | null;
  commissionExpiresAt: string | null;
  sealStoragePath: string | null;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminApplicationRow = {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  jurisdiction: string;
  serviceAreaKind: NotaryServiceAreaKind;
  serviceAreaName: string;
  commissionNumber: string | null;
  commissionExpiresAt: string | null;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    supabaseUserId: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type SelectOption = {
  label: string;
  value: string;
};

type SavedSignature = {
  id: string;
  label: string;
  dataUrl: string;
  createdAt: string;
};

const SAVED_SIGNATURES_STORAGE_KEY = "darci.notary.savedSignatures";
const CURRENT_PROFILE_SIGNATURE_ID = "current-profile-signature";
const DRAW_CANVAS_WIDTH = 960;
const DRAW_CANVAS_HEIGHT = 320;
const SIGNATURE_UPLOAD_MAX_DIMENSION = 960;
const SEAL_UPLOAD_MAX_DIMENSION = 560;
const ALLOWED_NOTARY_ASSET_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const PDF_IMAGE_DATA_URL_PATTERN = /^data:image\/(?:png|jpe?g);base64,/i;

const stateFipsByAbbreviation: Record<string, string> = {
  AL: "01",
  AK: "02",
  AZ: "04",
  AR: "05",
  CA: "06",
  CO: "08",
  CT: "09",
  DE: "10",
  FL: "12",
  GA: "13",
  HI: "15",
  ID: "16",
  IL: "17",
  IN: "18",
  IA: "19",
  KS: "20",
  KY: "21",
  LA: "22",
  ME: "23",
  MD: "24",
  MA: "25",
  MI: "26",
  MN: "27",
  MS: "28",
  MO: "29",
  MT: "30",
  NE: "31",
  NV: "32",
  NH: "33",
  NJ: "34",
  NM: "35",
  NY: "36",
  NC: "37",
  ND: "38",
  OH: "39",
  OK: "40",
  OR: "41",
  PA: "42",
  RI: "44",
  SC: "45",
  SD: "46",
  TN: "47",
  TX: "48",
  UT: "49",
  VT: "50",
  VA: "51",
  WA: "53",
  WV: "54",
  WI: "55",
  WY: "56",
  DC: "11",
};

const stateAbbreviationByName: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
  "DISTRICT OF COLUMBIA": "DC",
};

const emptyApplicationForm = {
  jurisdiction: "",
  serviceAreaKind: "county" as NotaryServiceAreaKind,
  serviceAreaName: "",
  commissionNumber: "",
  commissionExpiresAt: "",
  signatureDataUrl: null as string | null,
  sealDataUrl: null as string | null,
};

const formatPersonName = (firstName: string | null, lastName: string | null) => {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Profile";
};

const toLocalDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseCalendarDateValue = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatCalendarDateKey = (date: Date) => {
  return toLocalDateInputValue(date);
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

const toDateInputValue = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? "" : toLocalDateInputValue(parsed);
};

const toCommissionExpirationPayload = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? `${trimmed}T23:59:59.999Z` : "";
};

const isDateInputBeforeToday = (value: string) => {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed < toLocalDateInputValue(new Date());
};

const formatCommissionExpiration = (value: string | null | undefined) => {
  return toDateInputValue(value) || "Missing";
};

const normalizeJurisdictionValue = (value: string) => {
  return value.trim().toUpperCase();
};

const getJurisdictionCode = (value: string) => {
  const normalized = normalizeJurisdictionValue(value);
  if (normalized.startsWith("US-")) {
    return normalized;
  }

  if (normalized.length === 2) {
    return `US-${normalized}`;
  }

  return normalized;
};

const getStateAbbreviation = (value: string) => {
  const normalized = getJurisdictionCode(value);
  if (normalized.startsWith("US-") && normalized.length === 5) {
    return normalized.slice(3);
  }

  const embeddedCodeMatch = normalized.match(/\b([A-Z]{2})\b/);
  if (embeddedCodeMatch?.[1] && stateFipsByAbbreviation[embeddedCodeMatch[1]]) {
    return embeddedCodeMatch[1];
  }

  return null;
};

const getStateAbbreviationFromLabel = (label: string | null | undefined) => {
  const normalized = (label ?? "").trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  const codeMatch = normalized.match(/US-([A-Z]{2})/);
  if (codeMatch?.[1] && stateFipsByAbbreviation[codeMatch[1]]) {
    return codeMatch[1];
  }

  if (stateAbbreviationByName[normalized]) {
    return stateAbbreviationByName[normalized];
  }

  return null;
};

const inferServiceAreaKind = (serviceAreaLabel: string): NotaryServiceAreaKind => {
  const normalized = serviceAreaLabel.toLowerCase();
  if (normalized.includes("parish")) {
    return "parish";
  }
  if (normalized.includes("borough")) {
    return "borough";
  }
  if (normalized.includes("district")) {
    return "district";
  }
  if (normalized.includes("city")) {
    return "city";
  }
  if (normalized.includes("metro")) {
    return "metro";
  }
  if (normalized.includes("region")) {
    return "region";
  }
  if (normalized.includes("state")) {
    return "state";
  }

  return "county";
};

const isAllowedNotaryAssetFile = (file: File) => {
  return ALLOWED_NOTARY_ASSET_MIME_TYPES.has(file.type.toLowerCase());
};

const renderImageSourceToPngDataUrl = (source: string, options?: { maxDimension?: number }) => {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const maxDimension = options?.maxDimension ?? SIGNATURE_UPLOAD_MAX_DIMENSION;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Failed to prepare image file"));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      reject(new Error("Failed to read image file"));
    };
    image.src = source;
  });
};

const toDataUrlFromFile = (file: File, options?: { maxDimension?: number }) => {
  const objectUrl = URL.createObjectURL(file);
  return renderImageSourceToPngDataUrl(objectUrl, options).finally(() => {
    URL.revokeObjectURL(objectUrl);
  });
};

const normalizeNotaryAssetDataUrl = async (
  dataUrl: string | null,
  options?: { maxDimension?: number },
) => {
  const trimmed = dataUrl?.trim() ?? "";
  if (!trimmed) {
    return null;
  }

  if (PDF_IMAGE_DATA_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }

  if (!trimmed.startsWith("data:image/")) {
    throw new Error("Signature and seal images must be PNG or JPG files.");
  }

  return renderImageSourceToPngDataUrl(trimmed, options);
};

const loadSavedSignatures = (): SavedSignature[] => {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = localStorage.getItem(SAVED_SIGNATURES_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SavedSignature[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => {
      return Boolean(item && item.id && item.label && item.dataUrl);
    });
  } catch {
    return [];
  }
};

const getInitialSelectedSavedSignatureId = (value: string | null) => {
  const currentValue = value?.trim() ?? "";
  if (!currentValue) {
    return null;
  }

  return loadSavedSignatures().find((item) => item.dataUrl === currentValue)?.id ?? CURRENT_PROFILE_SIGNATURE_ID;
};

const saveSignatureToLibrary = (dataUrl: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const current = loadSavedSignatures();
  const nextItem: SavedSignature = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    label: `Saved ${new Date().toLocaleString()}`,
    dataUrl,
    createdAt: new Date().toISOString(),
  };

  const deduped = [nextItem, ...current.filter((item) => item.dataUrl !== dataUrl)].slice(0, 10);
  localStorage.setItem(SAVED_SIGNATURES_STORAGE_KEY, JSON.stringify(deduped));
};

const removeSignatureFromLibrary = (signatureId: string) => {
  if (typeof window === "undefined") {
    return [] as SavedSignature[];
  }

  const nextSignatures = loadSavedSignatures().filter((item) => item.id !== signatureId);
  localStorage.setItem(SAVED_SIGNATURES_STORAGE_KEY, JSON.stringify(nextSignatures));
  return nextSignatures;
};

function SettingsDatePicker({
  value,
  onChange,
  disabled,
  min,
  className,
  placeholder = "Select date",
  ariaLabel = "Select date",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  min?: string;
  className: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const selectedDate = parseCalendarDateValue(value);
  const minDate = parseCalendarDateValue(min);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<CalendarView>("days");
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getCalendarMonthStart(selectedDate ?? minDate ?? new Date()),
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
  const minKey = minDate ? formatCalendarDateKey(minDate) : null;
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
                    const isBeforeMin = Boolean(minKey && dayKey < minKey);

                    return (
                      <button
                        key={dayKey}
                        type="button"
                        disabled={isBeforeMin}
                        className={`h-8 rounded-md border text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                          isSelected
                            ? "border-Color-Neutral-Darkest bg-Color-Neutral-Darkest text-Color-White"
                            : "border-transparent bg-Color-White/70 hover:border-Color-Scheme-1-Border/60 hover:bg-Color-White"
                        } ${isMuted ? "text-Color-Neutral" : "text-Color-Scheme-1-Text"}`}
                        onClick={() => {
                          if (isBeforeMin) {
                            return;
                          }

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
        disabled={disabled}
        className={`${className} flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50`}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) {
            return;
          }

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
}

function SelectField({
  label,
  value,
  placeholder,
  options,
  isOpen,
  disabled,
  onChange,
  onOpenChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: SelectOption[];
  isOpen: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }

    const popoverWidth = 320;
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

    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const portalTarget = typeof document === "undefined" ? null : document.body;
  const popover =
    isOpen && popoverPosition && portalTarget
      ? createPortal(
          <div
            className="fixed z-[100] max-h-72 w-80 overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-2 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value || option.label}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-Green text-Color-Neutral-Darkest"
                      : "text-Color-Scheme-1-Text hover:bg-Color-White"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    onOpenChange(false);
                    triggerRef.current?.blur();
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected ? <span>Selected</span> : null}
                </button>
              );
            })}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
      <span>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        className="flex h-10 w-full items-center justify-between rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-left text-sm text-Color-Scheme-1-Text outline-none transition-colors hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-50"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) {
            updatePopoverPosition();
          }
          onOpenChange(!isOpen);
        }}
      >
        <span className={selectedOption ? "text-Color-Scheme-1-Text" : "text-Color-Neutral"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 border-b border-r border-Color-Neutral transition-transform ${
            isOpen ? "rotate-[225deg]" : "rotate-45"
          }`}
        />
      </button>
      {popover}
    </div>
  );
}

function SignatureCaptureField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (nextValue: string | null) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<"draw" | "upload" | "saved">(() => value ? "saved" : "draw");
  const [isUsingDrawnSignature, setIsUsingDrawnSignature] = useState(false);
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>(() =>
    loadSavedSignatures(),
  );
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(() =>
    getInitialSelectedSavedSignatureId(value),
  );
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.beginPath();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#111111";
    hasInkRef.current = false;
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  useEffect(() => {
    resetCanvas();
  }, [resetCanvas]);

  const getCanvasPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  const beginDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || disabled) {
      return;
    }

    const context = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    if (!context || !point) {
      return;
    }

    isDrawingRef.current = true;
    hasInkRef.current = true;
    lastPointRef.current = point;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }, [disabled, getCanvasPoint]);

  const continueDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    const point = getCanvasPoint(event);
    if (!context || !point) {
      return;
    }

    const previousPoint = lastPointRef.current;
    if (!previousPoint) {
      lastPointRef.current = point;
      return;
    }

    context.beginPath();
    context.moveTo(previousPoint.x, previousPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    lastPointRef.current = point;
  }, [disabled, getCanvasPoint]);

  const endDraw = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }

    isDrawingRef.current = false;
    lastPointRef.current = null;
  }, []);

  const saveDrawnSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInkRef.current || isUsingDrawnSignature) {
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    onChange(dataUrl);
    saveSignatureToLibrary(dataUrl);
    setSavedSignatures(loadSavedSignatures());
    setIsUsingDrawnSignature(true);
  }, [isUsingDrawnSignature, onChange]);

  const applyUploadFile = useCallback(async (file: File | null) => {
    if (!file || disabled) {
      return;
    }

    if (!isAllowedNotaryAssetFile(file)) {
      return;
    }

    const dataUrl = await toDataUrlFromFile(file, {
      maxDimension: SIGNATURE_UPLOAD_MAX_DIMENSION,
    });
    onChange(dataUrl);
    saveSignatureToLibrary(dataUrl);
    setSavedSignatures(loadSavedSignatures());
    setIsUsingDrawnSignature(false);
  }, [disabled, onChange]);

  const onUploadInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    void applyUploadFile(file);
    event.target.value = "";
  }, [applyUploadFile]);

  const onDropUpload = useCallback((event: ReactDragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDraggingUpload(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    void applyUploadFile(file);
  }, [applyUploadFile]);

  const savedSignatureOptions = useMemo(() => {
    const currentValue = value?.trim() ?? "";
    if (!currentValue || savedSignatures.some((item) => item.dataUrl === currentValue)) {
      return savedSignatures;
    }

    return [
      {
        id: CURRENT_PROFILE_SIGNATURE_ID,
        label: "Current profile signature",
        dataUrl: currentValue,
        createdAt: "",
      },
      ...savedSignatures,
    ];
  }, [savedSignatures, value]);

  const selectedSaved = useMemo(() => {
    return savedSignatureOptions.find((item) => item.id === selectedSavedId) ?? null;
  }, [savedSignatureOptions, selectedSavedId]);

  const deleteSavedSignature = useCallback((signature: SavedSignature) => {
    if (signature.id === CURRENT_PROFILE_SIGNATURE_ID) {
      if (value === signature.dataUrl) {
        onChange(null);
      }
      setSelectedSavedId(null);
      return;
    }

    const nextSavedSignatures = removeSignatureFromLibrary(signature.id);
    setSavedSignatures(nextSavedSignatures);
    setSelectedSavedId((currentId) => currentId === signature.id ? null : currentId);
    if (value === signature.dataUrl) {
      onChange(null);
    }
  }, [onChange, value]);

  return (
    <div className="space-y-3 rounded-xl bg-Color-Neutral-Lightest/60 p-4">
      <div className="text-sm font-medium text-Color-Scheme-1-Text">Signature</div>
      <div className="flex flex-wrap gap-2">
        {([
          { key: "draw", label: "Draw" },
          { key: "upload", label: "Upload" },
          { key: "saved", label: "Use pre-saved" },
        ] as const).map((option) => (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            onClick={() => setMode(option.key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              mode === option.key
                ? "bg-Green text-Color-Neutral-Darkest"
                : "bg-white text-Color-Scheme-1-Text"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {mode === "draw" ? (
        <div className="space-y-3">
          <canvas
            ref={canvasRef}
            width={DRAW_CANVAS_WIDTH}
            height={DRAW_CANVAS_HEIGHT}
            className={`w-full rounded-lg border border-Color-Scheme-1-Border/40 bg-white touch-none ${
              isUsingDrawnSignature ? "cursor-not-allowed opacity-75" : ""
            }`}
            onPointerDown={beginDraw}
            onPointerMove={continueDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md bg-white px-3 py-2 text-xs font-medium text-Color-Scheme-1-Text"
              disabled={disabled}
              onClick={() => {
                resetCanvas();
                setIsUsingDrawnSignature(false);
                onChange(null);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-xs font-medium ${
                isUsingDrawnSignature
                  ? "bg-Green text-Color-Neutral-Darkest opacity-70"
                  : "bg-Green text-Color-Neutral-Darkest"
              }`}
              disabled={disabled || isUsingDrawnSignature}
              onClick={saveDrawnSignature}
            >
              {isUsingDrawnSignature ? "Using drawn signature" : "Save drawn signature"}
            </button>
          </div>
        </div>
      ) : null}

      {mode === "upload" ? (
        <label
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingUpload(true);
          }}
          onDragLeave={() => setIsDraggingUpload(false)}
          onDrop={onDropUpload}
          className={`block cursor-pointer rounded-lg border border-dashed px-4 py-6 text-center text-sm ${
            isDraggingUpload ? "border-Green bg-Green/10" : "border-Color-Scheme-1-Border/40 bg-white"
          }`}
        >
          <div className="font-medium text-Color-Scheme-1-Text">Drag & drop signature image or click to upload</div>
          <div className="mt-1 text-xs text-Color-Neutral">PNG or JPG</div>
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onUploadInputChange} />
        </label>
      ) : null}

      {mode === "saved" ? (
        <div className="space-y-3">
          {savedSignatureOptions.length === 0 ? (
            <div className="rounded-md bg-white p-3 text-xs text-Color-Neutral">No saved signatures yet.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {savedSignatureOptions.map((item) => {
                const isSelected = selectedSavedId === item.id;
                const isCurrentProfileSignature = item.id === CURRENT_PROFILE_SIGNATURE_ID;
                const deleteLabel = isCurrentProfileSignature
                  ? "Clear current profile signature"
                  : "Delete saved signature";

                return (
                  <div
                    key={item.id}
                    className={`relative overflow-hidden rounded-lg border bg-white transition-colors ${
                      isSelected ? "border-Green" : "border-Color-Scheme-1-Border/30"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedSavedId(item.id)}
                      className="block w-full p-2 pr-11 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="mb-2 text-xs text-Color-Neutral">{item.label}</div>
                      <img src={item.dataUrl} alt={item.label} className="h-14 w-full rounded bg-white object-contain" />
                    </button>
                    <button
                      aria-label={deleteLabel}
                      className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-Color-Scheme-1-Border/70 bg-white/95 text-Color-Neutral shadow-[0_8px_18px_rgba(0,0,0,0.08)] transition-[background-color,border-color,color,transform,opacity] duration-200 ease-out hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={disabled}
                      onClick={() => deleteSavedSignature(item)}
                      title={deleteLabel}
                      type="button"
                    >
                      <svg
                        aria-hidden="true"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9.25 5.75h5.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
                        <path d="M10.25 5.75 10.9 4.5h2.2l.65 1.25" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
                        <path d="M6.75 8h10.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
                        <path d="m8.25 8 .55 10.25h6.4L15.75 8" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.6" />
                        <path d="M10.75 11v4.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
                        <path d="M13.25 11v4.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <button
            type="button"
            disabled={!selectedSaved || disabled}
            onClick={() => {
              if (!selectedSaved) {
                return;
              }

              onChange(selectedSaved.dataUrl);
              setIsUsingDrawnSignature(false);
            }}
            className="rounded-md bg-Green px-3 py-2 text-xs font-medium text-Color-Neutral-Darkest disabled:cursor-not-allowed disabled:opacity-60"
          >
            Use selected signature
          </button>
        </div>
      ) : null}

      {value && mode !== "draw" ? (
        <div className="rounded-md bg-white p-3">
          <div className="mb-2 text-xs text-Color-Neutral">Current signature</div>
          <img src={value} alt="Current signature" className="h-20 w-full object-contain" />
        </div>
      ) : null}
    </div>
  );
}

function SealDropzoneField({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (nextValue: string | null) => void;
  disabled?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback(async (file: File | null) => {
    if (!file || disabled || !isAllowedNotaryAssetFile(file)) {
      return;
    }

    const dataUrl = await toDataUrlFromFile(file, {
      maxDimension: SEAL_UPLOAD_MAX_DIMENSION,
    });
    onChange(dataUrl);
  }, [disabled, onChange]);

  return (
    <div className="space-y-3 rounded-xl bg-Color-Neutral-Lightest/60 p-4">
      <div className="text-sm font-medium text-Color-Scheme-1-Text">Seal upload</div>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) {
            fileInputRef.current?.click();
          }
        }}
        onKeyDown={(event) => {
          if (!disabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0] ?? null;
          void onFile(file);
        }}
        className={`cursor-pointer rounded-lg border border-dashed px-4 py-6 text-center text-sm outline-none transition-colors ${
          isDragging ? "border-Green bg-Green/10" : "border-Color-Scheme-1-Border/40 bg-white"
        } ${disabled ? "cursor-not-allowed opacity-60" : "focus-visible:border-Color-Scheme-1-Text"}`}
      >
        {value ? (
          <div className="space-y-3">
            <img src={value} alt="Current seal" className="mx-auto h-28 w-full rounded object-contain" />
            <div className="text-xs text-Color-Neutral">Drag & drop or click to replace the seal image.</div>
            <button
              type="button"
              className="rounded-md bg-Color-Neutral-Lightest px-3 py-2 text-xs font-medium text-Color-Neutral-Darkest transition hover:bg-Color-Neutral-Lighter"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onChange(null);
              }}
            >
              Remove seal
            </button>
          </div>
        ) : (
          <>
            <div className="font-medium text-Color-Scheme-1-Text">Drag & drop your seal image</div>
            <div className="mt-1 text-xs text-Color-Neutral">PNG or JPG</div>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void onFile(file);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { showToast } = useAppToast();
  const { accessToken } = useStoredAuth();
  const user = useStoredUser();
  const isAdmin = user?.role === "admin";
  const [application, setApplication] = useState<NotaryApplication | null>(null);
  const [notaryProfile, setNotaryProfile] = useState<NotaryProfile | null>(null);
  const [adminApplications, setAdminApplications] = useState<AdminApplicationRow[]>([]);
  const [applicationForm, setApplicationForm] = useState(emptyApplicationForm);
  const [adminReviewNotes, setAdminReviewNotes] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jurisdictions, setJurisdictions] = useState<JurisdictionOption[]>([]);
  const [serviceAreaOptions, setServiceAreaOptions] = useState<SelectOption[]>([]);
  const [isLoadingServiceAreas, setIsLoadingServiceAreas] = useState(false);
  const [serviceAreaLoadFailed, setServiceAreaLoadFailed] = useState(false);
  const [hasAuthError, setHasAuthError] = useState(false);
  const [openSelectId, setOpenSelectId] = useState<"jurisdiction" | "serviceArea" | null>(null);
  const serviceAreaOptionsCacheRef = useRef(new Map<string, SelectOption[]>());

  const loadSettings = useCallback(async () => {
    if (!accessToken) {
      setHasAuthError(true);
      return;
    }

    setIsLoading(true);
    try {
      const [applicationResponse, profileResponse, adminResponse] = await Promise.all([
        fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-application`, accessToken, { cache: "no-store" }),
        fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/notary-profile`, accessToken, { cache: "no-store" }),
        isAdmin
          ? fetchWithTokenRefresh(`${notaryApiBaseUrl}/admin/notary-applications`, accessToken, { cache: "no-store" })
          : Promise.resolve(null),
      ]);

      if (applicationResponse.status === 401 || profileResponse.status === 401) {
        setHasAuthError(true);
        setErrorMessage("Session expired. Please sign in again.");
        return;
      }

      if (!applicationResponse.ok) {
        throw new Error(await readApiErrorMessage(applicationResponse, "Unable to load your notary application."));
      }
      if (!profileResponse.ok) {
        throw new Error(await readApiErrorMessage(profileResponse, "Unable to load your notary profile."));
      }
      if (adminResponse && !adminResponse.ok) {
        if (adminResponse.status === 401) {
          setHasAuthError(true);
          setErrorMessage("Session expired. Please sign in again.");
          return;
        }
        throw new Error(await readApiErrorMessage(adminResponse, "Unable to load notary applications."));
      }

      const applicationPayload = (await applicationResponse.json()) as { application: NotaryApplication | null };
      const profilePayload = (await profileResponse.json()) as { profile: NotaryProfile | null };
      const adminPayload = adminResponse ? ((await adminResponse.json()) as { applications: AdminApplicationRow[] }) : { applications: [] };
      const formSource = profilePayload.profile ?? applicationPayload.application;

      setApplication(applicationPayload.application);
      setNotaryProfile(profilePayload.profile);
      setAdminApplications(adminPayload.applications ?? []);
      setApplicationForm(
        formSource
          ? {
              jurisdiction: formSource.jurisdiction,
              serviceAreaKind: formSource.serviceAreaKind,
              serviceAreaName: formSource.serviceAreaName,
              commissionNumber: formSource.commissionNumber ?? "",
              commissionExpiresAt: toDateInputValue(formSource.commissionExpiresAt),
              signatureDataUrl: formSource.signatureDataUrl,
              sealDataUrl: formSource.sealDataUrl,
            }
          : emptyApplicationForm,
      );
      setMessage(null);
      setErrorMessage(null);
      setHasAuthError(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load settings.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, isAdmin]);

  const loadJurisdictions = useCallback(async () => {
    if (!accessToken) {
      setHasAuthError(true);
      return;
    }

    try {
      const query = new URLSearchParams({ mode: "notarize_document" }).toString();
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/rules/member-form?${query}`, accessToken, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as MemberFormJurisdictionsPayload | null;
      if (response.status === 401) {
        setHasAuthError(true);
        setErrorMessage("Session expired. Please sign in again.");
        setJurisdictions([]);
        return;
      }

      if (!response.ok || !payload?.jurisdictions) {
        throw new Error(payload?.message || "Failed to load jurisdictions");
      }

      setJurisdictions(payload.jurisdictions);
      setHasAuthError(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load jurisdictions");
      setJurisdictions([]);
    }
  }, [accessToken]);

  const loadServiceAreas = useCallback(async (jurisdictionValue: string, jurisdictionLabel?: string | null) => {
    if (!accessToken) {
      setServiceAreaOptions([]);
      setServiceAreaLoadFailed(false);
      setHasAuthError(true);
      return;
    }

    setServiceAreaLoadFailed(false);
    const stateAbbreviation =
      getStateAbbreviation(jurisdictionValue) ?? getStateAbbreviationFromLabel(jurisdictionLabel);
    if (!stateAbbreviation) {
      setServiceAreaOptions([]);
      setServiceAreaLoadFailed(true);
      return;
    }

    const stateFips = stateFipsByAbbreviation[stateAbbreviation];
    if (!stateFips) {
      setServiceAreaOptions([]);
      setServiceAreaLoadFailed(true);
      return;
    }

    const cachedOptions = serviceAreaOptionsCacheRef.current.get(stateAbbreviation);
    if (cachedOptions) {
      setServiceAreaOptions(cachedOptions);
      setServiceAreaLoadFailed(cachedOptions.length === 0);
      return;
    }

    setIsLoadingServiceAreas(true);
    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/rules/service-areas/${encodeURIComponent(jurisdictionValue)}`,
        accessToken,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as
        | { options?: Array<{ label: string; value: string }>; message?: string }
        | null;
      if (response.status === 401) {
        setHasAuthError(true);
        setErrorMessage("Session expired. Please sign in again.");
        setServiceAreaOptions([]);
        setServiceAreaLoadFailed(false);
        return;
      }

      if (!response.ok || !payload?.options) {
        throw new Error("Unable to load counties for this jurisdiction.");
      }

      const options = payload.options
        .filter((option) => option && option.value && option.label)
        .sort((a, b) => a.label.localeCompare(b.label));

      serviceAreaOptionsCacheRef.current.set(stateAbbreviation, options);
      setServiceAreaOptions(options);
      setServiceAreaLoadFailed(options.length === 0);
      setHasAuthError(false);
    } catch {
      setServiceAreaOptions([]);
      setServiceAreaLoadFailed(true);
    } finally {
      setIsLoadingServiceAreas(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadSettings();
    void loadJurisdictions();
  }, [loadSettings, loadJurisdictions]);

  useEffect(() => {
    if (!applicationForm.jurisdiction) {
      setServiceAreaOptions([]);
      setServiceAreaLoadFailed(false);
      return;
    }

    void loadServiceAreas(applicationForm.jurisdiction);
  }, [applicationForm.jurisdiction, loadServiceAreas]);

  const submitApplication = async () => {
    if (!accessToken) {
      setErrorMessage("Sign in again to submit your notary request.");
      return;
    }

    const isProfileUpdate = Boolean(notaryProfile) || application?.status === "approved";
    if (application && !isProfileUpdate) {
      setErrorMessage("A notary application has already been submitted for this account.");
      return;
    }

    if (!applicationForm.jurisdiction.trim() || !applicationForm.serviceAreaName.trim()) {
      setErrorMessage("Choose your jurisdiction and service area.");
      return;
    }

    if (!applicationForm.commissionNumber.trim() || !applicationForm.commissionExpiresAt.trim()) {
      setErrorMessage("Enter your commission number and expiration date.");
      return;
    }

    if (isDateInputBeforeToday(applicationForm.commissionExpiresAt)) {
      setErrorMessage("Commission expiration must be today or later.");
      return;
    }

    setIsSavingApplication(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const [signatureDataUrl, sealDataUrl] = await Promise.all([
        normalizeNotaryAssetDataUrl(applicationForm.signatureDataUrl, {
          maxDimension: SIGNATURE_UPLOAD_MAX_DIMENSION,
        }),
        normalizeNotaryAssetDataUrl(applicationForm.sealDataUrl, {
          maxDimension: SEAL_UPLOAD_MAX_DIMENSION,
        }),
      ]);

      if (
        signatureDataUrl !== applicationForm.signatureDataUrl ||
        sealDataUrl !== applicationForm.sealDataUrl
      ) {
        setApplicationForm((current) => ({
          ...current,
          signatureDataUrl,
          sealDataUrl,
        }));
      }

      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/users/me/${isProfileUpdate ? "notary-profile" : "notary-application"}`, accessToken, {
        method: isProfileUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdiction: applicationForm.jurisdiction.trim(),
          serviceAreaKind: applicationForm.serviceAreaKind,
          serviceAreaName: applicationForm.serviceAreaName.trim(),
          commissionNumber: applicationForm.commissionNumber.trim(),
          commissionExpiresAt: toCommissionExpirationPayload(applicationForm.commissionExpiresAt),
          signatureDataUrl,
          sealDataUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to save notary application."));
      }

      if (isProfileUpdate) {
        const payload = (await response.json()) as { profile: NotaryProfile | null };
        setNotaryProfile(payload.profile);
        setMessage("Notary profile updated.");
        showToast({
          tone: "success",
          message: "Notary profile updated.",
          durationMs: 4000,
        });
        return;
      }

      showToast({
        tone: "success",
        message: "Your request has been sent. We'll be in touch soon.",
        durationMs: 6000,
      });
      router.push("/app");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save notary application.");
    } finally {
      setIsSavingApplication(false);
    }
  };

  const reviewApplication = async (applicationId: string, decision: "approve" | "reject") => {
    if (!accessToken) {
      setErrorMessage("Sign in again to review notary applications.");
      return;
    }

    setActionId(applicationId);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/admin/notary-applications/${encodeURIComponent(applicationId)}/${decision}`,
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewNotes: adminReviewNotes.trim() || null }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to review the notary application."));
      }

      setMessage(decision === "approve" ? "Notary application approved." : "Notary application rejected.");
      setAdminReviewNotes("");
      await loadSettings();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to review the notary application.");
    } finally {
      setActionId(null);
    }
  };

  const pendingApplications = useMemo(
    () => adminApplications.filter((row) => row.status === "pending"),
    [adminApplications],
  );
  const hasSubmittedApplication = Boolean(application);
  const canEditApprovedProfile = Boolean(notaryProfile) || application?.status === "approved";
  const isProfileFormLocked = Boolean(application && !canEditApprovedProfile);
  const applicationStatusLabel = application
    ? application.status.charAt(0).toUpperCase() + application.status.slice(1)
    : null;

  const jurisdictionSelectOptions = useMemo(() => {
    return jurisdictions.map((jurisdiction) => ({
      value: jurisdiction.code,
      label: jurisdiction.label,
    }));
  }, [jurisdictions]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="text-2xl font-medium">Settings</div>
        <div className="text-sm text-Color-Neutral">
          {isAdmin
            ? "Review notary applications and manage approvals."
            : "Request notary approval from your member profile."}
        </div>
      </div>

      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div> : null}
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="max-w-4xl">
        <div className="space-y-4 rounded-2xl bg-Color-White p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-Color-Scheme-1-Text">Member profile</div>
              <div className="mt-1 text-xs text-Color-Neutral">Name, email, and phone are already captured in the member flow.</div>
            </div>
            {application ? (
              <span className="rounded-full bg-Color-Neutral-Lightest px-3 py-1 text-xs font-medium text-Color-Scheme-1-Text">
                Application: {application.status}
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-xl bg-Color-Neutral-Lightest/70 p-4 text-sm">
            <div>Name: {formatPersonName(user?.firstName ?? null, user?.lastName ?? null)}</div>
            <div>Email: {user?.email ?? "-"}</div>
            <div>Phone: {user?.phone ?? "-"}</div>
          </div>

          <div className="space-y-4 rounded-xl bg-Color-Neutral-Lightest/60 p-4">
            <div className="text-sm font-medium text-Color-Scheme-1-Text">
              {canEditApprovedProfile ? "Notary profile" : "Apply as a notary"}
            </div>
            {hasSubmittedApplication ? (
              <div className="rounded-xl bg-white p-4 text-sm text-Color-Neutral-Darkest">
                {canEditApprovedProfile
                  ? `Your notary profile is active${notaryProfile ? "" : ", but profile details still need to be saved"}.`
                  : `Your notary application has already been submitted. Current status: ${applicationStatusLabel}.`}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="State"
                value={applicationForm.jurisdiction}
                placeholder="Select a state"
                options={jurisdictionSelectOptions}
                isOpen={openSelectId === "jurisdiction"}
                disabled={isProfileFormLocked || isLoading || jurisdictionSelectOptions.length === 0}
                onOpenChange={(isOpen) => setOpenSelectId(isOpen ? "jurisdiction" : null)}
                onChange={(nextValue) => {
                  setApplicationForm((current) => ({
                    ...current,
                    jurisdiction: nextValue,
                    serviceAreaName: "",
                    serviceAreaKind: "county",
                  }));
                }}
              />

              <SelectField
                label="County or service area"
                value={applicationForm.serviceAreaName}
                placeholder={isLoadingServiceAreas ? "Loading options..." : "Select one"}
                options={serviceAreaOptions}
                isOpen={openSelectId === "serviceArea"}
                disabled={isProfileFormLocked || isLoading || isLoadingServiceAreas || !applicationForm.jurisdiction}
                onOpenChange={(isOpen) => setOpenSelectId(isOpen ? "serviceArea" : null)}
                onChange={(nextValue) => {
                  setApplicationForm((current) => ({
                    ...current,
                    serviceAreaName: nextValue,
                    serviceAreaKind: inferServiceAreaKind(nextValue),
                  }));
                }}
              />

              {applicationForm.jurisdiction && !isLoadingServiceAreas && serviceAreaLoadFailed && !hasAuthError ? (
                <div className="text-xs text-amber-700">
                  Could not load county/service-area options for this state right now. Re-select the state and try again.
                </div>
              ) : null}
            </div>

            <div className="text-xs text-Color-Neutral">
              Service area options are loaded from the US Census county dataset for the selected state.
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
                <span>Commission number</span>
                <input
                  className="h-10 rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-sm text-Color-Scheme-1-Text outline-none transition-colors focus-visible:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isProfileFormLocked || isSavingApplication || isLoading}
                  maxLength={120}
                  onChange={(event) => setApplicationForm((current) => ({ ...current, commissionNumber: event.target.value }))}
                  placeholder="State commission number"
                  value={applicationForm.commissionNumber}
                />
              </label>

              <label className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
                <span>Commission expiration</span>
                <SettingsDatePicker
                  className="h-10 rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-sm text-Color-Scheme-1-Text outline-none transition-colors focus-visible:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isProfileFormLocked || isSavingApplication || isLoading}
                  min={toLocalDateInputValue(new Date())}
                  onChange={(value) => setApplicationForm((current) => ({ ...current, commissionExpiresAt: value }))}
                  placeholder="Select expiration date"
                  value={applicationForm.commissionExpiresAt}
                />
              </label>
            </div>

            <SignatureCaptureField
              key={notaryProfile?.updatedAt ?? application?.updatedAt ?? "new-notary-signature"}
              value={applicationForm.signatureDataUrl}
              onChange={(nextValue) => setApplicationForm((current) => ({ ...current, signatureDataUrl: nextValue }))}
              disabled={isProfileFormLocked || isSavingApplication || isLoading}
            />

            <SealDropzoneField
              value={applicationForm.sealDataUrl}
              onChange={(nextValue) => setApplicationForm((current) => ({ ...current, sealDataUrl: nextValue }))}
              disabled={isProfileFormLocked || isSavingApplication || isLoading}
            />

            <button
              className="w-full rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isProfileFormLocked || isSavingApplication || isLoading}
              onClick={() => void submitApplication()}
              type="button"
            >
              {isProfileFormLocked
                ? "Application already submitted"
                : canEditApprovedProfile
                ? isSavingApplication
                  ? "Saving"
                  : "Save notary profile"
                : isSavingApplication
                ? "Submitting"
                : "Submit notary application"}
            </button>

            <div className="rounded-xl bg-Color-Neutral-Lightest/60 p-4 text-sm text-Color-Neutral-Darkest">
              Once your application is approved, you will get a notification email with further instructions.
            </div>
          </div>
        </div>
      </section>

      {isAdmin ? (
        <section className="space-y-4 rounded-2xl bg-Color-White p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-Color-Scheme-1-Text">Notary applications</div>
              <div className="mt-1 text-xs text-Color-Neutral">Approve or reject pending notary signup requests.</div>
            </div>
            <label className="block min-w-[18rem] flex-1 max-w-xl">
              <span className="text-xs font-medium uppercase tracking-wide text-Color-Neutral">Admin review note</span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                onChange={(event) => setAdminReviewNotes(event.target.value)}
                placeholder="Optional note to include with the approval or rejection"
                value={adminReviewNotes}
              />
            </label>
          </div>

          {isLoading ? <div className="text-sm text-Color-Neutral">Loading applications.</div> : null}

          {pendingApplications.length ? (
            <div className="overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
              <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.75fr)] gap-3 bg-Color-Neutral-Lightest px-4 py-3 text-xs uppercase tracking-wide text-Color-Neutral">
                <div>Member</div>
                <div>Jurisdiction</div>
                <div>Service area</div>
                <div>Commission</div>
                <div className="text-right">Actions</div>
              </div>
              <div className="divide-y divide-Color-Scheme-1-Border/15">
                {pendingApplications.map((row) => {
                  const fullName = formatPersonName(row.user?.firstName ?? null, row.user?.lastName ?? null);
                  return (
                    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.75fr)] gap-3 px-4 py-4 text-sm" key={row.id}>
                      <div className="min-w-0">
                        <div className="font-medium text-Color-Scheme-1-Text">{fullName}</div>
                        <div className="text-xs text-Color-Neutral">{row.user?.email ?? row.user?.phone ?? "No contact on file"}</div>
                      </div>
                      <div className="text-Color-Neutral-Darkest">{row.jurisdiction}</div>
                      <div className="text-Color-Neutral-Darkest">{row.serviceAreaKind} · {row.serviceAreaName}</div>
                      <div className="text-Color-Neutral-Darkest">
                        <div>{row.commissionNumber?.trim() || "Missing"}</div>
                        <div className="text-xs text-Color-Neutral">Expires {formatCommissionExpiration(row.commissionExpiresAt)}</div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="rounded-lg bg-Green px-3 py-2 text-xs font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={actionId === row.id}
                          onClick={() => void reviewApplication(row.id, "approve")}
                          type="button"
                        >
                          {actionId === row.id ? "Working" : "Approve"}
                        </button>
                        <button
                          className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2 text-xs font-medium text-Color-Neutral-Darkest transition hover:bg-Color-Neutral-Lighter disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={actionId === row.id}
                          onClick={() => void reviewApplication(row.id, "reject")}
                          type="button"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-Color-Neutral-Lightest/60 p-4 text-sm text-Color-Neutral-Darkest">
              No pending notary applications.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
