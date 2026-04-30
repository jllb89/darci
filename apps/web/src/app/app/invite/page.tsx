"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  clearStoredAuth,
  logoutStoredAuth,
  refreshStoredAuth,
  useStoredAuth,
  type StoredUser,
} from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type InviteRecipient = {
  id: string;
  channel: "email" | "sms" | "in_app";
  deliveryAddress: string | null;
  displayName: string | null;
  isPrimary: boolean;
};

type PublicInviteView = {
  id: string;
  documentId: string;
  documentOutputSignerId: string | null;
  status: string;
  claimMode: string;
  recipientName: string | null;
  partyRole: string | null;
  obligationType: string | null;
  documentLabel: string;
  documentType: string;
  roleLabel: string;
  requesterName: string | null;
  recipients: InviteRecipient[];
  token: {
    status: string;
    expiresAt: string;
    isExpired: boolean;
    canClaim: boolean;
  };
  latestClaim: {
    id: string;
    claimStatus: string;
    claimAddress: string | null;
  } | null;
};

type PublicInviteResponse = {
  invite?: PublicInviteView | null;
  message?: string;
};

type InviteClaimResponse = {
  invite?: PublicInviteView | null;
  message?: string;
};

const normalizeEmail = (value?: string | null) => value?.trim().toLowerCase() ?? "";

const formatTokenLabel = (value?: string | null) => {
  const candidate = value?.trim() ?? "";
  if (!candidate) {
    return "Signer";
  }

  return candidate
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatInviteDate = (value?: string | null) => {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

const getPrimaryEmailRecipient = (invite: PublicInviteView | null) => {
  return (
    invite?.recipients.find(
      (recipient) => recipient.isPrimary && recipient.channel === "email",
    ) ??
    invite?.recipients.find((recipient) => recipient.channel === "email") ??
    null
  );
};

const getReturnTo = (token: string) => {
  const params = new URLSearchParams({ token });
  return `/app/invite?${params.toString()}`;
};

const buildAuthHref = (token: string, mode: "login" | "signup") => {
  const params = new URLSearchParams({
    returnTo: getReturnTo(token),
    mode,
  });
  return `/start?${params.toString()}`;
};

const fetchInvite = async (token: string, accessToken: string | null) => {
  const headers = new Headers();
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const request = () =>
    fetch(`${apiBaseUrl}/invites/public/${encodeURIComponent(token)}`, {
      cache: "no-store",
      headers,
    });

  let response = await request();
  if (response.status === 401 && accessToken) {
    const refreshed = await refreshStoredAuth();
    const refreshedAccessToken = refreshed?.accessToken ?? null;
    headers.delete("Authorization");
    if (refreshedAccessToken) {
      headers.set("Authorization", `Bearer ${refreshedAccessToken}`);
      response = await request();
    }
  }

  return response;
};

const claimInvite = async (input: {
  token: string;
  accessToken: string;
  claimAddress: string | null;
}) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.set("Authorization", `Bearer ${input.accessToken}`);

  const request = (accessToken: string) => {
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(`${apiBaseUrl}/invites/public/${encodeURIComponent(input.token)}/claim`, {
      method: "POST",
      headers,
      body: JSON.stringify({ claimAddress: input.claimAddress ?? undefined }),
    });
  };

  let response = await request(input.accessToken);
  if (response.status === 401) {
    const refreshed = await refreshStoredAuth();
    if (refreshed?.accessToken) {
      response = await request(refreshed.accessToken);
    }
  }

  return response;
};

const getDisplayName = (user: StoredUser | null) => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return fullName || user?.email || "there";
};

function InviteLandingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const { accessToken, user } = useStoredAuth();
  const [invite, setInvite] = useState<PublicInviteView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const primaryRecipient = useMemo(() => getPrimaryEmailRecipient(invite), [invite]);
  const invitedEmail = normalizeEmail(primaryRecipient?.deliveryAddress);
  const sessionEmail = normalizeEmail(user?.email);
  const emailMatches = Boolean(sessionEmail && (!invitedEmail || sessionEmail === invitedEmail));
  const hasEmailMismatch = Boolean(sessionEmail && invitedEmail && sessionEmail !== invitedEmail);
  const roleLabel = invite?.roleLabel || formatTokenLabel(invite?.partyRole ?? invite?.obligationType);

  const loadInvite = useCallback(async () => {
    if (!token) {
      setErrorMessage("Invite token is missing.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetchInvite(token, accessToken);
      const payload = (await response.json().catch(() => null)) as PublicInviteResponse | null;

      if (!response.ok || !payload?.invite) {
        throw new Error(payload?.message || "Invite could not be loaded.");
      }

      setInvite(payload.invite);
    } catch (error) {
      setInvite(null);
      setErrorMessage(error instanceof Error ? error.message : "Invite could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, token]);

  useEffect(() => {
    void loadInvite();
  }, [loadInvite]);

  const goToSigning = useCallback(
    (documentId: string) => {
      router.replace(`/app/sign?documentId=${encodeURIComponent(documentId)}`);
    },
    [router],
  );

  const handleContinue = async () => {
    if (!invite || !token || !accessToken || isClaiming) {
      return;
    }

    if (!emailMatches) {
      setErrorMessage("This invite belongs to a different email address.");
      return;
    }

    if (!invite.token.canClaim && ["claimed", "accepted"].includes(invite.status)) {
      goToSigning(invite.documentId);
      return;
    }

    setIsClaiming(true);
    setErrorMessage(null);

    try {
      const response = await claimInvite({
        token,
        accessToken,
        claimAddress: user?.email ?? invitedEmail,
      });
      const payload = (await response.json().catch(() => null)) as InviteClaimResponse | null;

      if (!response.ok || !payload?.invite) {
        throw new Error(payload?.message || "Invite could not be claimed.");
      }

      goToSigning(payload.invite.documentId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Invite could not be claimed.");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleUseDifferentAccount = async () => {
    setErrorMessage(null);
    try {
      await logoutStoredAuth();
    } catch {
      clearStoredAuth();
    } finally {
      router.replace(buildAuthHref(token, "login"));
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
            {isLoading ? (
              <div className="w-full max-w-md">
                <div
                  aria-label="Loading invitation"
                  className="h-1 w-full overflow-hidden bg-black/10"
                  role="progressbar"
                >
                  <div className="h-full w-1/3 animate-pulse bg-Green" />
                </div>
              </div>
            ) : (
              <>
                <div className="w-full max-w-md">
                  <div>
                    <div className="mb-4 text-sm font-medium text-Color-Neutral">
                      Signature request
                    </div>
                    <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
                      {invite ? "Review and sign with DARCi" : "Invitation unavailable"}
                    </h1>
                    <p className="mt-3 text-sm leading-6 text-Color-Neutral">
                      {invite
                        ? `You've been invited to review and sign ${invite.documentLabel} as ${roleLabel}.`
                        : "This link could not be opened. Check that the invitation is current and try again."}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-Color-Neutral">
                      DARCi helps people prepare, sign, and manage important documents securely. This invitation lets you complete only the signature step assigned to you.
                    </p>
                  </div>

                  <div className="mt-10 space-y-6">
                    {errorMessage ? (
                      <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                        {errorMessage}
                      </div>
                    ) : null}

                    {invite ? (
                      <div className="border-y border-Color-Scheme-1-Border py-5 text-sm">
                        <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3">
                          <div className="text-Color-Neutral">Document</div>
                          <div className="font-medium">{invite.documentLabel}</div>
                          <div className="text-Color-Neutral">Role</div>
                          <div>{roleLabel}</div>
                          <div className="text-Color-Neutral">Expires</div>
                          <div>{formatInviteDate(invite.token.expiresAt)}</div>
                        </div>
                      </div>
                    ) : null}

                    {invite && invite.token.isExpired ? (
                      <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                        This invitation has expired. Ask the document owner to send a fresh link.
                      </div>
                    ) : null}

                    {invite && hasEmailMismatch ? (
                      <div className="border border-Color-Scheme-1-Border bg-black/5 px-4 py-3 text-sm leading-6 text-Color-Neutral">
                        You are signed in as {getDisplayName(user)}. This invitation is for {invitedEmail}.
                      </div>
                    ) : null}

                    {invite && !invite.token.isExpired ? (
                      <div className="space-y-3 pt-2">
                        {!accessToken ? (
                          <>
                            <Link
                              className="flex w-full items-center justify-center bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest"
                              href={buildAuthHref(token, "signup")}
                            >
                              Create account to sign
                            </Link>
                            <Link
                              className="flex w-full items-center justify-center border border-Color-Scheme-1-Border bg-black/5 px-4 py-3 text-sm font-medium text-Color-Scheme-1-Text"
                              href={buildAuthHref(token, "login")}
                            >
                              Sign in to sign
                            </Link>
                          </>
                        ) : emailMatches ? (
                          <button
                            className="w-full bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest disabled:opacity-60"
                            type="button"
                            onClick={handleContinue}
                            disabled={isClaiming}
                          >
                            {isClaiming ? "Opening document..." : "Continue to document"}
                          </button>
                        ) : (
                          <button
                            className="w-full bg-Green px-4 py-3 text-sm font-medium text-Color-Neutral-Darkest"
                            type="button"
                            onClick={handleUseDifferentAccount}
                          >
                            Log out and use invited email.
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="absolute bottom-10 left-8 text-xs text-Color-Neutral md:bottom-16 md:left-12">
                  © 2024 DARCi
                </div>
              </>
            )}
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

export default function InviteLandingPage() {
  return (
    <Suspense fallback={null}>
      <InviteLandingPageContent />
    </Suspense>
  );
}
