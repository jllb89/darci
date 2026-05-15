"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type VerificationDetailPayload = {
  verification: {
    idn: string;
    documentId: string;
    documentStatus: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    hash: string | null;
    ledgerTxId: string | null;
    anchoredAt: string | null;
    status: "verified" | "unverified";
    lastCheckedAt: string | null;
    publicVerifyPath: string;
  };
  request: {
    id: string;
    status: string | null;
    submittedAt: string | null;
    meetingStatus: string | null;
    meetingScheduledAt: string | null;
  } | null;
  workflow: {
    latestStatus: string | null;
    latestStatusAt: string | null;
  } | null;
  latestCodeDelivery: {
    status: string;
    expiresAt: string | null;
    deliveredAt: string | null;
  } | null;
  latestCheck: {
    createdAt: string;
  } | null;
  anchorAttempt: {
    status: string;
    attemptNumber: number;
    requestedAt: string;
    completedAt: string | null;
    failedAt: string | null;
    errorMessage: string | null;
  } | null;
  owner: {
    displayName: string | null;
  } | null;
  notary: {
    displayName: string | null;
  } | null;
  documents: Array<{
    id: string;
    idn: string;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
    publicVerifyPath: string;
  }>;
  audit: Array<{
    id: string;
    action: string;
    message: string;
    timestamp: string;
    actorId: string | null;
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

export default function VerificationDetailPage() {
  const params = useParams<{ id: string }>();
  const idn = typeof params?.id === "string" ? params.id : "";
  const { accessToken } = useStoredAuth();
  const [payload, setPayload] = useState<VerificationDetailPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!accessToken || !idn) {
      setPayload(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/verification/${encodeURIComponent(idn)}`,
        accessToken,
        { cache: "no-store" },
      );
      const nextPayload = (await response.json().catch(() => null)) as
        | VerificationDetailPayload
        | null;

      if (!response.ok || !nextPayload?.verification) {
        throw new Error("Failed to load verification detail.");
      }

      setPayload(nextPayload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load verification detail.",
      );
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, idn]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-medium">{payload?.verification.idn ?? idn}</div>
        <div className="text-sm text-Color-Neutral">
          {payload?.owner?.displayName ?? "Verification"} • {payload?.verification.status ?? "-"}
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!isLoading && payload ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Verification summary</div>
              <div className="mt-4 grid gap-3 text-sm text-Color-Neutral md:grid-cols-2">
                <div>Document: {payload.verification.documentId}</div>
                <div>Type: {payload.verification.documentType ?? "-"}</div>
                <div>Jurisdiction: {payload.verification.jurisdiction ?? "-"}</div>
                <div>Status: {payload.verification.status}</div>
                <div>Anchored: {formatDateTime(payload.verification.anchoredAt)}</div>
                <div>Last checked: {formatDateTime(payload.verification.lastCheckedAt)}</div>
                <div>Ledger TX: {payload.verification.ledgerTxId ?? "-"}</div>
                <div>Hash: {payload.verification.hash ?? "-"}</div>
              </div>
            </div>

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Audit log</div>
              <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
                {payload.audit.map((entry) => (
                  <div key={entry.id}>
                    {entry.message} • {formatDateTime(entry.timestamp)}
                  </div>
                ))}
                {payload.audit.length === 0 ? <div>No audit events.</div> : null}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Request context</div>
              <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
                <div>Request: {payload.request?.id ?? "-"}</div>
                <div>Request status: {payload.request?.status ?? "-"}</div>
                <div>Meeting: {payload.request?.meetingStatus ?? "-"}</div>
                <div>Workflow: {payload.workflow?.latestStatus ?? "-"}</div>
              </div>
            </div>

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Code delivery</div>
              <div className="mt-4 space-y-2 text-sm text-Color-Neutral">
                <div>Status: {payload.latestCodeDelivery?.status ?? "-"}</div>
                <div>Delivered: {formatDateTime(payload.latestCodeDelivery?.deliveredAt ?? null)}</div>
                <div>Expires: {formatDateTime(payload.latestCodeDelivery?.expiresAt ?? null)}</div>
              </div>
            </div>

            <a
              className="block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
              href={payload.verification.publicVerifyPath}
              rel="noreferrer"
              target="_blank"
            >
              Open public verification
            </a>

            <Link
              className="block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
              href="/app/verification"
            >
              Back to verification
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
