"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type DashboardDocumentRouteSource = {
  id: string;
  status: string | null;
};

type DashboardDocumentLabelSource = {
  documentType: string | null;
  documentTypeLabel?: string;
  productFlowMode?: string | null;
  selectedFamilies?: string[];
};

type DashboardAlertDocument = DashboardDocumentRouteSource & DashboardDocumentLabelSource;

type DashboardActivity = {
  action: string;
  timestamp: string;
  documentId: string | null;
  entityType: string;
  entityId: string | null;
  document?: DashboardAlertDocument;
};

type DashboardPayload = {
  activity: DashboardActivity[];
};

type DocumentListItem = DashboardDocumentRouteSource & DashboardDocumentLabelSource & {
  idn: string | null;
  principalName?: string | null;
  jurisdiction: string | null;
  createdAt: string;
};

type DocumentsPayload = {
  documents: DocumentListItem[];
};

type ActivityCopy = {
  title: string;
  detail: string;
};

type ActivityTimelineEvent = DashboardActivity & {
  key: string;
  copy: ActivityCopy;
  timestampMs: number;
  slotIndex: number;
  isLatestForDocument: boolean;
};

type ActivityTimelineDocument = DashboardAlertDocument & {
  principalName?: string | null;
};

type ActivityTimelineRow = {
  document: ActivityTimelineDocument;
  events: ActivityTimelineEvent[];
};

type ActivityTimeline = {
  rows: ActivityTimelineRow[];
  timeMarks: string[];
  eventCount: number;
  totalEventCount: number;
  hasMoreEvents: boolean;
  slotCount: number;
  timelineWidth: number;
};

type SectionIconName = "documents" | "activity";

