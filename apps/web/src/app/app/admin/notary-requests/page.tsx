"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAppToast } from "@/components/app/AppToastContext";
import { useStoredAuth } from "@/lib/auth";
import { fetchWithTokenRefresh, notaryApiBaseUrl, readApiErrorMessage } from "@/lib/notaryWorkspace";
import { AdminPageShell, RefreshIconButton, formatAdminDate, formatAdminStatus } from "../adminCommon";

type NotaryApplication = {
  id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  jurisdiction: string;
  serviceAreaKind: string;
  serviceAreaName: string;
  signatureDataUrl: string | null;
  sealDataUrl: string | null;
  reviewNotes: string | null;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    supabaseUserId: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
};

type ApplicationsPayload = {
  applications: NotaryApplication[];
};

const statusTabs = ["pending", "approved", "rejected", "all"] as const;
type StatusTab = (typeof statusTabs)[number];

const getDisplayName = (application: NotaryApplication) => {
  return [application.user?.firstName, application.user?.lastName].filter(Boolean).join(" ").trim() || application.user?.email || application.user?.phone || "Member";
};

const GreyStatusPill = ({ status }: { status: string }) => (
  <span className="inline-flex rounded-full bg-Color-Neutral-Lighter px-2.5 py-1 text-xs font-medium text-Color-Neutral-Darkest">
    {formatAdminStatus(status)}
  </span>
);

