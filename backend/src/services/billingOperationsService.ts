import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";
import { assertStripeObjectIsTestMode, getStripeClient } from "../config/stripe";
import { getBillingEnforcementMode, releaseMemberBillingHeldDocuments } from "./billingPolicyService";
import { processStoredStripeWebhook, resyncStripeMemberSubscription } from "./stripeWebhookService";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

const EFFECTIVE_SUBSCRIPTION_STATUSES = new Set([
  "pending",
  "trialing",
  "active",
  "past_due",
  "paused",
  "incomplete",
  "unpaid",
]);

const ENTITLED_SUBSCRIPTION_STATUSES = new Set(["trialing", "active"]);
const TERMINAL_PROVIDER_STATUSES = new Set(["canceled", "incomplete_expired", "unpaid"]);

type BillingAccountSnapshot = {
  id: string;
  owner_user_id: string;
  status: string;
};

type InternalSubscriptionSnapshot = {
  id: string;
  billing_account_id: string;
  provider_subscription_id: string | null;
  provider_environment: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

type SubscriptionItemSnapshot = {
  id: string;
  subscription_id: string;
  price_code_snapshot: string;
  usage_limit_quantity: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  metadata: Record<string, unknown> | null;
};

type EntitlementSnapshot = {
  id: string;
  billing_account_id: string;
  subscription_item_id: string | null;
  status: string;
  quantity_total: number | null;
  quantity_used: number;
  starts_at: string | null;
  ends_at: string | null;
};

type UsageEventSnapshot = {
  id: string;
  billing_account_id: string;
  entitlement_id: string;
  document_id: string;
  event_kind: string;
  quantity_delta: number;
  occurred_at: string;
};

type ReleaseControlSnapshot = {
  id: string;
  document_id: string;
  release_status: string;
  updated_at: string;
  owner_user_id: string | null;
};

type WebhookSnapshot = {
  id: string;
  event_id: string;
  event_type: string;
  object_id: string | null;
  status: string;
  attempt_count: number;
  next_attempt_at: string | null;
  processing_lease_expires_at: string | null;
  last_error_code: string | null;
  error_message: string | null;
  dead_lettered_at: string | null;
  received_at: string;
  processed_at: string | null;
  payload_retention_until: string | null;
};

type PaymentSnapshot = {
  id: string;
  billing_account_id: string;
  subscription_id: string | null;
  external_id: string;
  status: string;
  provider_environment: string;
  amount_cents: number;
  currency_code: string;
  occurred_at: string;
  updated_at: string;
};

type BillingOrderSnapshot = {
  id: string;
  billing_account_id: string;
  order_kind: string;
  status: string;
  total_amount_cents: number;
  currency_code: string;
  provider_checkout_session_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProviderSubscriptionSnapshot = {
  id: string;
  billingAccountId: string | null;
  status: string;
  priceId: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  livemode: boolean;
};

export type BillingReconciliationIssue = {
  id: string;
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  entityType: "billing_account" | "subscription" | "entitlement" | "invoice" | "webhook" | "document";
  entityId: string;
  billingAccountId: string | null;
  message: string;
  repairAction: "replay_webhook" | "resync_subscription" | "retry_release" | "inspect" | null;
};

export type BillingReconciliationSnapshot = {
  accounts: BillingAccountSnapshot[];
  subscriptions: InternalSubscriptionSnapshot[];
  subscriptionItems: SubscriptionItemSnapshot[];
  entitlements: EntitlementSnapshot[];
  usageEvents: UsageEventSnapshot[];
  releaseControls: ReleaseControlSnapshot[];
  webhooks: WebhookSnapshot[];
  payments: PaymentSnapshot[];
  orders: BillingOrderSnapshot[];
  providerSubscriptions: ProviderSubscriptionSnapshot[];
  providerScanComplete: boolean;
};

export class BillingOperationsError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BillingOperationsError";
  }
}

const timestampDistanceMs = (left: string | null, right: string | null) => {
  if (!left || !right) return Number.POSITIVE_INFINITY;
  return Math.abs(new Date(left).getTime() - new Date(right).getTime());
};

const issue = (input: Omit<BillingReconciliationIssue, "id">): BillingReconciliationIssue => ({
  id: `${input.code}:${input.entityType}:${input.entityId}`,
  ...input,
});