const SectionIcon = ({ name }: { name: SectionIconName }) => {
  const commonProps = {
    className: "h-3.5 w-3.5",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "documents") {
    return (
      <svg {...commonProps}>
        <path d="M6 2h9l3 3v17H6z" />
        <path d="M14 2v5h4" />
        <path d="M9 11h6" />
        <path d="M9 15h6" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M4 12h4l2-5 4 10 2-5h4" />
    </svg>
  );
};

const SectionTitle = ({ icon, title }: { icon: SectionIconName; title: string }) => (
  <div className="inline-flex items-center gap-2 text-sm font-medium">
    <SectionIcon name={icon} />
    <span>{title}</span>
  </div>
);

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

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
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

const formatTimelineMarker = (value: number) => {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

const normalizeStatusText = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

const getStatusBadgeClass = (value: string | null) => {
  void value;
  return "bg-Color-Neutral-Lighter text-Color-Neutral-Darkest";
};

const formatReference = (value: string | null | undefined, prefix: string) => {
  if (!value) {
    return `${prefix}-N/A`;
  }

  const compact = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const sliced = compact.length >= 8 ? compact.slice(0, 8) : compact;
  return `${prefix}-${sliced}`;
};

const formatDocumentTitle = (document: DashboardDocumentLabelSource) => {
  const type =
    document.documentTypeLabel ??
    resolveFriendlyDocumentType(
      document.documentType,
      document.selectedFamilies,
      document.productFlowMode,
    );
  return type;
};

const resolveFriendlyDocumentType = (
  value: string | null | undefined,
  selectedFamilies?: string[] | null,
  productFlowMode?: string | null,
) => {
  const normalizedFamilies = (selectedFamilies ?? []).map((entry) => entry.toLowerCase());

  if (normalizedFamilies.includes("trust")) {
    return "Trust";
  }

  if (normalizedFamilies.includes("poa")) {
    return "POA";
  }

  if (normalizedFamilies.includes("idn")) {
    return "Document notarization";
  }

  const normalizedFlowMode = (productFlowMode ?? "").toLowerCase();
  if (normalizedFlowMode.includes("trust")) {
    return "Trust";
  }

  if (normalizedFlowMode.includes("poa")) {
    return "POA";
  }

  if (normalizedFlowMode.includes("idn") || normalizedFlowMode.includes("notar")) {
    return "Document notarization";
  }

  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("poa") || normalized.includes("power")) {
    return "POA";
  }

  if (normalized.includes("trust")) {
    return "Trust";
  }

  if (normalized.includes("notar") || normalized.includes("idn")) {
    return "Document notarization";
  }

  if (normalized === "generic" || normalized.includes("uploaded")) {
    return "Document";
  }

  if (normalized.length === 0) {
    return "Document";
  }

  return toTitleWords(normalized);
};

const getDocumentRouteByStatus = (document: DashboardDocumentRouteSource) => {
  const status = normalizeStatusText(document.status);

  if (status.includes("draft") || status.includes("intake")) {
    return `/app/start?documentId=${encodeURIComponent(document.id)}`;
  }

  if (status.includes("review") || status.includes("approve") || status.includes("blocked")) {
    return `/app/review?documentId=${encodeURIComponent(document.id)}`;
  }

  return `/app/sign?documentId=${encodeURIComponent(document.id)}`;
};

const makeActivityCopy = (title: string): ActivityCopy => ({
  title,
  detail: `${title}.`,
});

const activityCopyByAction: Record<string, ActivityCopy> = {
  "member.document_upload_started": makeActivityCopy("The user began creating or uploading a document"),
  "system.document_created": makeActivityCopy("A document record now exists in the workspace"),
  "member.document_upload_completed": makeActivityCopy("The uploaded document is available to work on"),
  "system.document_ready_for_review": makeActivityCopy("The document moved to a reviewable state"),
  "member.document_review_approved": makeActivityCopy("The user approved the reviewed document"),
  "system.document_idn_assigned": makeActivityCopy("The document received its registry identifier"),
  "system.document_signing_prepared": makeActivityCopy("The document is ready for signature collection"),
  "member.signature_capture_completed": makeActivityCopy("A required signer completed a signature"),
  "member.document_signatures_confirmed": makeActivityCopy("The document signature set was confirmed"),
  "system.signature_completion_workflow_applied": makeActivityCopy("Signing moved the document to its next workflow state"),
  "system.signature_completion_workflow_failed": makeActivityCopy("Something went wrong after signature capture"),
  "system.invites_issued_for_remaining_signers": makeActivityCopy("Additional signer invitations were issued"),
  "system.remaining_signer_invite_dispatch_failed": makeActivityCopy("A signer invitation could not be sent"),
  "member.signature_reminder_sent": makeActivityCopy("A pending signer was reminded"),
  "member.signature_reminder_failed": makeActivityCopy("A reminder could not be sent"),
  "member.notarization_submit_started": makeActivityCopy("The user started the notarization handoff"),
  "member.notarization_submitted": makeActivityCopy("The document entered the notary workflow"),
  "member.notary_selected": makeActivityCopy("A notary was selected for the request"),
  "notary.code_resolved": makeActivityCopy("The notary accessed the request"),
  "system.request_assigned_to_notary": makeActivityCopy("The request was assigned to a notary"),
  "notary.request_approved": makeActivityCopy("The notary approved the request"),
  "notary.request_rejected": makeActivityCopy("The notary rejected the request"),
  "notary.request_changes_requested": makeActivityCopy("The notary requested changes"),
  "notary.meeting_started": makeActivityCopy("The notary meeting began"),
  "notary.meeting_completed": makeActivityCopy("The notary meeting ended"),
  "system.meeting_no_show_recorded": makeActivityCopy("A meeting participant was marked as no-show"),
  "notary.identity_verified": makeActivityCopy("Identity verification was completed"),
  "system.notarized_document_created": makeActivityCopy("The final notarized artifact exists"),
  "system.ledger_anchor_completed": makeActivityCopy("The finalized record was anchored/registered"),
};

const getFriendlyActivity = (action: string) => {
  return activityCopyByAction[action.trim().toLowerCase()] ?? null;
};

const timelineWindowDays = 7;
const timelineSlotWidth = 220;
const timelineMinimumWidth = 860;
const activityPageSize = 20;
const activityLoadThresholdPx = 96;
const activityLoadDelayMs = 220;

const timelineBackgroundStyle = {
  backgroundImage: "radial-gradient(circle, rgba(32, 32, 32, 0.16) 1px, transparent 1px)",
  backgroundSize: "12px 12px",
};

const parseActivityTimestampMs = (value: string) => {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const getTimelineWindowStartMs = (windowEndMs: number) => {
  return windowEndMs - timelineWindowDays * 24 * 60 * 60 * 1000;
};

export default function ActivityPage() {
  const { accessToken, user } = useStoredAuth();
  const [dashboardPayload, setDashboardPayload] = useState<DashboardPayload | null>(null);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [visibleActivityLimit, setVisibleActivityLimit] = useState(activityPageSize);
  const [isActivityLoadingMore, setIsActivityLoadingMore] = useState(false);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const previousTimelineWidthRef = useRef(0);
  const hasAutoScrolledTimelineRef = useRef(false);
  const activityLoadTimeoutRef = useRef<number | null>(null);

  const loadActivity = useCallback(async () => {
    if (!accessToken) {
      setDashboardPayload(null);
      setDocuments([]);
      setSelectedDocumentId(null);
      return;
    }

    setIsLoading(true);
    try {
      const [dashboardResponse, documentsResponse] = await Promise.all([
        fetchWithTokenRefresh(`${apiBaseUrl}/dashboard`, accessToken, {
          cache: "no-store",
        }),
        fetchWithTokenRefresh(`${apiBaseUrl}/documents`, accessToken, {
          cache: "no-store",
        }),
      ]);
      const [nextDashboardPayload, documentsPayload] = await Promise.all([
        dashboardResponse.json().catch(() => null) as Promise<DashboardPayload | null>,
        documentsResponse.json().catch(() => null) as Promise<DocumentsPayload | null>,
      ]);

      if (!dashboardResponse.ok || !nextDashboardPayload || !documentsResponse.ok || !documentsPayload?.documents) {
        throw new Error("Failed to load activity.");
      }

      setDashboardPayload(nextDashboardPayload);
      setDocuments(documentsPayload.documents);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load activity.");
      setDashboardPayload(null);
      setDocuments([]);
      setSelectedDocumentId(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (documents.length === 0) {
      setSelectedDocumentId(null);
      return;
    }

    setSelectedDocumentId((currentDocumentId) => {
      if (currentDocumentId && documents.some((document) => document.id === currentDocumentId)) {
        return currentDocumentId;
      }

      const documentIdWithActivity = dashboardPayload?.activity.find((activity) => {
        return activity.documentId && documents.some((document) => document.id === activity.documentId);
      })?.documentId;

      return documentIdWithActivity ?? documents[0]?.id ?? null;
    });
  }, [dashboardPayload?.activity, documents]);

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "there";

  const documentsById = useMemo(() => {
    return new Map(documents.map((document) => [document.id, document]));
  }, [documents]);

  const selectedDocument = selectedDocumentId ? documentsById.get(selectedDocumentId) ?? null : null;

  const activityTimeline = useMemo<ActivityTimeline>(() => {
    const eventsByDocumentId = new Map<string, ActivityTimelineRow>();
    const windowEndMs = Date.now();
    const windowStartMs = getTimelineWindowStartMs(windowEndMs);
    const timelineEvents = (dashboardPayload?.activity ?? [])
      .map((item) => {
        if (!item.documentId || item.documentId !== selectedDocumentId) {
          return null;
        }

        const copy = getFriendlyActivity(item.action);
        if (!copy) {
          return null;
        }

        const timestampMs = parseActivityTimestampMs(item.timestamp);
        if (timestampMs === null) {
          return null;
        }

        if (timestampMs < windowStartMs || timestampMs > windowEndMs) {
          return null;
        }

        const document = documentsById.get(item.documentId) ?? item.document;
        if (!document) {
          return null;
        }

        return {
          ...item,
          copy,
          document,
          timestampMs,
        };
      })
      .filter((event): event is DashboardActivity & { copy: ActivityCopy; document: ActivityTimelineDocument; timestampMs: number } => event !== null)
      .sort((first, second) => second.timestampMs - first.timestampMs);

    const visibleEventsByRecency = timelineEvents.slice(0, visibleActivityLimit);
    const chronologicalEvents = [...visibleEventsByRecency].sort((first, second) => first.timestampMs - second.timestampMs);
    const latestEventKeyByDocumentId = new Map<string, string>();

    for (const event of visibleEventsByRecency) {
      if (!event.documentId || latestEventKeyByDocumentId.has(event.documentId)) {
        continue;
      }

      latestEventKeyByDocumentId.set(
        event.documentId,
        `${event.entityType}-${event.entityId ?? event.documentId ?? "global"}-${event.action}-${event.timestamp}`,
      );
      eventsByDocumentId.set(event.documentId, {
        document: event.document,
        events: [],
      });
    }

    chronologicalEvents.forEach((event, index) => {
      if (!event.documentId) {
        return;
      }

      const row = eventsByDocumentId.get(event.documentId);
      if (!row) {
        return;
      }

      const key = `${event.entityType}-${event.entityId ?? event.documentId ?? "global"}-${event.action}-${event.timestamp}`;
      row.events.push({
        ...event,
        key: `${key}-${index}`,
        slotIndex: index,
        isLatestForDocument: latestEventKeyByDocumentId.get(event.documentId) === key,
      });
    });

    const slotCount = Math.max(chronologicalEvents.length, 1);

    return {
      rows: Array.from(eventsByDocumentId.values()).filter((row) => row.events.length > 0),
      timeMarks: chronologicalEvents.map((event) => formatTimelineMarker(event.timestampMs)),
      eventCount: chronologicalEvents.length,
      totalEventCount: timelineEvents.length,
      hasMoreEvents: timelineEvents.length > chronologicalEvents.length,
      slotCount,
      timelineWidth: Math.max(timelineMinimumWidth, slotCount * timelineSlotWidth),
    };
  }, [dashboardPayload?.activity, documentsById, selectedDocumentId, visibleActivityLimit]);

  useEffect(() => {
    if (activityLoadTimeoutRef.current !== null) {
      window.clearTimeout(activityLoadTimeoutRef.current);
      activityLoadTimeoutRef.current = null;
    }

    setVisibleActivityLimit(activityPageSize);
    setIsActivityLoadingMore(false);
    hasAutoScrolledTimelineRef.current = false;
    previousTimelineWidthRef.current = 0;
  }, [dashboardPayload?.activity, selectedDocumentId]);

  useEffect(() => {
    return () => {
      if (activityLoadTimeoutRef.current !== null) {
        window.clearTimeout(activityLoadTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const element = timelineScrollRef.current;
    if (!element) {
      return;
    }

    const previousTimelineWidth = previousTimelineWidthRef.current;
    const nextTimelineWidth = activityTimeline.timelineWidth;
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);

    if (!hasAutoScrolledTimelineRef.current) {
      element.scrollLeft = maxScrollLeft;
      hasAutoScrolledTimelineRef.current = true;
    } else if (nextTimelineWidth > previousTimelineWidth && previousTimelineWidth > 0) {
      element.scrollLeft = Math.min(
        maxScrollLeft,
        element.scrollLeft + nextTimelineWidth - previousTimelineWidth,
      );
    }

    previousTimelineWidthRef.current = nextTimelineWidth;
  }, [activityTimeline.eventCount, activityTimeline.timelineWidth]);

  const handleActivityTimelineScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (
      element.scrollLeft > activityLoadThresholdPx ||
      !activityTimeline.hasMoreEvents ||
      isActivityLoadingMore ||
      activityLoadTimeoutRef.current !== null
    ) {
      return;
    }

    setIsActivityLoadingMore(true);
    activityLoadTimeoutRef.current = window.setTimeout(() => {
      setVisibleActivityLimit((currentLimit) => Math.min(
        currentLimit + activityPageSize,
        activityTimeline.totalEventCount,
      ));
      setIsActivityLoadingMore(false);
      activityLoadTimeoutRef.current = null;
    }, activityLoadDelayMs);
  }, [activityTimeline.hasMoreEvents, activityTimeline.totalEventCount, isActivityLoadingMore]);

  return (
    <div className="flex flex-col gap-6 lg:h-full lg:min-h-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-medium">Activity</div>
          <div className="text-sm text-Color-Neutral">
            Select a document to inspect its recent workflow events.
          </div>
        </div>
        {selectedDocument ? (
          <Link className="text-sm text-Color-Neutral-Darkest underline" href={getDocumentRouteByStatus(selectedDocument)}>
            Open selected document
          </Link>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-h-[420px] rounded-lg border border-Color-Scheme-1-Border/40 p-4 lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon="documents" title="Documents" />
            <div className="rounded-full bg-Color-Neutral-Lighter px-2.5 py-1 text-[11px] font-medium text-Color-Neutral-Darkest">
              {documents.length}
            </div>
          </div>
          <div className="mt-4 space-y-3 lg:max-h-full lg:overflow-y-auto lg:pr-1">
            {documents.map((document) => {
              const isSelected = document.id === selectedDocumentId;
              const documentLabel = formatDocumentTitle(document);
              const documentReference = formatReference(document.id, "DOC");

              return (
                <button
                  key={document.id}
                  type="button"
                  className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "border-Color-Neutral-Darkest/50 bg-Color-Neutral-Lighter"
                      : "border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest hover:border-Color-Neutral-Darkest/30"
                  }`}
                  onClick={() => setSelectedDocumentId(document.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-display text-sm font-medium text-Color-Scheme-1-Text">
                        {documentLabel}
                      </div>
                      <div className="mt-1 text-xs text-Color-Neutral">{documentReference}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-medium ${getStatusBadgeClass(document.status)}`}>
                      {formatStatusLabel(document.status)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-Color-Neutral">
                    <div className="truncate">Principal: {document.principalName ?? displayName}</div>
                    <div>Created {formatDateOnly(document.createdAt)}</div>
                  </div>
                </button>
              );
            })}
            {!isLoading && documents.length === 0 ? (
              <div className="rounded-md border border-dashed border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3 text-xs text-Color-Neutral">
                No documents yet.
              </div>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-[620px] min-w-0 flex-col rounded-lg border border-Color-Scheme-1-Border/40 p-4 lg:min-h-0 lg:flex-1">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle icon="activity" title="Recent activity" />
            {selectedDocument ? (
              <div className="min-w-0 truncate text-xs text-Color-Neutral">
                {formatDocumentTitle(selectedDocument)} • {formatReference(selectedDocument.id, "DOC")}
              </div>
            ) : null}
          </div>
          <div
            ref={timelineScrollRef}
            className="mt-4 max-w-full flex-1 overflow-x-auto pb-3 lg:min-h-0"
            onScroll={handleActivityTimelineScroll}
          >
            <div
              className="relative flex min-h-full flex-col overflow-visible rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/55"
              style={{ width: activityTimeline.timelineWidth, ...timelineBackgroundStyle }}
            >
              {isActivityLoadingMore ? (
                <div className="sticky left-3 top-3 z-30 h-0">
                  <div className="inline-flex -translate-y-1/2 items-center gap-2 rounded-full border border-Color-Scheme-1-Border/60 bg-Color-White px-3 py-1.5 text-[11px] font-medium text-Color-Neutral-Darkest shadow-[0_12px_28px_rgba(0,0,0,0.12)]">
                    <span className="h-3 w-3 animate-spin rounded-full border border-Color-Scheme-1-Border border-t-Color-Neutral-Darkest" />
                    Loading older activity
                  </div>
                </div>
              ) : null}
              <div className="rounded-t-lg border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest text-[11px] uppercase tracking-wide text-Color-Neutral">
                {activityTimeline.timeMarks.length > 0 ? (
                  <div
                    className="grid gap-2 px-3 py-2"
                    style={{ gridTemplateColumns: `repeat(${activityTimeline.slotCount}, minmax(${timelineSlotWidth - 24}px, 1fr))` }}
                  >
                    {activityTimeline.timeMarks.map((mark, index) => (
                      <div key={`${mark}-${index}`} className="min-w-0 truncate text-center">
                        {mark}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2">No activity</div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-center">
                {activityTimeline.rows.map((row, rowIndex) => {
                  const principalName = row.document.principalName ?? displayName;
                  const documentLabel = formatDocumentTitle(row.document);
                  const documentReference = formatReference(row.document.id, "DOC");
                  const firstEventSlotIndex = Math.min(...row.events.map((event) => event.slotIndex));
                  const lastEventSlotIndex = Math.max(...row.events.map((event) => event.slotIndex));
                  const lineStartRatio = (firstEventSlotIndex + 0.5) / activityTimeline.slotCount;
                  const lineEndRatio = (lastEventSlotIndex + 0.5) / activityTimeline.slotCount;
                  const progressLineStyle = {
                    left: `calc(0.75rem + ${lineStartRatio * 100}% - ${lineStartRatio * 1.5}rem)`,
                    right: `calc(0.75rem + ${(1 - lineEndRatio) * 100}% - ${(1 - lineEndRatio) * 1.5}rem)`,
                  };

                  return (
                    <div
                      key={row.document.id}
                      className="border-b border-Color-Scheme-1-Border/30 last:border-b-0"
                    >
                      <div
                        className="relative min-h-[104px] overflow-visible px-3 py-4"
                        aria-label={`${documentLabel} ${documentReference}`}
                      >
                        <span className="sr-only">{documentLabel} {documentReference}</span>
                        <div className="absolute top-1/2 h-px bg-Color-Scheme-1-Border/50" style={progressLineStyle} />
                        <div
                          className="relative z-10 grid min-h-[70px] items-center gap-2"
                          style={{ gridTemplateColumns: `repeat(${activityTimeline.slotCount}, minmax(${timelineSlotWidth - 24}px, 1fr))` }}
                        >
                          {row.events.map((event) => {
                            const eventTooltip = `${event.copy.detail} ${formatDateTime(event.timestamp)}. ${documentLabel} ${documentReference}. Principal: ${principalName}.`;
                            const tooltipDirectionClassName = rowIndex === 0
                              ? "top-full mt-2"
                              : "bottom-full mb-2";
                            const badgeClassName = `w-full max-w-[200px] rounded-md border px-3 py-2 text-left text-[11px] font-medium leading-snug shadow-sm transition-colors ${
                              event.isLatestForDocument
                                ? "border-Color-Neutral-Darkest/40 bg-Color-Neutral-Lighter text-Color-Neutral-Darkest hover:border-Color-Neutral-Darkest"
                                : "border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest text-Color-Neutral"
                            }`;
                            const badgeStyle = {
                              gridColumn: `${event.slotIndex + 1} / span 1`,
                            };
                            const tooltip = (
                              <div className={`pointer-events-none absolute left-1/2 z-30 hidden w-64 -translate-x-1/2 rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 py-2 text-left text-[11px] leading-relaxed text-Color-Neutral shadow-[0_14px_34px_rgba(0,0,0,0.12)] group-hover:block ${tooltipDirectionClassName}`}>
                                <div className="font-medium text-Color-Neutral-Darkest">{event.copy.title}</div>
                                <div className="mt-1">{formatDateTime(event.timestamp)}</div>
                                <div className="mt-1">{documentLabel} • {documentReference}</div>
                                <div className="mt-1">Principal: {principalName}</div>
                              </div>
                            );

                            return (
                              <Link
                                key={event.key}
                                href={getDocumentRouteByStatus(row.document)}
                                className={`group relative flex min-w-0 justify-center ${event.isLatestForDocument ? "z-20" : "z-10"}`}
                                style={badgeStyle}
                                aria-label={eventTooltip}
                              >
                                <span className={badgeClassName}>{event.copy.title}</span>
                                {tooltip}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {activityTimeline.rows.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-Color-Neutral">
                    {selectedDocument ? "No recent activity for this document yet." : "Select a document to view recent activity."}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm text-Color-Neutral">
          Loading activity.
        </div>
      ) : null}
    </div>
  );
}