"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type SigningRequestDirection = "incoming" | "outgoing";

type SigningRequestCard = {
  id: string;
  inviteId: string;
  direction: SigningRequestDirection;
  documentId: string;
  documentLabel: string;
  documentTypeLabel: string;
  signerName: string | null;
  signerEmail: string | null;
  signerPhone: string | null;
  senderName: string | null;
  senderEmail: string | null;
  roleLabel: string;
  status: string;
  sentAt: string | null;
  updatedAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;
  resendCount: number;
  actionHref: string | null;
  actionLabel: string;
  detail: string;
};

type RequestsPayload = {
  incoming?: SigningRequestCard[];
  outgoing?: SigningRequestCard[];
};

type RequestFilters = {
  query: string;
  status: string;
  role: string;
  activity: string;
};

type FilterOption = {
  label: string;
  value: string;
};

type CardIconName = "arrow" | "bell" | "check" | "click" | "document" | "email" | "eye" | "filter" | "person" | "phone" | "search" | "send" | "time" | "x";

const searchInputClass = "h-9 w-full rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-xs text-Color-Scheme-1-Text outline-none transition-colors placeholder:text-Color-Neutral focus-visible:border-Color-Scheme-1-Text";

const activityFilterOptions = [
  { value: "", label: "All activity" },
  { value: "needs_signature", label: "Needs my signature" },
  { value: "waiting", label: "Waiting on signer" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "completed", label: "Completed" },
];

const CardIcon = ({ name, className = "h-3.5 w-3.5 shrink-0" }: { name: CardIconName; className?: string }) => {
  const commonProps = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "bell") {
    return <svg {...commonProps}><path d="M15 17H9" /><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
  }

  if (name === "check") {
    return <svg {...commonProps}><path d="M20 6 9 17l-5-5" /></svg>;
  }

  if (name === "click") {
    return <svg {...commonProps}><path d="M10 4 3 21l7-4 4 4 3-3-4-4 8-4Z" /></svg>;
  }

  if (name === "document") {
    return <svg {...commonProps}><path d="M6 2h9l3 3v17H6z" /><path d="M14 2v5h4" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>;
  }

  if (name === "email") {
    return <svg {...commonProps}><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></svg>;
  }

  if (name === "eye") {
    return <svg {...commonProps}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
  }

  if (name === "filter") {
    return <svg {...commonProps}><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /></svg>;
  }

  if (name === "person") {
    return <svg {...commonProps}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
  }

  if (name === "phone") {
    return <svg {...commonProps}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" /></svg>;
  }

  if (name === "search") {
    return <svg {...commonProps}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  }

  if (name === "send") {
    return <svg {...commonProps}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>;
  }

  if (name === "time") {
    return <svg {...commonProps}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  }

  if (name === "x") {
    return <svg {...commonProps}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
  }

  return <svg {...commonProps}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
};

const SelectFilterControl = ({
  label,
  value,
  placeholder,
  options,
  isOpen,
  onChange,
  onOpenChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: FilterOption[];
  isOpen: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const selectedOption = options.find((option) => option.value === value);

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

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const portalTarget = typeof document === "undefined" ? null : document.body;
  const selectPopover =
    isOpen && popoverPosition && portalTarget
      ? createPortal(
          <div
            className="fixed z-[100] max-h-72 w-72 overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-2 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
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
                  {isSelected ? <CardIcon name="check" className="h-3 w-3" /> : null}
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
        className="flex h-9 w-full items-center justify-between rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-left text-xs text-Color-Scheme-1-Text outline-none transition-colors hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) {
            updatePopoverPosition();
          }
          onOpenChange(!isOpen);
        }}
      >
        <span className={selectedOption ? undefined : "text-Color-Neutral"}>{selectedOption?.label ?? placeholder}</span>
        <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 border-b border-r border-Color-Neutral" />
      </button>
      {selectPopover}
    </div>
  );
};