export const analyzeBillingReconciliation = (
  snapshot: BillingReconciliationSnapshot,
  now = new Date(),
) => {
  const issues: BillingReconciliationIssue[] = [];
  const subscriptionById = new Map(snapshot.subscriptions.map((row) => [row.id, row]));
  const providerById = new Map(snapshot.providerSubscriptions.map((row) => [row.id, row]));
  const itemBySubscription = new Map(snapshot.subscriptionItems.map((row) => [row.subscription_id, row]));
  const entitlementByItem = new Map(
    snapshot.entitlements
      .filter((row) => row.subscription_item_id)
      .map((row) => [row.subscription_item_id as string, row]),
  );
  const accountByOwner = new Map(snapshot.accounts.map((row) => [row.owner_user_id, row]));

  const effectiveByAccount = new Map<string, InternalSubscriptionSnapshot[]>();
  for (const subscription of snapshot.subscriptions) {
    if (EFFECTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
      const rows = effectiveByAccount.get(subscription.billing_account_id) ?? [];
      rows.push(subscription);
      effectiveByAccount.set(subscription.billing_account_id, rows);
    }
  }
  for (const [accountId, rows] of effectiveByAccount.entries()) {
    if (rows.length > 1) {
      issues.push(issue({
        code: "duplicate_effective_subscriptions",
        severity: "critical",
        entityType: "billing_account",
        entityId: accountId,
        billingAccountId: accountId,
        message: `${rows.length} effective member subscriptions exist for one billing account.`,
        repairAction: "inspect",
      }));
    }
  }

  for (const subscription of snapshot.subscriptions) {
    const providerId = subscription.provider_subscription_id;
    const provider = providerId ? providerById.get(providerId) : null;
    if (subscription.provider_environment !== "test") {
      issues.push(issue({
        code: "internal_environment_mismatch",
        severity: "critical",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: `Private-beta subscription is stored as ${subscription.provider_environment}.`,
        repairAction: "inspect",
      }));
    }
    if (snapshot.providerScanComplete && providerId && !provider) {
      issues.push(issue({
        code: "internal_subscription_missing_in_stripe",
        severity: "critical",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: "DARCi has a Stripe subscription ID that Stripe test mode did not return.",
        repairAction: "inspect",
      }));
      continue;
    }
    if (!provider) continue;
    if (provider.livemode) {
      issues.push(issue({
        code: "provider_environment_mismatch",
        severity: "critical",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: "A live-mode Stripe subscription appeared in the private-beta reconciliation set.",
        repairAction: "inspect",
      }));
    }
    if (provider.billingAccountId && provider.billingAccountId !== subscription.billing_account_id) {
      issues.push(issue({
        code: "provider_account_mismatch",
        severity: "critical",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: "Stripe correlation metadata points to another DARCi billing account.",
        repairAction: "inspect",
      }));
    }
    if (provider.status !== subscription.status) {
      issues.push(issue({
        code: "subscription_status_mismatch",
        severity: TERMINAL_PROVIDER_STATUSES.has(provider.status) && ENTITLED_SUBSCRIPTION_STATUSES.has(subscription.status)
          ? "critical"
          : "high",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: `DARCi status ${subscription.status} differs from Stripe status ${provider.status}.`,
        repairAction: "resync_subscription",
      }));
    }

    const item = itemBySubscription.get(subscription.id);
    if (!item) {
      issues.push(issue({
        code: "subscription_item_missing",
        severity: "high",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: "Member subscription has no internal subscription item.",
        repairAction: "resync_subscription",
      }));
      continue;
    }
    const internalProviderPrice = typeof item.metadata?.provider_price_id === "string"
      ? item.metadata.provider_price_id
      : null;
    if (provider.priceId && internalProviderPrice && provider.priceId !== internalProviderPrice) {
      issues.push(issue({
        code: "subscription_price_mismatch",
        severity: "high",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: "DARCi subscription item and Stripe reference different Prices.",
        repairAction: "resync_subscription",
      }));
    }
    if (
      timestampDistanceMs(subscription.current_period_start, provider.currentPeriodStart) > 5 * 60 * 1000
      || timestampDistanceMs(subscription.current_period_end, provider.currentPeriodEnd) > 5 * 60 * 1000
    ) {
      issues.push(issue({
        code: "subscription_period_mismatch",
        severity: "high",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: "DARCi and Stripe subscription periods differ by more than five minutes.",
        repairAction: "resync_subscription",
      }));
    }

    const entitlement = entitlementByItem.get(item.id);
    if (ENTITLED_SUBSCRIPTION_STATUSES.has(provider.status) && !entitlement) {
      issues.push(issue({
        code: "active_entitlement_missing",
        severity: "critical",
        entityType: "subscription",
        entityId: subscription.id,
        billingAccountId: subscription.billing_account_id,
        message: "Active Stripe membership has no DARCi workflow entitlement.",
        repairAction: "resync_subscription",
      }));
      continue;
    }
    if (!entitlement) continue;
    const expectedEntitlementStatus = ENTITLED_SUBSCRIPTION_STATUSES.has(provider.status) ? "active" : null;
    if (expectedEntitlementStatus && entitlement.status !== expectedEntitlementStatus) {
      issues.push(issue({
        code: "entitlement_status_mismatch",
        severity: "critical",
        entityType: "entitlement",
        entityId: entitlement.id,
        billingAccountId: entitlement.billing_account_id,
        message: `Active Stripe membership has a ${entitlement.status} DARCi entitlement.`,
        repairAction: "resync_subscription",
      }));
    }
    if (item.usage_limit_quantity !== entitlement.quantity_total) {
      issues.push(issue({
        code: "allowance_mismatch",
        severity: "high",
        entityType: "entitlement",
        entityId: entitlement.id,
        billingAccountId: entitlement.billing_account_id,
        message: `Subscription limit ${item.usage_limit_quantity ?? "null"} differs from entitlement ${entitlement.quantity_total ?? "null"}.`,
        repairAction: "resync_subscription",
      }));
    }
    const ledgerQuantity = snapshot.usageEvents
      .filter((event) => event.entitlement_id === entitlement.id)
      .reduce((total, event) => total + event.quantity_delta, 0);
    if (ledgerQuantity !== entitlement.quantity_used) {
      issues.push(issue({
        code: "usage_counter_drift",
        severity: "critical",
        entityType: "entitlement",
        entityId: entitlement.id,
        billingAccountId: entitlement.billing_account_id,
        message: `Usage ledger totals ${ledgerQuantity}, but the cached counter is ${entitlement.quantity_used}.`,
        repairAction: "inspect",
      }));
    }
  }

  if (snapshot.providerScanComplete) {
    const internalProviderIds = new Set(
      snapshot.subscriptions.map((row) => row.provider_subscription_id).filter(Boolean),
    );
    for (const provider of snapshot.providerSubscriptions) {
      if (!internalProviderIds.has(provider.id)) {
        issues.push(issue({
          code: "stripe_subscription_missing_internal",
          severity: "critical",
          entityType: "subscription",
          entityId: provider.id,
          billingAccountId: provider.billingAccountId,
          message: "Stripe has a DARCi member subscription with no internal subscription record.",
          repairAction: "inspect",
        }));
      }
    }
  }

  for (const payment of snapshot.payments) {
    if (payment.provider_environment !== "test") {
      issues.push(issue({
        code: "invoice_environment_mismatch",
        severity: "critical",
        entityType: "invoice",
        entityId: payment.id,
        billingAccountId: payment.billing_account_id,
        message: "Private-beta invoice transaction is not marked test mode.",
        repairAction: "inspect",
      }));
    }
    if (payment.status === "succeeded" && (!payment.subscription_id || !subscriptionById.has(payment.subscription_id))) {
      issues.push(issue({
        code: "paid_invoice_not_fulfilled",
        severity: "critical",
        entityType: "invoice",
        entityId: payment.id,
        billingAccountId: payment.billing_account_id,
        message: "A paid Stripe invoice is not linked to a fulfilled DARCi subscription.",
        repairAction: "inspect",
      }));
    }
  }

  const nowMs = now.getTime();
  for (const webhook of snapshot.webhooks) {
    const ageMs = nowMs - new Date(webhook.received_at).getTime();
    const leaseExpired = webhook.processing_lease_expires_at
      ? new Date(webhook.processing_lease_expires_at).getTime() <= nowMs
      : false;
    if (webhook.status === "dead_lettered") {
      issues.push(issue({
        code: "webhook_dead_lettered",
        severity: "critical",
        entityType: "webhook",
        entityId: webhook.id,
        billingAccountId: null,
        message: `${webhook.event_type} exhausted automatic retries.`,
        repairAction: "replay_webhook",
      }));
    } else if (webhook.status === "processing" && leaseExpired) {
      issues.push(issue({
        code: "webhook_processing_lease_expired",
        severity: "high",
        entityType: "webhook",
        entityId: webhook.id,
        billingAccountId: null,
        message: `${webhook.event_type} has an expired processing lease.`,
        repairAction: "replay_webhook",
      }));
    } else if (["received", "failed"].includes(webhook.status) && ageMs > 5 * 60 * 1000) {
      issues.push(issue({
        code: "webhook_backlog_stale",
        severity: ageMs > 60 * 60 * 1000 ? "high" : "medium",
        entityType: "webhook",
        entityId: webhook.id,
        billingAccountId: null,
        message: `${webhook.event_type} has remained ${webhook.status} for ${Math.floor(ageMs / 60000)} minutes.`,
        repairAction: "replay_webhook",
      }));
    }
  }

  const activeEntitlementAccounts = new Set(
    snapshot.entitlements
      .filter((row) => row.status === "active" && (!row.ends_at || new Date(row.ends_at).getTime() > nowMs))
      .map((row) => row.billing_account_id),
  );
  for (const control of snapshot.releaseControls) {
    if (control.release_status !== "billing_held" || !control.owner_user_id) continue;
    const account = accountByOwner.get(control.owner_user_id);
    if (account && activeEntitlementAccounts.has(account.id)) {
      issues.push(issue({
        code: "held_package_release_eligible",
        severity: "high",
        entityType: "document",
        entityId: control.document_id,
        billingAccountId: account.id,
        message: "A billing-held final package is eligible for release after membership recovery.",
        repairAction: "retry_release",
      }));
    }
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  issues.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]
    || left.code.localeCompare(right.code));
  return issues;
};

