"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";
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
        verifyPath: string | null;
      };
      finalization: {
        latestStatus: string | null;
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
  const { accessToken } = useStoredAuth();
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
  const liveMeeting = payload?.meeting?.status === "in_progress" ? payload.meeting : null;
  const memberParticipant = getRequestSessionParticipant(liveMeeting, "member");
  const notaryParticipant = getRequestSessionParticipant(liveMeeting, "notary");
  const hasMemberCheckIn = hasRequestSessionParticipantCheckedIn(liveMeeting, "member");
  const hasNotaryCheckIn = hasRequestSessionParticipantCheckedIn(liveMeeting, "notary");
  const isInitialMemberCheckIn = shouldShowMemberSessionCheckIn(liveMeeting);
  const canCheckIn = canRecordMemberSessionCheckIn(liveMeeting);

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

      {!isLoading && payload ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            {liveMeeting ? (
              <div className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-Color-Scheme-1-Text">In-person session</div>
                    <div className="mt-1 text-sm text-Color-Neutral">
                      Same place: {liveMeeting.samePlaceStatus ?? "pending"}
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