const fetchWithTokenRefresh = async (
  url: string,
  accessToken: string,
  init?: RequestInit,
) => {
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

const formatDateOnly = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const toTitleWords = (value: string) => {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
};

const formatStatusLabel = (value: string | null) => {
  if (!value || value.trim().length === 0) {
    return "Unknown";
  }

  return toTitleWords(value);
};

const normalizeFilterText = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getSearchDigits = (value: string) => value.replace(/\D/g, "");

const formatFriendlyDocumentLabel = (value: string | null | undefined) => {
  const rawValue = value?.trim() ?? "";
  if (!rawValue) {
    return "";
  }

  const normalized = rawValue.toLowerCase();
  if (normalized.includes("intake")) {
    if (normalized.includes("trust")) {
      return "Trust registration";
    }

    if (normalized.includes("poa") || normalized.includes("power")) {
      return "Power of attorney";
    }

    if (normalized.includes("notar") || normalized.includes("idn")) {
      return "Document notarization";
    }

    return "Document package";
  }

  return toTitleWords(rawValue);
};

const formatReference = (value: string, prefix: string) => {
  const compact = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const sliced = compact.length >= 8 ? compact.slice(0, 8) : compact;
  return `${prefix}-${sliced}`;
};

const formatRequestDocumentTitle = (item: SigningRequestCard) => {
  return formatFriendlyDocumentLabel(item.documentTypeLabel) || formatFriendlyDocumentLabel(item.documentLabel) || "Document";
};

const getStatusBadgeClass = (value: string) => {
  const normalized = value.trim().toLowerCase();

  if (["completed", "accepted"].includes(normalized)) {
    return "bg-Color-Neutral-Lighter text-Color-Neutral-Darkest";
  }

  if (["declined", "revoked", "expired", "failed"].includes(normalized)) {
    return "bg-red-50 text-red-700";
  }

  return "bg-Color-Neutral-Lighter text-Color-Neutral-Darkest";
};

const getRequestCardMeta = (item: SigningRequestCard) => {
  if (item.direction === "incoming") {
    return [
      { icon: "person" as const, text: `From: ${item.senderName ?? item.senderEmail ?? "DARCi"}` },
      { icon: "document" as const, text: `Role: ${item.roleLabel}` },
      { icon: "time" as const, text: `Updated ${formatDateOnly(item.updatedAt)}` },
    ];
  }

  return [
    { icon: "person" as const, text: `Signer: ${item.signerName ?? item.signerEmail ?? "Pending signer"}` },
    { icon: "document" as const, text: `Role: ${item.roleLabel}` },
    { icon: "time" as const, text: `Sent ${formatDateOnly(item.sentAt ?? item.updatedAt)}` },
  ];
};

const getLaneEmptyCopy = (direction: SigningRequestDirection) => {
  if (direction === "incoming") {
    return "No documents are waiting for your signature.";
  }

  return "No sent signature requests yet.";
};

const terminalStatuses = new Set(["completed", "declined", "revoked", "expired", "failed"]);
const reminderBlockedStatuses = new Set(["completed", "declined", "revoked"]);

const isOpenRequest = (item: SigningRequestCard) => !terminalStatuses.has(item.status.trim().toLowerCase());

const canSendReminderForRequest = (item: SigningRequestCard) => {
  return item.direction === "outgoing" && !reminderBlockedStatuses.has(item.status.trim().toLowerCase()) && Boolean(item.signerEmail);
};

const getRequestSearchText = (item: SigningRequestCard) => {
  return [
    item.documentId,
    item.documentLabel,
    item.documentTypeLabel,
    item.signerName,
    item.signerEmail,
    item.signerPhone,
    item.senderName,
    item.senderEmail,
    item.roleLabel,
    item.status,
    item.detail,
  ].filter(Boolean).join(" ").toLowerCase();
};

const matchesRequestFilters = (item: SigningRequestCard, filters: RequestFilters) => {
  const query = normalizeFilterText(filters.query);
  if (query) {
    const haystack = getRequestSearchText(item);
    const haystackDigits = getSearchDigits(haystack);
    const queryDigits = getSearchDigits(query);
    const queryTokens = query.split(/\s+/).filter(Boolean);
    const textMatches = queryTokens.every((token) => haystack.includes(token));
    const digitMatches = queryDigits.length > 0 && haystackDigits.includes(queryDigits);

    if (!textMatches && !digitMatches) {
      return false;
    }
  }

  if (filters.status && normalizeFilterText(item.status) !== filters.status) {
    return false;
  }

  if (filters.role && normalizeFilterText(item.roleLabel) !== filters.role) {
    return false;
  }

  if (filters.activity === "needs_signature" && !(item.direction === "incoming" && item.actionHref && isOpenRequest(item))) {
    return false;
  }

  if (filters.activity === "waiting" && !(item.direction === "outgoing" && isOpenRequest(item))) {
    return false;
  }

  if (filters.activity === "opened" && !item.firstOpenedAt) {
    return false;
  }

  if (filters.activity === "clicked" && !item.firstClickedAt) {
    return false;
  }

  if (filters.activity === "completed" && normalizeFilterText(item.status) !== "completed") {
    return false;
  }

  return true;
};

const RequestCard = ({
  item,
  resendState,
  onSendReminder,
}: {
  item: SigningRequestCard;
  resendState?: "sending" | "sent" | "error";
  onSendReminder: (item: SigningRequestCard) => void;
}) => {
  const router = useRouter();
  const canOpenCard = Boolean(item.actionHref);
  const canSendReminder = canSendReminderForRequest(item);

  const openCard = () => {
    if (item.actionHref) {
      router.push(item.actionHref);
    }
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!canOpenCard || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    openCard();
  };

  const handleReminderClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onSendReminder(item);
  };

  return (
    <article
      className={`relative min-h-[214px] rounded-xl border border-Color-Scheme-1-Border px-5 py-5 text-left transition-[border-color,transform] duration-200 ease-out ${canOpenCard ? "cursor-pointer hover:-translate-y-0.5 hover:border-Color-Scheme-1-Text" : "bg-Color-Neutral-Lightest/60"}`}
      role={canOpenCard ? "link" : undefined}
      tabIndex={canOpenCard ? 0 : undefined}
      onClick={canOpenCard ? openCard : undefined}
      onKeyDown={handleCardKeyDown}
      aria-label={canOpenCard ? `Open ${formatRequestDocumentTitle(item)} ${formatReference(item.documentId, "DOC")}` : undefined}
    >
      <div className="pr-24 font-display text-sm font-medium text-Color-Scheme-1-Text">
        {formatRequestDocumentTitle(item)}
      </div>
      <span className={`absolute right-4 top-4 rounded-full px-2.5 py-1 text-[11px] font-medium ${getStatusBadgeClass(item.status)}`}>
        {formatStatusLabel(item.status)}
      </span>
      <div className="mt-2 text-xs leading-relaxed text-Color-Neutral">
        {item.detail}
      </div>
      <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-Color-Neutral">
        {getRequestCardMeta(item).map((entry) => (
          <div key={entry.text} className="flex items-center gap-1.5">
            <CardIcon name={entry.icon} />
            <span>{entry.text}</span>
          </div>
        ))}
        {item.signerEmail ? (
          <div className="flex items-center gap-1.5">
            <CardIcon name="email" />
            <span>{item.signerEmail}</span>
          </div>
        ) : null}
        {item.signerPhone ? (
          <div className="flex items-center gap-1.5">
            <CardIcon name="phone" />
            <span>{item.signerPhone}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <CardIcon name="document" />
          <span>{formatReference(item.documentId, "DOC")}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-Color-Neutral">
        {item.firstOpenedAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-Color-Neutral-Lightest px-2 py-1">
            <CardIcon name="eye" /> Opened {formatDateOnly(item.firstOpenedAt)}
          </span>
        ) : null}
        {item.firstClickedAt ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-Color-Neutral-Lightest px-2 py-1">
            <CardIcon name="click" /> Clicked {formatDateOnly(item.firstClickedAt)}
          </span>
        ) : null}
        {item.resendCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-Color-Neutral-Lightest px-2 py-1">
            <CardIcon name="bell" /> {item.resendCount} reminder{item.resendCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-Color-Scheme-1-Text">
          <CardIcon name="arrow" />
          <span>{canOpenCard ? "Open document" : item.actionLabel}</span>
        </div>
        {item.direction === "outgoing" ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canSendReminder || resendState === "sending"}
            onClick={handleReminderClick}
          >
            <CardIcon name={resendState === "sent" ? "check" : "send"} />
            <span>{resendState === "sending" ? "Sending..." : resendState === "sent" ? "Reminder sent" : "Send reminder"}</span>
          </button>
        ) : null}
      </div>
      {resendState === "error" ? (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Reminder could not be sent.
        </div>
      ) : null}
    </article>
  );
};