const requireRows = <T>(label: string, data: T[] | null, error: { message: string } | null) => {
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
};

const loadProviderSubscriptions = async (): Promise<ProviderSubscriptionSnapshot[]> => {
  const stripe = getStripeClient();
  const subscriptions = await stripe.subscriptions
    .list({ status: "all", limit: 100 })
    .autoPagingToArray({ limit: 1000 });
  return subscriptions
    .filter((subscription) => {
      const item = subscription.items.data[0];
      return subscription.metadata.darci_environment === "test"
        || item?.price.metadata.darci_product_code === "member_membership";
    })
    .map((subscription) => {
      assertStripeObjectIsTestMode(subscription, "Stripe Subscription");
      const item = subscription.items.data[0] ?? null;
      return {
        id: subscription.id,
        billingAccountId: subscription.metadata.darci_billing_account_id || null,
        status: subscription.status,
        priceId: item?.price.id ?? null,
        currentPeriodStart: item ? new Date(item.current_period_start * 1000).toISOString() : null,
        currentPeriodEnd: item ? new Date(item.current_period_end * 1000).toISOString() : null,
        livemode: subscription.livemode,
      };
    });
};

const itemBySubscriptionForReport = (
  items: SubscriptionItemSnapshot[],
  subscriptionId: string,
) => items.find((row) => row.subscription_id === subscriptionId) ?? null;

