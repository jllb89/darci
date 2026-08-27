"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppToast } from "@/components/app/AppToastContext";
import { useStoredAuth } from "@/lib/auth";
import {
  AdminMetricStrip,
  AdminPageShell,
  RefreshIconButton,
  StatusPill,
  fetchAdminJson,
  formatAdminDate,
  formatAdminStatus,
} from "../adminCommon";

type RepairAction = "replay_webhook" | "resync_subscription" | "retry_release" | "inspect" | null;

type BillingIssue = {
  id: string;
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  entityType: string;
  entityId: string;
  billingAccountId: string | null;
  message: string;
  repairAction: RepairAction;
};

type WebhookEvent = {
  id: string;
  eventId: string;
  event_id?: string;
  eventType: string;
  event_type?: string;
  status: string;
  attemptCount: number;
  attempt_count?: number;
  receivedAt: string;
  received_at?: string;
  lastErrorCode: string | null;
  last_error_code?: string | null;
};

type BillingOperationsPayload = {
  generatedAt: string;
  providerEnvironment: "test";
  enforcementMode: string;
  providerScanComplete: boolean;
  lifecycleAcceptanceId: string | null;
  lifecycleCoverage: {
    since: string;
    complete: boolean;
    passedCount: number;
    totalCount: number;
    acceptanceId: string | null;
    checks: Array<{
      code: string;
      label: string;
      passed: boolean;
      evidenceCount: number;
    }>;
  };
  readiness: {
    blockingIssueCount: number;
    technicalReady: boolean;
    enforcementReady: boolean;
    enforcementRecommendation: "remain_observe";
    reason: string;
  };
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    issues: number;
    accounts: number;
    subscriptions: number;
    providerSubscriptions: number;
    heldPackages: number;
    webhookBacklog: number;
  };
  issues: BillingIssue[];
  recentWebhooks: WebhookEvent[];
  accountDetails: Array<{
    id: string;
    ownerUserId: string;
    status: string;
    subscription: {
      id: string;
      providerSubscriptionId: string | null;
      status: string;
      priceCode: string | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    } | null;
    entitlement: {
      id: string;
      status: string;
      total: number | null;
      used: number;
      remaining: number | null;
    } | null;
    orderCount: number;
    invoiceCount: number;
    usageEventCount: number;
    heldPackageCount: number;
  }>;
  recentOrders: Array<{
    id: string;
    billingAccountId: string;
    orderKind: string;
    status: string;
    totalAmountCents: number;
    currencyCode: string;
    createdAt: string;
  }>;
  recentInvoices: Array<{
    id: string;
    billingAccountId: string;
    providerInvoiceId: string;
    status: string;
    amountCents: number;
    currencyCode: string;
    occurredAt: string;
  }>;
  recentUsage: Array<{
    id: string;
    billingAccountId: string;
    documentId: string;
    eventKind: string;
    quantityDelta: number;
    occurredAt: string;
  }>;
};

const repairLabel = (action: RepairAction) => {
  if (action === "replay_webhook") return "Replay event";
  if (action === "resync_subscription") return "Resync";
  if (action === "retry_release") return "Retry release";
  return "Inspect";
};

const actionPath = (issue: BillingIssue) => {
  if (issue.repairAction === "replay_webhook") {
    return `/admin/billing/webhook-events/${encodeURIComponent(issue.entityId)}/replay`;
  }
  if (issue.repairAction === "resync_subscription") {
    return `/admin/billing/subscriptions/${encodeURIComponent(issue.entityId)}/resync`;
  }
  if (issue.repairAction === "retry_release" && issue.billingAccountId) {
    return `/admin/billing/accounts/${encodeURIComponent(issue.billingAccountId)}/retry-releases`;
  }
  return null;
};

const normalizeWebhook = (event: WebhookEvent) => ({
  id: event.id,
  eventId: event.eventId ?? event.event_id ?? "-",
  eventType: event.eventType ?? event.event_type ?? "unknown",
  status: event.status,
  attemptCount: event.attemptCount ?? event.attempt_count ?? 0,
  receivedAt: event.receivedAt ?? event.received_at ?? "",
  lastErrorCode: event.lastErrorCode ?? event.last_error_code ?? null,
});

