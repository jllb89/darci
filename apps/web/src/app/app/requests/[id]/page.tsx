"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";
import {
  buildRealtimeEqualsFilter,
  requestRealtimeBroadcastEvent,
  useRequestRealtimeInvalidation,
  type RequestRealtimeTarget,
} from "@/lib/requestRealtime";
import {
  canRecordMemberSessionCheckIn,
  getRequestSessionParticipant,
  hasRequestSessionParticipantCheckedIn,
  shouldShowMemberSessionCheckIn,
} from "../requestSession";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type RequestDetailPayload = {
  request: {
    id: string;
    documentId: string;
    workflowId: string | null;
    status: string | null;
    submittedAt: string | null;
    meetingId: string | null;
    meetingStatus: string | null;
    meetingScheduledAt: string | null;
    meetingTimezone: string | null;
    meetingLocation: string | null;
  };
  document: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    summary: {
      verification: {
        status: string;
        idn: string | null;
        verifyPath: string | null;
      };
      finalization: {
        latestStatus: string | null;
        latestStatusAt: string | null;
        isAnchored: boolean;
        isVerificationChecked: boolean;
        isWatermarked: boolean;
        isHashRecorded: boolean;
        hash: string | null;
        ledgerTxId: string | null;
        anchoredAt: string | null;
        anchorAttempt: {
          id: string;
          status: string;
          attemptNumber: number;
          requestedAt: string;
          completedAt: string | null;
          failedAt: string | null;
          errorMessage: string | null;
        } | null;
        history: Array<{
          id: string;
          status: string;
          changeSource: string;
          changeReason: string | null;
          createdAt: string;
        }>;
      };
    };
  };
  workflow: {
    latestStatus: string | null;
    latestStatusAt: string | null;
    selectedNotaryUserId: string | null;
    assignedNotaryUserId: string | null;
  } | null;
  latestCodeDelivery: {
    status: string;
    expiresAt: string | null;
    deliveredAt: string | null;
  } | null;
  owner: {
    displayName: string | null;
  } | null;
  notary: {
    displayName: string | null;
  } | null;
  meeting: {
    meetingId: string;
    requestId: string;
    workflowId: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
    samePlaceRequired: boolean;
    samePlaceStatus: string | null;
    proposedSlots: string[];
    participants: Array<{
      id: string;
      userId: string | null;
      participantRole: string;
      status: string;
      presenceRequired: boolean;
      participantLabel: string | null;
      arrivedAt: string | null;
      departedAt: string | null;
    }>;
  } | null;
  warnings: Array<{
    code: string;
    severity: "info" | "warning";
    message: string;
  }>;
  nextAction: string | null;
};

type BrowserGeolocationSample = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitudeMeters?: number;
  sampleKind: "device_gps";
};

type TimelinePayload = {
  timeline: Array<{
    id?: string;
    event?: string;
    label?: string;
    message?: string;
    timestamp?: string;
    createdAt?: string;
  }>;
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

const formatStatusLabel = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

function FinalizationStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-Color-White px-3 py-2 text-xs shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
      <span className="text-Color-Neutral-Darkest">{label}</span>
      <span className={done ? "font-medium text-emerald-700" : "text-Color-Neutral"}>{done ? "Done" : "Pending"}</span>
    </div>
  );
}

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

const readApiErrorMessage = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null) as { message?: unknown } | null;
  return typeof payload?.message === "string" && payload.message.trim() ? payload.message : fallback;
};

