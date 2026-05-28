"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStoredAuth } from "@/lib/auth";
import {
  fetchWithTokenRefresh,
  formatDateTime,
  formatStatusLabel,
  notaryApiBaseUrl,
  readApiErrorMessage,
  type NotaryQueueRequestSummary,
  type NotaryQueueResponse,
} from "@/lib/notaryWorkspace";

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

const resolveQueueStatus = (request: NotaryQueueRequestSummary) => {
  return request.request.queueStatus ?? request.workflow?.latestStatus ?? request.workflow?.status ?? request.request.status;
};

const isHistoryItem = (request: NotaryQueueRequestSummary) => {
  const queueStatus = resolveQueueStatus(request);
  const meetingStatus = request.meeting?.status ?? null;

  return (
    queueStatus === "completed" ||
    queueStatus === "rejected" ||
    queueStatus === "cancelled" ||
    queueStatus === "canceled" ||
    request.document.summary.finalization.isAnchored ||
    meetingStatus === "completed" ||
    meetingStatus === "cancelled" ||
    meetingStatus === "no_show"
  );
};

const getHistoryTimestamp = (request: NotaryQueueRequestSummary) => {
  return (
    request.finalization.latestStatusAt ??
    request.workflow?.closedAt ??
    request.meeting?.scheduledAt ??
    request.request.submittedAt ??
    null
  );
};

const getLifecycleLabel = (request: NotaryQueueRequestSummary) => {
  const queueStatus = resolveQueueStatus(request);
  const meetingStatus = request.meeting?.status ?? null;

  if (request.document.summary.finalization.isAnchored) {
    return "Anchored";
  }

  if (meetingStatus === "no_show") {
    return "No-show";
  }

  if (queueStatus === "rejected") {
    return "Rejected";
  }

  if (queueStatus === "cancelled" || queueStatus === "canceled") {
    return "Cancelled";
  }

  if (queueStatus === "completed" || meetingStatus === "completed") {
    return "Completed";
  }

  return formatStatusLabel(queueStatus);
};

const getLifecycleBadgeClassName = (label: string) => {
  if (label === "Anchored" || label === "Completed") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (label === "Rejected" || label === "Cancelled" || label === "No-show") {
    return "bg-rose-100 text-rose-800";
  }

  return "bg-Color-Neutral-Lightest text-Color-Neutral-Darkest";
};

const getFinalizationLabel = (request: NotaryQueueRequestSummary) => {
  if (request.document.summary.finalization.isAnchored) {
    return "Ledger anchored";
  }

  return formatStatusLabel(request.finalization.latestStatus ?? "pending");
};

const getFinalizationBadgeClassName = (label: string) => {
  if (label === "Ledger anchored") {
    return "bg-emerald-100 text-emerald-800";
  }

  if (label === "Failed") {
    return "bg-rose-100 text-rose-800";
  }

  if (label === "Pending") {
    return "bg-amber-100 text-amber-800";
  }

  return "bg-Color-Neutral-Lightest text-Color-Neutral-Darkest";
};

export default function NotaryHistoryPage() {
  const { accessToken } = useStoredAuth();
  const [queue, setQueue] = useState<NotaryQueueResponse>(emptyQueue);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!accessToken) {
      setQueue(emptyQueue);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/notary/requests?limit=120`, accessToken, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load notary history."));
      }

      setQueue((await response.json()) as NotaryQueueResponse);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load notary history.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const historyRequests = useMemo(() => {
    return queue.requests
      .filter(isHistoryItem)
      .sort((left, right) => {
        const leftTime = getHistoryTimestamp(left);
        const rightTime = getHistoryTimestamp(right);
        const leftValue = leftTime ? new Date(leftTime).getTime() : 0;
        const rightValue = rightTime ? new Date(rightTime).getTime() : 0;
        return rightValue - leftValue;
      });
  }, [queue.requests]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-medium">Notary history</div>
            <span className="rounded-full bg-Color-Neutral-Lightest px-2.5 py-1 text-xs font-medium text-Color-Neutral-Darkest">
              {historyRequests.length}
            </span>
          </div>
          <div className="text-sm text-Color-Neutral">Completed and closed requests handled in your notary workspace.</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="rounded-lg border border-Color-Scheme-1-Border/60 px-4 py-2 text-sm font-medium text-Color-Scheme-1-Text transition hover:border-Color-Scheme-1-Text"
            href="/app/settings"
          >
            Settings
          </Link>
          <button
            className="rounded-lg border border-Color-Scheme-1-Border/60 px-4 py-2 text-sm font-medium text-Color-Scheme-1-Text transition hover:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={() => void loadHistory()}
            type="button"
          >
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {historyRequests.length ? (
        <div className="overflow-hidden rounded-xl bg-Color-White shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <div className="hidden gap-3 px-4 py-3 text-xs uppercase tracking-wide text-Color-Neutral sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.65fr)_minmax(8rem,0.8fr)_minmax(9rem,0.8fr)]">
            <div>Member / IDN</div>
            <div>Status</div>
            <div>Finalization</div>
            <div className="sm:text-right">Last update</div>
          </div>
          <div className="divide-y divide-Color-Scheme-1-Border/20">
            {historyRequests.map((request) => {
              const memberName = request.owner?.displayName ?? request.owner?.email ?? "Member pending";
              const lifecycleLabel = getLifecycleLabel(request);
              const finalizationLabel = getFinalizationLabel(request);

              return (
                <Link
                  className="grid grid-cols-2 gap-3 px-4 py-4 text-sm transition hover:bg-Color-Neutral-Lightest sm:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.65fr)_minmax(8rem,0.8fr)_minmax(9rem,0.8fr)]"
                  href={`/app/notary/requests/${encodeURIComponent(request.request.id)}`}
                  key={request.request.id}
                >
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <div className="truncate font-medium text-Color-Scheme-1-Text">{memberName}</div>
                    <div className="truncate font-mono text-xs text-Color-Neutral">{request.document.idn ?? "IDN pending"}</div>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-Color-Neutral sm:hidden">Status</div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getLifecycleBadgeClassName(lifecycleLabel)}`}>
                      {lifecycleLabel}
                    </span>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-Color-Neutral sm:hidden">Finalization</div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getFinalizationBadgeClassName(finalizationLabel)}`}>
                      {finalizationLabel}
                    </span>
                  </div>
                  <div className="col-span-2 text-Color-Neutral sm:col-span-1 sm:text-right">
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-Color-Neutral sm:hidden">Last update</div>
                    {formatDateTime(getHistoryTimestamp(request))}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-Color-White px-4 py-8 text-sm text-Color-Neutral">
          No completed or closed notary requests yet.
        </div>
      )}
    </div>
  );
}