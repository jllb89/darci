"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { refreshStoredAuth, useStoredAuth, type StoredUserRole } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

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

type VerificationLookupItem = {
  idn: string;
};

type VerificationLookupPayload = {
  verifications?: VerificationLookupItem[];
};

const PROFILE_ROLE_LABELS: Record<StoredUserRole, string> = {
  member: "Member",
  pro: "Member",
  notary: "Notary",
  admin: "Admin",
};

const getProfileSwitchOptions = (availableRoles: StoredUserRole[]) => {
  const options = new Map<string, StoredUserRole>();

  availableRoles.forEach((availableRole) => {
    const label = PROFILE_ROLE_LABELS[availableRole];
    const existingRole = options.get(label);

    if (!existingRole || availableRole === "member") {
      options.set(label, availableRole);
    }
  });

  return Array.from(options, ([label, value]) => ({ label, value }));
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
        label: "Activity",
        href: "/app/activity",
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
        label: "Activity",
        href: "/app/activity",
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
      { label: "Queue", href: "/app/notary", icon: "requests", sectionLabel: "Notary" },
      { label: "Verify a document", href: "/app/verification", icon: "verify" },
    ],
    settingsHref: "/app/settings",
    newDocumentHref: "/app/start",
    showNewDocument: false,
  },
  admin: {
    primaryItems: [
      { label: "Admin home", href: "/app/admin", icon: "start", sectionLabel: "Admin" },
      {
        label: "Notary requests",
        href: "/app/admin/notary-requests",
        icon: "requests",
      },
      { label: "Users", href: "/app/admin/users", icon: "documents" },
      { label: "Admin team", href: "/app/admin/team", icon: "settings" },
      { label: "Verify a document", href: "/app/verification", icon: "verify", sectionLabel: "Tools" },
    ],
    settingsHref: "/app/settings",
    newDocumentHref: "/app/start",
    showNewDocument: false,
  },
};

