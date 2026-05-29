"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fetchWithTokenRefresh, notaryApiBaseUrl, readApiErrorMessage } from "@/lib/notaryWorkspace";

export type AdminCapabilities = {
  canManageAdmins: boolean;
  canReviewNotaries: boolean;
  canManageUsers: boolean;
  canViewAudit: boolean;
  canManagePlatformRules: boolean;
};

export type AdminUserRole = {
  id: string;
  role: string;
  status: string;
  isActiveProfile: boolean;
  grantedReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminUser = {
  id: string;
  supabaseUserId: string | null;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  role: string | null;
  status: string | null;
  createdAt: string | null;
  lastSignInAt?: string | null;
  lastAuthSyncedAt?: string | null;
  documentCount?: number;
  roles: AdminUserRole[];
  adminPermissions: AdminCapabilities;
  permissionsUpdatedAt?: string | null;
};

export type AdminActivity = {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actor: {
    id: string;
    email: string | null;
    displayName: string;
  } | null;
};

export type AdminNotaryApplicationSummary = {
  id: string;
  status: string;
  jurisdiction: string;
  serviceAreaKind: string;
  serviceAreaName: string;
  createdAt: string | null;
  updatedAt: string | null;
  applicant: {
    id: string | null;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
  };
};

export type AdminDashboardPayload = {
  capabilities: AdminCapabilities;
  metrics: {
    notaryApplications: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    };
    users: {
      total: number;
      active: number;
      admins: number;
    };
  };
  recentNotaryApplications: AdminNotaryApplicationSummary[];
  recentActivity: AdminActivity[];
};

export type AdminFilterOption = {
  label: string;
  value: string;
};

export type AdminMetricItem = {
  label: string;
  value: string | number;
};

export const formatAdminDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export const formatAdminStatus = (value?: string | null) => {
  return (value ?? "unknown")
    .split(/[_-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

export const getAdminContact = (user: Pick<AdminUser, "email" | "phone">) => {
  return user.email ?? user.phone ?? "No contact";
};

export const isActiveAdminUser = (user: Pick<AdminUser, "role" | "roles">) => {
  return user.role === "admin" || user.roles.some((role) => role.role === "admin" && role.status === "active");
};

const CheckIcon = () => (
  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24">
    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
  </svg>
);

const RefreshIcon = ({ isLoading }: { isLoading?: boolean }) => (
  <svg className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24">
    <path d="M21 3v5h-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    <path d="M3 21v-5h5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
  </svg>
);

export function AdminMetricStrip({ metrics }: { metrics: AdminMetricItem[] }) {
  if (metrics.length === 0) {
    return null;
  }

  const gridClass = metrics.length >= 4 ? "min-w-[360px] grid-cols-4" : metrics.length === 2 ? "min-w-[220px] grid-cols-2" : "min-w-[320px] grid-cols-3";

  return (
    <div className={`grid overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest text-sm ${gridClass}`}>
      {metrics.map((metric, index) => (
        <div
          className={`${index < metrics.length - 1 ? "border-r border-Color-Scheme-1-Border/40" : ""} px-3 py-2`}
          key={metric.label}
        >
          <div className="text-xs text-Color-Neutral">{metric.label}</div>
          <div className="mt-1 font-medium">{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

export function RefreshIconButton({
  isLoading,
  onClick,
  label = "Refresh",
}: {
  isLoading?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      aria-label={isLoading ? "Refreshing" : label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-Color-Scheme-1-Border/60 text-Color-Scheme-1-Text transition hover:border-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-60"
      disabled={isLoading}
      onClick={onClick}
      title={isLoading ? "Refreshing" : label}
      type="button"
    >
      <RefreshIcon isLoading={isLoading} />
    </button>
  );
}

export function AdminSelectFilterControl({
  label,
  value,
  placeholder,
  options,
  isOpen,
  onChange,
  onOpenChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: AdminFilterOption[];
  isOpen: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }

    const popoverWidth = 288;
    const leftBoundary = 16;
    const rightBoundary = window.innerWidth - popoverWidth - leftBoundary;
    setPopoverPosition({
      left: Math.max(leftBoundary, Math.min(triggerRect.left, rightBoundary)),
      top: triggerRect.bottom + 8,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const portalTarget = typeof document === "undefined" ? null : document.body;
  const selectPopover = isOpen && popoverPosition && portalTarget
    ? createPortal(
        <div
          className="fixed z-[100] max-h-72 w-72 overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-2 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
          style={{ left: popoverPosition.left, top: popoverPosition.top }}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                  isSelected ? "bg-Green text-Color-Neutral-Darkest" : "text-Color-Scheme-1-Text hover:bg-Color-White"
                }`}
                key={option.value || option.label}
                onClick={() => {
                  onChange(option.value);
                  onOpenChange(false);
                  triggerRef.current?.blur();
                }}
                type="button"
              >
                <span>{option.label}</span>
                {isSelected ? <CheckIcon /> : null}
              </button>
            );
          })}
        </div>,
        portalTarget,
      )
    : null;

  return (
    <div className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
      <span>{label}</span>
      <button
        aria-expanded={isOpen}
        className="flex h-9 w-full items-center justify-between rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-left text-xs text-Color-Scheme-1-Text outline-none transition-colors hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
        onClick={() => onOpenChange(!isOpen)}
        ref={triggerRef}
        type="button"
      >
        <span className={selectedOption ? "" : "text-Color-Neutral"}>{selectedOption?.label ?? placeholder}</span>
        <span className="ml-2 inline-block h-2 w-2 rotate-45 border-b border-r border-current" />
      </button>
      {selectPopover}
    </div>
  );
}

export const fetchAdminJson = async <T,>(path: string, accessToken: string, init?: RequestInit) => {
  const response = await fetchWithTokenRefresh(`${notaryApiBaseUrl}${path}`, accessToken, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response, "Admin request failed."));
  }

  return (await response.json()) as T;
};

export function AdminPageShell({
  title,
  description,
  titleAccessory,
  children,
}: {
  title: string;
  description: string;
  titleAccessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-medium">{title}</div>
          <div className="text-sm text-Color-Neutral">{description}</div>
        </div>
        {titleAccessory ? <div className="ml-auto">{titleAccessory}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function StatusPill({ status }: { status?: string | null }) {
  const normalized = status ?? "unknown";
  const tone = normalized === "active" || normalized === "approved"
    ? "bg-emerald-50 text-emerald-700"
    : normalized === "pending"
      ? "bg-amber-50 text-amber-700"
      : normalized === "rejected" || normalized === "suspended" || normalized === "revoked"
        ? "bg-red-50 text-red-700"
        : "bg-Color-Neutral-Lightest text-Color-Neutral-Darkest";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {formatAdminStatus(normalized)}
    </span>
  );
}