const formatMoney = (amountCents: number, currencyCode: string) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: currencyCode,
}).format(amountCents / 100);

export default function AdminBillingOperationsPage() {
  const { accessToken } = useStoredAuth();
  const { showToast } = useAppToast();
  const [payload, setPayload] = useState<BillingOperationsPayload | null>(null);
  const [reason, setReason] = useState("Team Stripe staging verification");
  const [isLoading, setIsLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const next = await fetchAdminJson<BillingOperationsPayload>(
        "/admin/billing/operations?includeProvider=true&webhookLimit=100",
        accessToken,
      );
      setPayload(next);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load billing operations.");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const metrics = useMemo(() => payload ? [
    { label: "Critical", value: payload.counts.critical },
    { label: "High", value: payload.counts.high },
    { label: "Webhook backlog", value: payload.counts.webhookBacklog },
    { label: "Held packages", value: payload.counts.heldPackages },
  ] : [], [payload]);

  const runAction = async (id: string, path: string, body: Record<string, unknown>) => {
    if (!accessToken) return;
    if (reason.trim().length < 8) {
      setErrorMessage("Enter a support reason with at least eight characters.");
      return;
    }
    setActionId(id);
    try {
      await fetchAdminJson(path, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim(), ...body }),
      });
      showToast({ tone: "success", message: "Billing recovery action completed." });
      await loadReport();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Billing recovery action failed.";
      setErrorMessage(message);
      showToast({ tone: "error", message });
    } finally {
      setActionId(null);
    }
  };

  const normalizedWebhooks = (payload?.recentWebhooks ?? []).map(normalizeWebhook);

  return (
    <AdminPageShell
      description="Reconcile Stripe test mode with DARCi, inspect drift, and run narrow audited recovery actions."
      title="Billing operations"
      titleAccessory={<AdminMetricStrip metrics={metrics} />}
    >
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div>
          <span className="font-medium">Staging remains in {payload?.enforcementMode ?? "observe"} mode.</span>{" "}
          {payload?.readiness.reason ?? "Loading reconciliation status."}
        </div>
        <RefreshIconButton isLoading={isLoading} onClick={() => void loadReport()} />
      </section>

      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Lifecycle acceptance evidence</div>
            <div className="mt-1 text-xs text-Color-Neutral">
              {payload?.lifecycleCoverage.passedCount ?? 0} of {payload?.lifecycleCoverage.totalCount ?? 15} required scenarios observed in the last 30 days.
            </div>
          </div>
          <StatusPill status={payload?.lifecycleCoverage.complete ? "complete" : "incomplete"} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(payload?.lifecycleCoverage.checks ?? []).map((check) => (
            <div className="flex items-start gap-2 text-xs" key={check.code}>
              <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${check.passed ? "bg-emerald-500" : "bg-amber-400"}`} />
              <span className={check.passed ? "text-Color-Neutral-Darkest" : "text-Color-Neutral"}>{check.label}</span>
            </div>
          ))}
        </div>
        {payload?.lifecycleCoverage.acceptanceId ? (
          <div className="mt-3 font-mono text-[11px] text-Color-Neutral">Acceptance ID: {payload.lifecycleCoverage.acceptanceId}</div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
          <span>Required reason for recovery actions</span>
          <input
            className="h-10 rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-sm outline-none focus-visible:border-Color-Scheme-1-Text"
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </label>
        <button
          className="h-10 rounded-md border border-Color-Scheme-1-Border/60 px-4 text-xs font-medium disabled:opacity-50"
          disabled={Boolean(actionId)}
          onClick={() => void runAction("retention", "/admin/billing/webhook-retention/cleanup", { limit: 100 })}
          type="button"
        >
          {actionId === "retention" ? "Cleaning" : "Run retention cleanup"}
        </button>
      </section>

      <section className="overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60">
        <div className="border-b border-Color-Scheme-1-Border/40 px-4 py-3">
          <div className="text-sm font-medium">Reconciliation issues</div>
          <div className="mt-1 text-xs text-Color-Neutral">Generated {formatAdminDate(payload?.generatedAt)} with Stripe provider scan {payload?.providerScanComplete ? "complete" : "incomplete"}.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-Color-Neutral">
              <tr>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Issue</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {payload?.issues.length ? payload.issues.map((issue) => {
                const path = actionPath(issue);
                return (
                  <tr className="align-top border-t border-Color-Scheme-1-Border/30" key={issue.id}>
                    <td className="px-4 py-4"><StatusPill status={issue.severity} /></td>
                    <td className="max-w-xl px-4 py-4">
                      <div className="font-medium">{formatAdminStatus(issue.code)}</div>
                      <div className="mt-1 text-xs leading-5 text-Color-Neutral">{issue.message}</div>
                    </td>
                    <td className="px-4 py-4 text-xs text-Color-Neutral">
                      <div>{formatAdminStatus(issue.entityType)}</div>
                      <div className="mt-1 max-w-48 truncate" title={issue.entityId}>{issue.entityId}</div>
                    </td>
                    <td className="px-4 py-4">
                      {path ? (
                        <button
                          className="text-xs font-medium underline underline-offset-4 disabled:opacity-50"
                          disabled={Boolean(actionId)}
                          onClick={() => void runAction(issue.id, path, {})}
                          type="button"
                        >
                          {actionId === issue.id ? "Working" : repairLabel(issue.repairAction)}
                        </button>
                      ) : <span className="text-xs text-Color-Neutral">Inspect logs</span>}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td className="border-t border-Color-Scheme-1-Border/30 px-4 py-8 text-center text-sm text-Color-Neutral" colSpan={4}>No reconciliation issues detected.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60">
        <div className="border-b border-Color-Scheme-1-Border/40 px-4 py-3">
          <div className="text-sm font-medium">Member account ledger</div>
          <div className="mt-1 text-xs text-Color-Neutral">Subscription, entitlement, usage, invoice, order, and release context without direct mutation controls.</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-Color-Neutral">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3">Plan / period</th>
                <th className="px-4 py-3">Allowance</th>
                <th className="px-4 py-3">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {(payload?.accountDetails ?? []).length ? payload?.accountDetails.map((account) => (
                <tr className="align-top border-t border-Color-Scheme-1-Border/30" key={account.id}>
                  <td className="max-w-56 px-4 py-4">
                    <div className="truncate font-medium" title={account.id}>{account.id}</div>
                    <div className="mt-1 truncate text-xs text-Color-Neutral" title={account.ownerUserId}>Owner {account.ownerUserId}</div>
                  </td>
                  <td className="px-4 py-4">
                    {account.subscription ? (
                      <>
                        <StatusPill status={account.subscription.status} />
                        <div className="mt-2 max-w-48 truncate text-xs text-Color-Neutral" title={account.subscription.providerSubscriptionId ?? ""}>{account.subscription.providerSubscriptionId ?? "No provider ID"}</div>
                      </>
                    ) : <span className="text-xs text-Color-Neutral">No subscription</span>}
                  </td>
                  <td className="px-4 py-4 text-xs text-Color-Neutral-Darkest">
                    <div>{account.subscription?.priceCode ? formatAdminStatus(account.subscription.priceCode) : "-"}</div>
                    <div className="mt-1 text-Color-Neutral">Ends {formatAdminDate(account.subscription?.currentPeriodEnd)}</div>
                    {account.subscription?.cancelAtPeriodEnd ? <div className="mt-1 text-amber-700">Cancels at period end</div> : null}
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {account.entitlement ? (
                      <>
                        <div>{account.entitlement.used} / {account.entitlement.total ?? "-"} used</div>
                        <div className="mt-1 text-Color-Neutral">{account.entitlement.remaining ?? "-"} remaining</div>
                      </>
                    ) : <span className="text-Color-Neutral">No entitlement</span>}
                  </td>
                  <td className="px-4 py-4 text-xs text-Color-Neutral">
                    <div>{account.orderCount} orders · {account.invoiceCount} invoices</div>
                    <div className="mt-1">{account.usageEventCount} usage events · {account.heldPackageCount} held</div>
                  </td>
                </tr>
              )) : <tr><td className="border-t border-Color-Scheme-1-Border/30 px-4 py-8 text-center text-sm text-Color-Neutral" colSpan={5}>No member billing accounts found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60">
          <div className="border-b border-Color-Scheme-1-Border/40 px-4 py-3 text-sm font-medium">Recent orders and invoices</div>
          <div className="max-h-[420px] overflow-auto">
            {[...(payload?.recentOrders ?? []).map((row) => ({
              id: `order:${row.id}`,
              kind: "Order",
              accountId: row.billingAccountId,
              status: row.status,
              amount: formatMoney(row.totalAmountCents, row.currencyCode),
              occurredAt: row.createdAt,
            })), ...(payload?.recentInvoices ?? []).map((row) => ({
              id: `invoice:${row.id}`,
              kind: "Invoice",
              accountId: row.billingAccountId,
              status: row.status,
              amount: formatMoney(row.amountCents, row.currencyCode),
              occurredAt: row.occurredAt,
            }))]
              .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
              .slice(0, 100)
              .map((row) => (
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-Color-Scheme-1-Border/20 px-4 py-3 text-xs" key={row.id}>
                  <StatusPill status={row.status} />
                  <div className="min-w-0">
                    <div className="font-medium">{row.kind} · {row.amount}</div>
                    <div className="mt-1 truncate text-Color-Neutral" title={row.accountId}>{row.accountId}</div>
                  </div>
                  <div className="text-Color-Neutral">{formatAdminDate(row.occurredAt)}</div>
                </div>
              ))}
            {!(payload?.recentOrders.length || payload?.recentInvoices.length) ? <div className="px-4 py-8 text-center text-sm text-Color-Neutral">No order or invoice activity.</div> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60">
          <div className="border-b border-Color-Scheme-1-Border/40 px-4 py-3 text-sm font-medium">Recent workflow usage</div>
          <div className="max-h-[420px] overflow-auto">
            {(payload?.recentUsage ?? []).length ? payload?.recentUsage.map((row) => (
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-Color-Scheme-1-Border/20 px-4 py-3 text-xs" key={row.id}>
                <StatusPill status={row.eventKind} />
                <div className="min-w-0">
                  <div className="truncate font-medium" title={row.documentId}>Document {row.documentId}</div>
                  <div className="mt-1 truncate text-Color-Neutral" title={row.billingAccountId}>{row.billingAccountId}</div>
                </div>
                <div className="text-right text-Color-Neutral">
                  <div>{row.quantityDelta > 0 ? "+" : ""}{row.quantityDelta}</div>
                  <div className="mt-1">{formatAdminDate(row.occurredAt)}</div>
                </div>
              </div>
            )) : <div className="px-4 py-8 text-center text-sm text-Color-Neutral">No workflow usage activity.</div>}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/60">
        <div className="border-b border-Color-Scheme-1-Border/40 px-4 py-3 text-sm font-medium">Recent Stripe webhook events</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-Color-Neutral">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {normalizedWebhooks.length ? normalizedWebhooks.map((event) => (
                <tr className="border-t border-Color-Scheme-1-Border/30" key={event.id}>
                  <td className="max-w-sm px-4 py-4">
                    <div className="font-medium">{event.eventType}</div>
                    <div className="mt-1 truncate text-xs text-Color-Neutral" title={event.eventId}>{event.eventId}</div>
                    {event.lastErrorCode ? <div className="mt-1 text-xs text-red-700">{event.lastErrorCode}</div> : null}
                  </td>
                  <td className="px-4 py-4"><StatusPill status={event.status} /></td>
                  <td className="px-4 py-4 text-Color-Neutral">{event.attemptCount}</td>
                  <td className="px-4 py-4 text-Color-Neutral">{formatAdminDate(event.receivedAt)}</td>
                  <td className="px-4 py-4">
                    <button
                      className="text-xs font-medium underline underline-offset-4 disabled:opacity-50"
                      disabled={Boolean(actionId) || event.status === "processing"}
                      onClick={() => void runAction(
                        `webhook:${event.id}`,
                        `/admin/billing/webhook-events/${encodeURIComponent(event.id)}/replay`,
                        {},
                      )}
                      type="button"
                    >
                      {actionId === `webhook:${event.id}` ? "Replaying" : "Replay"}
                    </button>
                  </td>
                </tr>
              )) : <tr><td className="border-t border-Color-Scheme-1-Border/30 px-4 py-8 text-center text-sm text-Color-Neutral" colSpan={5}>No Stripe webhook events found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </AdminPageShell>
  );
}
