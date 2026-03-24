"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const getRouteLabel = (pathname: string) => {
  if (pathname === "/app") return "APP > DASHBOARD";
  if (pathname.startsWith("/app/new")) return "DOCUMENTS > NEW";
  if (pathname.startsWith("/app/documents/")) return "DOCUMENTS > DOC-1024";
  if (pathname.startsWith("/app/documents")) return "DOCUMENTS > ALL DOCUMENTS";
  if (pathname.startsWith("/app/requests/")) return "REQUESTS > REQ-8812";
  if (pathname.startsWith("/app/requests")) return "REQUESTS > ACTIVE REQUESTS";
  if (pathname.startsWith("/app/verification/")) return "VERIFICATION > IDN-29384";
  if (pathname.startsWith("/app/verification")) return "VERIFICATION > IDN LOOKUP";
  if (pathname.startsWith("/app/settings")) return "SETTINGS > ACCOUNT";
  if (pathname.startsWith("/app/notary")) return "NOTARY > QUEUE";
  if (pathname.startsWith("/app/ops")) return "OPS > CONSOLE";
  return "APP > DASHBOARD";
};

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const routeLabel = getRouteLabel(pathname);
  return (
    <div className="flex h-screen flex-col bg-Color-Neutral-Lightest text-Color-Scheme-1-Text">
      <div className="w-full bg-Color-Scheme-1-Background">
        <div className="flex w-full items-center justify-between px-6 py-3 md:px-10">
          <Link className="flex items-center gap-2" href="/">
            <img
              src="/icons/navbar/darci_white.svg"
              alt="DARCi"
              className="h-4 w-auto invert"
            />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="rounded border border-Color-Scheme-1-Border/40 px-4 py-2 text-sm font-medium"
              href="/app/verification"
            >
              Verify IDN
            </Link>
            <Link
              className="rounded bg-Green px-4 py-2 text-sm font-medium text-Color-Neutral-Darkest"
              href="/app/new"
            >
              New document
            </Link>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-1 gap-8 overflow-hidden px-6 py-8 md:px-10">
        <aside className="hidden w-56 flex-shrink-0 rounded-xl border border-Color-Scheme-1-Border/40 bg-Color-Scheme-1-Background p-4 md:block">
          <div className="text-xs uppercase text-Color-Neutral">Home</div>
          <nav className="mt-4 flex flex-col gap-2 text-sm">
            <Link className="rounded px-2 py-1 hover:bg-Color-Neutral-Lightest" href="/app">
              Start
            </Link>
            <Link className="rounded px-2 py-1 hover:bg-Color-Neutral-Lightest" href="/app/documents">
              Documents
            </Link>
            <Link className="rounded px-2 py-1 hover:bg-Color-Neutral-Lightest" href="/app/requests">
              Requests
            </Link>
            <Link className="rounded px-2 py-1 hover:bg-Color-Neutral-Lightest" href="/app/verification">
              Verification
            </Link>
            <Link className="rounded px-2 py-1 hover:bg-Color-Neutral-Lightest" href="/app/settings">
              Settings
            </Link>
            <div className="mt-4 text-xs uppercase text-Color-Neutral">Notary</div>
            <Link className="rounded px-2 py-1 hover:bg-Color-Neutral-Lightest" href="/app/notary">
              Queue
            </Link>
            <div className="mt-4 text-xs uppercase text-Color-Neutral">Ops</div>
            <Link className="rounded px-2 py-1 hover:bg-Color-Neutral-Lightest" href="/app/ops">
              Console
            </Link>
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
