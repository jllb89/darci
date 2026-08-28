# DARCi Stripe Phase 7 Operations And Team Testing

- Status: build-ready implementation
- Environment: Stripe test mode
- Staging enforcement: `enforced`
- iOS purchase availability: enabled for controlled Stripe test-mode acceptance

## What ships

Phase 7 adds the operational layer required to let the team test and recover Stripe without direct database edits:

- provider-backed DARCi/Stripe reconciliation;
- webhook backlog, expired-lease, and dead-letter detection;
- subscription, Price, period, entitlement, allowance, and usage-counter drift detection;
- paid-invoice fulfillment checks;
- held-package release eligibility checks;
- audited webhook replay, subscription resync, and held-release retry;
- scheduled reconciliation alerts through the existing error-monitoring channel;
- safe error-monitoring signals for rejected webhook signatures, failed ingress persistence, and repeated blocked Checkout attempts;
- scheduled redaction of expired minimized webhook payload envelopes;
- Stripe request-ID and DARCi order/request correlation without retaining signatures or document payloads;
- a machine-readable lifecycle-evidence report; and
- the admin Billing Operations screen.

No new migration is required. Phase 7 uses the durable inbox, entitlement ledger, audit log, and release controls already applied to staging.

## Deployment posture

Deploy API, worker, web, and iOS normally with:

```text
BILLING_ENFORCEMENT_MODE=enforced
IOS_MEMBER_CHECKOUT_ENABLED=true
BILLING_RECONCILIATION_RUNNER_ENABLED=true
BILLING_RECONCILIATION_INTERVAL_SECONDS=900
STRIPE_WEBHOOK_RETENTION_RUNNER_ENABLED=true
STRIPE_WEBHOOK_RETENTION_INTERVAL_SECONDS=86400
STRIPE_WEBHOOK_RETENTION_RUN_LIMIT=100
BILLING_LIFECYCLE_ACCEPTANCE_ID=
```

Staging now runs in the private-beta target posture: Stripe test mode with DARCi billing enforcement enabled. Stripe cannot collect a live payment, but DARCi blocks new workflows without entitlement, rejects submissions above the allowance, and holds finalized member packages when release eligibility is lost. Use controlled test accounts because these restrictions are real within staging.

Do not populate `BILLING_LIFECYCLE_ACCEPTANCE_ID` merely to make the readiness display green. The lifecycle report generates an acceptance ID only after it finds evidence for every required staging scenario.

## Operator screen

After deployment, an administrator can open:

```text
https://app.staging.darciregistry.dev/app/admin/billing
```

The screen shows:

- critical/high reconciliation drift;
- webhook backlog and recent deliveries;
- held final-package count;
- lifecycle evidence coverage;
- member account, subscription, entitlement, allowance, order, invoice, and usage ledgers;
- the current enforcement mode; and
- available recovery actions.

Recovery mutations require a recently authenticated admin session and a reason of at least eight characters. Every action writes an audit event.

Available actions:

- **Replay event** resets one durable event while preserving prior attempt evidence, retrieves the canonical event from Stripe, and processes it immediately.
- **Resync subscription** retrieves the canonical Stripe test subscription and reapplies the transactional subscription/entitlement snapshot.
- **Retry release** reevaluates the billing account and releases only packages currently eligible through an active entitlement.
- **Run retention cleanup** redacts expired minimized webhook envelopes while preserving event identity, type, status, attempts, timing, errors, and audit metadata.

The UI never offers arbitrary status, allowance, Price ID, entitlement, or document-release mutation.

## Command-line readiness report

From `backend/`:

```bash
npm run stripe:operations:report
```

Useful variants:

```bash
npm run stripe:operations:report -- --database-only
npm run stripe:operations:report -- --json
npm run stripe:acceptance:verify -- --since=2026-08-27T00:00:00.000Z
```

- The normal report exits nonzero when critical/high reconciliation drift exists.
- `--database-only` avoids the Stripe provider scan and is diagnostic only.
- `stripe:acceptance:verify` also exits nonzero until all lifecycle scenarios have evidence.
- The report is read-only. Recovery requires the guarded admin endpoints/UI.

## Team test sequence

Use dedicated staging member accounts and Stripe test payment methods. Do not use production identities or legal documents.

### 1. Baseline

1. Confirm `/app/billing` says private beta / Stripe test mode.
2. Confirm `/app/admin/billing` says `enforced`.
3. Run `npm run stripe:operations:report` and record any pre-existing drift.
4. Confirm iOS displays the membership purchase CTA and opens Stripe test Checkout.

### 2. Checkout and activation

1. Start each of Starter, Plus, and Volume through web Checkout using separate test members.
2. Confirm the success return says activation pending until the webhook is fulfilled.
3. Confirm plan, period, allowance, and remaining quantity come from `GET /billing/member-membership` after fulfillment.
4. Confirm duplicate clicks/retries do not create duplicate effective subscriptions.

