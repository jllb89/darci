"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { syncStoredAuthFromSession } from "@/lib/auth";
import { sanitizeAuthReturnTo } from "@/lib/authRedirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Completing authentication...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const completeCallback = async () => {
      const code = searchParams.get("code");
      const intent = searchParams.get("intent");
      const returnTo = sanitizeAuthReturnTo(searchParams.get("returnTo"));
      const errorDescription = searchParams.get("error_description") ?? searchParams.get("error");

      if (errorDescription) {
        throw new Error(errorDescription);
      }

      if (!code) {
        throw new Error("Missing auth callback code");
      }

      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        throw error;
      }

      if (!data.session?.access_token) {
        throw new Error("Missing auth session");
      }

      if (intent === "recovery") {
        router.replace(`/auth/reset-password?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      setMessage("Preparing your workspace...");
      await syncStoredAuthFromSession({
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        intent:
          intent === "signup" ||
          intent === "magic-link" ||
          intent === "otp" ||
          intent === "oauth"
            ? intent
            : null,
      });
      router.replace(returnTo);
    };

    completeCallback().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "Authentication failed");
    });
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-8 text-Color-Scheme-1-Text">
      <div className="w-full max-w-sm">
        <Link href="/" aria-label="DARCi home" className="inline-flex">
          <Image
            src="/icons/navbar/darci_black.svg"
            alt="DARCi"
            width={91}
            height={20}
            className="h-5 w-auto"
          />
        </Link>
        <h1 className="mt-10 font-display text-3xl font-medium tracking-tight">
          {errorMessage ? "Authentication failed" : "One moment"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-Color-Neutral">
          {errorMessage ?? message}
        </p>
        {errorMessage ? (
          <Link
            href="/start"
            className="mt-8 inline-flex w-full items-center justify-center bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest"
          >
            Return to sign in
          </Link>
        ) : null}
      </div>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <AuthCallbackContent />
    </Suspense>
  );
}