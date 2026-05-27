"use client";

import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";
import {
  hasStoredSession,
  setStoredAuth,
  syncStoredAuthFromSession,
  type StoredUser,
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

type AuthStep = "identifier" | "otp" | "password" | "profile";
type OtpStartResponsePayload = {
  message?: string;
  otpLength?: number | null;
  cooldownSeconds?: number | null;
  details?: Array<{ message?: string }>;
};
type AuthSessionResponsePayload = {
  accessToken?: string | null;
  refreshToken?: string | null;
  user?: StoredUser | null;
  profileCompletionRequired?: boolean;
  message?: string;
  details?: Array<{ message?: string }>;
};
type PendingAuthSession = {
  accessToken: string;
  refreshToken: string | null;
  user: StoredUser;
};
type ProfileFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

const DEFAULT_OTP_LENGTH = 8;
const MIN_OTP_LENGTH = 4;
const MAX_OTP_LENGTH = 12;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;
const MAX_RESEND_COOLDOWN_SECONDS = 10 * 60;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeOtpToken = (value: string) => value.replace(/\s+/g, "").trim();

const normalizeOtpLength = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_OTP_LENGTH;
  }

  if (value < MIN_OTP_LENGTH || value > MAX_OTP_LENGTH) {
    return DEFAULT_OTP_LENGTH;
  }

  return value;
};

const normalizeResendCooldownSeconds = (value: unknown) => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return DEFAULT_RESEND_COOLDOWN_SECONDS;
  }

  if (value < 0 || value > MAX_RESEND_COOLDOWN_SECONDS) {
    return DEFAULT_RESEND_COOLDOWN_SECONDS;
  }

  return value;
};

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

const formatPhoneInputValue = (value: string) => {
  const trimmed = value.trimStart();
  if (!trimmed) {
    return "";
  }

  return new AsYouType("US").input(trimmed);
};

function StartAuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeAuthReturnTo(searchParams.get("returnTo"));
  const [authStep, setAuthStep] = useState<AuthStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [challenge, setChallenge] = useState<IdentifierChallenge | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(() =>
    Array.from({ length: DEFAULT_OTP_LENGTH }, () => ""),
  );
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAuthSession, setPendingAuthSession] = useState<PendingAuthSession | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoverySubmitting, setIsRecoverySubmitting] = useState(false);
  const [resendCountdownSeconds, setResendCountdownSeconds] = useState(0);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const otpCode = useMemo(() => otpDigits.join(""), [otpDigits]);

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

  const finishVerifiedSession = (
    payload: AuthSessionResponsePayload,
    verifiedChallenge: IdentifierChallenge,
  ) => {
    if (!payload.accessToken || !payload.user) {
      const validationMessage = payload.details?.[0]?.message;
      throw new Error(payload.message || validationMessage || "Invalid or expired code.");
    }

    const refreshToken = payload.refreshToken ?? null;

    if (payload.profileCompletionRequired) {
      setPendingAuthSession({
        accessToken: payload.accessToken,
        refreshToken,
        user: payload.user,
      });
      setProfileForm({
        firstName: payload.user.firstName ?? "",
        lastName: payload.user.lastName ?? "",
        email: payload.user.email || (verifiedChallenge.kind === "email" ? verifiedChallenge.value : ""),
        phone: formatPhoneInputValue(
          payload.user.phone ?? (verifiedChallenge.kind === "phone" ? verifiedChallenge.value : ""),
        ),
      });
      setNoticeMessage("Complete your profile to continue.");
      setIsSubmitting(false);
      setAuthStep("profile");
      return;
    }

    setStoredAuth({
      accessToken: payload.accessToken,
      refreshToken,
      user: payload.user,
    });
    router.push(returnTo);
  };

  const requestOtpForChallenge = async (nextChallenge: IdentifierChallenge) => {
    let nextOtpLength = DEFAULT_OTP_LENGTH;
    let nextCooldownSeconds = DEFAULT_RESEND_COOLDOWN_SECONDS;

    if (nextChallenge.kind === "email") {
      const response = await fetch(`${apiBaseUrl}/auth/otp/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: nextChallenge.value,
          returnTo,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | OtpStartResponsePayload
        | null;

      if (!response.ok) {
        const validationMessage = payload?.details?.[0]?.message;
        throw new Error(payload?.message || validationMessage || "Failed to send code");
      }

      nextOtpLength = normalizeOtpLength(payload?.otpLength);
      nextCooldownSeconds = normalizeResendCooldownSeconds(payload?.cooldownSeconds);
      setNoticeMessage(payload?.message ?? `Code sent to ${nextChallenge.displayValue}.`);
    } else {
      // ✅ FIXED: Phone OTP now uses backend endpoint (server-side like email OTP)
      const response = await fetch(`${apiBaseUrl}/auth/otp/phone/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: nextChallenge.value,
          returnTo,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | OtpStartResponsePayload
        | null;

      if (!response.ok) {
        const validationMessage = payload?.details?.[0]?.message;
        throw new Error(payload?.message || validationMessage || "Failed to send code");
      }

      nextOtpLength = normalizeOtpLength(payload?.otpLength);
      nextCooldownSeconds = normalizeResendCooldownSeconds(payload?.cooldownSeconds);
      setNoticeMessage(payload?.message ?? `Code sent to ${nextChallenge.displayValue}.`);
    }

    setResendCountdownSeconds(nextCooldownSeconds);
    return nextOtpLength;
  };

  const startOtpChallenge = async () => {
    const nextChallenge = resolveIdentifier(identifier);
    if (!nextChallenge) {
      throw new Error("Enter a valid email address or phone number.");
    }

    const nextOtpLength = await requestOtpForChallenge(nextChallenge);

    setChallenge(nextChallenge);
    setOtpDigits(Array.from({ length: nextOtpLength }, () => ""));
    setPasswordEmail(nextChallenge.kind === "email" ? nextChallenge.value : "");
    setAuthStep("otp");
    requestAnimationFrame(() => {
      otpInputRefs.current[0]?.focus();
    });
  };

  const requestAnotherCode = async () => {
    if (!challenge || resendCountdownSeconds > 0 || isSubmitting) {
      return;
    }

    resetMessages();
    setIsSubmitting(true);

    try {
      const nextOtpLength = await requestOtpForChallenge(challenge);
      setOtpDigits(Array.from({ length: nextOtpLength }, () => ""));
      requestAnimationFrame(() => {
        otpInputRefs.current[0]?.focus();
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setIsSubmitting(false);
    }
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

    if (challenge.kind === "email") {
      const response = await fetch(`${apiBaseUrl}/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: challenge.value,
          token,
          returnTo,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | AuthSessionResponsePayload
        | null;

      if (!response.ok || !payload?.accessToken || !payload.user) {
        const validationMessage = payload?.details?.[0]?.message;
        throw new Error(payload?.message || validationMessage || "Invalid or expired code.");
      }

      finishVerifiedSession(payload, challenge);
    } else {
      // ✅ FIXED: Phone OTP verify now uses backend endpoint (server-side like email OTP)
      const response = await fetch(`${apiBaseUrl}/auth/otp/phone/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: challenge.value,
          token,
          returnTo,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | AuthSessionResponsePayload
        | null;

      if (!response.ok || !payload?.accessToken || !payload.user) {
        const validationMessage = payload?.details?.[0]?.message;
        throw new Error(payload?.message || validationMessage || "Invalid or expired code.");
      }

      finishVerifiedSession(payload, challenge);
    }
  };

  const updateOtpDigitsFromInput = (value: string, index: number) => {
    const digitsOnly = value.replace(/\D/g, "");

    setOtpDigits((currentDigits) => {
      const nextDigits = [...currentDigits];

      if (!digitsOnly) {
        nextDigits[index] = "";
        return nextDigits;
      }

      for (let offset = 0; offset < digitsOnly.length; offset += 1) {
        const targetIndex = index + offset;
        if (targetIndex >= nextDigits.length) {
          break;
        }

        nextDigits[targetIndex] = digitsOnly[offset] ?? "";
      }

      return nextDigits;
    });

    const nextFocusIndex = Math.min(
      index + Math.max(digitsOnly.length, 1),
      otpDigits.length - 1,
    );
    requestAnimationFrame(() => {
      otpInputRefs.current[nextFocusIndex]?.focus();
    });
  };

  const handleOtpDigitKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      event.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < otpDigits.length - 1) {
      event.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (
    event: React.ClipboardEvent<HTMLInputElement>,
    index: number,
  ) => {
    const pastedDigits = event.clipboardData.getData("text").replace(/\D/g, "");
    if (!pastedDigits) {
      return;
    }

    event.preventDefault();
    updateOtpDigitsFromInput(pastedDigits, index);
  };

  useEffect(() => {
    if (authStep !== "otp" || resendCountdownSeconds <= 0) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setResendCountdownSeconds((currentSeconds) => Math.max(currentSeconds - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [authStep, resendCountdownSeconds]);

  useEffect(() => {
    if (authStep !== "otp" || isSubmitting) {
      return;
    }

    if (!otpDigits.every((digit) => digit.length === 1)) {
      return;
    }

    let cancelled = false;

    const runVerify = async () => {
      resetMessages();
      setIsSubmitting(true);

      try {
        await verifyOtpChallenge();
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Request failed");
        }
      } finally {
        if (!cancelled) {
          setIsSubmitting(false);
        }
      }
    };

    runVerify();

    return () => {
      cancelled = true;
    };
  }, [authStep, isSubmitting, otpDigits]);

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

  const completeProfile = async () => {
    if (!pendingAuthSession) {
      throw new Error("Verify your code before completing your profile.");
    }

    const firstName = profileForm.firstName.trim();
    const lastName = profileForm.lastName.trim();
    const email = profileForm.email.trim().toLowerCase();
    const parsedPhone = parsePhoneNumberFromString(profileForm.phone.trim(), "US");

    if (!firstName || !lastName) {
      throw new Error("Enter your first and last name.");
    }

    if (!emailPattern.test(email)) {
      throw new Error("Enter a valid email address.");
    }

    if (!parsedPhone?.isValid()) {
      throw new Error("Enter a valid phone number.");
    }

    const response = await fetch(`${apiBaseUrl}/users/me`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pendingAuthSession.accessToken}`,
      },
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        phone: parsedPhone.number,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { user?: StoredUser | null; message?: string; details?: Array<{ message?: string }> }
      | null;

    if (!response.ok || !payload?.user) {
      const validationMessage = payload?.details?.[0]?.message;
      throw new Error(payload?.message || validationMessage || "Failed to complete profile.");
    }

    setStoredAuth({
      accessToken: pendingAuthSession.accessToken,
      refreshToken: pendingAuthSession.refreshToken,
      user: payload.user,
    });
    setPendingAuthSession(null);
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
      } else if (authStep === "profile") {
        await completeProfile();
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
    setPendingAuthSession(null);
    setOtpDigits(Array.from({ length: DEFAULT_OTP_LENGTH }, () => ""));
    setResendCountdownSeconds(0);
    setPassword("");
  };

  const supportingCopy = authStep === "profile"
    ? "Add your name and contact details before entering your workspace."
    : authStep === "otp" && challenge
    ? `Verification code sent to ${challenge.displayValue}`
    : returnTo.startsWith("/app/invite")
      ? "Sign in to continue to the document signature."
      : "Sign in to continue your workspace.";
  const headingLabel = authStep === "profile" ? "Complete your profile" : "Access DARCi";

  const submitLabel = isSubmitting
    ? authStep === "identifier"
      ? "Sending code..."
      : authStep === "otp"
        ? "Verifying code..."
        : authStep === "profile"
          ? "Saving profile..."
        : "Signing in..."
    : authStep === "identifier"
      ? "Send code"
      : authStep === "otp"
        ? "Verify code"
        : authStep === "profile"
          ? "Continue"
        : "Sign in";

  return (
    <div className="h-screen w-screen overflow-hidden bg-white text-Color-Scheme-1-Text">
      <div className="relative flex h-full w-full flex-col">
        {noticeMessage ? (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[120]">
            <div className="mx-auto mt-3 w-[min(92vw,32rem)] rounded-md bg-black px-4 py-2 text-center text-xs font-medium text-white shadow-[0_16px_36px_rgba(0,0,0,0.3)]">
              {noticeMessage}
            </div>
          </div>
        ) : null}
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
              {authStep !== "identifier" && authStep !== "profile" ? (
                <button
                  type="button"
                  className="mb-8 text-xs font-medium text-Color-Neutral underline underline-offset-4 disabled:opacity-50"
                  onClick={useDifferentIdentifier}
                  disabled={isSubmitting}
                >
                  go back
                </button>
              ) : null}

              <div>
                <h1 className="font-display text-4xl font-medium md:text-5xl">
                  {headingLabel}
                </h1>
                <p className="mt-3 text-sm leading-6 text-Color-Neutral">
                  {supportingCopy}
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
                  </div>
                ) : null}

                {authStep === "otp" && challenge ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium">Code</label>
                    <div className="flex w-full items-center justify-between gap-2">
                      {otpDigits.map((digit, index) => (
                        <input
                          key={`otp-digit-${index}`}
                          ref={(element) => {
                            otpInputRefs.current[index] = element;
                          }}
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          className="h-12 min-w-0 flex-1 border border-Color-Scheme-1-Border text-center text-lg outline-none transition focus:border-Color-Scheme-1-Text md:h-14"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          type="text"
                          maxLength={1}
                          value={digit}
                          onChange={(event) => updateOtpDigitsFromInput(event.target.value, index)}
                          onKeyDown={(event) => handleOtpDigitKeyDown(event, index)}
                          onPaste={(event) => handleOtpPaste(event, index)}
                          disabled={isSubmitting}
                          required
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="mt-3 text-xs text-Color-Neutral underline underline-offset-4 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-70"
                      onClick={requestAnotherCode}
                      disabled={isSubmitting || resendCountdownSeconds > 0}
                    >
                      {resendCountdownSeconds > 0
                        ? `Request another code in... ${resendCountdownSeconds} seconds`
                        : "Request another code"}
                    </button>
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

                {authStep === "profile" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium">First name</label>
                        <input
                          autoComplete="given-name"
                          className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                          type="text"
                          value={profileForm.firstName}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              firstName: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium">Last name</label>
                        <input
                          autoComplete="family-name"
                          className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                          type="text"
                          value={profileForm.lastName}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              lastName: event.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Email</label>
                      <input
                        autoComplete="email"
                        className={`w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text ${
                          challenge?.kind === "email" ? "bg-Color-Neutral-Lightest text-Color-Neutral" : ""
                        }`}
                        type="email"
                        value={profileForm.email}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                        readOnly={challenge?.kind === "email"}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium">Phone number</label>
                      <input
                        autoComplete="tel"
                        className={`w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text ${
                          challenge?.kind === "phone" ? "bg-Color-Neutral-Lightest text-Color-Neutral" : ""
                        }`}
                        placeholder="(555) 555-1234"
                        type="tel"
                        value={profileForm.phone}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            phone: formatPhoneInputValue(event.target.value),
                          }))
                        }
                        readOnly={challenge?.kind === "phone"}
                        required
                      />
                    </div>
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

                  <button
                    className="flex w-full cursor-not-allowed items-center justify-center gap-3 border border-Color-Scheme-1-Border bg-Color-Neutral-Lightest px-4 py-3 text-sm font-medium text-Color-Neutral disabled:opacity-70"
                    type="button"
                    onClick={handleGoogleAuth}
                    disabled
                    aria-disabled="true"
                    title="Google sign-in is temporarily unavailable"
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
