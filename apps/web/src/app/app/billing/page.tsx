"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStoredAuth } from "@/lib/auth";
import {
  FALLBACK_MEMBER_PLANS,
  createMemberCheckout,
  createMemberPortalSession,
  getMemberMembership,
  isActiveMembershipState,
  isRecoveryMembershipState,
  type MemberBillingPlan,
  type MemberMembershipPayload,
  type MemberPriceCode,
} from "@/lib/memberBilling";

const PLAN_COPY: Record<
  MemberPriceCode,
  { description: string; popular: boolean }
> = {
  member_starter_monthly: {
    description: "For life’s occasional important documents.",
    popular: false,
  },
  member_plus_monthly: {
    description: "Best for families with ongoing legal-document needs.",
    popular: true,
  },
  member_volume_monthly: {
    description: "For members handling important documents every week.",
    popular: false,
  },
};

const PLAN_FEATURES = [
  "Trusts, POAs, and any uploaded document",
  "Guided signing and in-person notarization",
  "Sealed final package with verifiable proof",
];

const RECOVERY_COPY: Record<string, { title: string; body: string }> = {
  past_due: {
    title: "Your payment needs attention",
    body: "Update your billing details to restore membership access and release any completed final packages.",
  },
  paused: {
    title: "Your membership is paused",
    body: "Open the billing portal to restore your membership and access to completed final packages.",
  },
  incomplete: {
    title: "Your membership setup is incomplete",
    body: "Finish the required payment step in Stripe to activate your document allowance.",
  },
  unpaid: {
    title: "Your membership is unpaid",
    body: "Resolve the outstanding payment in Stripe to restore membership access.",
  },
  canceled: {
    title: "Your membership has ended",
    body: "Your completed records remain preserved. Use the billing portal if a recovery option is available.",
  },
  expired: {
    title: "Your membership has expired",
    body: "Your completed records remain preserved. Restore billing to regain access to held final packages.",
  },
};

const formatMoney = (plan: MemberBillingPlan) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: plan.currencyCode,
    maximumFractionDigits: 0,
  }).format(plan.unitAmountCents / 100);
};

const formatDate = (value: string | null) => {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
};

const statusLabel = (state: string) => {
  if (state === "trialing") return "Trial active";
  if (state === "activation_pending" || state === "pending") return "Activating";
  return state.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
};

type StatusActionProps = {
  isOpeningPortal: boolean;
  onOpenPortal: () => void;
};

function PortalButton({ isOpeningPortal, onOpenPortal }: StatusActionProps) {
  return (
    <button
      className="platform-btn-primary inline-flex min-h-11 items-center justify-center px-6 disabled:cursor-not-allowed disabled:opacity-55"
      disabled={isOpeningPortal}
      onClick={onOpenPortal}
      type="button"
    >
      {isOpeningPortal ? "OPENING STRIPE…" : "MANAGE BILLING"}
    </button>
  );
}

type MembershipStatusProps = StatusActionProps & {
  payload: MemberMembershipPayload;
};