export const getBillingOperationsReport = async (input?: {
  includeProvider?: boolean;
  webhookLimit?: number;
}) => {
  const webhookLimit = Math.min(Math.max(input?.webhookLimit ?? 100, 1), 500);
  const [
    accountsResult,
    subscriptionsResult,
    itemsResult,
    entitlementsResult,
    usageResult,
    releasesResult,
    webhooksResult,
    paymentsResult,
    ordersResult,
    providerResult,
  ] = await Promise.all([
    supabaseAdmin.from("billing_accounts").select("id, owner_user_id, status").eq("account_key", "default"),
    supabaseAdmin.from("billing_subscriptions").select("id, billing_account_id, provider_subscription_id, provider_environment, status, current_period_start, current_period_end, cancel_at_period_end, updated_at").eq("role_context", "member"),
    supabaseAdmin.from("billing_subscription_items").select("id, subscription_id, price_code_snapshot, usage_limit_quantity, current_period_start, current_period_end, metadata").eq("role_context", "member"),
    supabaseAdmin.from("billing_entitlements").select("id, billing_account_id, subscription_item_id, status, quantity_total, quantity_used, starts_at, ends_at").eq("entitlement_type", "document_workflow_capacity"),
    supabaseAdmin.from("billing_usage_events").select("id, billing_account_id, entitlement_id, document_id, event_kind, quantity_delta, occurred_at").eq("metric_code", "document_workflow"),
    supabaseAdmin.from("document_release_controls").select("id, document_id, release_status, updated_at, documents!inner(owner_id)"),
    supabaseAdmin.from("stripe_webhook_events").select("id, event_id, event_type, object_id, status, attempt_count, next_attempt_at, processing_lease_expires_at, last_error_code, error_message, dead_lettered_at, received_at, processed_at, payload_retention_until").order("received_at", { ascending: false }).limit(webhookLimit),
    supabaseAdmin.from("payment_transactions").select("id, billing_account_id, subscription_id, external_id, status, provider_environment, amount_cents, currency_code, occurred_at, updated_at").eq("provider", "stripe").eq("transaction_kind", "invoice").order("occurred_at", { ascending: false }).limit(500),
    supabaseAdmin.from("billing_orders").select("id, billing_account_id, order_kind, status, total_amount_cents, currency_code, provider_checkout_session_id, created_at, updated_at").eq("provider_environment", "test").order("created_at", { ascending: false }).limit(500),
    input?.includeProvider === false
      ? Promise.resolve({ data: [] as ProviderSubscriptionSnapshot[], error: null })
      : loadProviderSubscriptions().then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
  ]);

  if (providerResult.error) {
    throw new BillingOperationsError(
      502,
      "billing_provider_reconciliation_failed",
      `Stripe reconciliation failed: ${providerResult.error instanceof Error ? providerResult.error.message : "unknown_error"}`,
    );
  }

  const releaseRows = requireRows<any>("Release-control reconciliation lookup", releasesResult.data, releasesResult.error)
    .map((row) => ({
      id: row.id,
      document_id: row.document_id,
      release_status: row.release_status,
      updated_at: row.updated_at,
      owner_user_id: Array.isArray(row.documents) ? row.documents[0]?.owner_id ?? null : row.documents?.owner_id ?? null,
    }));
  const snapshot: BillingReconciliationSnapshot = {
    accounts: requireRows("Billing-account reconciliation lookup", accountsResult.data, accountsResult.error) as BillingAccountSnapshot[],
    subscriptions: requireRows("Subscription reconciliation lookup", subscriptionsResult.data, subscriptionsResult.error) as InternalSubscriptionSnapshot[],
    subscriptionItems: requireRows("Subscription-item reconciliation lookup", itemsResult.data, itemsResult.error) as SubscriptionItemSnapshot[],
    entitlements: requireRows("Entitlement reconciliation lookup", entitlementsResult.data, entitlementsResult.error) as EntitlementSnapshot[],
    usageEvents: requireRows("Usage reconciliation lookup", usageResult.data, usageResult.error) as UsageEventSnapshot[],
    releaseControls: releaseRows,
    webhooks: requireRows("Webhook reconciliation lookup", webhooksResult.data, webhooksResult.error) as WebhookSnapshot[],
    payments: requireRows("Payment reconciliation lookup", paymentsResult.data, paymentsResult.error) as PaymentSnapshot[],
    orders: requireRows("Order reconciliation lookup", ordersResult.data, ordersResult.error) as BillingOrderSnapshot[],
    providerSubscriptions: providerResult.data ?? [],
    providerScanComplete: input?.includeProvider !== false,
  };
  const issues = analyzeBillingReconciliation(snapshot);
  const counts = issues.reduce(
    (total, row) => ({ ...total, [row.severity]: total[row.severity] + 1 }),
    { critical: 0, high: 0, medium: 0, low: 0 },
  );
  const lifecycleAcceptanceId = process.env.BILLING_LIFECYCLE_ACCEPTANCE_ID?.trim() || null;
  const blockingIssueCount = counts.critical + counts.high;
  const accountDetails = snapshot.accounts.map((account) => {
    const subscriptions = snapshot.subscriptions.filter((row) => row.billing_account_id === account.id);
    const currentSubscription = [...subscriptions].sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null;
    const item = currentSubscription ? itemBySubscriptionForReport(snapshot.subscriptionItems, currentSubscription.id) : null;
    const entitlement = item
      ? snapshot.entitlements.find((row) => row.subscription_item_id === item.id) ?? null
      : null;
    const accountUsage = snapshot.usageEvents.filter((row) => row.billing_account_id === account.id);
    const accountPayments = snapshot.payments.filter((row) => row.billing_account_id === account.id);
    const accountOrders = snapshot.orders.filter((row) => row.billing_account_id === account.id);
    const ownerHeldCount = snapshot.releaseControls.filter(
      (row) => row.owner_user_id === account.owner_user_id && row.release_status === "billing_held",
    ).length;
    return {
      id: account.id,
      ownerUserId: account.owner_user_id,
      status: account.status,
      subscription: currentSubscription ? {
        id: currentSubscription.id,
        providerSubscriptionId: currentSubscription.provider_subscription_id,
        status: currentSubscription.status,
        priceCode: item?.price_code_snapshot ?? null,
        currentPeriodStart: currentSubscription.current_period_start,
        currentPeriodEnd: currentSubscription.current_period_end,
        cancelAtPeriodEnd: currentSubscription.cancel_at_period_end,
      } : null,
      entitlement: entitlement ? {
        id: entitlement.id,
        status: entitlement.status,
        total: entitlement.quantity_total,
        used: entitlement.quantity_used,
        remaining: entitlement.quantity_total === null
          ? null
          : Math.max(entitlement.quantity_total - entitlement.quantity_used, 0),
      } : null,
      orderCount: accountOrders.length,
      invoiceCount: accountPayments.length,
      usageEventCount: accountUsage.length,
      heldPackageCount: ownerHeldCount,
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    providerEnvironment: "test" as const,
    enforcementMode: getBillingEnforcementMode(),
    providerScanComplete: snapshot.providerScanComplete,
    lifecycleAcceptanceId,
    readiness: {
      blockingIssueCount,
      technicalReady: snapshot.providerScanComplete && blockingIssueCount === 0,
      enforcementReady: snapshot.providerScanComplete && blockingIssueCount === 0 && Boolean(lifecycleAcceptanceId),
      enforcementRecommendation: "remain_observe" as const,
      reason: lifecycleAcceptanceId
        ? blockingIssueCount === 0
          ? "Automated reconciliation is clear; enforcement still requires an explicit deployment decision."
          : "Resolve blocking reconciliation issues before enforcement."
        : "Record a completed team lifecycle acceptance run before enforcement.",
    },
    counts: {
      ...counts,
      issues: issues.length,
      accounts: snapshot.accounts.length,
      subscriptions: snapshot.subscriptions.length,
      providerSubscriptions: snapshot.providerSubscriptions.length,
      heldPackages: snapshot.releaseControls.filter((row) => row.release_status === "billing_held").length,
      webhookBacklog: snapshot.webhooks.filter((row) => ["received", "processing", "failed", "dead_lettered"].includes(row.status)).length,
    },
    issues,
    recentWebhooks: snapshot.webhooks,
    accountDetails,
    recentOrders: snapshot.orders.slice(0, 100).map((row) => ({
      id: row.id,
      billingAccountId: row.billing_account_id,
      orderKind: row.order_kind,
      status: row.status,
      totalAmountCents: row.total_amount_cents,
      currencyCode: row.currency_code,
      checkoutSessionId: row.provider_checkout_session_id,
      createdAt: row.created_at,
    })),
    recentInvoices: snapshot.payments.slice(0, 100).map((row) => ({
      id: row.id,
      billingAccountId: row.billing_account_id,
      subscriptionId: row.subscription_id,
      providerInvoiceId: row.external_id,
      status: row.status,
      amountCents: row.amount_cents,
      currencyCode: row.currency_code,
      occurredAt: row.occurred_at,
    })),
    recentUsage: [...snapshot.usageEvents]
      .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at))
      .slice(0, 100)
      .map((row) => ({
        id: row.id,
        billingAccountId: row.billing_account_id,
        entitlementId: row.entitlement_id,
        documentId: row.document_id,
        eventKind: row.event_kind,
        quantityDelta: row.quantity_delta,
        occurredAt: row.occurred_at,
      })),
  };
};

