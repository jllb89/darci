"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { StoredUserRole } from "@/lib/auth";

type NavIcon = "start" | "documents" | "verify" | "notifications" | "requests" | "settings";

type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
  sectionLabel?: string;
};

type SidebarConfig = {
  primaryItems: NavItem[];
  settingsHref: string;
  newDocumentHref: string;
  showNewDocument: boolean;
};

const ROLE_SIDEBAR_CONFIG: Record<StoredUserRole, SidebarConfig> = {
  member: {
    primaryItems: [
      { label: "Start", href: "/app", icon: "start" },
      {
        label: "My documents",
        href: "/app/documents",
        icon: "documents",
        sectionLabel: "Documents",
      },
      { label: "Verify a document", href: "/app/verification", icon: "verify" },
      {
        label: "Notifications",
        href: "/app/notifications",
        icon: "notifications",
        sectionLabel: "Activity",
      },
      { label: "Requests", href: "/app/requests", icon: "requests" },
    ],
    settingsHref: "/app/settings",
    newDocumentHref: "/app/start",
    showNewDocument: true,
  },
  pro: {
    primaryItems: [
      { label: "Start", href: "/app", icon: "start" },
      {
        label: "My documents",
        href: "/app/documents",
        icon: "documents",
        sectionLabel: "Documents",
      },
      { label: "Verify a document", href: "/app/verification", icon: "verify" },
      {
        label: "Notifications",
        href: "/app/notifications",
        icon: "notifications",
        sectionLabel: "Activity",
      },
      { label: "Requests", href: "/app/requests", icon: "requests" },
    ],
    settingsHref: "/app/settings",
    newDocumentHref: "/app/start",
    showNewDocument: true,
  },
  notary: {
    primaryItems: [
      { label: "Start", href: "/app/notary", icon: "start" },
      {
        label: "My documents",
        href: "/app/documents",
        icon: "documents",
        sectionLabel: "Documents",
      },
      { label: "Verify a document", href: "/app/verification", icon: "verify" },
      {
        label: "Notifications",
        href: "/app/notifications",
        icon: "notifications",
        sectionLabel: "Activity",
      },
      { label: "Requests", href: "/app/requests", icon: "requests" },
    ],
    settingsHref: "/app/settings",
    newDocumentHref: "/app/start",
    showNewDocument: false,
  },
  admin: {
    primaryItems: [
      { label: "Start", href: "/app", icon: "start" },
      {
        label: "My documents",
        href: "/app/documents",
        icon: "documents",
        sectionLabel: "Documents",
      },
      { label: "Verify a document", href: "/app/verification", icon: "verify" },
      {
        label: "Notifications",
        href: "/app/notifications",
        icon: "notifications",
        sectionLabel: "Activity",
      },
      { label: "Requests", href: "/app/requests", icon: "requests" },
    ],
    settingsHref: "/app/settings",
    newDocumentHref: "/app/start",
    showNewDocument: false,
  },
};

