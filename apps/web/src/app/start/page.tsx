"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  hasStoredSession,
  setStoredAuth,
  syncStoredAuthFromSession,
} from "@/lib/auth";
import { buildAuthCallbackUrl, sanitizeAuthReturnTo } from "@/lib/authRedirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type IdentifierChallenge = {
  kind: "email" | "phone";
  value: string;
  displayValue: string;
};

type AuthStep = "identifier" | "otp" | "password";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeOtpToken = (value: string) => value.replace(/\s+/g, "").trim();

const resolveIdentifier = (value: string): IdentifierChallenge | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (emailPattern.test(trimmed)) {
    const email = trimmed.toLowerCase();
    return { kind: "email", value: email, displayValue: email };
  }

  const phoneNumber = parsePhoneNumberFromString(trimmed, "US");
  if (phoneNumber?.isValid()) {
    return {
      kind: "phone",
      value: phoneNumber.number,
      displayValue: phoneNumber.formatInternational(),
    };
  }

  return null;
};

function StartAuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeAuthReturnTo(searchParams.get("returnTo"));
  const [authStep, setAuthStep] = useState<AuthStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [challenge, setChallenge] = useState<IdentifierChallenge | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);

  const resolvedIdentifier = useMemo(
    () => resolveIdentifier(identifier),
    [identifier],
  );

  useEffect(() => {
    if (hasStoredSession()) {
      router.replace(returnTo);
    }
  }, [returnTo, router]);

  const getActionRedirectTo = (intent: "otp" | "oauth") => {
    return buildAuthCallbackUrl({
      origin: window.location.origin,
      intent,
      returnTo,
    });
  };

  const resetMessages = () => {
    setErrorMessage(null);
    setNoticeMessage(null);
  };

  const startOtpChallenge = async () => {
    const nextChallenge = resolveIdentifier(identifier);
    if (!nextChallenge) {
      throw new Error("Enter a valid email address or phone number.");
    }

    const supabase = getSupabaseBrowserClient();

    if (nextChallenge.kind === "email") {
      const { error } = await supabase.auth.signInWithOtp({
        email: nextChallenge.value,
        options: {
          emailRedirectTo: getActionRedirectTo("otp"),
          shouldCreateUser: true,
        },
      });

      if (error) {
        throw error;
      }
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        phone: nextChallenge.value,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        throw error;
      }
    }

    setChallenge(nextChallenge);
    setOtpCode("");
    setPasswordEmail(nextChallenge.kind === "email" ? nextChallenge.value : "");
    setAuthStep("otp");
    setNoticeMessage(`Code sent to ${nextChallenge.displayValue}.`);
  };

  const verifyOtpChallenge = async () => {
    if (!challenge) {
      setAuthStep("identifier");
      throw new Error("Start with your email or phone number first.");
    }

    const token = normalizeOtpToken(otpCode);
    if (!token) {
      throw new Error("Enter the code we sent you.");
    }

    const supabase = getSupabaseBrowserClient();
    const result = challenge.kind === "email"
      ? await supabase.auth.verifyOtp({
          email: challenge.value,
          token,
          type: "email",
        })
      : await supabase.auth.verifyOtp({
          phone: challenge.value,
          token,
          type: "sms",
        });

    if (result.error || !result.data.session?.access_token) {
      throw new Error(result.error?.message || "Invalid or expired code.");
    }

    await syncStoredAuthFromSession({
      accessToken: result.data.session.access_token,
      refreshToken: result.data.session.refresh_token,
      intent: "otp",
    });

    router.push(returnTo);
  };

  const signInWithPassword = async () => {
    const email = passwordEmail.trim().toLowerCase();
    if (!emailPattern.test(email)) {
      throw new Error("Enter the email address for your password login.");
    }

    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const payload = (await response.json().catch(() => null)) as {
      accessToken?: string | null;
      refreshToken?: string | null;
      user?: unknown;
      message?: string;
      details?: Array<{ path?: string; message?: string }>;
    } | null;

    if (!response.ok || !payload?.user) {
      const validationMessage = payload?.details?.[0]?.message;
      throw new Error(payload?.message || validationMessage || "Request failed");
    }

    setStoredAuth({
      accessToken: payload.accessToken ?? null,
      refreshToken: payload.refreshToken ?? null,
      user: payload.user,
    });

    router.push(returnTo);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsSubmitting(true);

    try {
      if (authStep === "identifier") {
        await startOtpChallenge();
      } else if (authStep === "otp") {
        await verifyOtpChallenge();
      } else {
        await signInWithPassword();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    resetMessages();
    setIsSubmitting(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getActionRedirectTo("oauth") },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Google login failed");
      setIsSubmitting(false);
    }
  };

  const handlePasswordRecovery = async () => {
    resetMessages();
    const email = passwordEmail.trim().toLowerCase();

    if (!emailPattern.test(email)) {
      setErrorMessage("Enter your email first.");
      return;
    }

    setIsRecoverySubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/auth/password/recovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, returnTo }),
      });

      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        details?: Array<{ message?: string }>;
      } | null;

      if (!response.ok) {
        const validationMessage = payload?.details?.[0]?.message;
        throw new Error(payload?.message || validationMessage || "Request failed");
      }

      setNoticeMessage(payload?.message ?? "Password reset email sent.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setIsRecoverySubmitting(false);
    }
  };

  const usePasswordFallback = () => {
    resetMessages();
    setAuthStep("password");
    setPasswordEmail(challenge?.kind === "email" ? challenge.value : "");
    setPassword("");
  };

  const useDifferentIdentifier = () => {
    resetMessages();
    setAuthStep("identifier");
    setChallenge(null);
    setOtpCode("");
    setPassword("");
  };

  const submitLabel = isSubmitting
    ? authStep === "identifier"
      ? "Sending code..."
      : authStep === "otp"
        ? "Verifying code..."
        : "Signing in..."
    : authStep === "identifier"
      ? "Send code"
      : authStep === "otp"
        ? "Verify code"
        : "Sign in";

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
                <h1 className="font-display text-4xl font-medium md:text-5xl">
                  Access DARCi
                </h1>
                <p className="mt-3 text-sm leading-6 text-Color-Neutral">
                  {returnTo.startsWith("/app/invite")
                    ? "Sign in to continue to the document signature."
                    : "Sign in to continue your workspace."}
                </p>
              </div>

              <form className="mt-10 space-y-4" onSubmit={handleSubmit}>
                {authStep === "identifier" ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      Email or phone number
                    </label>
                    <input
                      autoComplete="username"
                      className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                      placeholder="Enter your email or phone number"
                      type="text"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      required
                    />
                    {identifier.trim() && resolvedIdentifier ? (
                      <p className="mt-2 text-xs text-Color-Neutral">
                        {resolvedIdentifier.kind === "email" ? "Email" : "SMS"} code to {resolvedIdentifier.displayValue}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {authStep === "otp" && challenge ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium">Code</label>
                    <input
                      autoComplete="one-time-code"
                      className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                      inputMode="numeric"
                      placeholder="123456"
                      type="text"
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value)}
                      required
                    />
                    <p className="mt-2 text-xs text-Color-Neutral">
                      Sent to {challenge.displayValue}
                    </p>
                  </div>
                ) : null}

                {authStep === "password" ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Email</label>
                      <input
                        autoComplete="username"
                        className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                        placeholder="you@example.com"
                        type="email"
                        value={passwordEmail}
                        onChange={(event) => setPasswordEmail(event.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Password</label>
                      <input
                        autoComplete="current-password"
                        className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                        placeholder="Enter your password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={8}
                      />
                    </div>
                    <button
                      type="button"
                      className="text-xs text-Color-Neutral underline underline-offset-4"
                      onClick={handlePasswordRecovery}
                      disabled={isRecoverySubmitting}
                    >
                      {isRecoverySubmitting ? "Sending reset..." : "Reset your password"}
                    </button>
                  </>
                ) : null}

                {noticeMessage ? (
                  <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {noticeMessage}
                  </div>
                ) : null}

                {errorMessage ? (
                  <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorMessage}
                  </div>
                ) : null}

                <div className="space-y-3 pt-2">
                  <button
                    className="w-full bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest disabled:opacity-60"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {submitLabel}
                  </button>

                  {authStep === "otp" ? (
                    <button
                      type="button"
                      className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm font-medium"
                      onClick={usePasswordFallback}
                      disabled={isSubmitting}
                    >
                      Log in with password
                    </button>
                  ) : null}

                  {authStep === "password" ? (
                    <button
                      type="button"
                      className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm font-medium"
                      onClick={() => {
                        resetMessages();
                        setAuthStep(challenge ? "otp" : "identifier");
                      }}
                      disabled={isSubmitting}
                    >
                      Use code instead
                    </button>
                  ) : null}

                  {authStep !== "identifier" ? (
                    <button
                      type="button"
                      className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm font-medium"
                      onClick={useDifferentIdentifier}
                      disabled={isSubmitting}
                    >
                      Use different email or phone
                    </button>
                  ) : null}

                  <button
                    className="flex w-full items-center justify-center gap-3 border border-Color-Scheme-1-Border bg-white px-4 py-3 text-sm font-medium text-Color-Scheme-1-Text disabled:opacity-60"
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled={isSubmitting}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                    >
                      <path
                        fill="currentColor"
                        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.14 3.57-8.64Z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.87-3c-1.07.72-2.44 1.15-4.08 1.15-3.14 0-5.8-2.12-6.75-4.96H1.25v3.09A12 12 0 0 0 12 24Z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.25 14.28A7.2 7.2 0 0 1 4.87 12c0-.79.14-1.56.38-2.28V6.63H1.25A12 12 0 0 0 0 12c0 1.94.46 3.78 1.25 5.37l4-3.09Z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.96 1.2 15.24 0 12 0A12 12 0 0 0 1.25 6.63l4 3.09c.95-2.84 3.61-4.95 6.75-4.95Z"
                      />
                    </svg>
                    Continue with Google
                  </button>
                </div>
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

export default function StartAuthPage() {
  return (
    <Suspense fallback={null}>
      <StartAuthPageContent />
    </Suspense>
  );
}