const writeAudit = async (input: {
  actorUserId: string | null | undefined;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Record<string, unknown>;
}) => {
  const { error } = await supabaseAdmin.from("audit_events").insert({
    actor_id: input.actorUserId ?? null,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    metadata: input.metadata,
  });
  if (error) throw new Error(`Billing operations audit failed: ${error.message}`);
};

export const replayStripeWebhookForAdmin = async (input: {
  storedEventId: string;
  actorUserId?: string | null;
  reason: string;
}) => {
  const { data: existing, error: lookupError } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("id, event_id, event_type, status, attempt_count, metadata")
    .eq("id", input.storedEventId)
    .single();
  if (lookupError || !existing) {
    throw new BillingOperationsError(404, "billing_webhook_not_found", "Stripe webhook event not found");
  }
  if (existing.status === "processing") {
    throw new BillingOperationsError(409, "billing_webhook_processing", "Wait for the current processing lease before replaying this event");
  }

  const replayId = randomUUID();
  const replayedAt = new Date().toISOString();
  const previousReplays = Array.isArray(existing.metadata?.support_replays)
    ? existing.metadata.support_replays
    : [];
  const metadata = {
    ...(existing.metadata ?? {}),
    support_replays: [
      ...previousReplays.slice(-9),
      {
        replay_id: replayId,
        actor_user_id: input.actorUserId ?? null,
        reason: input.reason,
        previous_status: existing.status,
        previous_attempt_count: existing.attempt_count,
        replayed_at: replayedAt,
      },
    ],
  };
  const { error: resetError } = await supabaseAdmin
    .from("stripe_webhook_events")
    .update({
      status: "received",
      attempt_count: 0,
      next_attempt_at: replayedAt,
      processing_started_at: null,
      processing_lease_expires_at: null,
      last_error_code: null,
      error_message: null,
      dead_lettered_at: null,
      processed_at: null,
      metadata,
      updated_at: replayedAt,
    })
    .eq("id", existing.id);
  if (resetError) throw new Error(`Stripe webhook replay reset failed: ${resetError.message}`);

  await writeAudit({
    actorUserId: input.actorUserId,
    entityType: "stripe_webhook_event",
    entityId: existing.id,
    action: "billing.stripe_webhook_replayed",
    metadata: {
      replay_id: replayId,
      stripe_event_id: existing.event_id,
      event_type: existing.event_type,
      previous_status: existing.status,
      previous_attempt_count: existing.attempt_count,
      reason: input.reason,
    },
  });
  const result = await processStoredStripeWebhook({
    storedEventId: existing.id,
    workerId: `admin-replay:${replayId}`,
  });
  return { replayId, storedEventId: existing.id, result };
};

