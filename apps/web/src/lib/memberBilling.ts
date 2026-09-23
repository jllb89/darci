"use client";

import { getApiBaseUrl, refreshStoredAuth } from "@/lib/auth";

export const MEMBER_PRICE_CODES = [
  "member_starter_monthly",
  "member_plus_monthly",
  "member_volume_monthly",
  "member_starter_monthly_v2", "member_plus_monthly_v2", "member_unlimited_monthly_v2",
  "member_starter_annual_v2", "member_plus_annual_v2", "member_unlimited_annual_v2",
] as const;

export type MemberPriceCode = (typeof MEMBER_PRICE_CODES)[number];

export type MemberBillingPlan = {
  priceCode: MemberPriceCode;
  displayName: string;
  currencyCode: string;
  unitAmountCents: number;
  billingInterval: string;
  intervalCount: number;
  documentWorkflowAllowance: number | null;
  isUnlimited?: boolean;
  availableForPurchase?: boolean;
};

export type MemberMembershipState =
  | "none"
  | "activation_pending"
  | "pending"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "incomplete"
  | "unpaid"
  | "canceled"
  | "expired"
  | string;

export type MemberMembershipPayload = {
  providerEnvironment: "test";
  paymentsReal: false;
  enforcementMode: string;
  plans: MemberBillingPlan[];
  membership: {
    state: MemberMembershipState;
    subscriptionStatus: string | null;
    priceCode: MemberPriceCode | null;
    planName: string | null;
    pendingPlanChange: {
      type: "upgrade" | "downgrade" | "cadence_change";
      status: "pending_webhook" | "scheduled";
      targetPriceCode: MemberPriceCode;
      effectiveAt: string | null;
    } | null;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    allowance: {
      total: number | null;
      used: number;
      remaining: number | null;
      exhausted: boolean;
      isUnlimited?: boolean;
      periodStart?: string | null;
      periodEnd?: string | null;
    };
    heldFinalPackageCount: number;
  };
  eligibility: {
    canCreateWorkflow: boolean;
    entitled: boolean;
    wouldBlock: boolean;
    reasonCode: string | null;
  };
  actions: {
    canCheckout: boolean;
    iosCheckoutAvailable: boolean;
    canOpenPortal: boolean;
    planChangeAvailable: boolean;
    planChangeReason: string | null;
  };
};

// Historical contract fixtures only. Runtime purchase options always come from the API.
export const LEGACY_MEMBER_PLAN_FIXTURES: MemberBillingPlan[] = [
  {
    priceCode: "member_starter_monthly",
    displayName: "Starter",
    currencyCode: "USD",
    unitAmountCents: 4900,
    billingInterval: "month",
    intervalCount: 1,
    documentWorkflowAllowance: 3,
  },
  {
    priceCode: "member_plus_monthly",
    displayName: "Plus",
    currencyCode: "USD",
    unitAmountCents: 9900,
    billingInterval: "month",
    intervalCount: 1,
    documentWorkflowAllowance: 10,
  },
  {
    priceCode: "member_volume_monthly",
    displayName: "Volume",
    currencyCode: "USD",
    unitAmountCents: 19900,
    billingInterval: "month",
    intervalCount: 1,
    documentWorkflowAllowance: 25,
  },
];

const apiBaseUrl = getApiBaseUrl();

const requestWithTokenRefresh = async (
  path: string,
  accessToken: string,
  init?: RequestInit,
) => {
  const run = (token: string) => {
    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Darci-Billing-Catalog", "2");

    return fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  };

  const response = await run(accessToken);
  if (response.status !== 401) {
    return response;
  }

  try {
    const refreshed = await refreshStoredAuth();
    return refreshed?.accessToken ? run(refreshed.accessToken) : response;
  } catch {
    return response;
  }
};

const readResponse = async <T>(response: Response, fallbackMessage: string) => {
  const payload = (await response.json().catch(() => null)) as
    | (T & { message?: string })
    | { message?: string }
    | null;

  if (!response.ok) {
    throw new Error(payload?.message || fallbackMessage);
  }

  return payload as T;
};

export const getMemberMembership = async (accessToken: string) => {
  const response = await requestWithTokenRefresh(
    "/billing/member-membership",
    accessToken,
  );
  return readResponse<MemberMembershipPayload>(
    response,
    "We could not load your membership.",
  );
};

export const createMemberCheckout = async (
  accessToken: string,
  priceCode: MemberPriceCode,
) => {
  const response = await requestWithTokenRefresh(
    "/billing/member-membership/checkout",
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceCode,
        idempotencyToken: createCheckoutIdempotencyToken(),
      }),
    },
  );

  return readResponse<{ checkoutUrl: string; checkoutSessionId: string }>(
    response,
    "We could not open Stripe Checkout.",
  );
};

export const createMemberPortalSession = async (accessToken: string) => {
  const response = await requestWithTokenRefresh(
    "/billing/customer-portal-session",
    accessToken,
    { method: "POST" },
  );

  return readResponse<{ portalUrl: string }>(
    response,
    "We could not open your billing portal.",
  );
};

export const changeMemberPlan = async (
  accessToken: string,
  targetPriceCode: MemberPriceCode,
) => {
  const response = await requestWithTokenRefresh(
    "/billing/member-membership/plan-change",
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetPriceCode,
        idempotencyToken: createCheckoutIdempotencyToken(),
      }),
    },
  );

  return readResponse<{
    changeType: "upgrade" | "downgrade" | "cadence_change";
    status: "pending_webhook" | "scheduled";
    currentPriceCode: MemberPriceCode;
    targetPriceCode: MemberPriceCode;
    effectiveAt: string | null;
  }>(response, "We could not change your membership plan.");
};

export const createCheckoutIdempotencyToken = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `checkout-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const isActiveMembershipState = (state: MemberMembershipState) => {
  return state === "active" || state === "trialing";
};

export const isRecoveryMembershipState = (state: MemberMembershipState) => {
  return ["past_due", "paused", "incomplete", "unpaid", "canceled", "expired"].includes(
    state,
  );
};
