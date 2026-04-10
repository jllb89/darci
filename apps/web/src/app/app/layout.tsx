"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AppSidebar from "@/components/app/AppSidebar";
import AppTopbarBreadcrumb from "@/components/app/AppTopbarBreadcrumb";
import {
  logoutStoredAuth,
  useStoredAuth,
  useStoredSession,
  useStoredUser,
  type StoredUserRole,
} from "@/lib/auth";

type ToastState = {
  tone: "success" | "error";
  message: string;
};

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
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  const handleLogout = async () => {
    if (!accessToken || isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    setToast(null);

    try {
      await logoutStoredAuth();
      setToast({ tone: "success", message: "Signed out" });
      window.setTimeout(() => {
        router.replace("/start");
      }, 250);
    } catch (error) {
      setToast({
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
    <div className="flex h-screen bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
      {toast ? (
        <div className="pointer-events-none fixed right-6 top-20 z-50">
          <div
            className={`min-w-[240px] rounded-lg border px-4 py-3 text-sm shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
            role="status"
          >
            {toast.message}
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
  );
}