export const resyncStripeSubscriptionForAdmin = async (input: {
  subscriptionId: string;
  actorUserId?: string | null;
  reason: string;
}) => {
  const result = await resyncStripeMemberSubscription({
    internalSubscriptionId: input.subscriptionId,
    sourceId: `admin-resync:${randomUUID()}`,
  });
  await writeAudit({
    actorUserId: input.actorUserId,
    entityType: "billing_subscription",
    entityId: input.subscriptionId,
    action: "billing.stripe_subscription_resynced",
    metadata: { reason: input.reason, provider_subscription_id: result.providerSubscriptionId },
  });
  return result;
};

export const retryBillingHeldReleasesForAdmin = async (input: {
  billingAccountId: string;
  actorUserId?: string | null;
  reason: string;
}) => {
  const result = await releaseMemberBillingHeldDocuments({
    billingAccountId: input.billingAccountId,
    sourceEventId: `admin-release-retry:${randomUUID()}`,
  });
  await writeAudit({
    actorUserId: input.actorUserId,
    entityType: "billing_account",
    entityId: input.billingAccountId,
    action: "billing.held_release_retried",
    metadata: { reason: input.reason, released_count: result.releasedCount },
  });
  return result;
};

export const runStripeWebhookRetentionCleanup = async (input?: {
  limit?: number;
  actorUserId?: string | null;
  reason?: string;
}) => {
  const limit = Math.min(Math.max(input?.limit ?? 100, 1), 500);
  const now = new Date().toISOString();
  const { data: expired, error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("id, payload, metadata")
    .in("status", ["processed", "ignored", "dead_lettered"])
    .lte("payload_retention_until", now)
    .order("payload_retention_until", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Stripe webhook retention lookup failed: ${error.message}`);

  const redactedIds: string[] = [];
  for (const row of expired ?? []) {
    if (row.payload?.retained === false) {
      const { error: normalizeError } = await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ payload_retention_until: null, updated_at: now })
        .eq("id", row.id);
      if (normalizeError) throw new Error(`Stripe webhook retention normalization failed: ${normalizeError.message}`);
      continue;
    }
    const { error: updateError } = await supabaseAdmin
      .from("stripe_webhook_events")
      .update({
        payload: { retained: false, redacted_at: now },
        metadata: { ...(row.metadata ?? {}), payload_redacted_at: now },
        payload_retention_until: null,
        updated_at: now,
      })
      .eq("id", row.id);
    if (updateError) throw new Error(`Stripe webhook retention update failed: ${updateError.message}`);
    redactedIds.push(row.id);
  }

  if (input?.actorUserId || input?.reason) {
    await writeAudit({
      actorUserId: input.actorUserId,
      entityType: "billing_operation",
      entityId: randomUUID(),
      action: "billing.stripe_webhook_retention_cleanup",
      metadata: { reason: input.reason ?? "scheduled_retention", redacted_count: redactedIds.length },
    });
  }
  return { scannedCount: expired?.length ?? 0, redactedCount: redactedIds.length, redactedIds };
};

export const getBillingLifecycleAcceptanceReport = async (input?: { since?: string }) => {
  const since = input?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [webhooksResult, auditResult, usageResult] = await Promise.all([
    supabaseAdmin
      .from("stripe_webhook_events")
      .select("id, event_type, status, processed_at")
      .gte("received_at", since),
    supabaseAdmin
      .from("audit_events")
      .select("id, action, created_at")
      .like("action", "billing.%")
      .gte("created_at", since),
    supabaseAdmin
      .from("billing_usage_events")
      .select("id, product_flow_mode_snapshot, event_kind, occurred_at")
      .eq("metric_code", "document_workflow")
      .gte("occurred_at", since),
  ]);
  const webhooks = requireRows<any>("Lifecycle webhook evidence lookup", webhooksResult.data, webhooksResult.error);
  const audits = requireRows<any>("Lifecycle audit evidence lookup", auditResult.data, auditResult.error);
  const usage = requireRows<any>("Lifecycle usage evidence lookup", usageResult.data, usageResult.error);

  const webhookEvidence = (eventType: string) => webhooks
    .filter((row) => row.event_type === eventType && row.status === "processed")
    .map((row) => row.id as string);
  const auditEvidence = (action: string) => audits
    .filter((row) => row.action === action)
    .map((row) => row.id as string);
  const usageEvidence = (flowMode: string) => usage
    .filter((row) => row.product_flow_mode_snapshot === flowMode && row.event_kind === "consume")
    .map((row) => row.id as string);

  const rawChecks = [
    ["checkout_completed", "Checkout completes through a signed webhook", webhookEvidence("checkout.session.completed")],
    ["subscription_created", "Subscription creation is fulfilled", webhookEvidence("customer.subscription.created")],
    ["invoice_paid", "Successful invoice is fulfilled", webhookEvidence("invoice.paid")],
    ["invoice_failed", "Payment failure is observed", webhookEvidence("invoice.payment_failed")],
    ["payment_action_required", "Payment action required is observed", webhookEvidence("invoice.payment_action_required")],
    ["subscription_updated", "Subscription update is synchronized", webhookEvidence("customer.subscription.updated")],
    ["subscription_deleted", "Cancellation/deletion is synchronized", webhookEvidence("customer.subscription.deleted")],
    ["trust_usage", "Trust workflow consumes one unit", usageEvidence("trust_bundle")],
    ["poa_usage", "POA workflow consumes one unit", usageEvidence("poa_only")],
    ["uploaded_document_usage", "Uploaded-document workflow consumes one unit", usageEvidence("notarize_document")],
    ["plan_upgrade", "Immediate upgrade request is recorded", auditEvidence("billing.member_plan_upgrade_requested")],
    ["plan_downgrade", "Period-end downgrade request is recorded", auditEvidence("billing.member_plan_downgrade_requested")],
    ["package_held", "Final package billing hold is recorded", auditEvidence("billing.document_release_held")],
    ["package_released", "Held package release is recorded", auditEvidence("billing.document_released")],
    ["usage_reversal", "Controlled usage reversal is recorded", auditEvidence("billing.document_workflow_reversed")],
  ] as const;
  const checks = rawChecks.map(([code, label, evidenceIds]) => ({
    code,
    label,
    passed: evidenceIds.length > 0,
    evidenceCount: evidenceIds.length,
    evidenceIds: evidenceIds.slice(0, 20),
  }));
  const evidenceIds = checks.flatMap((check) => check.evidenceIds).sort();
  const passedCount = checks.filter((check) => check.passed).length;
  const complete = passedCount === checks.length;
  const acceptanceId = complete
    ? `stripe-observe-${createHash("sha256").update(`${since}:${evidenceIds.join(":")}`).digest("hex").slice(0, 16)}`
    : null;
  return {
    since,
    generatedAt: new Date().toISOString(),
    complete,
    passedCount,
    totalCount: checks.length,
    acceptanceId,
    checks,
  };
};
