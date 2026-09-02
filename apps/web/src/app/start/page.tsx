"use client";

import { FormEvent, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import ProfileCompletionForm, {
  formatProfilePhoneInputValue,
} from "@/components/auth/ProfileCompletionForm";
import {
  clearStoredAuth,
  getStoredAuth,
  hasCompleteStoredUserProfile,
  logoutStoredAuth,
  refreshStoredAuth,
  reportWebAuthIssue,
  setStoredAuth,
  switchStoredUserRole,
  syncStoredAuthFromSession,
  type StoredUser,
  type StoredUserRole,
} from "@/lib/auth";
import { buildAuthCallbackUrl, sanitizeAuthReturnTo } from "@/lib/authRedirects";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import {
  getNextOtpFocusIndexAfterInput,
  getOtpCodeForAutoSubmit,
  getOtpDigitsOnly,
  getOtpVerificationFailureMessage,
  isCompleteOtpDigits,
} from "./otpInput";

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
  stepUp?: {
    method: "email";
    identifier: string;
    otpLength?: number | null;
    cooldownSeconds?: number | null;
    message?: string;
  };
};
type PendingAuthSession = {
  accessToken: string;
  refreshToken: string | null;
  user: StoredUser;
};
type UpdateProfilePayload = {
  user?: StoredUser | null;
  message?: string;
  details?: Array<{ message?: string }>;
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
const storedUserRoles: StoredUserRole[] = ["member", "pro", "notary", "admin"];

const isStoredUserRole = (value: string | null): value is StoredUserRole => {
  return Boolean(value && storedUserRoles.includes(value as StoredUserRole));
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getStoredUserDisplayName = (user: StoredUser | null | undefined) => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return fullName || user?.email || "another account";
};

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

  const phoneNumber = trimmed.startsWith("+")
    ? parsePhoneNumberFromString(trimmed)
    : parsePhoneNumberFromString(trimmed, "US");
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
  const intendedEmail = normalizeEmail(searchParams.get("intendedEmail"));
  const isNotaryReturnTo = returnTo.startsWith("/app/notary");
  const [authStep, setAuthStep] = useState<AuthStep>("identifier");
  const [identifier, setIdentifier] = useState("");
  const [challenge, setChallenge] = useState<IdentifierChallenge | null>(null);
  const [otpDigits, setOtpDigits] = useState<string[]>(() =>
    Array.from({ length: DEFAULT_OTP_LENGTH }, () => ""),
  );
  const [passwordEmail, setPasswordEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingAuthSession, setPendingAuthSession] = useState<PendingAuthSession | null>(null);
  const [sessionMismatchUser, setSessionMismatchUser] = useState<StoredUser | null>(null);
  const [notarySessionGuardUser, setNotarySessionGuardUser] = useState<StoredUser | null>(null);
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
  const lastAutoSubmittedOtpCodeRef = useRef<string | null>(null);

  const otpCode = useMemo(() => otpDigits.join(""), [otpDigits]);

  useEffect(() => {
    lastAutoSubmittedOtpCodeRef.current = null;
  }, [authStep, challenge?.value]);

  const hasIntendedEmailMismatch = useCallback((user: StoredUser | null | undefined) => {
    const sessionEmail = normalizeEmail(user?.email);
    return Boolean(intendedEmail && sessionEmail && sessionEmail !== intendedEmail);
  }, [intendedEmail]);

  const showIntendedEmailMismatch = useCallback((user: StoredUser) => {
    setSessionMismatchUser(user);
    setIdentifier(intendedEmail);
    setPasswordEmail(intendedEmail);
    setPendingAuthSession(null);
    setChallenge(null);
    setOtpDigits(Array.from({ length: DEFAULT_OTP_LENGTH }, () => ""));
    setAuthStep("identifier");
    setErrorMessage(null);
    setNoticeMessage(null);
  }, [intendedEmail]);

  const assertIntendedEmailMatches = useCallback((user: StoredUser | null | undefined) => {
    if (!user || !hasIntendedEmailMismatch(user)) {
      setSessionMismatchUser(null);
      return;
    }

    showIntendedEmailMismatch(user);
    throw new Error(`This notary request was sent to ${intendedEmail}. Sign in with that email to continue.`);
  }, [hasIntendedEmailMismatch, intendedEmail, showIntendedEmailMismatch]);

  const shouldConfirmUnscopedNotarySession = useCallback((user: StoredUser | null | undefined) => {
    return Boolean(user && isNotaryReturnTo && !intendedEmail);
  }, [intendedEmail, isNotaryReturnTo]);

  const showUnscopedNotarySessionGuard = useCallback((user: StoredUser) => {
    setNotarySessionGuardUser(user);
    setPendingAuthSession(null);
    setChallenge(null);
    setOtpDigits(Array.from({ length: DEFAULT_OTP_LENGTH }, () => ""));
    setAuthStep("identifier");
    setErrorMessage(null);
    setNoticeMessage(null);
  }, []);

  const getReturnToRoleHint = useCallback(() => {
    try {
      const url = new URL(returnTo, window.location.origin);
      const role = url.searchParams.get("role");
      return isStoredUserRole(role) ? role : null;
    } catch {
      return null;
    }
  }, [returnTo]);

  const storeSessionAndActivateReturnRole = useCallback(async (input: {
    accessToken: string | null | undefined;
    refreshToken: string | null;
    user: StoredUser;
  }) => {
    if (!input.accessToken) {
      throw new Error("Missing session");
    }

    setStoredAuth({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      user: input.user,
    });

    const roleHint = getReturnToRoleHint();
    if (!roleHint || input.user.role === roleHint) {
      return;
    }

    const availableRoles = input.user.availableRoles ?? [input.user.role];
    if (!availableRoles.includes(roleHint)) {
      throw new Error(`This account does not have access to the ${roleHint} profile.`);
    }

    await switchStoredUserRole(roleHint);
  }, [getReturnToRoleHint]);

  useEffect(() => {
    let cancelled = false;

    const showProfileStep = (authSession: ReturnType<typeof getStoredAuth>) => {
      if (!authSession.accessToken || !authSession.user) {
        return false;
      }

      setPendingAuthSession({
        accessToken: authSession.accessToken,
        refreshToken: authSession.refreshToken,
        user: authSession.user,
      });
      setProfileForm({
        firstName: authSession.user.firstName ?? "",
        lastName: authSession.user.lastName ?? "",
        email: authSession.user.email ?? "",
        phone: formatProfilePhoneInputValue(authSession.user.phone ?? ""),
      });
      setChallenge(null);
      setErrorMessage(null);
      setNoticeMessage("Complete your profile to continue.");
      setAuthStep("profile");
      return true;
    };

    const continueStoredSession = async () => {
      const storedAuth = getStoredAuth();
      if (!storedAuth.accessToken) {
        return;
      }

      try {
        const syncedAuth = await syncStoredAuthFromSession({
          accessToken: storedAuth.accessToken,
          refreshToken: storedAuth.refreshToken,
        });

        if (cancelled) {
          return;
        }

        const nextAuth = syncedAuth ?? getStoredAuth();
        if (nextAuth.user && hasIntendedEmailMismatch(nextAuth.user)) {
          showIntendedEmailMismatch(nextAuth.user);
          return;
        }

        if (nextAuth.user && !hasCompleteStoredUserProfile(nextAuth.user) && showProfileStep(nextAuth)) {
          return;
        }

        if (nextAuth.user && shouldConfirmUnscopedNotarySession(nextAuth.user)) {
          showUnscopedNotarySessionGuard(nextAuth.user);
          return;
        }

        if (nextAuth.accessToken && nextAuth.user) {
          await storeSessionAndActivateReturnRole({
            accessToken: nextAuth.accessToken,
            refreshToken: nextAuth.refreshToken,
            user: nextAuth.user,
          });
        }

        router.replace(returnTo);
      } catch {
        if (cancelled) {
          return;
        }

        const refreshedAuth = await refreshStoredAuth().catch(() => null);
        if (cancelled) {
          return;
        }

        if (!refreshedAuth?.accessToken) {
          clearStoredAuth();
          setPendingAuthSession(null);
          setNoticeMessage("Your session expired. Send a new code to continue.");
          setAuthStep("identifier");
          return;
        }

        if (refreshedAuth.user && hasIntendedEmailMismatch(refreshedAuth.user)) {
          showIntendedEmailMismatch(refreshedAuth.user);
          return;
        }

        if (refreshedAuth.user && !hasCompleteStoredUserProfile(refreshedAuth.user) && showProfileStep(refreshedAuth)) {
          return;
        }

        if (refreshedAuth.user && shouldConfirmUnscopedNotarySession(refreshedAuth.user)) {
          showUnscopedNotarySessionGuard(refreshedAuth.user);
          return;
        }

        if (refreshedAuth.accessToken) {
          if (refreshedAuth.user) {
            await storeSessionAndActivateReturnRole({
              accessToken: refreshedAuth.accessToken,
              refreshToken: refreshedAuth.refreshToken,
              user: refreshedAuth.user,
            });
          }
          router.replace(returnTo);
        }
      }
    };

    void continueStoredSession();

    return () => {
      cancelled = true;
    };
  }, [hasIntendedEmailMismatch, returnTo, router, shouldConfirmUnscopedNotarySession, showIntendedEmailMismatch, showUnscopedNotarySessionGuard, storeSessionAndActivateReturnRole]);

  useEffect(() => {
    if (intendedEmail && authStep === "identifier" && !identifier.trim()) {
      setIdentifier(intendedEmail);
      setPasswordEmail(intendedEmail);
    }
  }, [authStep, identifier, intendedEmail]);

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

  const finishVerifiedSession = async (
    payload: AuthSessionResponsePayload,
    verifiedChallenge: IdentifierChallenge,
  ) => {
    if (!payload.accessToken || !payload.user) {
      const validationMessage = payload.details?.[0]?.message;
      throw new Error(payload.message || validationMessage || "Invalid or expired code.");
    }

    assertIntendedEmailMatches(payload.user);

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
        email: payload.user.email || (verifiedChallenge.kind === "email" ? verifiedChallenge.value : "") || intendedEmail,
        phone: formatProfilePhoneInputValue(
          payload.user.phone ?? (verifiedChallenge.kind === "phone" ? verifiedChallenge.value : ""),
        ),
      });
      setNoticeMessage("Complete your profile to continue.");
      setIsSubmitting(false);
      setAuthStep("profile");
      return;
    }

    await storeSessionAndActivateReturnRole({
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
      reportWebAuthIssue({
        operation: "otp_resend",
        reason: "failed",
        error,
        level: "warning",
        details: { authMethod: challenge.kind },
      });
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

      if (response.ok && payload?.stepUp?.method === "email") {
        const stepUpEmail = normalizeEmail(payload.stepUp.identifier);
        if (!emailPattern.test(stepUpEmail)) {
          throw new Error("The linked account email could not be verified. Sign in with email instead.");
        }

        const stepUpOtpLength = normalizeOtpLength(payload.stepUp.otpLength);
        setChallenge({
          kind: "email",
          value: stepUpEmail,
          displayValue: stepUpEmail,
        });
        setPasswordEmail(stepUpEmail);
        setOtpDigits(Array.from({ length: stepUpOtpLength }, () => ""));
        setResendCountdownSeconds(
          normalizeResendCooldownSeconds(payload.stepUp.cooldownSeconds),
        );
        setNoticeMessage(
          payload.stepUp.message ?? "Enter the code sent to the email linked to this phone number.",
        );
        lastAutoSubmittedOtpCodeRef.current = null;
        requestAnimationFrame(() => {
          otpInputRefs.current[0]?.focus();
        });
        return;
      }

      if (!response.ok || !payload?.accessToken || !payload.user) {
        const validationMessage = payload?.details?.[0]?.message;
        throw new Error(
          getOtpVerificationFailureMessage({
            status: response.status,
            message: payload?.message,
            validationMessage,
          }),
        );
      }

      await finishVerifiedSession(payload, challenge);
    } else {
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
        throw new Error(
          getOtpVerificationFailureMessage({
            status: response.status,
            message: payload?.message,
            validationMessage,
          }),
        );
      }

      await finishVerifiedSession(payload, challenge);
    }
  };

  const updateOtpDigitsFromInput = (value: string, index: number) => {
    const digitsOnly = getOtpDigitsOnly(value);
    setErrorMessage(null);

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

    const nextFocusIndex = getNextOtpFocusIndexAfterInput(value, index, otpDigits.length);
    if (nextFocusIndex !== null) {
      requestAnimationFrame(() => {
        otpInputRefs.current[nextFocusIndex]?.focus();
      });
    }
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

    const nextAutoSubmittedOtpCode = getOtpCodeForAutoSubmit(
      otpDigits,
      lastAutoSubmittedOtpCodeRef.current,
    );

    if (!nextAutoSubmittedOtpCode) {
      if (!isCompleteOtpDigits(otpDigits)) {
        lastAutoSubmittedOtpCodeRef.current = null;
      }
      return;
    }

    lastAutoSubmittedOtpCodeRef.current = nextAutoSubmittedOtpCode;
    let cancelled = false;

    const runVerify = async () => {
      resetMessages();
      setIsSubmitting(true);

      try {
        await verifyOtpChallenge();
      } catch (error) {
        if (!cancelled) {
          reportWebAuthIssue({
            operation: "otp_verify",
            reason: "failed",
            error,
            level: "warning",
            details: { authMethod: challenge?.kind ?? "unknown", autoSubmitted: true },
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-submit reads the current OTP/challenge snapshot.
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
      user?: StoredUser | null;
      profileCompletionRequired?: boolean;
      message?: string;
      details?: Array<{ path?: string; message?: string }>;
    } | null;

    if (!response.ok || !payload?.user) {
      const validationMessage = payload?.details?.[0]?.message;
      throw new Error(payload?.message || validationMessage || "Request failed");
    }

    assertIntendedEmailMatches(payload.user);

    if (payload.profileCompletionRequired || !hasCompleteStoredUserProfile(payload.user)) {
      await finishVerifiedSession(
        {
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
          user: payload.user,
          profileCompletionRequired: true,
        },
        { kind: "email", value: email, displayValue: email },
      );
      return;
    }

    await storeSessionAndActivateReturnRole({
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

    if (intendedEmail && email !== intendedEmail) {
      throw new Error(`This notary request was sent to ${intendedEmail}. Sign in with that email to continue.`);
    }

    if (!parsedPhone?.isValid()) {
      throw new Error("Enter a valid phone number.");
    }

    const profilePayload = {
      firstName,
      lastName,
      email,
      phone: parsedPhone.number,
    };
    const updateProfile = async (accessToken: string) => {
      const response = await fetch(`${apiBaseUrl}/users/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(profilePayload),
      });

      const payload = (await response.json().catch(() => null)) as UpdateProfilePayload | null;

      return { payload, response };
    };

    let activeAuthSession = pendingAuthSession;
    let { payload, response } = await updateProfile(activeAuthSession.accessToken);

    if (response.status === 401) {
      const refreshedAuth = await refreshStoredAuth().catch(() => null);
      if (refreshedAuth?.accessToken && refreshedAuth.user) {
        activeAuthSession = {
          accessToken: refreshedAuth.accessToken,
          refreshToken: refreshedAuth.refreshToken,
          user: refreshedAuth.user,
        };
        ({ payload, response } = await updateProfile(activeAuthSession.accessToken));
      } else {
        clearStoredAuth();
        setPendingAuthSession(null);
        setNoticeMessage("Your session expired. Send a new code to continue.");
        setAuthStep("identifier");
        throw new Error("Your session expired. Send a new code to continue.");
      }
    }

    if (!response.ok || !payload?.user) {
      const validationMessage = payload?.details?.[0]?.message;
      throw new Error(payload?.message || validationMessage || "Failed to complete profile.");
    }

    const completedUser = {
      ...activeAuthSession.user,
      ...payload.user,
      firstName,
      lastName,
      email,
      phone: parsedPhone.number,
    };

    await storeSessionAndActivateReturnRole({
      accessToken: activeAuthSession.accessToken,
      refreshToken: activeAuthSession.refreshToken,
      user: completedUser,
    });
    setPendingAuthSession(null);
    router.replace(returnTo);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsSubmitting(true);

    try {
      if (authStep === "identifier") {
        await startOtpChallenge();
      } else if (authStep === "otp") {
        lastAutoSubmittedOtpCodeRef.current = normalizeOtpToken(otpCode) || null;
        await verifyOtpChallenge();
      } else if (authStep === "profile") {
        await completeProfile();
      } else {
        await signInWithPassword();
      }
    } catch (error) {
      reportWebAuthIssue({
        operation: authStep === "identifier"
          ? "otp_start"
          : authStep === "otp"
            ? "otp_verify"
            : authStep === "profile"
              ? "profile_completion"
              : "password_login",
        reason: "failed",
        error,
        level: "warning",
        details: {
          authStep,
          authMethod: challenge?.kind ?? null,
          autoSubmitted: false,
        },
      });
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
      reportWebAuthIssue({
        operation: "oauth_start",
        reason: "failed",
        error,
        level: "warning",
        details: { provider: "google" },
      });
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
      reportWebAuthIssue({
        operation: "password_recovery",
        reason: "failed",
        error,
        level: "warning",
      });
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

  const handleUseIntendedEmail = async () => {
    resetMessages();
    setIsSubmitting(true);

    try {
      await logoutStoredAuth();
    } catch {
      clearStoredAuth();
    } finally {
      setSessionMismatchUser(null);
      setPendingAuthSession(null);
      setChallenge(null);
      setIdentifier(intendedEmail);
      setPasswordEmail(intendedEmail);
      setOtpDigits(Array.from({ length: DEFAULT_OTP_LENGTH }, () => ""));
      setAuthStep("identifier");
      setNoticeMessage(`Sign in as ${intendedEmail} to open this notary request.`);
      setIsSubmitting(false);
    }
  };

  const handleContinueWithCurrentNotarySession = async () => {
    resetMessages();
    const storedAuth = getStoredAuth();
    if (!storedAuth.accessToken || !storedAuth.user) {
      setNotarySessionGuardUser(null);
      setAuthStep("identifier");
      return;
    }

    setIsSubmitting(true);
    try {
      await storeSessionAndActivateReturnRole({
        accessToken: storedAuth.accessToken,
        refreshToken: storedAuth.refreshToken,
        user: storedAuth.user,
      });
      setNotarySessionGuardUser(null);
      router.replace(returnTo);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to continue with this account.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseAssignedNotaryAccount = async () => {
    resetMessages();
    setIsSubmitting(true);

    try {
      await logoutStoredAuth();
    } catch {
      clearStoredAuth();
    } finally {
      setNotarySessionGuardUser(null);
      setPendingAuthSession(null);
      setChallenge(null);
      setIdentifier("");
      setPasswordEmail("");
      setOtpDigits(Array.from({ length: DEFAULT_OTP_LENGTH }, () => ""));
      setAuthStep("identifier");
      setNoticeMessage("Sign in with the assigned notary email to open this request.");
      setIsSubmitting(false);
    }
  };

  const hasSessionMismatch = Boolean(sessionMismatchUser && intendedEmail);
  const hasUnscopedNotarySessionGuard = Boolean(notarySessionGuardUser && isNotaryReturnTo && !intendedEmail);
  const supportingCopy = hasUnscopedNotarySessionGuard
    ? "This notary request link does not identify the assigned email, so confirm the signed-in account before continuing."
    : hasSessionMismatch
    ? "This notary request belongs to a different signed-in email."
    : authStep === "profile"
    ? "Add your name and contact details before entering your workspace."
    : authStep === "otp" && challenge
    ? `Verification code sent to ${challenge.displayValue}`
    : returnTo.startsWith("/app/invite")
      ? "Sign in to continue to the document signature."
      : returnTo.startsWith("/app/notary")
        ? "Sign in as the assigned notary to review this request."
      : authStep === "identifier"
        ? "Use one field for email or mobile. We will send the right verification code."
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
                {hasSessionMismatch && sessionMismatchUser ? (
                  <div className="border border-Color-Scheme-1-Border bg-black/5 px-4 py-3 text-sm leading-6 text-Color-Neutral">
                    <div>
                      You are signed in as {getStoredUserDisplayName(sessionMismatchUser)}. This notary request is for {intendedEmail}.
                    </div>
                    <button
                      type="button"
                      className="mt-3 w-full bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest disabled:opacity-60"
                      onClick={handleUseIntendedEmail}
                      disabled={isSubmitting}
                    >
                      Log out and use assigned notary email
                    </button>
                  </div>
                ) : null}

                {hasUnscopedNotarySessionGuard && notarySessionGuardUser ? (
                  <div className="border border-Color-Scheme-1-Border bg-black/5 px-4 py-3 text-sm leading-6 text-Color-Neutral">
                    <div>
                      You are signed in as {getStoredUserDisplayName(notarySessionGuardUser)}. Continue only if this is the notary account that received the request email.
                    </div>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        className="w-full bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest disabled:opacity-60"
                        onClick={handleContinueWithCurrentNotarySession}
                        disabled={isSubmitting}
                      >
                        Continue with this notary account
                      </button>
                      <button
                        type="button"
                        className="w-full border border-Color-Scheme-1-Border bg-white px-4 py-3 text-sm font-medium text-Color-Scheme-1-Text disabled:opacity-60"
                        onClick={handleUseAssignedNotaryAccount}
                        disabled={isSubmitting}
                      >
                        Log out and use assigned notary email
                      </button>
                    </div>
                  </div>
                ) : null}

                {!hasSessionMismatch && !hasUnscopedNotarySessionGuard ? (
                  <>
                    {authStep === "identifier" ? (
                      <div>
                        <label className="mb-2 block text-sm font-medium">
                          Email or phone number
                        </label>
                        <input
                          autoComplete="username"
                          className="w-full border border-Color-Scheme-1-Border px-4 py-3 text-sm outline-none transition focus:border-Color-Scheme-1-Text"
                          placeholder="name@example.com or +1 202 555 0147"
                          type="text"
                          value={identifier}
                          onChange={(event) => setIdentifier(event.target.value)}
                          required
                        />
                        <p className="mt-2 text-xs leading-5 text-Color-Neutral">
                          Email gets an email code. Mobile gets an SMS code.
                        </p>
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
                      <ProfileCompletionForm
                        lockedEmail={challenge?.kind === "email" || Boolean(pendingAuthSession?.user.email?.trim()) || Boolean(intendedEmail)}
                        lockedPhone={challenge?.kind === "phone" || Boolean(pendingAuthSession?.user.phone?.trim())}
                        onChange={setProfileForm}
                        value={profileForm}
                      />
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
                  </>
                ) : null}
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
