"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppToast } from "@/components/app/AppToastContext";
import { useStoredAuth } from "@/lib/auth";
import {
  AdminMetricStrip,
  AdminPageShell,
  AdminSelectFilterControl,
  RefreshIconButton,
  StatusPill,
  fetchAdminJson,
  formatAdminDate,
  formatAdminStatus,
} from "../adminCommon";

type NotificationUser = {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
};

type NotificationJob = {
  id: string;
  templateKey: string | null;
  jobKind: string;
  channel: "email" | "sms" | "in_app" | "push";
  status: string;
  scheduledFor: string | null;
  completedAt: string | null;
  lastAttemptAt: string | null;
  documentId: string | null;
  documentIdn: string | null;
  user: NotificationUser | null;
  deliveryStatus: string;
  deliveryProvider: string | null;
  devicePushTokenId: string | null;
  deviceEnvironment: string | null;
  permissionStatus: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  deliveryCounts: {
    total: number;
    queued: number;
    sent: number;
    delivered: number;
    failed: number;
    suppressed: number;
  };
};

type NotificationsPayload = {
  jobs: NotificationJob[];
  page: {
    limit: number;
    offset: number;
    total: number;
  };
};

type NotificationFilters = {
  search: string;
  status: string;
  channel: string;
  deliveryStatus: string;
};

const channelOptions = [
  { label: "All channels", value: "" },
  { label: "Push", value: "push" },
  { label: "Email", value: "email" },
  { label: "SMS", value: "sms" },
  { label: "In-app", value: "in_app" },
];

