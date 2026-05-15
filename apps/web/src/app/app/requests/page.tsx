"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type RequestListItem = {
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

type RequestsPayload = {
  requests: RequestListItem[];
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

export default function RequestsPage() {
  const { accessToken } = useStoredAuth();
  const [requests, setRequests] = useState<RequestListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!accessToken) {
      setRequests([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${apiBaseUrl}/requests`, accessToken, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as RequestsPayload | null;

      if (!response.ok || !payload?.requests) {
        throw new Error("Failed to load requests.");
      }

      setRequests(payload.requests);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load requests.");
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Requests</div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">Active requests</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-Color-Neutral">
              <tr>
                <th className="px-3 py-2">Request</th>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Meeting</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.id} className="border-t border-Color-Scheme-1-Border/40">
                  <td className="px-3 py-3 font-medium">{item.id}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{item.documentId}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{item.status ?? "-"}</td>
                  <td className="px-3 py-3 text-Color-Neutral">
                    {item.meetingStatus ?? "-"} • {formatDateTime(item.meetingScheduledAt)}
                  </td>
                  <td className="px-3 py-3 text-Color-Neutral">{formatDateTime(item.submittedAt)}</td>
                  <td className="px-3 py-3">
                    <Link
                      className="rounded border border-Color-Scheme-1-Border/40 px-2 py-1 text-xs"
                      href={`/app/requests/${item.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isLoading && requests.length === 0 ? (
          <div className="mt-4 rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm text-Color-Neutral">
            No requests found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
