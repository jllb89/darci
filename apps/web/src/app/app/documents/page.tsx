"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type DocumentWorkspaceSummary = {
  workflow: {
    requestId: string | null;
    latestWorkflowStatus: string | null;
  };
  finalization: {
    latestStatus: string | null;
    isAnchored: boolean;
  };
  verification: {
    status: "unavailable" | "pending_finalization" | "ready";
    idn: string | null;
    verifyPath: string | null;
  };
};

type DocumentListItem = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  createdAt: string;
  summary: DocumentWorkspaceSummary | null;
};

type DocumentsPayload = {
  documents: DocumentListItem[];
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

export default function DocumentsPage() {
  const { accessToken } = useStoredAuth();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    if (!accessToken) {
      setDocuments([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${apiBaseUrl}/documents`, accessToken, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as DocumentsPayload | null;

      if (!response.ok || !payload?.documents) {
        throw new Error("Failed to load documents.");
      }

      setDocuments(payload.documents);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load documents.");
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <div className="space-y-6">
      <div className="text-2xl font-medium">Documents</div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
        <div className="text-sm font-medium">All documents</div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-Color-Neutral">
              <tr>
                <th className="px-3 py-2">Document</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Jurisdiction</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Workflow</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-t border-Color-Scheme-1-Border/40">
                  <td className="px-3 py-3">
                    <div className="font-medium">{document.id}</div>
                    <div className="text-xs text-Color-Neutral">{document.idn ?? "No IDN"}</div>
                  </td>
                  <td className="px-3 py-3 text-Color-Neutral">{document.documentType ?? "-"}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{document.jurisdiction ?? "-"}</td>
                  <td className="px-3 py-3 text-Color-Neutral">{document.status ?? "-"}</td>
                  <td className="px-3 py-3 text-Color-Neutral">
                    {document.summary?.workflow.latestWorkflowStatus ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-Color-Neutral">
                    {document.summary?.verification.status ?? "-"}
                  </td>
                  <td className="px-3 py-3 text-Color-Neutral">{formatDateTime(document.createdAt)}</td>
                  <td className="px-3 py-3">
                    <Link
                      className="rounded border border-Color-Scheme-1-Border/40 px-2 py-1 text-xs"
                      href={`/app/documents/${document.id}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!isLoading && documents.length === 0 ? (
          <div className="mt-4 rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm text-Color-Neutral">
            No documents found.
          </div>
        ) : null}
      </div>

      <Link className="text-sm text-Color-Neutral-Darkest underline" href="/app">
        Back to dashboard
      </Link>
    </div>
  );
}
