# Approved member pricing v2 — implementation and rollout

## Current state

Approved defaults 1–6 are implemented locally. Staging migration `20260923030000` is applied. Six Stripe **test** Prices and their mappings are independently verified, but the new DARCi prices remain **inactive for purchase**. No code has been pushed/deployed in this pass. No live keys, real charges, existing customer subscriptions or PDF bytes changed.

| Tier | Monthly | Annual, paid upfront | Allowance |
| --- | --- | --- | --- |
| Starter | $9.99 | $99 | 3 workflows/month |
| Plus | $19.99 | $199 | 25 workflows/month |
| Unlimited | $59.99 | $599 | No workflow quota |

USD; before applicable taxes; notary fees separate. Same features. Annual finite allowances reset monthly on the paid-period anniversary, in UTC with calendar-month/month-end handling; no rollover. One Trust package, standalone POA or uploaded notarization counts once on first accepted submission. Unlimited is explicit and still audited; file/page/rate/security safeguards remain. Missing quota data never grants Unlimited.

Same-cadence upgrades are prorated immediately, subject to Stripe payment confirmation, and retain current-window usage. Downgrades and any cadence change wait until the paid-through renewal date. Canceling renewal preserves annual monthly allowances through the paid year. Existing accepted-work/held-final/released-document rules are unchanged.

## Prepared Stripe objects

Product: `prod_V9DGwXNMzEMUtx`. Portal: `bpc_1U8urEETAqmB3GAqD7QJQRTA` (payment methods, invoices and period-end cancellation; direct Portal price changes remain disabled).

| Internal code | Test Price |
| --- | --- |
| `member_starter_monthly_v2` | `price_1UIgVKETAqmB3GAq9Adgjv0Y` |
| `member_plus_monthly_v2` | `price_1UIgVKETAqmB3GAq2rKO1aOO` |
| `member_unlimited_monthly_v2` | `price_1UIgVKETAqmB3GAq1OOUCy8w` |
| `member_starter_annual_v2` | `price_1UIgVKETAqmB3GAqvxjGQLKO` |
| `member_plus_annual_v2` | `price_1UIgVLETAqmB3GAqjUHWMXRB` |
| `member_unlimited_annual_v2` | `price_1UIgVLETAqmB3GAqZVd2rNHm` |

All six are flat recurring Prices, quantity 1, USD, `tax_behavior=exclusive`. This **does not enable Stripe Tax or settle tax registrations**; those remain production gates. No new trials/promotions/overage charges or refund policy introduced.

## What changed

- Additive catalog and service-only monthly-window functions; refresh on status/policy requests plus the existing billing worker sweep. Paid subscription periods remain annual; allowance periods are monthly. Repeated/catch-up refreshes preserve old windows and usage.
- Atomic finite/Unlimited consumption and reversal; retries after rollover return original consumption rather than charging the new month.
- Versioned internal codes, interval-aware renewal schedules, explicit quota validation and reconciliation that selects the current window instead of arbitrary historical rows.
- Web billing/paywall and public pricing; native billing/paywall, annual selector, active-plan details, plan-change confirmation, re-subscription after an ended membership, exact cents, separate allowance-reset/renewal dates and fee/tax disclosures. Existing DARCi fonts/layout retained.
- Clients declare `X-Darci-Billing-Catalog: 2`. Once v2 is active, older billing clients receive an update-required message rather than an undecodable Unlimited payload or misleading annual pricing. Document APIs remain separately authorized; this does not bypass billing enforcement.
- Deployment preflight requires the new database functions. Catalog preparation does not activate sales. Existing three price mappings and legacy entitlements are retained.

## Evidence

- Staging rehearsal and applied migration preserved whole-row fingerprints for **22 subscriptions, 22 subscription items, 23 entitlements, 88 usage events, 3 legacy mappings, 788 documents, 2,478 document versions, 680 signatures, 244 document hashes and 168 release controls**. Legacy catalog rows unchanged apart from additive `available_for_purchase=true`. Six new rows inactive. Recovery manifest less than 24 hours old verified before application.
- Applied migration SHA-256: `7b3e2b05359ff9130832ea2da2c00c453e65971ccc21922cee8fa04c57964609`.
- All three rolled-back SQL suites pass, including old billing contracts/holds/security and new month-end/leap-year boundaries, annual-vs-monthly periods, finite exhaustion, preserved-usage annual upgrades, Unlimited through 30 workflows, idempotent rollover and old-submission replay into a new month.
- Stripe API readback independently verifies six prices, exclusive tax behavior, cadence, mapping amounts and safe Portal settings. No customer subscription was created or modified by this preparation.
- Final backend build and **753 tests / 104 files pass**. Web: typecheck, **72 tests** and production build pass. iOS: app build and all **113 unit tests** pass. Error-catalog validation, **14 workflow-boundary checks** and whitespace/diff validation pass. The live staging deployment preflight recognizes the new functions and remains test-mode only.
- Final read-only Stripe/staging reconciliation: **zero critical/high/medium issues**, complete provider scan. A regression test now ensures a canceled test-clock contract is compared against its final entitlement window, not earlier historical usage. Existing legacy lifecycle coverage remains 15/15; this is not new-catalog lifecycle acceptance.

These tests are **not** a claim of new-catalog hosted Checkout/webhook/device acceptance. Existing Phase 1 real Stripe lifecycle evidence remains the legacy baseline. After activation, run all six new Checkouts and annual/Unlimited lifecycle scenarios with isolated test fixtures, plus checklist section 13. Do not mark physical iPhone/Apple Pay or production acceptance passed from unit tests.

## Release order — do not skip

1. Review/commit the local changes; deploy backend, worker and web. The staging migration is already installed. No new `.env` Price IDs are required; mappings live in the database.
2. Build/distribute the compatible TestFlight app. Verify the billing screen loads the existing catalog and sends catalog version 2; notify testers that old builds need updating.
3. Only after both releases are verified, activate atomically from the backend directory:

   ```sh
   cd /Users/jorge/Desktop/darci/backend
   npm run stripe:catalog:sync -- --activate --confirm-compatible-clients
   npm run stripe:catalog:verify
   ```

   The activation command is intentionally **not run in this pass**. Until then, legacy prices remain the server's offered catalog. New Prices are already prepared; sync is idempotent.
4. Test fresh isolated accounts on all six prices; test paid upgrade failure/success, monthly↔annual scheduling, annual monthly allowance catch-up, annual cancellation, renewal failure/recovery, ended-membership re-subscription and held/released package continuity. Reconcile before calling the new catalog accepted.
5. Production needs separate live Prices/mappings, tax/legal configuration and explicit go-live approval. These scripts intentionally refuse live mode.

## Rollback

Before activation, keep new prices inactive and revert only compatible application code if needed; leave the additive migration and new test mappings intact. After any v2 subscriptions exist, **do not revert to code that assumes finite monthly-only plans**, delete v2 prices/mappings or shorten paid periods. Pause new checkout/plan-change entry points, preserve webhook processing and allowance refresh, and roll forward with a tested correction. Do not use inverse migrations against payment history.

## Still separate

After the pricing pass, Jorge authorized one SMS retry and **confirmed receipt** (23 September 03:21 UTC request). Successful phone-login and failure-path acceptance remain separate; see [SMS evidence](phase1-sms-acceptance-2026-09-23.md). Physical-device/product-content acceptance, exact consumer terms/refund policy, tax setup and fresh-production provisioning remain in the production roadmap. Pricing approval is not production launch approval.
