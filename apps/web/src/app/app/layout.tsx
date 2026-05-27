"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AppSidebar from "@/components/app/AppSidebar";
import AppTopbarBreadcrumb from "@/components/app/AppTopbarBreadcrumb";
import {
  AppToastProvider,
  type AppToastInput,
} from "@/components/app/AppToastContext";
import {
  hasCompleteStoredUserProfile,
  logoutStoredAuth,
  switchStoredUserRole,
  syncStoredAuthFromSession,
  useStoredAuth,
  useStoredSession,
  useStoredUser,
  type StoredUserRole,
} from "@/lib/auth";

type ToastState = {
  tone: AppToastInput["tone"];
  message: string;
  durationMs: number;
  id: number;
};

const TOAST_EXIT_DURATION_MS = 240;

const isStoredUserRole = (value: unknown): value is StoredUserRole => {
  return value === "member" || value === "pro" || value === "notary" || value === "admin";
};

const roleLandingPath: Record<StoredUserRole, string> = {
  member: "/app",
  pro: "/app",
  notary: "/app/notary",
  admin: "/app",
};

const notaryBlockedRoutePrefixes = [
  "/app/activity",
  "/app/documents",
  "/app/requests",
  "/app/review",
  "/app/sign",
  "/app/start",
];

const isNotaryBlockedRoute = (pathname: string) => {
  return pathname === "/app" || notaryBlockedRoutePrefixes.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  });
};