const renderNavIcon = (icon: NavIcon) => {
  if (icon === "start") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M4 11.2 12 5l8 6.2V20H4v-8.8Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  if (icon === "documents") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M7 3.75h7.25L19 8.5v11.75H7V3.75Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path d="M11 12h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
        <path d="M11 16h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  if (icon === "requests") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M7 4.5h10v15H7z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path d="M9.5 9h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
        <path d="M9.5 13h5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  if (icon === "verify") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M12 3.75 5.75 6.5v5.8c0 3.7 2.3 7.05 6.25 8.95 3.95-1.9 6.25-5.25 6.25-8.95V6.5L12 3.75Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path d="m9.25 12.25 1.9 1.9 3.7-3.7" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  if (icon === "notifications") {
    return (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path
          d="M8 10a4 4 0 1 1 8 0v3.4l1.25 2.1H6.75L8 13.4V10Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
        <path d="M10 17.5a2 2 0 0 0 4 0" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3.25v2.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M12 18.5v2.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M3.25 12h2.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="M18.5 12h2.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="m5.8 5.8 1.6 1.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="m16.6 16.6 1.6 1.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="m18.2 5.8-1.6 1.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
      <path d="m7.4 16.6-1.6 1.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
};

const isNavItemActive = (pathname: string, href: string) => {
  if (href === "/app" || href === "/app/notary") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
};

type AppSidebarProps = {
  pathname: string;
  role: StoredUserRole;
  availableRoles: StoredUserRole[];
  onSwitchRole?: (role: StoredUserRole) => void;
  onLogout?: () => void;
  isLoggingOut?: boolean;
  isSwitchingRole?: boolean;
  profileName: string;
  profileEmail: string;
};

export default function AppSidebar({
  pathname,
  role,
  availableRoles,
  onSwitchRole,
  onLogout,
  isLoggingOut = false,
  isSwitchingRole = false,
  profileName,
  profileEmail,
}: AppSidebarProps) {
  const config = ROLE_SIDEBAR_CONFIG[role];
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);

  const rolesToDisplay = availableRoles.length > 1 ? availableRoles : [];

  return (
    <aside className="hidden h-screen w-60 flex-shrink-0 flex-col border-r border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest md:flex">
      <div className="flex h-full flex-col justify-between px-2 py-4">
        <div className="flex flex-col gap-5">
          <div className="px-2">
            <Image
              src="/icons/navbar/darci_black.svg"
              alt="DARCi"
              width={55}
              height={12}
              className="h-3 w-auto"
            />
          </div>

          <div className="group flex items-center gap-2 rounded-md bg-Color-Neutral-Lighter/40 px-2.5 py-1 text-sm text-Color-Neutral">
            <svg
              className="h-4 w-4 flex-shrink-0 text-Color-Neutral transition-colors duration-200 ease-in-out group-focus-within:text-Color-Scheme-1-Text"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="m21 21-4.35-4.35"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
              />
              <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            <input
              aria-label="Search"
              className="w-full bg-transparent text-sm text-Color-Neutral placeholder:text-Color-Neutral focus:text-Color-Scheme-1-Text focus:outline-none"
              placeholder="search"
              type="text"
            />
          </div>

          <nav className="flex flex-col gap-1.5">
            {config.primaryItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);

              return (
                <div key={item.href} className="flex flex-col">
                  {item.sectionLabel ? (
                    <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-[0.08em] text-Color-Neutral/80">
                      {item.sectionLabel}
                    </div>
                  ) : null}

                  <Link
                    className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-display font-medium transition-colors duration-200 ease-in-out ${
                      isActive
                        ? "bg-Color-Neutral-Lighter/60 text-Color-Scheme-1-Text"
                        : "text-Color-Neutral hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text"
                    }`}
                    href={item.href}
                    prefetch={false}
                  >
                    <span className="text-current">{renderNavIcon(item.icon)}</span>
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-3">
          <button
            className="flex items-center gap-2 rounded-md px-2 py-2 text-left text-Color-Neutral transition-colors duration-200 ease-in-out hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text"
            onClick={() => setIsProfilePanelOpen((prev) => !prev)}
            type="button"
          >
            <span className="h-8 w-8 flex-shrink-0 rounded-full bg-Color-Neutral-Lighter" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="flex items-center gap-1">
                <span className="truncate text-[13px] font-display font-medium text-Color-Scheme-1-Text">
                  {profileName}
                </span>
                <span className="rounded-full border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lighter px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.05em] text-Color-Scheme-1-Text">
                  {role}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-Color-Neutral">{profileEmail}</span>
            </span>
            <span className="text-current">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="m8.5 10 3.5-3.5 3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                <path d="m8.5 14 3.5 3.5 3.5-3.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
              </svg>
            </span>
          </button>

          <div
            className={`overflow-hidden transition-all duration-200 ease-in-out ${
              isProfilePanelOpen ? "max-h-64 translate-y-0 opacity-100" : "max-h-0 translate-y-1 opacity-0"
            }`}
          >
            <div className="rounded-md border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-2.5 py-2">
              {rolesToDisplay.length > 0 ? (
                <>
                  <div className="px-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-Color-Neutral/80">
                    Switch profile
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {rolesToDisplay.map((allowedRole) => (
                      <button
                        key={allowedRole}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors duration-200 ease-in-out ${
                          allowedRole === role
                            ? "bg-Color-Scheme-1-Text text-white"
                            : "bg-Color-Neutral-Lighter text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lighter/70"
                        }`}
                        disabled={isSwitchingRole || allowedRole === role}
                        onClick={() => onSwitchRole?.(allowedRole)}
                        type="button"
                      >
                        {allowedRole}
                      </button>
                    ))}
                  </div>
                  <div className="my-2 border-t border-Color-Scheme-1-Border/40" />
                </>
              ) : null}

              <div className="flex flex-col gap-1">
                <Link
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-Color-Neutral transition-colors duration-200 ease-in-out hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text"
                  href="/app/billing"
                  prefetch={false}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <path
                      d="M4.75 7.25h14.5v9.5H4.75z"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                    <path d="M4.75 10h14.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                  </svg>
                  Billing
                </Link>
                <Link
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-Color-Neutral transition-colors duration-200 ease-in-out hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text"
                  href={config.settingsHref}
                  prefetch={false}
                >
                  <span className="text-current">{renderNavIcon("settings")}</span>
                  Settings
                </Link>
                <button
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-[12px] text-Color-Neutral transition-colors duration-200 ease-in-out hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!onLogout || isLoggingOut}
                  onClick={onLogout}
                  type="button"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <path
                      d="M4.75 4.75h8.5v14.5h-8.5z"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                    <path d="M10 12h9.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                    <path d="m16.5 8.75 3.25 3.25-3.25 3.25" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                  </svg>
                  {isLoggingOut ? "Signing out..." : "Log out"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 border-t border-Color-Scheme-1-Border/40 pt-3">
            {(() => {
              const isActive = isNavItemActive(pathname, config.settingsHref);

              return (
                <Link
                  aria-label="Settings"
                  className={`flex items-center justify-center rounded-md p-1.5 transition-colors duration-200 ease-in-out ${
                    isActive
                      ? "bg-Color-Neutral-Lighter/60 text-Color-Scheme-1-Text"
                      : "text-Color-Neutral hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text"
                  }`}
                  href={config.settingsHref}
                  prefetch={false}
                >
                  <span className="text-current">{renderNavIcon("settings")}</span>
                </Link>
              );
            })()}

            {config.showNewDocument ? (
              <Link
                className="ml-auto inline-flex items-center gap-1.5 bg-Green px-3 py-2 text-right text-[13px] font-display font-normal text-Color-Neutral-Darkest transition-colors duration-200 ease-in-out hover:bg-Green-secondary"
                href={config.newDocumentHref}
                prefetch={false}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M12 8.75v6.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                  <path d="M8.75 12h6.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
                </svg>
                New document
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}