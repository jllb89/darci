"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { syncStoredAuthFromSession } from "@/lib/auth";
import { sanitizeAuthReturnTo } from "@/lib/authRedirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeAuthReturnTo(searchParams.get("returnTo"));
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data, error } = await getSupabaseBrowserClient().auth.getSession();
        if (error) {
          throw error;
        }

        if (!data.session?.access_token || !data.session.refresh_token) {
          throw new Error("Password reset session expired");
        }

        setAccessToken(data.session.access_token);
        setRefreshToken(data.session.refresh_token);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Password reset unavailable");
      }
    };

    loadSession();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!accessToken || !refreshToken) {
      setErrorMessage("Password reset session expired");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw error;
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      await syncStoredAuthFromSession({
        accessToken: sessionData.session?.access_token ?? accessToken,
        refreshToken: sessionData.session?.refresh_token ?? refreshToken,
      });
      router.replace(returnTo);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Password reset failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-white text-Color-Scheme-1-Text">
      <div className="relative flex h-full w-full flex-col">
        <header className="absolute left-0 right-0 top-0 z-10 flex h-20 items-center bg-transparent px-8 md:px-12">
          <Link href="/" aria-label="DARCi home">
            <Image
              src="/icons/navbar/darci_black.svg"
              alt="DARCi"
              width={91}
              height={20}
              className="h-5 w-auto"
            />
          </Link>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
          <section className="relative flex min-h-0 items-center justify-center bg-white px-8 pb-10 pt-24 md:px-12 md:pb-16 md:pt-28">
            <div className="w-full max-w-md">
              <div>
                <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
                  Set a new password
                </h1>
                <p className="mt-3 text-sm leading-6 text-Color-Neutral">
                  Enter a new password to continue to DARCi.
                </p>
              </div>

              <form className="mt-10 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-2 block text-sm font-medium">New password</label>
                  <input
                    className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium">Confirm password</label>
                  <input
                    className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                    type="password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </div>

                {errorMessage ? (
                  <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </div>
                ) : null}

                <button
                  className="w-full bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest"
                  type="submit"
                  disabled={isSubmitting || !accessToken}
                >
                  {isSubmitting ? "Updating password..." : "Update password"}
                </button>
              </form>
            </div>

            <div className="absolute bottom-10 left-8 text-xs text-Color-Neutral md:bottom-16 md:left-12">
              © 2024 DARCi
            </div>
          </section>

          <section className="relative hidden min-h-0 md:block">
            <Image
              src="/images/hero/hero.webp"
              alt="DARCi hero"
              fill
              priority
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/60" />
          </section>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}