### 3. Payment failure and recovery

1. Exercise a declined Stripe test payment.
2. Exercise Stripe's test payment method that requires authentication.
3. Confirm failure/action-required events appear in Billing Operations.
4. Recover the payment in Customer Portal and confirm the membership returns to active only after webhook fulfillment.

### 4. Usage across products

With an active test membership, submit one workflow of each kind:

- Trust package (`trust_bundle`);
- POA (`poa_only`); and
- uploaded-document notarization (`notarize_document`).

Confirm each first submission consumes exactly one unit. Saving drafts, signer activity, retries, rendering, signatures, finalization, and ledger retries must not consume another unit.

After consuming the plan allowance, start and submit one additional workflow. Confirm the server rejects it with `billing_workflow_limit_reached`, the web and iOS clients present the upgrade/renewal path, and no additional usage entry is written.

### 5. Plan changes

1. Upgrade Starter to Plus or Volume and confirm Stripe applies proration.
2. Confirm current-period used quantity does not reset.
3. Schedule a downgrade and confirm the current allowance remains until period end.
4. Confirm the billing page shows the pending downgrade and effective date.
5. Retry the same request token and confirm no duplicate provider change occurs.

### 6. Cancellation and provider drift recovery

1. Schedule cancellation through Customer Portal and confirm access remains through period end.
2. For a disposable Stripe test subscription, complete deletion/cancellation in Stripe and confirm DARCi synchronizes the terminal state.
3. Temporarily stop or delay a disposable webhook delivery, confirm it appears as backlog/drift, then use **Replay event** or **Resync subscription**.
4. Confirm reconciliation clears without duplicate orders, subscriptions, entitlements, usage, or releases.

### 7. Final-package continuity

In `enforced`, complete a workflow after making its subscription inactive and confirm:

- the notary workflow is never interrupted;
- the team can still complete the notarization;
- the finalized package enters `billing_held`; and
- member download, hash/ledger, and public-verification surfaces remain unavailable until reactivation.

Reactivate the test membership through Stripe, wait for webhook fulfillment, and confirm the original finalized bytes are released exactly once. Use only disposable staging subscriptions and non-legal test documents.

### 8. Acceptance report

Run:

```bash
npm run stripe:acceptance:verify -- --since=<start-of-team-test-ISO-timestamp>
```

The report lists every missing scenario and generates an `acceptanceId` only when the evidence set is complete. Keep staging in `enforced` throughout final-behavior acceptance so the report reflects the configuration being validated.

## Incident playbooks

### Stripe API outage

- Leave staging in `enforced`; use controlled test accounts and pause testing if Stripe is unavailable.
- Do not infer activation from Checkout return parameters.
- Let signed deliveries remain in the durable inbox and automatic backoff.
- After recovery, run reconciliation and resync affected subscriptions.

### Webhook or worker outage

- Inspect backlog, expired leases, and dead letters in Billing Operations.
- Restore the worker before replaying individual events.
- Replay from oldest to newest when ordering matters, then run provider reconciliation.

### Database outage

- Stripe ingress cannot be acknowledged safely without durable persistence; failed deliveries should be retried by Stripe.
- Restore the database and worker, then reconcile before running manual replay/resync.

### Finalization or release failure

- Do not regenerate or re-sign a completed package as a billing recovery shortcut.
- Repair finalization first.
- Use release retry only when the original version/hash control exists and the account is entitled.

### Duplicate charge or subscription

- Do not delete internal evidence.
- Record Stripe object IDs and DARCi correlation IDs.
- Reconcile before refunding or canceling; refunds remain a separately authorized Stripe/support action.

### Refund or dispute

- A refund/dispute does not automatically reverse workflow usage.
- Use the controlled usage reversal only when the approved support policy applies, with a unique idempotency key and reason.

### Suspected account takeover

- Suspend the account through the independent security controls.
- Do not use billing cancellation as an authorization substitute.
- Require reauthentication before any billing recovery action and review audit history.

## Known external gate

iOS hosted Checkout is enabled only for the controlled staging/test build so the team can validate the complete purchase flow. Public App Store distribution still requires recorded App Review/storefront treatment and physical-device Apple Pay validation; staging enablement is not evidence of production approval.

## Pre-deployment reconciliation baseline

The read-only report was run against staging on 2026-08-27 after implementation:

- provider scan complete;
- 0 critical, high, medium, or low reconciliation issues;
- 0 webhook backlog events;
- 1 internal and 1 matching Stripe test subscription;
- lifecycle evidence at 3/15: Checkout completed, subscription created, and invoice paid; and
- recommendation at the time of the baseline: remain in `observe` until the team begins controlled final-behavior acceptance. Staging was moved to `enforced` on 2026-08-28 for that exercise.

This is a baseline, not post-deployment acceptance. Run the report again after API/worker/web deployment and after every team test batch.