const RequestLane = ({
  title,
  description,
  direction,
  requests,
  hasActiveFilters,
  resendStates,
  onSendReminder,
}: {
  title: string;
  description: string;
  direction: SigningRequestDirection;
  requests: SigningRequestCard[];
  hasActiveFilters: boolean;
  resendStates: Record<string, "sending" | "sent" | "error">;
  onSendReminder: (item: SigningRequestCard) => void;
}) => {
  const openCount = requests.filter(isOpenRequest).length;

  return (
    <section className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs leading-relaxed text-Color-Neutral">{description}</div>
        </div>
        <div className="rounded-full bg-Color-Neutral-Lighter px-2.5 py-1 text-[11px] font-medium text-Color-Neutral-Darkest">
          {openCount} open
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {requests.map((item) => (
          <RequestCard
            key={item.id}
            item={item}
            resendState={resendStates[item.inviteId]}
            onSendReminder={onSendReminder}
          />
        ))}
      </div>
      {requests.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-xs text-Color-Neutral">
          {hasActiveFilters ? "No requests match these filters." : getLaneEmptyCopy(direction)}
        </div>
      ) : null}
    </section>
  );
};

export default function RequestsPage() {
  const { accessToken } = useStoredAuth();
  const [incomingRequests, setIncomingRequests] = useState<SigningRequestCard[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<SigningRequestCard[]>([]);
  const [filters, setFilters] = useState<RequestFilters>({ query: "", status: "", role: "", activity: "" });
  const [openFilterId, setOpenFilterId] = useState<"status" | "role" | "activity" | null>(null);
  const [resendStates, setResendStates] = useState<Record<string, "sending" | "sent" | "error">>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!accessToken) {
      setIncomingRequests([]);
      setOutgoingRequests([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${apiBaseUrl}/requests/signing?limit=60`, accessToken, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as RequestsPayload | null;

      if (!response.ok) {
        throw new Error("Failed to load requests.");
      }

      setIncomingRequests(payload?.incoming ?? []);
      setOutgoingRequests(payload?.outgoing ?? []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load requests.");
      setIncomingRequests([]);
      setOutgoingRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const allRequests = useMemo(() => [...incomingRequests, ...outgoingRequests], [incomingRequests, outgoingRequests]);

  const statusOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of allRequests) {
      const value = normalizeFilterText(item.status);
      if (value) {
        options.set(value, formatStatusLabel(item.status));
      }
    }

    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [allRequests]);

  const roleOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const item of allRequests) {
      const value = normalizeFilterText(item.roleLabel);
      if (value) {
        options.set(value, item.roleLabel);
      }
    }

    return [...options.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }, [allRequests]);

  const filteredIncomingRequests = useMemo(
    () => incomingRequests.filter((item) => matchesRequestFilters(item, filters)),
    [incomingRequests, filters],
  );

  const filteredOutgoingRequests = useMemo(
    () => outgoingRequests.filter((item) => matchesRequestFilters(item, filters)),
    [outgoingRequests, filters],
  );

  const hasActiveFilters = Boolean(filters.query.trim() || filters.status || filters.role || filters.activity);
  const searchQuery = filters.query.trim();
  const visibleRequestCount = filteredIncomingRequests.length + filteredOutgoingRequests.length;

  const requestStats = useMemo(() => {
    const visibleRequests = [...filteredIncomingRequests, ...filteredOutgoingRequests];
    const needsSignature = filteredIncomingRequests.filter((item) => item.actionHref && isOpenRequest(item)).length;
    const waitingOnOthers = filteredOutgoingRequests.filter(isOpenRequest).length;

    return [
      { key: "showing", label: "Showing", value: `${visibleRequests.length}/${allRequests.length}` },
      { key: "needs-signature", label: "Needs my signature", value: needsSignature },
      { key: "waiting", label: "Waiting on others", value: waitingOnOthers },
    ];
  }, [allRequests.length, filteredIncomingRequests, filteredOutgoingRequests]);

  const updateFilter = (key: keyof RequestFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ query: "", status: "", role: "", activity: "" });
    setOpenFilterId(null);
  };

  const sendReminder = useCallback(async (item: SigningRequestCard) => {
    if (!accessToken || !canSendReminderForRequest(item)) {
      return;
    }

    setResendStates((current) => ({ ...current, [item.inviteId]: "sending" }));
    try {
      const response = await fetchWithTokenRefresh(`${apiBaseUrl}/invites/${item.inviteId}/resend`, accessToken, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      if (!response.ok) {
        throw new Error("Failed to send reminder.");
      }

      setResendStates((current) => ({ ...current, [item.inviteId]: "sent" }));
      void loadRequests();
    } catch {
      setResendStates((current) => ({ ...current, [item.inviteId]: "error" }));
    }
  }, [accessToken, loadRequests]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-medium">Signature requests</div>
          <div className="text-sm text-Color-Neutral">
            Incoming and outgoing document signature work.
          </div>
        </div>
        <div className="grid min-w-[320px] grid-cols-3 overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest text-sm">
          {requestStats.map((metric, index) => (
            <div
              key={metric.key}
              className={`${index < requestStats.length - 1 ? "border-r border-Color-Scheme-1-Border/40" : ""} px-3 py-2`}
            >
              <div className="text-xs text-Color-Neutral">{metric.label}</div>
              <div className="mt-1 font-medium">{metric.value}</div>
            </div>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/70">
        <div className="relative z-20 grid gap-4 overflow-visible border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/45 p-4 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto]">
          <label className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
            <span>Search</span>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-Color-Neutral">
                <CardIcon name="search" />
              </span>
              <input
                className={`${searchInputClass} pl-9`}
                value={filters.query}
                onChange={(event) => updateFilter("query", event.target.value)}
                placeholder="Names, emails, phone numbers, document IDs"
              />
            </div>
          </label>
          <SelectFilterControl
            label="Status"
            value={filters.status}
            placeholder="All statuses"
            isOpen={openFilterId === "status"}
            options={[
              { label: "All statuses", value: "" },
              ...statusOptions.map(([value, label]) => ({ label, value })),
            ]}
            onChange={(value) => updateFilter("status", value)}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "status" : null)}
          />
          <SelectFilterControl
            label="Role"
            value={filters.role}
            placeholder="All roles"
            isOpen={openFilterId === "role"}
            options={[
              { label: "All roles", value: "" },
              ...roleOptions.map(([value, label]) => ({ label, value })),
            ]}
            onChange={(value) => updateFilter("role", value)}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "role" : null)}
          />
          <SelectFilterControl
            label="Activity"
            value={filters.activity}
            placeholder="All activity"
            isOpen={openFilterId === "activity"}
            options={activityFilterOptions}
            onChange={(value) => updateFilter("activity", value)}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "activity" : null)}
          />
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasActiveFilters}
              onClick={clearFilters}
            >
              <CardIcon name="x" />
              <span>Clear</span>
            </button>
          </div>
        </div>
        {searchQuery ? (
          <div className="bg-Color-Neutral-Lightest/80 px-4 py-3 text-xs font-medium text-Color-Neutral-Darkest">
            Displaying results for "{searchQuery}"... {visibleRequestCount} request{visibleRequestCount === 1 ? "" : "s"} found.
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <RequestLane
          title="Inbox"
          description="Documents where another party is waiting on your signature."
          direction="incoming"
          requests={filteredIncomingRequests}
          hasActiveFilters={hasActiveFilters}
          resendStates={resendStates}
          onSendReminder={sendReminder}
        />
        <RequestLane
          title="Sent"
          description="Documents waiting on signers you invited."
          direction="outgoing"
          requests={filteredOutgoingRequests}
          hasActiveFilters={hasActiveFilters}
          resendStates={resendStates}
          onSendReminder={sendReminder}
        />
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm text-Color-Neutral">
          Loading signature requests.
        </div>
      ) : null}
    </div>
  );
}
