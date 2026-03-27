"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutStoredAuth, useStoredAuth, useStoredSession, useStoredUser } from "@/lib/auth";

type AppRole = "member" | "notary" | "admin";

type NavItem = {
  label: string;
  href: string;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
};

const ROLE_NAV_ITEMS: Record<AppRole, NavItem[]> = {
  member: [
    { label: "Dashboard", href: "/app" },
    { label: "Start document", href: "/app/start" },
    { label: "Documents", href: "/app/documents" },
    { label: "Requests", href: "/app/requests" },
    { label: "Verification", href: "/app/verification" },
    { label: "Settings", href: "/app/settings" },
  ],
  notary: [
    { label: "Dashboard", href: "/app" },
    { label: "Requests", href: "/app/requests" },
    { label: "Verification", href: "/app/verification" },
    { label: "Settings", href: "/app/settings" },
  ],
  admin: [
    { label: "Dashboard", href: "/app" },
    { label: "Documents", href: "/app/documents" },
    { label: "Requests", href: "/app/requests" },
    { label: "Verification", href: "/app/verification" },
    { label: "Ops console", href: "/app/ops" },
    { label: "Settings", href: "/app/settings" },
  ],
};

const getRouteLabel = (pathname: string) => {
  if (pathname === "/app") return "APP > DASHBOARD";
  if (pathname.startsWith("/app/start")) return "DOCUMENTS > START";
  if (pathname.startsWith("/app/documents/")) return "DOCUMENTS > DOC-1024";
  if (pathname.startsWith("/app/documents")) return "DOCUMENTS > ALL DOCUMENTS";
  if (pathname.startsWith("/app/requests/")) return "REQUESTS > REQ-8812";
  if (pathname.startsWith("/app/requests")) return "REQUESTS > ACTIVE REQUESTS";
  if (pathname.startsWith("/app/verification/")) return "VERIFICATION > IDN-29384";
  if (pathname.startsWith("/app/verification")) return "VERIFICATION > IDN LOOKUP";
  if (pathname.startsWith("/app/settings")) return "SETTINGS > ACCOUNT";
  if (pathname.startsWith("/app/ops")) return "OPS > CONSOLE";
  return "APP > DASHBOARD";
};

const isNavItemActive = (pathname: string, href: string) => {
  if (href === "/app") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
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
  const role: AppRole = user?.role ?? "member";
  const navItems = ROLE_NAV_ITEMS[role];
  const routeLabel = getRouteLabel(pathname);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!isAuthorized) {
      router.replace("/start");
    }
  }, [isAuthorized, router]);

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

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
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
      <div className="w-full bg-Color-Scheme-1-Background">
        <div className="flex w-full items-center justify-between px-6 py-3 md:px-10">
          <Link className="flex items-center gap-2" href="/">
            <Image
              src="/icons/navbar/darci_white.svg"
              alt="DARCi"
              width={76}
              height={16}
              className="h-4 w-auto invert"
            />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {role !== "admin" ? (
              <Link
                className="rounded border border-Color-Scheme-1-Border/40 px-4 py-2 text-sm font-medium"
                href="/app/verification"
              >
                Verify IDN
              </Link>
            ) : null}
            {role === "member" ? (
              <Link
                className="rounded bg-Green px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest"
                href="/app/start"
              >
                New document
              </Link>
            ) : null}
            <button
              className="rounded border border-Color-Scheme-1-Border/40 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoggingOut}
              onClick={handleLogout}
              type="button"
            >
              {isLoggingOut ? "Signing out..." : "Log out"}
            </button>
            <div className="text-xs uppercase text-Color-Neutral">
              {role}
            </div>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-1 gap-8 overflow-hidden px-6 py-8 md:px-10">
        <aside className="hidden w-56 flex-shrink-0 rounded-xl border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Background p-4 md:block">
          <div className="text-xs uppercase text-Color-Neutral">{role}</div>
          <nav className="mt-4 flex flex-col gap-2 text-sm">
            {navItems.map((item) => {
              const isActive = isNavItemActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  className={`rounded px-2 py-1 ${
                    isActive
                      ? "bg-Color-Neutral-Lightest font-medium"
                      : "hover:bg-Color-Neutral-Lightest"
                  }`}
                  href={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Background p-6">
          <div className="mb-6 text-xs uppercase text-Color-Neutral">
            {routeLabel}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