function MembershipStatus({
  payload,
  isOpeningPortal,
  onOpenPortal,
}: MembershipStatusProps) {
  const { membership } = payload;
  const state = membership.state;
  const total = membership.allowance.total;
  const used = membership.allowance.used;
  const progress = total ? Math.min((used / total) * 100, 100) : 0;

  if (state === "activation_pending" || state === "pending") {
    return (
      <section className="mx-auto mb-12 max-w-3xl border-y border-Color-Scheme-1-Border bg-white px-6 py-9 text-center md:px-10">
        <div className="mx-auto mb-4 h-7 w-7 animate-spin rounded-full border-2 border-Color-Scheme-1-Border border-t-black" />
        <p className="text-[11px] font-semibold tracking-[0.18em] text-Color-Neutral">
          ACTIVATION PENDING
        </p>
        <h2 className="mt-2 text-2xl font-semibold">Stripe is confirming your membership</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-Color-Neutral">
          Checkout is complete, but access activates only after DARCi receives the signed Stripe webhook. This page will update automatically.
        </p>
      </section>
    );
  }

  if (isRecoveryMembershipState(state)) {
    const copy = RECOVERY_COPY[state] ?? RECOVERY_COPY.past_due;
    return (
      <section className="mb-12 border border-[#dfb5b5] bg-[#fff8f8] px-6 py-7 md:flex md:items-center md:justify-between md:gap-8 md:px-8">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#8d3838]">
            {statusLabel(state).toUpperCase()}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{copy.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-Color-Neutral">{copy.body}</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-Color-Neutral">
            A document already accepted by a notary can still finish its scheduled session; its sealed final package stays held until membership is restored.
          </p>
        </div>
        {payload.actions.canOpenPortal ? (
          <div className="mt-5 shrink-0 md:mt-0">
            <PortalButton
              isOpeningPortal={isOpeningPortal}
              onOpenPortal={onOpenPortal}
            />
          </div>
        ) : null}
      </section>
    );
  }

  if (!isActiveMembershipState(state)) {
    return null;
  }

  return (
    <section className="mb-12 border-y border-Color-Scheme-1-Border bg-white px-6 py-7 md:px-8">
      <div className="grid gap-7 lg:grid-cols-[1fr_1.3fr_auto] lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-Green-Secondary" />
            <span className="text-[11px] font-semibold tracking-[0.16em]">
              {statusLabel(state).toUpperCase()}
            </span>
          </div>
          <h2 className="mt-2 text-3xl font-semibold">{membership.planName || "Membership"}</h2>
          <p className="mt-1 text-sm text-Color-Neutral">
            {membership.cancelAtPeriodEnd
              ? `Access continues through ${formatDate(membership.currentPeriodEnd)}.`
              : `Renews ${formatDate(membership.currentPeriodEnd)}.`}
          </p>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4 text-sm">
            <span className="font-medium">Monthly document allowance</span>
            <span className="text-Color-Neutral">
              {total === null ? `${used} used` : `${used} of ${total} used`}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden bg-Color-Neutral-Lightest">
            <div
              className="h-full bg-black transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-Color-Neutral">
            {membership.allowance.remaining === null
              ? "Usage updates after each document workflow begins."
              : `${membership.allowance.remaining} document${membership.allowance.remaining === 1 ? "" : "s"} remaining this period.`}
          </p>
        </div>

        {payload.actions.canOpenPortal ? (
          <PortalButton
            isOpeningPortal={isOpeningPortal}
            onOpenPortal={onOpenPortal}
          />
        ) : null}
      </div>
    </section>
  );
}

type PlanCardProps = {
  plan: MemberBillingPlan;
  isCurrent: boolean;
  canCheckout: boolean;
  isStarting: boolean;
  onCheckout: (priceCode: MemberPriceCode) => void;
};

function PlanCard({
  plan,
  isCurrent,
  canCheckout,
  isStarting,
  onCheckout,
}: PlanCardProps) {
  const copy = PLAN_COPY[plan.priceCode] ?? PLAN_COPY.member_starter_monthly;

  return (
    <article
      className={`relative flex min-h-[350px] flex-col rounded-2xl bg-white px-6 pb-6 pt-7 ${
        copy.popular
          ? "border-2 border-black"
          : "border border-Color-Scheme-1-Border"
      }`}
    >
      {copy.popular ? (
        <span className="absolute -right-px -top-px rounded-bl-lg rounded-tr-[14px] bg-black px-3 py-2 text-[10px] font-semibold tracking-[0.16em] text-white">
          MOST POPULAR
        </span>
      ) : null}

      <div>
        <h3 className="text-xl font-semibold">{plan.displayName}</h3>
        <p className="mt-2 min-h-10 max-w-[260px] text-sm leading-5 text-Color-Neutral">
          {copy.description}
        </p>
      </div>

      <div className="mt-5 flex items-end gap-2 border-b border-Color-Scheme-1-Border pb-5">
        <span className="text-[38px] font-semibold leading-none">{formatMoney(plan)}</span>
        <span className="pb-1 text-sm text-Color-Neutral">/ month</span>
      </div>

      <p className="mt-4 text-sm font-semibold">
        {plan.documentWorkflowAllowance} documents / month
      </p>
      <ul className="mt-4 space-y-3">
        {PLAN_FEATURES.map((feature) => (
          <li className="flex gap-3 text-[13px] leading-5" key={feature}>
            <Image
              alt=""
              aria-hidden="true"
              className="mt-1 h-2.5 w-auto shrink-0"
              height={12}
              src="/icons/pricing/check.svg"
              width={16}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        {canCheckout ? (
          <button
            className="platform-btn-primary flex w-full items-center justify-center px-4 py-3 text-xs font-semibold tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={isStarting}
            onClick={() => onCheckout(plan.priceCode)}
            type="button"
          >
            {isStarting ? "OPENING CHECKOUT…" : "START MEMBERSHIP"}
          </button>
        ) : (
          <div className="flex min-h-10 items-center justify-center border-t border-Color-Scheme-1-Border pt-4 text-[11px] font-semibold tracking-[0.12em] text-Color-Neutral">
            {isCurrent ? "CURRENT PLAN" : "PLAN CHANGES COMING SOON"}
          </div>
        )}
      </div>
    </article>
  );
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { accessToken, user } = useStoredAuth();
  const [payload, setPayload] = useState<MemberMembershipPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startingPlan, setStartingPlan] = useState<MemberPriceCode | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const billingResult = searchParams.get("billing");
  const hasMemberBillingContext = user?.role === "member" || user?.role === "pro";

  const loadMembership = useCallback(async (quiet = false) => {
    if (!accessToken || !hasMemberBillingContext) {
      setIsLoading(false);
      return;
    }

    if (!quiet) setIsLoading(true);
    try {
      const nextPayload = await getMemberMembership(accessToken);
      setPayload(nextPayload);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "We could not load your membership.",
      );
    } finally {
      if (!quiet) setIsLoading(false);
    }
  }, [accessToken, hasMemberBillingContext]);

  useEffect(() => {
    void loadMembership();
  }, [loadMembership]);

  useEffect(() => {
    const shouldPoll =
      billingResult === "success" ||
      payload?.membership.state === "activation_pending" ||
      payload?.membership.state === "pending";

    if (!shouldPoll || isActiveMembershipState(payload?.membership.state ?? "none")) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadMembership(true);
    }, 2500);

    return () => window.clearInterval(intervalId);
  }, [billingResult, loadMembership, payload?.membership.state]);

  const plans = useMemo(() => {
    return payload?.plans.length ? payload.plans : FALLBACK_MEMBER_PLANS;
  }, [payload?.plans]);

  const handleCheckout = async (priceCode: MemberPriceCode) => {
    if (!accessToken || startingPlan) return;

    setStartingPlan(priceCode);
    setErrorMessage(null);
    try {
      const result = await createMemberCheckout(accessToken, priceCode);
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "We could not open Stripe Checkout.",
      );
      setStartingPlan(null);
    }
  };

  const handleOpenPortal = async () => {
    if (!accessToken || isOpeningPortal) return;

    setIsOpeningPortal(true);
    setErrorMessage(null);
    try {
      const result = await createMemberPortalSession(accessToken);
      window.location.assign(result.portalUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "We could not open your billing portal.",
      );
      setIsOpeningPortal(false);
    }
  };

  if (!hasMemberBillingContext) {
    return (
      <div className="mx-auto max-w-2xl bg-white px-8 py-10 text-center">
        <h1 className="text-3xl font-semibold">Member billing only</h1>
        <p className="mt-3 text-sm leading-6 text-Color-Neutral">
          Notaries do not pay for DARCi. Switch to a member profile to view a membership.
        </p>
        <Link className="mt-6 inline-block text-sm font-semibold underline" href="/app">
          Return to start
        </Link>
      </div>
    );
  }

  const membershipState = payload?.membership.state ?? "none";
  const canCheckout = Boolean(
    payload?.actions.canCheckout && membershipState === "none" && !isLoading,
  );

  return (
    <div className="mx-auto -mt-10 w-full max-w-[1216px] pb-10">
      <header className="relative px-2 pb-12 pt-4 text-center md:px-16 md:pb-14 md:pt-6">
        <div className="mb-5 inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.2em] text-Color-Neutral">
          <span>DARCi MEMBERSHIP</span>
        </div>
        <div className="mb-5 md:absolute md:right-0 md:top-6 md:mb-0">
          <span className="inline-flex items-center gap-2 border border-Color-Scheme-1-Border bg-white px-3 py-2 text-[10px] font-semibold tracking-[0.14em]">
            <span className="h-1.5 w-1.5 rounded-full bg-Green-Secondary" />
            PRIVATE BETA · TEST MODE
          </span>
        </div>
        <h1 className="mx-auto max-w-[760px] text-3xl font-semibold leading-tight tracking-[-0.025em] md:text-[42px] md:leading-[50px]">
          One membership. Every essential document.
        </h1>
        <p className="mx-auto mt-4 max-w-[710px] text-[15px] leading-6 text-Color-Neutral md:text-base">
          Create, sign, notarize, and securely verify trusts, powers of attorney, and uploaded documents. Choose only how many you need each month.
        </p>
        <p className="mt-5 text-xs font-medium text-Color-Neutral">
          Same features on every plan · Monthly billing · Secure Stripe checkout
        </p>
      </header>

      {billingResult === "canceled" ? (
        <div className="mb-8 border-y border-Color-Scheme-1-Border bg-white px-5 py-3 text-center text-sm text-Color-Neutral">
          Checkout was canceled. Nothing changed, and no payment was made.
        </div>
      ) : null}

      {billingResult === "success" && !isActiveMembershipState(membershipState) ? (
        <div className="mb-8 border-y border-Color-Scheme-1-Border bg-white px-5 py-3 text-center text-sm text-Color-Neutral">
          Checkout returned successfully. We’re waiting for Stripe to confirm activation.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mb-8 flex flex-col items-center justify-between gap-4 border border-[#dfb5b5] bg-[#fff8f8] px-5 py-4 text-sm sm:flex-row">
          <span>{errorMessage}</span>
          <button
            className="shrink-0 font-semibold underline"
            onClick={() => void loadMembership()}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}

      {payload ? (
        <MembershipStatus
          isOpeningPortal={isOpeningPortal}
          onOpenPortal={() => void handleOpenPortal()}
          payload={payload}
        />
      ) : null}

      {payload?.membership.allowance.exhausted && isActiveMembershipState(membershipState) ? (
        <section className="mb-12 border-y border-black bg-white px-6 py-6 md:flex md:items-center md:justify-between md:gap-8 md:px-8">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-Color-Neutral">
              MONTHLY ALLOWANCE REACHED
            </p>
            <h2 className="mt-2 text-2xl font-semibold">You’ve used every document this period</h2>
            <p className="mt-2 text-sm text-Color-Neutral">
              New document workflows become available when your allowance renews on {formatDate(payload.membership.currentPeriodEnd)}.
            </p>
          </div>
          <a className="mt-4 inline-block text-sm font-semibold underline md:mt-0" href="#plans">
            View membership
          </a>
        </section>
      ) : null}

      <section id="plans">
        <div className="mb-7 text-center">
          <h2 className="text-2xl font-semibold md:text-[28px]">Choose your monthly allowance</h2>
          <p className="mt-2 text-sm text-Color-Neutral">
            Every plan includes the same DARCi workflow. Only the number of documents changes.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              canCheckout={canCheckout}
              isCurrent={payload?.membership.priceCode === plan.priceCode}
              isStarting={startingPlan === plan.priceCode}
              key={plan.priceCode}
              onCheckout={(priceCode) => void handleCheckout(priceCode)}
              plan={plan}
            />
          ))}
        </div>
        {isLoading && !payload ? (
          <p className="mt-4 text-center text-xs text-Color-Neutral">Checking membership availability…</p>
        ) : null}
      </section>

      <section className="scroll-mt-8 py-20 md:py-24" id="membership-workflow">
        <div className="text-center">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-Color-Neutral">
            EVERY PLAN INCLUDES
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.02em] md:text-[36px]">
            From first draft to final proof.
          </h2>
        </div>

        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-0">
          {[
            {
              number: "01",
              title: "Create with confidence",
              body: "Build guided, jurisdiction-aware trusts and POAs, or upload the document you already have.",
            },
            {
              number: "02",
              title: "Sign and meet locally",
              body: "Invite every signer, select a qualified notary, and complete the required in-person session.",
            },
            {
              number: "03",
              title: "Keep verifiable proof",
              body: "Receive the seal, acknowledgment, hash, ledger record, and public verification for the final package.",
            },
          ].map((benefit, index) => (
            <article
              className={`px-2 md:px-9 ${index ? "md:border-l md:border-Color-Scheme-1-Border" : ""}`}
              key={benefit.number}
            >
              <span className="text-xs font-semibold text-Color-Neutral">{benefit.number}</span>
              <h3 className="mt-4 text-xl font-semibold">{benefit.title}</h3>
              <p className="mt-3 text-sm leading-6 text-Color-Neutral">{benefit.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="bg-black px-7 py-8 text-white md:flex md:items-center md:justify-between md:gap-10 md:px-10"
        id="membership-access"
      >
        <div className="flex gap-5">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 text-lg">
            ✓
          </div>
          <div>
            <h2 className="text-xl font-semibold">Your notary appointment stays protected.</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/65">
              Once a notary accepts your document, the scheduled session can finish even if billing changes. The sealed final document, acknowledgment, and verification access resume when membership is active again.
            </p>
          </div>
        </div>
        <a
          className="mt-5 inline-block shrink-0 text-sm font-semibold underline underline-offset-4 md:mt-0"
          href="#membership-workflow"
        >
          How access works →
        </a>
      </section>

      {payload && payload.membership.heldFinalPackageCount > 0 ? (
        <section className="border-x border-b border-black bg-white px-7 py-5 text-sm leading-6 md:px-10">
          <strong>
            {payload.membership.heldFinalPackageCount} final package{payload.membership.heldFinalPackageCount === 1 ? " is" : "s are"} safely held.
          </strong>{" "}
          The completed files remain preserved, but download, hash, ledger, and public verification access stay hidden until membership is restored.
        </section>
      ) : null}

      <footer className="flex flex-col items-center justify-center gap-3 py-9 text-sm sm:flex-row sm:gap-8">
        {payload?.actions.canOpenPortal ? (
          <button
            className="font-semibold underline underline-offset-4 disabled:opacity-50"
            disabled={isOpeningPortal}
            onClick={() => void handleOpenPortal()}
            type="button"
          >
            Already subscribed? Manage billing
          </button>
        ) : (
          <span className="text-Color-Neutral">Already subscribed? Membership status appears here.</span>
        )}
        <a
          className="font-semibold underline underline-offset-4"
          href="mailto:support@darciregistry.com"
        >
          Questions? Contact support
        </a>
      </footer>
    </div>
  );
}
