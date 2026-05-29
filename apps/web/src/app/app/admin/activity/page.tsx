"use client";

import { useCallback, useEffect, useState } from "react";
import { useStoredAuth } from "@/lib/auth";
import {
  AdminPageShell,
  RefreshIconButton,
  fetchAdminJson,
  formatAdminDate,
  formatAdminStatus,
  type AdminActivity,
  type AdminCapabilities,
} from "../adminCommon";

type ActivityPayload = {
  capabilities: AdminCapabilities;
  activity: AdminActivity[];
};

const formatMetadata = (metadata: Record<string, unknown>) => {
  const entries = Object.entries(metadata).filter(([, value]) => value !== null && typeof value !== "undefined");
  if (!entries.length) {
    return null;
  }

  return entries.slice(0, 4).map(([key, value]) => `${formatAdminStatus(key)}: ${String(value)}`).join(" · ");
};

export default function AdminActivityPage() {
  const { accessToken } = useStoredAuth();
  const [activity, setActivity] = useState<AdminActivity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!accessToken) {
      return;
    }

    setIsLoading(true);
    try {
      const payload = await fetchAdminJson<ActivityPayload>("/admin/profile/activity", accessToken);
      setActivity(payload.activity ?? []);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load admin activity.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  return (
    <AdminPageShell title="Activity" description="Audit trail for admin-sensitive events.">
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="overflow-hidden rounded-xl bg-Color-White shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
        <div className="flex justify-end border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/45 p-4">
          <RefreshIconButton isLoading={isLoading} onClick={() => void loadActivity()} />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.4fr)] gap-3 bg-Color-Neutral-Lightest px-4 py-3 text-xs uppercase tracking-wide text-Color-Neutral">
          <div>Event</div>
          <div className="text-right">Time</div>
        </div>
        <div className="divide-y divide-Color-Scheme-1-Border/15">
          {activity.length ? activity.map((event) => {
            const metadata = formatMetadata(event.metadata);
            return (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(8rem,0.4fr)] gap-3 px-4 py-4 text-sm" key={event.id}>
                <div className="min-w-0">
                  <div className="font-medium text-Color-Scheme-1-Text">{event.action}</div>
                  <div className="mt-1 text-xs text-Color-Neutral">{event.actor?.displayName ?? "System"} · {event.entityType}{event.entityId ? ` · ${event.entityId}` : ""}</div>
                  {metadata ? <div className="mt-2 text-xs text-Color-Neutral-Darkest">{metadata}</div> : null}
                </div>
                <div className="text-right text-xs text-Color-Neutral">{formatAdminDate(event.createdAt)}</div>
              </div>
            );
          }) : <div className="px-4 py-8 text-center text-sm text-Color-Neutral">No audit activity found.</div>}
        </div>
      </section>
    </AdminPageShell>
  );
}