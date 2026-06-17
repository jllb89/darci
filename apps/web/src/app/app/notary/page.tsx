"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useStoredAuth } from "@/lib/auth";
import {
  requestRealtimeBroadcastEvent,
  useRequestRealtimeInvalidation,
  type RequestRealtimeTarget,
} from "@/lib/requestRealtime";
import {
  fetchWithTokenRefresh,
  formatDateTime,
  formatStatusLabel,
  notaryApiBaseUrl,
  readApiErrorMessage,
  type NotaryQueueRequestSummary,
  type NotaryQueueResponse,
} from "@/lib/notaryWorkspace";

type QueueTab = "review" | "in_review" | "ready" | "completed";

const tabs: QueueTab[] = ["review", "in_review", "ready", "completed"];

const emptyQueue: NotaryQueueResponse = {
  requests: [],
  meetings: [],
  counts: {
    pending: 0,
    scheduled: 0,
    completed: 0,
    total: 0,
  },
};

const tabLabels: Record<QueueTab, string> = {
  review: "Review requests",
  in_review: "In-review",
  ready: "Ready for in-person session",
  completed: "Completed",
};

const tabEmptyCopy: Record<QueueTab, string> = {
  review: "No review requests.",
  in_review: "No requests currently in review.",
  ready: "No requests are ready for in-person session.",
  completed: "No completed requests yet.",
};

const resolveQueueStatus = (request: NotaryQueueRequestSummary) => {
  return request.request.queueStatus ?? request.workflow?.latestStatus ?? request.workflow?.status ?? request.request.status;
};

const isSelectedNotaryRequest = (request: NotaryQueueRequestSummary) => {
  return Boolean(request.workflow?.selectedNotaryUserId && !request.workflow?.assignedNotaryUserId);
};

const isOpenMeetingRequest = (request: NotaryQueueRequestSummary) => {
  return Boolean(
    request.meeting && !["completed", "cancelled", "canceled", "no_show"].includes(request.meeting.status ?? ""),
  );
};

const splitRequests = (requests: NotaryQueueRequestSummary[]) => {
  return {
    review: requests.filter((request) => {
      const status = resolveQueueStatus(request);
      return status === "pending" || status === "submitted" || status === "code_delivered";
    }),
    in_review: requests.filter((request) => resolveQueueStatus(request) === "in_review"),
    ready: requests.filter((request) => resolveQueueStatus(request) === "approved" || isOpenMeetingRequest(request)),
    completed: requests.filter((request) => {
      const status = resolveQueueStatus(request);
      return status === "completed" || request.document.summary.finalization.isAnchored;
    }),
  } satisfies Record<QueueTab, NotaryQueueRequestSummary[]>;
};

