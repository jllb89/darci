"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type DocumentWorkspaceSummary = {
  workflow: {
    requestId: string | null;
    workflowId: string | null;
    requestStatus: string | null;
    latestWorkflowStatus: string | null;
    latestWorkflowStatusAt: string | null;
    submittedAt: string | null;
    assignedNotaryId: string | null;
    latestCodeStatus: string | null;
    latestCodeExpiresAt: string | null;
  };
  finalization: {
    latestStatus: string | null;
    latestStatusAt: string | null;
    isAnchored: boolean;
    isVerificationChecked: boolean;
  };
  verification: {
    status: "unavailable" | "pending_finalization" | "ready";
    idn: string | null;
    verifyPath: string | null;
  };
};

type DocumentPayload = {
  document: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
    summary: DocumentWorkspaceSummary;
  };
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

export default function DocumentWorkspacePage() {
  const params = useParams<{ id: string }>();
  const documentId = typeof params?.id === "string" ? params.id : "";
  const { accessToken } = useStoredAuth();
  const [payload, setPayload] = useState<DocumentPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    if (!accessToken || !documentId) {
      setPayload(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${encodeURIComponent(documentId)}`,
        accessToken,
        { cache: "no-store" },
      );
      const nextPayload = (await response.json().catch(() => null)) as DocumentPayload | null;

      if (!response.ok || !nextPayload?.document) {
        throw new Error("Failed to load document.");
      }

      setPayload(nextPayload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load document.");
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, documentId]);

  useEffect(() => {
    void loadDocument();
  }, [loadDocument]);

  const document = payload?.document;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-2xl font-medium">{document?.id ?? "Document"}</div>
          <div className="text-sm text-Color-Neutral">
            {(document?.documentType ?? "-").toUpperCase()} • {document?.jurisdiction ?? "-"}
          </div>
        </div>
        <span className="w-fit rounded-full border border-Color-Scheme-1-Border/40 px-3 py-1 text-xs text-Color-Neutral">
          {document?.status ?? "-"}
        </span>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!isLoading && document ? (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Core</div>
              <div className="mt-4 grid gap-3 text-sm text-Color-Neutral md:grid-cols-2">
                <div>IDN: {document.idn ?? "-"}</div>
                <div>Created: {formatDateTime(document.createdAt)}</div>
                <div>Verification: {document.summary.verification.status}</div>
                <div>Anchored: {document.summary.finalization.isAnchored ? "Yes" : "No"}</div>
              </div>
            </div>

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Workflow</div>
              <div className="mt-4 grid gap-3 text-sm text-Color-Neutral md:grid-cols-2">
                <div>Request: {document.summary.workflow.requestId ?? "-"}</div>
                <div>Workflow: {document.summary.workflow.workflowId ?? "-"}</div>
                <div>Status: {document.summary.workflow.latestWorkflowStatus ?? "-"}</div>
                <div>Submitted: {formatDateTime(document.summary.workflow.submittedAt)}</div>
                <div>Code status: {document.summary.workflow.latestCodeStatus ?? "-"}</div>
                <div>Code expires: {formatDateTime(document.summary.workflow.latestCodeExpiresAt)}</div>
              </div>
            </div>

            <div className="rounded-lg border border-Color-Scheme-1-Border/40 p-4">
              <div className="text-sm font-medium">Finalization</div>
              <div className="mt-4 grid gap-3 text-sm text-Color-Neutral md:grid-cols-2">
                <div>Latest status: {document.summary.finalization.latestStatus ?? "-"}</div>
                <div>Updated: {formatDateTime(document.summary.finalization.latestStatusAt)}</div>
                <div>Verification checked: {document.summary.finalization.isVerificationChecked ? "Yes" : "No"}</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {document.summary.workflow.requestId ? (
              <Link
                className="block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
                href={`/app/requests/${document.summary.workflow.requestId}`}
              >
                Open linked request
              </Link>
            ) : null}

            {document.summary.verification.verifyPath ? (
              <a
                className="block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
                href={document.summary.verification.verifyPath}
                rel="noreferrer"
                target="_blank"
              >
                Open public verification
              </a>
            ) : null}

            <Link
              className="block rounded-lg border border-Color-Scheme-1-Border/40 px-4 py-3 text-sm hover:bg-Color-Neutral-Lightest"
              href="/app/documents"
            >
              Back to documents
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
