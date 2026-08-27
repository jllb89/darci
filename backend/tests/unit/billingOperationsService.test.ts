import { describe, expect, it } from "vitest";
import {
  analyzeBillingReconciliation,
  type BillingReconciliationSnapshot,
} from "../../src/services/billingOperationsService";

const periodStart = "2026-08-01T00:00:00.000Z";
const periodEnd = "2026-09-01T00:00:00.000Z";

const healthySnapshot = (): BillingReconciliationSnapshot => ({
  accounts: [{ id: "account-1", owner_user_id: "user-1", status: "active" }],
  subscriptions: [{
    id: "subscription-1",
    billing_account_id: "account-1",
    provider_subscription_id: "sub_test_1",
    provider_environment: "test",
    status: "active",
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    updated_at: periodStart,
  }],
  subscriptionItems: [{
    id: "item-1",
    subscription_id: "subscription-1",
    price_code_snapshot: "member_plus_monthly",
    usage_limit_quantity: 10,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    metadata: { provider_price_id: "price_test_plus" },
  }],
  entitlements: [{
    id: "entitlement-1",
    billing_account_id: "account-1",
    subscription_item_id: "item-1",
    status: "active",
    quantity_total: 10,
    quantity_used: 2,
    starts_at: periodStart,
    ends_at: periodEnd,
  }],
  usageEvents: [
    { id: "usage-1", billing_account_id: "account-1", entitlement_id: "entitlement-1", document_id: "document-1", event_kind: "consume", quantity_delta: 1, occurred_at: "2026-08-10T00:00:00.000Z" },
    { id: "usage-2", billing_account_id: "account-1", entitlement_id: "entitlement-1", document_id: "document-2", event_kind: "consume", quantity_delta: 1, occurred_at: "2026-08-11T00:00:00.000Z" },
  ],
  releaseControls: [],
  webhooks: [{
    id: "stored-1",
    event_id: "evt_1",
    event_type: "invoice.paid",
    object_id: "in_1",
    status: "processed",
    attempt_count: 1,
    next_attempt_at: null,
    processing_lease_expires_at: null,
    last_error_code: null,
    error_message: null,
    dead_lettered_at: null,
    received_at: "2026-08-20T00:00:00.000Z",
    processed_at: "2026-08-20T00:00:01.000Z",
    payload_retention_until: "2026-11-20T00:00:00.000Z",
  }],
  payments: [{
    id: "invoice-1",
    billing_account_id: "account-1",
    subscription_id: "subscription-1",
    external_id: "in_1",
    status: "succeeded",
    provider_environment: "test",
    amount_cents: 9900,
    currency_code: "USD",
    occurred_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
  }],
  orders: [],
  providerSubscriptions: [{
    id: "sub_test_1",
    billingAccountId: "account-1",
    status: "active",
    priceId: "price_test_plus",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    livemode: false,
  }],
  providerScanComplete: true,
});

describe("billing operations reconciliation", () => {
  it("reports no drift for a synchronized test membership", () => {
    expect(analyzeBillingReconciliation(
      healthySnapshot(),
      new Date("2026-08-27T00:00:00.000Z"),
    )).toEqual([]);
  });

  it("detects provider, entitlement, allowance, and usage drift", () => {
    const snapshot = healthySnapshot();
    snapshot.providerSubscriptions[0]!.status = "canceled";
    snapshot.providerSubscriptions[0]!.priceId = "price_test_volume";
    snapshot.entitlements[0]!.status = "suspended";
    snapshot.entitlements[0]!.quantity_total = 3;
    snapshot.entitlements[0]!.quantity_used = 7;

    const codes = analyzeBillingReconciliation(
      snapshot,
      new Date("2026-08-27T00:00:00.000Z"),
    ).map((row) => row.code);

    expect(codes).toEqual(expect.arrayContaining([
      "subscription_status_mismatch",
      "subscription_price_mismatch",
      "allowance_mismatch",
      "usage_counter_drift",
    ]));
  });

  it("detects dead letters and held packages eligible for release", () => {
    const snapshot = healthySnapshot();
    snapshot.webhooks[0] = {
      ...snapshot.webhooks[0]!,
      status: "dead_lettered",
      dead_lettered_at: "2026-08-26T00:00:00.000Z",
      processed_at: null,
    };
    snapshot.releaseControls.push({
      id: "release-1",
      document_id: "document-1",
      release_status: "billing_held",
      updated_at: "2026-08-26T00:00:00.000Z",
      owner_user_id: "user-1",
    });

    const issues = analyzeBillingReconciliation(
      snapshot,
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "webhook_dead_lettered", repairAction: "replay_webhook" }),
      expect.objectContaining({ code: "held_package_release_eligible", repairAction: "retry_release" }),
    ]));
  });

  it("detects provider subscriptions that never fulfilled internally", () => {
    const snapshot = healthySnapshot();
    snapshot.subscriptions = [];
    snapshot.subscriptionItems = [];
    snapshot.entitlements = [];
    snapshot.usageEvents = [];
    snapshot.payments = [];

    expect(analyzeBillingReconciliation(snapshot)).toContainEqual(expect.objectContaining({
      code: "stripe_subscription_missing_internal",
      severity: "critical",
    }));
  });
});
