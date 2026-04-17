"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AppSidebar from "@/components/app/AppSidebar";
import AppTopbarBreadcrumb from "@/components/app/AppTopbarBreadcrumb";
import {
  AppToastProvider,
  type AppToastInput,
} from "@/components/app/AppToastContext";
import {
  logoutStoredAuth,
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
  return value === "member" || value === "notary" || value === "admin";
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
  const isAuthorized = useStoredSession();
  const { accessToken } = useStoredAuth();
  const user = useStoredUser();
  const role: StoredUserRole = user?.role ?? "member";
  const availableRoles = getAvailableRoles(user, role);
  const profileName = "Name Placeholder";
  const profileEmail = user?.email ?? "email@example.com";
  const [hasHydrated, setHasHydrated] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [toastPhase, setToastPhase] = useState<"hidden" | "visible" | "closing">("hidden");

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
    if (hasHydrated && !isAuthorized) {
      router.replace("/start");
    }
  }, [hasHydrated, isAuthorized, router]);

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

  if (!hasHydrated) {
    return null;
  }

  if (!isAuthorized) {
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
          onLogout={handleLogout}
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