export default function AdminNotaryRequestsPage() {
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const searchParams = useSearchParams();
  const focusedRequestId = searchParams.get("requestId");
  const [applications, setApplications] = useState<NotaryApplication[]>([]);
  const [activeStatus, setActiveStatus] = useState<StatusTab>("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [selectedApplication, setSelectedApplication] = useState<NotaryApplication | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}/admin/notary-applications`, accessToken, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to load notary applications."));
      }

      const payload = (await response.json()) as ApplicationsPayload;
      setApplications(payload.applications ?? []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load notary applications.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const visibleApplications = useMemo(() => {
    const filtered = activeStatus === "all"
      ? applications
      : applications.filter((application) => application.status === activeStatus);

    if (!focusedRequestId) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      if (left.id === focusedRequestId) {
        return -1;
      }

      if (right.id === focusedRequestId) {
        return 1;
      }

      return 0;
    });
  }, [activeStatus, applications, focusedRequestId]);

  const counts = useMemo(() => ({
    pending: applications.filter((application) => application.status === "pending").length,
    approved: applications.filter((application) => application.status === "approved").length,
    rejected: applications.filter((application) => application.status === "rejected").length,
    all: applications.length,
  }), [applications]);

  const reviewApplication = async (applicationId: string, decision: "approve" | "reject") => {
    if (!accessToken) {
      setErrorMessage("Sign in again to review notary applications.");
      return;
    }

    setActionId(applicationId);
    setErrorMessage(null);
    try {
      const response = await fetchWithTokenRefresh(
        `${notaryApiBaseUrl}/admin/notary-applications/${encodeURIComponent(applicationId)}/${decision}`,
        accessToken,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewNotes: reviewNotes[applicationId]?.trim() || null }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiErrorMessage(response, "Unable to review notary application."));
      }

      showToast({ tone: "success", message: decision === "approve" ? "Notary request approved." : "Notary request rejected." });
      setReviewNotes((current) => ({ ...current, [applicationId]: "" }));
      setSelectedApplication(null);
      await loadApplications();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to review notary application.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setActionId(null);
    }
  };

  return (
    <AdminPageShell title="Notary Requests" description="Approve or reject notary profile requests from members.">
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 rounded-xl bg-Color-Neutral-Lighter/70 p-1 text-sm">
          {statusTabs.map((status) => (
            <button
              className={`rounded-lg px-3 py-2 font-medium transition ${activeStatus === status ? "bg-Color-White text-Color-Scheme-1-Text shadow-sm" : "text-Color-Neutral hover:text-Color-Scheme-1-Text"}`}
              key={status}
              onClick={() => setActiveStatus(status)}
              type="button"
            >
              {status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)} ({counts[status]})
            </button>
          ))}
        </div>
        <RefreshIconButton isLoading={isLoading} onClick={() => void loadApplications()} />
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleApplications.length ? visibleApplications.map((application) => {
          return (
          <div
            className={`cursor-pointer rounded-xl border border-Color-Scheme-1-Border px-5 py-5 text-left transition-[border-color,box-shadow] hover:border-Color-Scheme-1-Text focus:outline-none focus-visible:ring-2 focus-visible:ring-Color-Scheme-1-Text ${application.id === focusedRequestId ? "ring-2 ring-Color-Scheme-1-Border" : ""}`}
            key={application.id}
            onClick={() => setSelectedApplication(application)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedApplication(application);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-Color-Scheme-1-Text">{getDisplayName(application)}</div>
                    <div className="mt-1 text-xs text-Color-Neutral">{application.user?.email ?? application.user?.phone ?? "No contact on file"}</div>
                  </div>
                  <GreyStatusPill status={application.status} />
                </div>
                <div className="grid gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-Color-Neutral">Jurisdiction</div>
                    <div className="mt-1 text-Color-Scheme-1-Text">{application.jurisdiction}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-Color-Neutral">Service area</div>
                    <div className="mt-1 text-Color-Scheme-1-Text">{application.serviceAreaName}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-Color-Neutral">Submitted</div>
                    <div className="mt-1 text-Color-Scheme-1-Text">{formatAdminDate(application.createdAt)}</div>
                  </div>
                </div>
            </div>
          </div>
          );
        }) : <div className="rounded-xl bg-Color-White p-8 text-center text-sm text-Color-Neutral shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">No notary requests in this view.</div>}
      </section>

      {selectedApplication ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6" onClick={() => setSelectedApplication(null)}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-Color-White p-6 shadow-[0_24px_64px_rgba(0,0,0,0.24)]" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-medium text-Color-Scheme-1-Text">{getDisplayName(selectedApplication)}</div>
                <div className="mt-1 text-sm text-Color-Neutral">{selectedApplication.user?.email ?? selectedApplication.user?.phone ?? "No contact on file"}</div>
              </div>
              <div className="flex items-center gap-3">
                <GreyStatusPill status={selectedApplication.status} />
                <button
                  className="border-0 bg-transparent p-0 text-sm font-medium text-Color-Scheme-1-Text underline underline-offset-4 transition hover:text-Color-Neutral-Darkest"
                  onClick={() => setSelectedApplication(null)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Request ID</div>
                <div className="mt-1 break-all text-Color-Scheme-1-Text">{selectedApplication.id}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Jurisdiction</div>
                <div className="mt-1 text-Color-Scheme-1-Text">{selectedApplication.jurisdiction}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Service area type</div>
                <div className="mt-1 text-Color-Scheme-1-Text">{selectedApplication.serviceAreaKind}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Service area</div>
                <div className="mt-1 text-Color-Scheme-1-Text">{selectedApplication.serviceAreaName}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Submitted</div>
                <div className="mt-1 text-Color-Scheme-1-Text">{formatAdminDate(selectedApplication.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Updated</div>
                <div className="mt-1 text-Color-Scheme-1-Text">{formatAdminDate(selectedApplication.updatedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Reviewed</div>
                <div className="mt-1 text-Color-Scheme-1-Text">{formatAdminDate(selectedApplication.reviewedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-Color-Neutral">Reviewer</div>
                <div className="mt-1 break-all text-Color-Scheme-1-Text">{selectedApplication.reviewedByUserId ?? "-"}</div>
              </div>
            </div>

            {selectedApplication.reviewNotes ? (
              <div className="mt-5 rounded-lg bg-Color-Neutral-Lightest p-3 text-sm text-Color-Neutral-Darkest">{selectedApplication.reviewNotes}</div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-Color-Neutral-Lightest p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-Color-Neutral">Signature</div>
                {selectedApplication.signatureDataUrl ? <img alt="Notary signature" className="h-36 w-full rounded bg-white object-contain" src={selectedApplication.signatureDataUrl} /> : <div className="text-sm text-Color-Neutral">No signature</div>}
              </div>
              <div className="rounded-lg bg-Color-Neutral-Lightest p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-Color-Neutral">Seal</div>
                {selectedApplication.sealDataUrl ? <img alt="Notary seal" className="h-36 w-full rounded bg-white object-contain" src={selectedApplication.sealDataUrl} /> : <div className="text-sm text-Color-Neutral">No seal</div>}
              </div>
            </div>

            {selectedApplication.status === "pending" ? (
              <div className="mt-5 space-y-3 rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60 p-4">
                <textarea
                  className="min-h-24 w-full rounded-lg bg-Color-White px-3 py-2 text-sm outline-none shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                  onChange={(event) => setReviewNotes((current) => ({ ...current, [selectedApplication.id]: event.target.value }))}
                  placeholder="Approval or rejection note"
                  value={reviewNotes[selectedApplication.id] ?? ""}
                />
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <button
                    className="rounded-lg bg-Color-Neutral-Lightest px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest transition hover:bg-Color-Neutral-Lighter disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={actionId === selectedApplication.id}
                    onClick={() => void reviewApplication(selectedApplication.id, "reject")}
                    type="button"
                  >
                    Reject
                  </button>
                  <button
                    className="rounded-lg bg-Green px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={actionId === selectedApplication.id}
                    onClick={() => void reviewApplication(selectedApplication.id, "approve")}
                    type="button"
                  >
                    {actionId === selectedApplication.id ? "Working" : "Approve"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminPageShell>
  );
}