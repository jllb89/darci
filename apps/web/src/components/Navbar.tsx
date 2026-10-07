"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logoutStoredAuth, useStoredSession } from "@/lib/auth";

const landingLinks = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Questions", href: "/#questions" },
];

type NavbarProps = {
  showLogout?: boolean;
};

export default function Navbar({ showLogout = true }: NavbarProps) {
  const router = useRouter();
  const isAuthenticated = useStoredSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await logoutStoredAuth();
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <>
      <div className="fixed left-0 top-0 z-50 w-full bg-Color-Scheme-1-Text">
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-3 px-6 md:px-16">
          <Link href="/" aria-label="DARCi home" className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <Image
              src="/icons/navbar/darci_white.svg"
              alt="DARCi"
              width={71}
              height={20}
              className="h-5 w-auto"
              priority
            />
          </Link>
          <div className="hidden h-10 w-20 md:block" />
          <div className="flex min-w-0 items-center gap-3 lg:gap-6">
            <nav aria-label="Main navigation" className="hidden items-center gap-6 lg:flex">
              {landingLinks.map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center text-sm text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">{item.label}</Link>)}
            </nav>
            <button type="button" aria-expanded={isMenuOpen} aria-controls="landing-mobile-navigation" onClick={() => setIsMenuOpen(!isMenuOpen)} className="min-h-11 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white lg:hidden">
              {isMenuOpen ? "Close" : "Menu"}
            </button>
            <div className="flex min-w-0 items-center gap-3">
              {showLogout && isAuthenticated ? (
                <button
                  className="border border-Color-Scheme-1-Background px-5 py-2 text-Color-Scheme-1-Background disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                  type="button"
                >
                  <div className="text-sm font-medium font-sans leading-6">
                    {isLoggingOut ? "Signing out..." : "Log out"}
                  </div>
                </button>
              ) : null}
              <Link
                data-alternate="False"
                data-icon-position="No icon"
                data-small="True"
                data-style="Secondary"
                className="flex min-h-11 items-center gap-2 bg-Green px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-5"
                href={isAuthenticated ? "/app" : "/start"}
              >
                <div className="text-Color-Scheme-1-Text text-sm font-medium font-sans leading-6">
                  {isAuthenticated ? "Go to dashboard" : "Get started"}
                </div>
              </Link>
            </div>
          </div>
        </div>
        <nav id="landing-mobile-navigation" aria-label="Mobile navigation" hidden={!isMenuOpen} className="border-t border-white/20 px-6 pb-4 lg:hidden">
          {landingLinks.map((item) => <Link key={item.href} href={item.href} onClick={() => setIsMenuOpen(false)} className="flex min-h-11 items-center text-sm text-white focus-visible:outline-2 focus-visible:outline-white">{item.label}</Link>)}
        </nav>
      </div>
      <div className="h-16" aria-hidden="true" />
    </>
  );
}
