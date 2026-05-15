"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type DashboardMetric = {
  key: string;
  label: string;
  value: number;
};

type DashboardDocument = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  createdAt: string;
  updatedAt: string | null;
};

type DashboardRequest = {
  id: string;
  documentId: string;
  documentType: string | null;
  jurisdiction: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: string | null;
  submittedAt: string | null;
  meetingId: string | null;
  meetingScheduledAt: string | null;
  meetingStatus: string | null;
};

type DashboardMeeting = {
  id: string;
  requestId: string;
  documentId: string | null;
  documentType: string | null;
  ownerName: string | null;
  scheduledAt: string | null;
  timezone: string | null;
  location: string | null;
  status: string | null;
};

type DashboardActivity = {
  action: string;
  timestamp: string;
  documentId: string | null;
  entityType: string;
  entityId: string | null;
};

type DashboardAlert = {
  key: string;
  message: string;
};

type DashboardPayload = {
  role: string;
  metrics: DashboardMetric[];
  documents: DashboardDocument[];
  requests: DashboardRequest[];
  meetings: DashboardMeeting[];
  activity: DashboardActivity[];
  alerts: DashboardAlert[];
  nextAction: string | null;
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

export default function DashboardPage() {
  const { accessToken, user } = useStoredAuth();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!accessToken) {
      setPayload(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${apiBaseUrl}/dashboard`, accessToken, {
        cache: "no-store",
      });
      const nextPayload = (await response.json().catch(() => null)) as DashboardPayload | null;

      if (!response.ok || !nextPayload) {
        throw new Error("Failed to load dashboard.");
      }

      setPayload(nextPayload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "there";

  return (
    <div className="space-y-8">
      <div>
        <div className="text-2xl font-medium">Dashboard</div>
        <div className="text-sm text-Color-Neutral">Welcome back, {displayName}.</div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {(payload?.metrics ?? []).map((metric) => (
          <div key={metric.key} className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-xs uppercase text-Color-Neutral">{metric.label}</div>
            <div className="mt-2 text-2xl font-medium">{metric.value}</div>
          </div>
        ))}
      </div>

      {!isLoading && payload?.metrics.length === 0 ? (
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm text-Color-Neutral">
          No dashboard metrics available yet.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Recent documents</div>
              <Link className="text-xs underline" href="/app/documents">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {(payload?.documents ?? []).slice(0, 5).map((document) => (
                <div key={document.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{document.id}</div>
                    <div className="text-xs text-Color-Neutral">
                      {(document.documentType ?? "document").toUpperCase()} • {document.status ?? "-"}
                    </div>
                  </div>
                  <div className="text-xs text-Color-Neutral">
                    {formatDateTime(document.updatedAt ?? document.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Recent requests</div>
              <Link className="text-xs underline" href="/app/requests">
                View all
              </Link>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {(payload?.requests ?? []).slice(0, 5).map((request) => (
                <div key={request.id} className="space-y-1">
                  <div className="font-medium">{request.id}</div>
                  <div className="text-xs text-Color-Neutral">
                    {request.status ?? "-"} • {request.ownerName ?? "Unassigned"}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Recent activity</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {(payload?.activity ?? []).slice(0, 8).map((item) => (
                <div key={`${item.entityType}-${item.entityId ?? item.timestamp}-${item.action}`}>
                  {item.action} • {formatDateTime(item.timestamp)}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Meetings</div>
            <div className="mt-4 space-y-3 text-sm text-Color-Neutral">
              {(payload?.meetings ?? []).slice(0, 5).map((meeting) => (
                <div key={meeting.id}>
                  {meeting.status ?? "-"} • {formatDateTime(meeting.scheduledAt)}
                </div>
              ))}
              {(payload?.meetings ?? []).length === 0 ? <div>No meetings scheduled.</div> : null}
            </div>
          </div>

          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Alerts</div>
            <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
              {(payload?.alerts ?? []).map((alert) => (
                <div key={alert.key}>{alert.message}</div>
              ))}
              {(payload?.alerts ?? []).length === 0 ? <div>No alerts.</div> : null}
            </div>
          </div>

          <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
            <div className="text-sm font-medium">Next action</div>
            <div className="mt-4 text-sm text-Color-Neutral">
              {payload?.nextAction ?? "No action required."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
