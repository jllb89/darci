"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type VerificationListItem = {
  idn: string;
  status: "verified" | "unverified";
  documentId: string;
  documentStatus: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  anchoredAt: string | null;
  lastCheckedAt: string | null;
  publicVerifyPath: string;
  owner: {
    displayName: string | null;
  } | null;
  notary: {
    displayName: string | null;
  } | null;
};

type VerificationsPayload = {
  verifications: VerificationListItem[];
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

export default function VerificationPage() {
  const { accessToken } = useStoredAuth();
  const [query, setQuery] = useState("");
  const [verifications, setVerifications] = useState<VerificationListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadVerifications = useCallback(
    async (idnFilter?: string) => {
      if (!accessToken) {
        setVerifications([]);
        return;
      }

      setIsLoading(true);
      try {
        const search = idnFilter && idnFilter.trim().length > 0 ? `?idn=${encodeURIComponent(idnFilter.trim())}` : "";
        const response = await fetchWithTokenRefresh(`${apiBaseUrl}/verification${search}`, accessToken, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as VerificationsPayload | null;

        if (!response.ok || !payload?.verifications) {
          throw new Error("Failed to load verification results.");
        }

        setVerifications(payload.verifications);
        setErrorMessage(null);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to load verification results.",
        );
        setVerifications([]);
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    void loadVerifications();
  }, [loadVerifications]);

  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Verification</div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">IDN lookup</div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            className="w-full rounded border border-Color-Scheme-1-Border/40 bg-transparent px-3 py-2 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Enter IDN"
            value={query}
          />
          <button
            className="rounded bg-Green px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest"
            onClick={() => {
              void loadVerifications(query);
            }}
            type="button"
          >
            Verify
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">Results</div>
        <div className="mt-4 space-y-3">
          {verifications.map((result) => (
            <div
              key={result.idn}
              className="flex flex-col gap-2 rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm md:flex-row md:items-center md:justify-between"
            >
              <div>
                <div className="font-medium">{result.owner?.displayName ?? result.documentId}</div>
                <div className="text-xs text-Color-Neutral">{result.idn}</div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-xs text-Color-Neutral">{result.status}</div>
                <div className="text-xs text-Color-Neutral">{formatDateTime(result.lastCheckedAt)}</div>
                <Link
                  className="text-xs font-medium text-Color-Neutral-Darkest underline"
                  href={`/app/verification/${result.idn}`}
                >
                  View detail
                </Link>
              </div>
            </div>
          ))}
        </div>

        {!isLoading && verifications.length === 0 ? (
          <div className="mt-4 rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm text-Color-Neutral">
            No verification records found.
          </div>
        ) : null}
      </div>
    </div>
  );
}