export default function RequestWorkspacePage() {
  const params = useParams<{ id: string }>();
  const requestId = typeof params?.id === "string" ? params.id : "";
  const { accessToken, refreshToken } = useStoredAuth();
  const [payload, setPayload] = useState<RequestDetailPayload | null>(null);
  const [timeline, setTimeline] = useState<TimelinePayload["timeline"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRequest = useCallback(async () => {
    if (!accessToken || !requestId) {
      setPayload(null);
      setTimeline([]);
      return;
    }

    setIsLoading(true);
    try {
      const [detailResponse, timelineResponse] = await Promise.all([
        fetchWithTokenRefresh(`${apiBaseUrl}/requests/${encodeURIComponent(requestId)}`, accessToken, {
          cache: "no-store",
        }),
        fetchWithTokenRefresh(
          `${apiBaseUrl}/requests/${encodeURIComponent(requestId)}/timeline`,
          accessToken,
          { cache: "no-store" },
        ),
      ]);

      const detailPayload = (await detailResponse.json().catch(() => null)) as RequestDetailPayload | null;
      const timelinePayload = (await timelineResponse.json().catch(() => null)) as TimelinePayload | null;

      if (!detailResponse.ok || !detailPayload?.request) {
        throw new Error("Failed to load request.");
      }

      setPayload(detailPayload);
      setTimeline(Array.isArray(timelinePayload?.timeline) ? timelinePayload.timeline : []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load request.");
      setPayload(null);
      setTimeline([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, requestId]);

  useEffect(() => {
    void loadRequest();
  }, [loadRequest]);

  const realtimeTargets: RequestRealtimeTarget[] = [
    { table: "notarization_requests", filter: buildRealtimeEqualsFilter("id", requestId) },
    { table: "meetings", filter: buildRealtimeEqualsFilter("request_id", requestId) },
    { table: "workflow_status_history", filter: buildRealtimeEqualsFilter("workflow_id", payload?.request.workflowId) },
    { table: "meeting_participants", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "meeting_checkins", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "geolocation_samples", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "proximity_evaluations", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "identity_verification_events", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "meeting_artifacts", filter: buildRealtimeEqualsFilter("meeting_id", payload?.meeting?.meetingId) },
    { table: "document_versions", filter: buildRealtimeEqualsFilter("document_id", payload?.document.id) },
    { table: "finalization_status_history", filter: buildRealtimeEqualsFilter("document_id", payload?.document.id) },
    { table: "document_hash_records", filter: buildRealtimeEqualsFilter("document_id", payload?.document.id) },
  ];

  const realtimeState = useRequestRealtimeInvalidation({
    enabled: Boolean(accessToken && requestId),
    accessToken,
    refreshToken,
    channelName: `request:${requestId}`,
    targets: realtimeTargets,
    broadcastTargets: [{ event: requestRealtimeBroadcastEvent, private: true }],
    tableChangeTargetsEnabled: false,
    onInvalidate: loadRequest,
    pollIntervalMs: 30_000,
  });

  const handleMemberCheckIn = async () => {
    if (!accessToken || !requestId) {
      setErrorMessage("Sign in again to check in for the in-person session.");
      return;
    }

    setIsCheckingIn(true);
    setErrorMessage(null);
    setSessionMessage(null);

    try {
      const geolocation = await getCurrentGeolocationSample();
      if (!geolocation) {
        throw new Error("Location permission is needed to check in for the in-person session.");
      }

      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/notary/requests/${encodeURIComponent(requestId)}/meeting/check-in`,
        accessToken,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            participantRole: "member",
            checkinKind: "arrival",
            recordedAt: new Date().toISOString(),
            notes: "Member checked in from the member request workspace.",
            geolocation,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to record member check-in."));
      }

      setSessionMessage("Location check-in recorded. Your Illuminotary can continue the session.");
      await loadRequest();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to record member check-in.");
    } finally {
      setIsCheckingIn(false);
    }
  };

  const detail = payload?.request;
  const sessionMeeting = payload?.meeting ?? null;
  const liveMeeting = sessionMeeting?.status === "in_progress" ? sessionMeeting : null;
  const memberParticipant = getRequestSessionParticipant(sessionMeeting, "member");
  const notaryParticipant = getRequestSessionParticipant(sessionMeeting, "notary");
  const hasMemberCheckIn = hasRequestSessionParticipantCheckedIn(sessionMeeting, "member");
  const hasNotaryCheckIn = hasRequestSessionParticipantCheckedIn(sessionMeeting, "notary");
  const isInitialMemberCheckIn = shouldShowMemberSessionCheckIn(liveMeeting);
  const canCheckIn = canRecordMemberSessionCheckIn(liveMeeting);
  const finalization = payload?.document.summary.finalization ?? null;
  const verification = payload?.document.summary.verification ?? null;
  const hasFinalWatermark = Boolean(
    finalization?.isWatermarked || finalization?.history.some((event) => event.status === "watermark_applied"),
  );
  const hasHashRecorded = Boolean(
    finalization?.isHashRecorded || finalization?.hash || finalization?.history.some((event) => event.status === "hash_recorded"),
  );
  const hasLedgerFailure = Boolean(finalization?.anchorAttempt?.status === "failed" || finalization?.latestStatus === "failed");
  const isVerificationReady = Boolean(finalization?.isAnchored && verification?.verifyPath);
  const recentFinalizationHistory = finalization?.history.slice(-4).reverse() ?? [];
  const isSessionStarted = Boolean(
    sessionMeeting?.status === "in_progress" || sessionMeeting?.status === "completed" || hasNotaryCheckIn,
  );
  const isSamePlaceConfirmed = sessionMeeting?.samePlaceStatus === "passed";
  const showRealtimeFallbackNotice = realtimeState.status === "degraded" && realtimeState.isPollingFallbackActive;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-medium">{detail?.id ?? "Request"}</div>
          <div className="text-sm text-Color-Neutral">Document {detail?.documentId ?? "-"}</div>
        </div>
        <span className="w-fit rounded-full border border-Color-Scheme-1-Border/40 px-3 py-1 text-xs text-Color-Neutral">
          {detail?.status ?? "-"}
        </span>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {sessionMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sessionMessage}
        </div>
      ) : null}

      {showRealtimeFallbackNotice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Live updates are reconnecting. This page is refreshing automatically.
        </div>
      ) : null}

      {!isLoading && payload ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {sessionMeeting ? (
              <div className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-Color-Scheme-1-Text">In-person session</div>
                    <div className="mt-1 text-sm text-Color-Neutral">
                      Status: {formatStatusLabel(sessionMeeting.status)} · Same place: {formatStatusLabel(sessionMeeting.samePlaceStatus)}
                    </div>
                  </div>
                  {canCheckIn ? (
                    <button
                      className="rounded-lg bg-Green px-5 py-3 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isCheckingIn}
                      onClick={() => void handleMemberCheckIn()}
                      type="button"
                    >
                      {isCheckingIn ? "Checking in" : isInitialMemberCheckIn ? "Check in" : "Refresh check-in"}
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2">
                  <FinalizationStep done={isSessionStarted} label="Illuminotary started" />
                  <FinalizationStep done={hasMemberCheckIn} label="Location shared" />
                  <FinalizationStep done={isSamePlaceConfirmed} label="Same-place confirmed" />
                  <FinalizationStep done={isVerificationReady} label="Final package ready" />
                </div>

                <div className="mt-4 grid gap-2 text-sm text-Color-Neutral md:grid-cols-2">
                  <div className="rounded-lg bg-Color-White px-3 py-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    <div className="font-medium text-Color-Scheme-1-Text">Illuminotary</div>
                    <div className="mt-1">{hasNotaryCheckIn ? "Checked in" : "Pending"}</div>
                    <div className="mt-1 text-xs">{formatDateTime(notaryParticipant?.arrivedAt ?? null)}</div>
                  </div>
                  <div className="rounded-lg bg-Color-White px-3 py-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    <div className="font-medium text-Color-Scheme-1-Text">Member</div>
                    <div className="mt-1">{hasMemberCheckIn ? "Checked in" : "Pending"}</div>
                    <div className="mt-1 text-xs">{formatDateTime(memberParticipant?.arrivedAt ?? null)}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Request summary</div>
              <div className="mt-4 grid gap-3 text-sm text-Color-Neutral md:grid-cols-2">
                <div>Owner: {payload.owner?.displayName ?? "-"}</div>
                <div>Notary: {payload.notary?.displayName ?? "-"}</div>
                <div>Submitted: {formatDateTime(payload.request.submittedAt)}</div>
                <div>Meeting: {payload.request.meetingStatus ?? "-"}</div>
                <div>Scheduled: {formatDateTime(payload.request.meetingScheduledAt)}</div>
                <div>Workflow: {payload.workflow?.latestStatus ?? "-"}</div>
              </div>
            </div>

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Timeline</div>
              <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
                {timeline.map((item, index) => (
                  <div key={`${item.id ?? index}-${item.timestamp ?? item.createdAt ?? ""}`}>
                    {item.message ?? item.label ?? item.event ?? "Event"} • {formatDateTime(item.timestamp ?? item.createdAt ?? null)}
                  </div>
                ))}
                {timeline.length === 0 ? <div>No timeline entries yet.</div> : null}
              </div>
            </div>

            {payload.warnings.length > 0 ? (
              <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
                <div className="text-sm font-medium">Warnings</div>
                <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
                  {payload.warnings.map((warning) => (
                    <div key={warning.code}>{warning.message}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            {finalization ? (
              <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm font-medium">Final package</div>
                  <div className={hasLedgerFailure ? "text-xs font-medium text-red-700" : "text-xs text-Color-Neutral"}>
                    {formatStatusLabel(finalization.latestStatus)}
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  <FinalizationStep done={hasFinalWatermark} label="Watermarked" />
                  <FinalizationStep done={hasHashRecorded} label="Hash recorded" />
                  <FinalizationStep done={finalization.isAnchored} label="Ledger anchored" />
                  <FinalizationStep done={isVerificationReady} label="Verification ready" />
                </div>
                <div className="mt-4 space-y-2 break-words text-sm text-Color-Neutral">
                  <div>Hash: {finalization.hash ?? "-"}</div>
                  <div>Ledger TX: {finalization.ledgerTxId ?? "-"}</div>
                  <div>Anchored: {formatDateTime(finalization.anchoredAt)}</div>
                </div>
                {verification?.verifyPath ? (
                  <Link
                    className="mt-4 block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
                    href={verification.verifyPath}
                  >
                    Open public verification
                  </Link>
                ) : null}
                {hasLedgerFailure ? (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Ledger anchoring failed{finalization.anchorAttempt?.errorMessage ? `: ${finalization.anchorAttempt.errorMessage}` : "."} Your Illuminotary can retry final package submission.
                  </div>
                ) : null}
                {recentFinalizationHistory.length > 0 ? (
                  <div className="mt-4 space-y-2 text-xs text-Color-Neutral">
                    {recentFinalizationHistory.map((event) => (
                      <div key={event.id} className="rounded-lg bg-Color-Neutral-Lightest px-3 py-2">
                        {formatStatusLabel(event.status)} • {formatDateTime(event.createdAt)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Code delivery</div>
              <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
                <div>Status: {payload.latestCodeDelivery?.status ?? "-"}</div>
                <div>Delivered: {formatDateTime(payload.latestCodeDelivery?.deliveredAt ?? null)}</div>
                <div>Expires: {formatDateTime(payload.latestCodeDelivery?.expiresAt ?? null)}</div>
              </div>
            </div>

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Next action</div>
              <div className="mt-4 text-sm text-Color-Neutral">{payload.nextAction ?? "No action required."}</div>
            </div>

            <Link
              className="block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
              href={`/app/documents/${payload.document.id}`}
            >
              Open document
            </Link>

            <Link
              className="block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
              href="/app/requests"
            >
              Back to requests
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