const getAvailableRoles = (user: ReturnType<typeof useStoredUser>, fallbackRole: StoredUserRole) => {
  const roleSources = [
    (user as { roles?: unknown } | null)?.roles,
    (user as { allowedRoles?: unknown } | null)?.allowedRoles,
    (user as { availableRoles?: unknown } | null)?.availableRoles,
  ];

  const collectedRoles = roleSources.flatMap((source) => {
    if (!Array.isArray(source)) {
      return [];
    }

    return source.filter(isStoredUserRole);
  });

  if (collectedRoles.length === 0) {
    return [fallbackRole];
  }

  return Array.from(new Set(collectedRoles));
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAuthorized = useStoredSession();
  const { accessToken, refreshToken } = useStoredAuth();
  const user = useStoredUser();
  const role: StoredUserRole = user?.role ?? "member";
  const availableRoles = getAvailableRoles(user, role);
  const isPublicInviteRoute = pathname === "/app/invite";
  const searchParamsString = searchParams.toString();
  const profileCompletionReturnTo = `${pathname}${searchParamsString ? `?${searchParamsString}` : ""}`;
  const profileName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || user?.phone || "Profile";
  const profileEmail = user?.email || user?.phone || "Profile";
  const isProfileCompletionRequired = Boolean(
    accessToken && user && !hasCompleteStoredUserProfile(user),
  );
  const sessionSyncKey = accessToken ? `${accessToken}:${refreshToken ?? ""}` : null;
  const startedSessionSyncKeyRef = useRef<string | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [checkedSessionSyncKey, setCheckedSessionSyncKey] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSwitchingRole, setIsSwitchingRole] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastPhase, setToastPhase] = useState<"hidden" | "visible" | "closing">("hidden");
  const hasCheckedCurrentSession = !sessionSyncKey || checkedSessionSyncKey === sessionSyncKey;
  const shouldRedirectForProfileCompletion = isProfileCompletionRequired && hasCheckedCurrentSession;

  const clearToast = useCallback(() => {
    setToastPhase("closing");
  }, []);

  const showToast = useCallback((nextToast: AppToastInput) => {
    setToast({
      tone: nextToast.tone,
      message: nextToast.message,
      durationMs: nextToast.durationMs ?? 4000,
      id: Date.now(),
    });
    setToastPhase("visible");
  }, []);

  const toastContextValue = useMemo(
    () => ({
      showToast,
      clearToast,
    }),
    [clearToast, showToast],
  );

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (hasHydrated && !isAuthorized && !isPublicInviteRoute) {
      router.replace("/start");
    }
  }, [hasHydrated, isAuthorized, isPublicInviteRoute, router]);

  useEffect(() => {
    if (!hasHydrated || !isAuthorized || isPublicInviteRoute || !accessToken) {
      return;
    }

    if (!sessionSyncKey || startedSessionSyncKeyRef.current === sessionSyncKey) {
      return;
    }

    startedSessionSyncKeyRef.current = sessionSyncKey;
    setCheckedSessionSyncKey(null);

    let cancelled = false;
    void syncStoredAuthFromSession({ accessToken, refreshToken })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setCheckedSessionSyncKey(sessionSyncKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasHydrated, isAuthorized, isPublicInviteRoute, refreshToken, sessionSyncKey]);

  useEffect(() => {
    if (!hasHydrated || !isAuthorized || isPublicInviteRoute || !shouldRedirectForProfileCompletion) {
      return;
    }

    router.replace(`/start?returnTo=${encodeURIComponent(profileCompletionReturnTo || "/app")}`);
  }, [hasHydrated, isAuthorized, isPublicInviteRoute, profileCompletionReturnTo, router, shouldRedirectForProfileCompletion]);

  useEffect(() => {
    if (hasHydrated && isAuthorized && !shouldRedirectForProfileCompletion && role === "notary" && isNotaryBlockedRoute(pathname)) {
      router.replace(roleLandingPath.notary);
    }
  }, [hasHydrated, isAuthorized, pathname, role, router, shouldRedirectForProfileCompletion]);

  useEffect(() => {
    if (!toast) {
      setToastPhase("hidden");
      return;
    }

    if (toastPhase !== "visible") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastPhase((currentPhase) => {
        return currentPhase === "visible" ? "closing" : currentPhase;
      });
    }, toast.durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast, toastPhase]);

  useEffect(() => {
    if (!toast || toastPhase !== "closing") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast((currentToast) => {
        if (!currentToast || currentToast.id !== toast.id) {
          return currentToast;
        }

        return null;
      });
      setToastPhase("hidden");
    }, TOAST_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast, toastPhase]);

  const handleLogout = async () => {
    if (!accessToken || isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    clearToast();

    try {
      await logoutStoredAuth();
      showToast({ tone: "success", message: "Signed out" });
      window.setTimeout(() => {
        router.replace("/start");
      }, 250);
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to sign out",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleRoleSwitch = async (nextRole: StoredUserRole) => {
    if (nextRole === role || isSwitchingRole) {
      return;
    }

    setIsSwitchingRole(true);
    clearToast();

    try {
      await switchStoredUserRole(nextRole);
      showToast({ tone: "success", message: `Switched to ${nextRole} profile` });
      router.push(roleLandingPath[nextRole]);
    } catch (error) {
      showToast({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to switch profile",
      });
    } finally {
      setIsSwitchingRole(false);
    }
  };

  if (!hasHydrated) {
    return null;
  }

  if (isPublicInviteRoute) {
    return <>{children}</>;
  }

  if (!isAuthorized) {
    return null;
  }

  if (isProfileCompletionRequired && !hasCheckedCurrentSession) {
    return null;
  }

  if (shouldRedirectForProfileCompletion) {
    return null;
  }

  return (
    <AppToastProvider value={toastContextValue}>
      <div className="flex h-screen bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
        {toast ? (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[80]">
            <div
              className="w-full border-b border-black/10 bg-Color-Green px-6 py-2 text-Color-Neutral-Darkest shadow-[0_16px_36px_rgba(0,0,0,0.18)] md:px-10"
              role="status"
              style={{
                animation:
                  toastPhase === "closing"
                    ? `darciToastSlideOut ${TOAST_EXIT_DURATION_MS}ms cubic-bezier(0.2,0.8,0.2,1) forwards`
                    : `darciToastSlideIn 260ms cubic-bezier(0.16,1,0.3,1) both`,
              }}
            >
              <div className="flex items-center justify-center text-xs font-medium text-Color-Neutral-Darkest">
                <span>{toast.message}</span>
              </div>
            </div>
          </div>
        ) : null}
        <AppSidebar
          isLoggingOut={isLoggingOut}
          isSwitchingRole={isSwitchingRole}
          onLogout={handleLogout}
          onSwitchRole={handleRoleSwitch}
          pathname={pathname}
          availableRoles={availableRoles}
          profileEmail={profileEmail}
          profileName={profileName}
          role={role}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbarBreadcrumb pathname={pathname} />

          <main className="flex-1 overflow-y-auto bg-Color-Neutral-Lightest px-6 pb-6 pt-16 md:px-10">
            {children}
          </main>
        </div>
      </div>
    </AppToastProvider>
  );
}
