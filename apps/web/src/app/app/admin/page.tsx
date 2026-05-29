"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useStoredAuth } from "@/lib/auth";
import {
  AdminMetricStrip,
  AdminPageShell,
  StatusPill,
  fetchAdminJson,
  formatAdminDate,
  type AdminDashboardPayload,
} from "./adminCommon";

const emptyDashboard: AdminDashboardPayload = {
  capabilities: {
    canManageAdmins: false,
    canReviewNotaries: true,
    canManageUsers: true,
    canViewAudit: true,
    canManagePlatformRules: false,
  },
  metrics: {
    notaryApplications: { total: 0, pending: 0, approved: 0, rejected: 0 },
    users: { total: 0, active: 0, admins: 0 },
  },
  recentNotaryApplications: [],
  recentActivity: [],
};

const metricCards = (dashboard: AdminDashboardPayload) => [
  { label: "Pending notaries", value: dashboard.metrics.notaryApplications.pending },
  { label: "Total users", value: dashboard.metrics.users.total },
  { label: "Active users", value: dashboard.metrics.users.active },
  { label: "Admins", value: dashboard.metrics.users.admins },
];

export default function AdminHomePage() {
  const { accessToken } = useStoredAuth();
  const [dashboard, setDashboard] = useState<AdminDashboardPayload>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const payload = await fetchAdminJson<AdminDashboardPayload>("/admin/profile/dashboard", accessToken);
      setDashboard(payload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load admin dashboard.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <AdminPageShell
      description="Review notary requests, manage users, and keep the team moving."
      title="Admin"
      titleAccessory={<AdminMetricStrip metrics={metricCards(dashboard)} />}
    >
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <div>
        <section className="rounded-xl bg-Color-White p-5 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-Color-Scheme-1-Text">Recent notary requests</div>
              <div className="mt-1 text-xs text-Color-Neutral">Newest application activity.</div>
            </div>
            <Link className="text-xs font-medium underline underline-offset-4" href="/admin/notary-requests">View all</Link>
          </div>
          <div className="mt-4 divide-y divide-Color-Scheme-1-Border/15">
            {dashboard.recentNotaryApplications.length ? dashboard.recentNotaryApplications.map((application) => (
              <div className="grid gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]" key={application.id}>
                <div className="min-w-0">
                  <div className="truncate font-medium text-Color-Scheme-1-Text">{application.applicant.displayName}</div>
                  <div className="mt-1 text-xs text-Color-Neutral">{application.jurisdiction} · {application.serviceAreaName}</div>
                </div>
                <div className="flex items-center gap-3 sm:justify-end">
                  <StatusPill status={application.status} />
                  <span className="text-xs text-Color-Neutral">{formatAdminDate(application.updatedAt)}</span>
                </div>
              </div>
            )) : <div className="py-6 text-sm text-Color-Neutral">No notary requests yet.</div>}
          </div>
        </section>
      </div>

      {isLoading ? <div className="text-sm text-Color-Neutral">Refreshing admin dashboard.</div> : null}
    </AdminPageShell>
  );
}