const getSidebarConfig = (role: StoredUserRole, pathname: string): SidebarConfig => {
  const config = ROLE_SIDEBAR_CONFIG[role];

  if (role !== "admin" || !pathname.startsWith("/admin")) {
    return config;
  }

  return {
    ...config,
    primaryItems: config.primaryItems.map((item) => ({
      ...item,
      href: item.href.replace(/^\/app\/admin/, "/admin"),
    })),
  };
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
  const router = useRouter();
  const { accessToken } = useStoredAuth();
  const config = getSidebarConfig(role, pathname);
  const [isProfilePanelOpen, setIsProfilePanelOpen] = useState(false);
  const [isVerificationLookupOpen, setIsVerificationLookupOpen] = useState(false);
  const [verificationQuery, setVerificationQuery] = useState("");
  const [isVerificationLookupLoading, setIsVerificationLookupLoading] = useState(false);
  const [verificationLookupMessage, setVerificationLookupMessage] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const verificationLookupRef = useRef<HTMLDivElement | null>(null);

  const profileRoleLabel = PROFILE_ROLE_LABELS[role];
  const profileSwitchOptions = getProfileSwitchOptions(availableRoles);
  const rolesToDisplay = profileSwitchOptions.length > 1 ? profileSwitchOptions : [];
  const showNotarySignupLink = role === "member" || role === "pro";

  const closeVerificationLookup = useCallback(() => {
    setIsVerificationLookupOpen(false);
    setVerificationQuery("");
    setVerificationLookupMessage(null);
  }, []);

  useEffect(() => {
    const storedSidebarState = window.localStorage.getItem("darci.appSidebar.collapsed");
    if (storedSidebarState === "true") {
      setIsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("darci.appSidebar.collapsed", isCollapsed ? "true" : "false");
  }, [isCollapsed]);

  useEffect(() => {
    if (!isCollapsed) {
      return;
    }

    setIsProfilePanelOpen(false);
    closeVerificationLookup();
  }, [closeVerificationLookup, isCollapsed]);

  useEffect(() => {
    if (!isVerificationLookupOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!verificationLookupRef.current?.contains(event.target as Node)) {
        closeVerificationLookup();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeVerificationLookup();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeVerificationLookup, isVerificationLookupOpen]);

  const runVerificationLookup = useCallback(async () => {
    const idn = verificationQuery.trim();
    if (!idn) {
      setVerificationLookupMessage("Enter an IDN to verify.");
      return;
    }

    if (!accessToken) {
      setVerificationLookupMessage("Sign in again to verify an IDN.");
      return;
    }

    setIsVerificationLookupLoading(true);
    setVerificationLookupMessage(null);
    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/verification?idn=${encodeURIComponent(idn)}&limit=1`,
        accessToken,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => null)) as VerificationLookupPayload | null;

      if (!response.ok || !payload?.verifications) {
        throw new Error("Verification lookup failed.");
      }

      const result = payload.verifications[0] ?? null;
      if (!result) {
        setVerificationLookupMessage("No document was found for the entered IDN.");
        return;
      }

      closeVerificationLookup();
      router.push(`/app/verification/${encodeURIComponent(result.idn)}`);
    } catch (error) {
      setVerificationLookupMessage(error instanceof Error ? error.message : "Verification lookup failed.");
    } finally {
      setIsVerificationLookupLoading(false);
    }
  }, [accessToken, closeVerificationLookup, router, verificationQuery]);

  return (
    <motion.aside
      animate={{ width: isCollapsed ? 52 : 240 }}
      className="hidden h-screen flex-shrink-0 flex-col overflow-visible border-r border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest md:flex"
      initial={false}
      transition={{ type: "spring", stiffness: 430, damping: 42, mass: 0.85 }}
    >
      <AnimatePresence initial={false} mode="wait">
        {isCollapsed ? (
          <motion.div
            key="collapsed"
            animate={{ opacity: 1, filter: "blur(0px)" }}
            className="flex h-full w-full flex-col items-center px-1.5 py-4"
            exit={{ opacity: 0, filter: "blur(6px)" }}
            initial={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              aria-expanded={false}
              aria-label="Expand sidebar"
              className="inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent p-0 text-Color-Neutral transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-Color-Scheme-1-Text"
              onClick={() => setIsCollapsed(false)}
              title="Expand sidebar"
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path d="M5.75 7.25h12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                <path d="M5.75 12h12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
                <path d="M5.75 16.75h12.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
              </svg>
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            animate={{ opacity: 1, filter: "blur(0px)" }}
            className="flex h-full w-full flex-col justify-between px-2 py-4"
            exit={{ opacity: 0, filter: "blur(6px)" }}
            initial={{ opacity: 0, filter: "blur(6px)" }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          >
        <div className="flex flex-col gap-5">
          <div className="flex h-8 items-center justify-between px-2">
            <Image
              src="/icons/navbar/darci_black.svg"
              alt="DARCi"
              width={55}
              height={12}
              className="h-3 w-auto"
            />
            <button
              aria-expanded
              aria-label="Collapse sidebar"
              className="inline-flex h-7 w-7 items-center justify-center border-0 bg-transparent p-0 text-Color-Neutral transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-Color-Scheme-1-Text"
              onClick={() => setIsCollapsed(true)}
              title="Collapse sidebar"
              type="button"
            >
              <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <path d="m14 7-5 5 5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
            </button>
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
              const isVerificationItem = item.icon === "verify";
              const navItemClassName = `flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-display font-medium transition-colors duration-200 ease-in-out ${
                isActive || (isVerificationItem && isVerificationLookupOpen)
                  ? "bg-Color-Neutral-Lighter/60 text-Color-Scheme-1-Text"
                  : "text-Color-Neutral hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text"
              }`;

              return (
                <div
                  key={item.href}
                  className="relative flex flex-col"
                  ref={isVerificationItem ? verificationLookupRef : undefined}
                >
                  {item.sectionLabel ? (
                    <div className="px-2.5 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-[0.08em] text-Color-Neutral/80">
                      {item.sectionLabel}
                    </div>
                  ) : null}

                  {isVerificationItem ? (
                    <>
                      <button
                        aria-controls="sidebar-verification-lookup"
                        aria-expanded={isVerificationLookupOpen}
                        className={navItemClassName}
                        onClick={() => {
                          if (isVerificationLookupOpen) {
                            closeVerificationLookup();
                            return;
                          }

                          setVerificationLookupMessage(null);
                          setIsVerificationLookupOpen(true);
                        }}
                        type="button"
                      >
                        <span className="text-current">{renderNavIcon(item.icon)}</span>
                        {item.label}
                      </button>
                      {isVerificationLookupOpen ? (
                        <div
                          id="sidebar-verification-lookup"
                          className="absolute left-[calc(100%+0.75rem)] top-1/2 z-[70] w-80 -translate-y-1/2 rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-4 shadow-[0_22px_54px_rgba(0,0,0,0.16)]"
                        >
                          <form
                            className="space-y-3"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void runVerificationLookup();
                            }}
                          >
                            <div>
                              <div className="text-sm font-medium text-Color-Scheme-1-Text">Verify a document</div>
                              <div className="mt-1 text-xs leading-relaxed text-Color-Neutral">
                                Enter the document IDN to open its verification record.
                              </div>
                            </div>
                            <label className="block text-xs font-medium text-Color-Neutral-Darkest">
                              IDN
                              <input
                                className="mt-2 h-9 w-full rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-xs text-Color-Scheme-1-Text outline-none transition-colors placeholder:text-Color-Neutral focus-visible:border-Color-Scheme-1-Text"
                                onChange={(event) => {
                                  setVerificationQuery(event.target.value);
                                  setVerificationLookupMessage(null);
                                }}
                                placeholder="Enter IDN"
                                value={verificationQuery}
                              />
                            </label>
                            {verificationLookupMessage ? (
                              <div className="text-xs leading-relaxed text-Color-Neutral">
                                {verificationLookupMessage}
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between gap-3">
                              <button
                                className="inline-flex h-9 items-center justify-center bg-Green px-3 text-xs font-medium text-Color-Neutral-Darkest transition-colors hover:bg-Green-secondary disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isVerificationLookupLoading}
                                type="submit"
                              >
                                {isVerificationLookupLoading ? "Checking..." : "Verify"}
                              </button>
                              <button
                                className="border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline"
                                onClick={closeVerificationLookup}
                                type="button"
                              >
                                Close
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <Link
                      className={navItemClassName}
                      href={item.href}
                      prefetch={false}
                    >
                      <span className="text-current">{renderNavIcon(item.icon)}</span>
                      {item.label}
                    </Link>
                  )}
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
                <span className="rounded-full border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lighter px-1.5 py-0.5 text-[9px] font-medium text-Color-Scheme-1-Text">
                  {profileRoleLabel}
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
            <div className="rounded-md border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest px-3 py-3">
              {rolesToDisplay.length > 0 ? (
                <>
                  <div className="mb-2 text-[12px] font-medium text-Color-Neutral/80">
                    Switch profile
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rolesToDisplay.map((allowedRole) => {
                      const isCurrentProfile = allowedRole.label === profileRoleLabel;

                      return (
                      <button
                        key={allowedRole.label}
                        className={`rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-colors duration-200 ease-in-out ${
                          isCurrentProfile
                            ? "bg-Color-Scheme-1-Text text-white"
                            : "bg-Color-Neutral-Lighter text-Color-Scheme-1-Text hover:bg-Color-Neutral-Lighter/70"
                        }`}
                        disabled={isSwitchingRole || isCurrentProfile}
                        onClick={() => {
                          setIsProfilePanelOpen(false);
                          onSwitchRole?.(allowedRole.value);
                        }}
                        type="button"
                      >
                        {allowedRole.label}
                      </button>
                      );
                    })}
                  </div>
                  <div className="my-3 border-t border-Color-Scheme-1-Border/40" />
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
                {showNotarySignupLink ? (
                  <Link
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-Color-Neutral transition-colors duration-200 ease-in-out hover:bg-Color-Neutral-Lighter/40 hover:text-Color-Scheme-1-Text"
                    href="/app/notary/signup"
                    prefetch={false}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <path
                        d="M12 4.5v15"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M4.5 12h15"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                    Notary signup
                  </Link>
                ) : null}
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}