function RequestRow({ request }: { request: NotaryQueueRequestSummary }) {
  const memberName = request.owner?.displayName ?? request.owner?.email ?? "Member pending";
  const queueStatus = resolveQueueStatus(request);
  const rowStatus = formatStatusLabel(queueStatus);
  const showSelectedBadge = isSelectedNotaryRequest(request);
  const meetingStatus = request.meeting?.status ? formatStatusLabel(request.meeting.status) : "No meeting";
  const finalizationStatus = formatStatusLabel(request.finalization.latestStatus);
  const nextAction = request.nextAction ? formatStatusLabel(request.nextAction) : null;

  return (
    <Link
      className="grid gap-3 px-3 py-4 text-sm transition hover:bg-Color-Neutral-Lightest lg:grid-cols-[minmax(0,1fr)_minmax(10rem,0.5fr)_minmax(12rem,0.7fr)]"
      href={`/app/notary/requests/${encodeURIComponent(request.request.id)}`}
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-Color-Scheme-1-Text">{memberName}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-Color-Neutral-Lightest px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-Color-Neutral-Darkest">
            {rowStatus}
          </span>
          {showSelectedBadge ? (
            <span className="inline-flex rounded-full border border-Color-Scheme-1-Border/60 bg-Color-White px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-Color-Scheme-1-Text">
              Selected
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-Color-Neutral">
          <span>{meetingStatus}</span>
          <span>{finalizationStatus}</span>
          {nextAction ? <span>{nextAction}</span> : null}
        </div>
      </div>
      <div className="min-w-0 lg:text-right">
        <div className="truncate font-mono font-medium text-Color-Scheme-1-Text">{request.document.idn ?? "Pending"}</div>
        <div className="mt-1 text-xs text-Color-Neutral">{formatStatusLabel(request.document.documentType)}</div>
      </div>
      <div className="min-w-0 lg:text-right">
        <div className="truncate text-xs text-Color-Neutral">Submitted {formatDateTime(request.request.submittedAt)}</div>
        <div className="mt-1 truncate text-xs text-Color-Neutral">Anchored {formatDateTime(request.finalization.anchoredAt)}</div>
      </div>
    </Link>
  );
}

export default function NotaryHomePage() {
  const { accessToken, refreshToken } = useStoredAuth();
  const [queue, setQueue] = useState<NotaryQueueResponse>(emptyQueue);
  const [activeTab, setActiveTab] = useState<QueueTab>("review");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    if (!accessToken) {
      setQueue(emptyQueue);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/notary/requests?limit=80`, accessToken, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load notary queue."));
      }

      setQueue((await response.json()) as NotaryQueueResponse);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load notary queue.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const realtimeTargets: RequestRealtimeTarget[] = [
    { table: "notarization_requests" },
    { table: "illuminotarization_workflows" },
    { table: "workflow_status_history" },
    { table: "meetings" },
    { table: "meeting_participants" },
    { table: "finalization_status_history" },
    { table: "document_hash_records" },
    { table: "ledger_anchor_attempts" },
  ];

  const realtimeState = useRequestRealtimeInvalidation({
    enabled: Boolean(accessToken),
    accessToken,
    refreshToken,
    channelName: "notary-queue",
    targets: realtimeTargets,
    broadcastTargets: [{ event: requestRealtimeBroadcastEvent, private: true }],
    tableChangeTargetsEnabled: false,
    onInvalidate: loadQueue,
    pollIntervalMs: 45_000,
  });

  const requestsByTab = splitRequests(queue.requests);
  const visibleRequests = requestsByTab[activeTab];
  const showRealtimeFallbackNotice = realtimeState.status === "degraded" && realtimeState.isPollingFallbackActive;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-medium">Notary</div>
          <div className="text-sm text-Color-Neutral">Review signed documents assigned to you.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-lg border border-Color-Scheme-1-Border/60 px-4 py-2 text-sm font-medium text-Color-Scheme-1-Text transition hover:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={() => void loadQueue()}
            type="button"
          >
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {showRealtimeFallbackNotice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Live queue updates are reconnecting. Automatic refresh is on.
        </div>
      ) : null}

      <section className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 rounded-xl bg-Color-Neutral-Lighter/70 p-1 text-sm">
            {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                className={`rounded-lg px-3 py-2 font-medium transition ${
                  isActive ? "bg-Color-White text-Color-Scheme-1-Text shadow-sm" : "text-Color-Neutral hover:text-Color-Scheme-1-Text"
                }`}
                key={tab}
                onClick={() => setActiveTab(tab)}
                type="button"
              >
                {tabLabels[tab]} ({requestsByTab[tab].length})
              </button>
            );
          })}
          </div>
        </div>

        {visibleRequests.length ? (
          <div className="bg-Color-White">
            <div className="grid gap-3 px-3 py-2 text-xs uppercase tracking-wide text-Color-Neutral lg:grid-cols-[minmax(0,1fr)_minmax(10rem,0.5fr)_minmax(12rem,0.7fr)]">
              <div>Name</div>
              <div className="lg:text-right">IDN</div>
              <div className="lg:text-right">Activity</div>
            </div>
            <div className="divide-y divide-Color-Scheme-1-Border/20">
              {visibleRequests.map((request) => (
                <RequestRow key={request.request.id} request={request} />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-Color-White px-3 py-8 text-Color-Neutral">
            {tabEmptyCopy[activeTab]}
          </div>
        )}
      </section>
    </div>
  );
}