const statusOptions = [
  { label: "All job statuses", value: "" },
  { label: "Queued", value: "queued" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Processing", value: "processing" },
  { label: "Sent", value: "sent" },
  { label: "Partially sent", value: "partially_sent" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
  { label: "Suppressed", value: "suppressed" },
  { label: "Canceled", value: "canceled" },
];

const deliveryStatusOptions = [
  { label: "All delivery statuses", value: "" },
  { label: "Queued", value: "queued" },
  { label: "Accepted", value: "accepted" },
  { label: "Sent", value: "sent" },
  { label: "Delivered", value: "delivered" },
  { label: "Failed", value: "failed" },
  { label: "Suppressed", value: "suppressed" },
  { label: "Mixed", value: "mixed" },
  { label: "None", value: "none" },
];

const getUserLabel = (job: NotificationJob) => {
  if (!job.user) {
    return "No user linked";
  }

  return job.user.displayName || job.user.email || job.user.phone || job.user.id;
};

const getUserContact = (job: NotificationJob) => {
  return job.user?.email ?? job.user?.phone ?? job.user?.id ?? "-";
};

const getNotificationLabel = (job: NotificationJob) => {
  return job.templateKey ?? job.jobKind;
};

const getDeviceLabel = (job: NotificationJob) => {
  if (!job.devicePushTokenId) {
    return "-";
  }

  const shortId = job.devicePushTokenId.slice(0, 8);
  const context = [job.deviceEnvironment, job.permissionStatus].filter(Boolean).join(" / ");
  return context ? `${shortId} (${context})` : shortId;
};

export default function AdminNotificationsPage() {
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const [jobs, setJobs] = useState<NotificationJob[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState<NotificationFilters>({ search: "", status: "", channel: "push", deliveryStatus: "" });
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filters.status) {
        params.set("status", filters.status);
      }
      if (filters.channel) {
        params.set("channel", filters.channel);
      }

      const payload = await fetchAdminJson<NotificationsPayload>(`/admin/notification-jobs?${params.toString()}`, accessToken);
      setJobs(payload.jobs ?? []);
      setTotalCount(payload.page?.total ?? 0);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load notifications.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, filters.channel, filters.status]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return jobs.filter((job) => {
      const searchable = [
        getNotificationLabel(job),
        job.status,
        job.deliveryStatus,
        job.deliveryProvider ?? "",
        getUserLabel(job),
        getUserContact(job),
        job.documentId ?? "",
        job.documentIdn ?? "",
        job.lastErrorCode ?? "",
        job.lastErrorMessage ?? "",
      ].join(" ").toLowerCase();

      return (!search || searchable.includes(search))
        && (!filters.deliveryStatus || job.deliveryStatus === filters.deliveryStatus);
    });
  }, [filters.deliveryStatus, filters.search, jobs]);

  const metrics = useMemo(() => {
    const failed = jobs.reduce((total, job) => total + job.deliveryCounts.failed, 0);
    const accepted = jobs.filter((job) => job.deliveryStatus === "accepted").length;
    const queued = jobs.filter((job) => job.status === "queued" || job.status === "scheduled").length;
    return [
      { label: "Showing", value: `${filteredJobs.length}/${totalCount}` },
      { label: "Failed", value: failed },
      { label: "Accepted", value: accepted },
      { label: "Queued", value: queued },
    ];
  }, [filteredJobs.length, jobs, totalCount]);

  const hasActiveFilters = Boolean(filters.search || filters.status || filters.channel !== "push" || filters.deliveryStatus);

  const retryJob = async (job: NotificationJob) => {
    if (!accessToken) {
      setErrorMessage("Sign in again to retry notifications.");
      return;
    }

    setActionId(job.id);
    try {
      await fetchAdminJson(`/admin/notification-jobs/${encodeURIComponent(job.id)}/retry`, accessToken, {
        method: "POST",
      });
      showToast({ tone: "success", message: "Notification retry queued." });
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to retry notification.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setActionId(null);
    }
  };

  return (
    <AdminPageShell
      description="Review notification jobs, APNs failures, delivery state, and retry failed sends."
      title="Notifications"
      titleAccessory={<AdminMetricStrip metrics={metrics} />}
    >
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/70">
        <div className="relative z-20 grid gap-4 overflow-visible border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/45 p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto_auto]">
          <label className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
            <span>Search notifications</span>
            <input
              className="h-9 w-full rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-xs text-Color-Scheme-1-Text outline-none transition-colors placeholder:text-Color-Neutral hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Template, user, IDN, device, or error"
              value={filters.search}
            />
          </label>
          <AdminSelectFilterControl
            isOpen={openFilterId === "channel"}
            label="Channel"
            onChange={(value) => setFilters((current) => ({ ...current, channel: value }))}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "channel" : null)}
            options={channelOptions}
            placeholder="Push"
            value={filters.channel}
          />
          <AdminSelectFilterControl
            isOpen={openFilterId === "status"}
            label="Job status"
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "status" : null)}
            options={statusOptions}
            placeholder="All job statuses"
            value={filters.status}
          />
          <AdminSelectFilterControl
            isOpen={openFilterId === "deliveryStatus"}
            label="Delivery status"
            onChange={(value) => setFilters((current) => ({ ...current, deliveryStatus: value }))}
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "deliveryStatus" : null)}
            options={deliveryStatusOptions}
            placeholder="All delivery statuses"
            value={filters.deliveryStatus}
          />
          <div className="flex items-end">
            <button
              className="inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasActiveFilters}
              onClick={() => {
                setFilters({ search: "", status: "", channel: "push", deliveryStatus: "" });
                setOpenFilterId(null);
              }}
              type="button"
            >
              Clear
            </button>
          </div>
          <div className="flex items-end justify-end">
            <RefreshIconButton isLoading={isLoading} onClick={() => void loadJobs()} />
          </div>
        </div>

        <div className="overflow-x-auto bg-Color-Neutral-Lightest/80">
          <table className="min-w-full bg-Color-Neutral-Lightest/60 text-left text-sm">
            <thead className="bg-Color-Neutral-Lightest text-xs text-Color-Neutral">
              <tr className="border-b border-Color-Scheme-1-Border/40">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Notification</th>
                <th className="px-4 py-3">Job status</th>
                <th className="px-4 py-3">Delivery status</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Document IDN</th>
                <th className="px-4 py-3">Device</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length ? filteredJobs.map((job) => {
                const canRetry = job.deliveryCounts.failed > 0;
                return (
                  <tr className="align-top transition-colors hover:bg-Color-Neutral-Lighter/50" key={job.id}>
                    <td className="max-w-[240px] border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                      <div className="truncate font-medium text-Color-Scheme-1-Text">{getUserLabel(job)}</div>
                      <div className="mt-1 truncate text-xs text-Color-Neutral">{getUserContact(job)}</div>
                    </td>
                    <td className="max-w-[260px] border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                      <div className="truncate font-medium text-Color-Scheme-1-Text">{getNotificationLabel(job)}</div>
                      <div className="mt-1 truncate text-xs text-Color-Neutral">{job.channel} / {job.jobKind}</div>
                      {job.lastErrorMessage ? <div className="mt-2 max-w-[240px] truncate text-xs text-red-700">{job.lastErrorCode ? `${job.lastErrorCode}: ` : ""}{job.lastErrorMessage}</div> : null}
                    </td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5"><StatusPill status={job.status} /></td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral-Darkest">
                      <div>{formatAdminStatus(job.deliveryStatus)}</div>
                      <div className="mt-1 text-xs text-Color-Neutral">{job.deliveryProvider ?? "No provider"}</div>
                    </td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{formatAdminDate(job.lastAttemptAt ?? job.createdAt)}</td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{job.documentIdn ?? job.documentId ?? "-"}</td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{getDeviceLabel(job)}</td>
                    <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                      {canRetry ? (
                        <button
                          className="border-0 bg-transparent p-0 text-xs font-medium text-Color-Scheme-1-Text underline underline-offset-4 transition hover:text-Color-Neutral-Darkest disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={Boolean(actionId)}
                          onClick={() => void retryJob(job)}
                          type="button"
                        >
                          {actionId === job.id ? "Retrying" : "Retry"}
                        </button>
                      ) : <span className="text-xs text-Color-Neutral">No retry</span>}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-8 text-center text-sm text-Color-Neutral" colSpan={8}>No notifications found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  );
}