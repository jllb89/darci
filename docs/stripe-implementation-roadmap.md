# DARCi Stripe Implementation Roadmap

- Status: **active implementation roadmap**
- Revised: 2026-08-26
- Release authority: `docs/private-beta-readiness-roadmap-2026-08-25.md`
- Historical client request: `docs/DARCi_Payment_Logic_Spec.md`

## Purpose

Implement the paid scope that DARCi has actually approved: three monthly member subscription tiers with identical features and different document-workflow allowances.

The implementation must remain small enough for the current engagement while preserving clean extension points for the broader client payment proposal if that work is separately approved and paid for later.

This roadmap supersedes every earlier DARCi roadmap statement that assigns subscription fees, document capacity, or Checkout to illuminotaries/notaries.

## Locked Product Decisions

### Who pays

- The member/document owner is the subscriber and billing beneficiary.
- Notaries do not pay DARCi, do not consume member allowance, and must not see membership purchase or capacity controls.
- Invited signees, witnesses, and trusted persons do not pay and do not consume allowance.
- A verified Pro receives no special billing treatment in this phase. If a Pro owns a document workflow, the same member subscription rules apply to that billing account.
- Payment state must never grant or remove DARCi roles. Member, Pro, notary, and admin authorization remains independent from Stripe.

### Launch plans

DARCi offers one membership product with three monthly recurring prices. Every tier receives the same application features; only the monthly document-workflow allowance changes.

| Internal price code | Display name | Monthly allowance | Price |
| --- | --- | ---: | --- |
| `member_starter_monthly` | Member Starter | 3 workflows | $49 USD/month |
| `member_plus_monthly` | Member Plus | 10 workflows | $99 USD/month |
| `member_volume_monthly` | Member Volume | 25 workflows | $199 USD/month |

The client-facing reasoning and market context are recorded in `docs/member-membership-pricing-rationale.md`.

Rules:

- Monthly billing only for the current scope.
- No annual prices at launch.
- No unlimited tier at launch.
- No automatic overage charges.
- Unused allowance does not roll over.
- When the allowance is exhausted, the member must upgrade or wait for the next billing period.
- Upgrades may take effect immediately after verified Stripe fulfillment; used quantity remains unchanged and the higher limit applies for the rest of the current period.
- Downgrades take effect at the next billing-period boundary.
- Cancellation at period end preserves access through the paid period end.
- Plan names and limits are catalog data, not conditionals distributed through controllers or clients.

Do not call the 25-workflow plan “Pro.” `pro` is an independent DARCi role and that name would make authorization and support behavior ambiguous.

## Usage Definition

The launch usage metric is `document_workflow`.

One unit means one member-owned product workflow first submitted from draft into execution:

- one Trust package, regardless of how many generated PDF artifacts belong to the package;
- one regular POA workflow; or
- one uploaded-document notarization workflow.

The unit is counted once when the server atomically accepts the workflow's first submit-for-signing/notarization transition. It is not counted when a draft is opened or saved.

The following do not consume another unit:

- multiple files produced inside one Trust package;
- document rendering or technical regeneration;
- invited signer activity;
- signatures, notarial acknowledgment, watermarking, hashing, or ledger retries;
- notary approval, rejection, or in-person session steps;
- retrying the same idempotent submission; or
- downloading or verifying a previously released final document.

A member cancellation after a successful submission does not automatically restore the unit. A confirmed DARCi technical error or support correction may add an immutable reversal event; operators must not delete or silently rewrite usage history.

## Subscription And Workflow Continuity Policy

### Access states

| Internal state | New workflow creation | Submit existing draft | Already submitted workflow | Released final documents |
| --- | --- | --- | --- | --- |
| `trialing` or `active` | Allowed | Allowed if allowance remains | Continues | Available |
| `active` with `cancel_at_period_end` | Allowed through period end | Allowed if allowance remains | Continues | Available through period end; post-period policy below |
| `past_due`, `paused`, `unpaid`, `canceled`, `expired`, or terminal `incomplete` | Blocked | Blocked | Continues | Previously released documents remain available; newly completed held package follows the release gate |
| Checkout/activation pending | Blocked | Blocked | Existing submitted work continues | No new entitlement until trusted fulfillment |

Private beta may choose not to offer a trial, but `trialing` must map safely if Stripe test clocks or a later product decision produce it.

### Accepted/submitted work survives billing changes

Once a workflow has been successfully submitted and its unit recorded:

- later cancellation, nonpayment, downgrade, or period rollover must not interrupt signatures, notary acceptance, the in-person session, acknowledgment generation, finalization, hashing, or the notary's agenda;
- the notary must retain every operational and recordkeeping view required to complete the work;
- retries must remain bound to the original usage record and must never consume another unit.

Account suspension, fraud, commission invalidity, court order, or other safety/legal controls remain separate from billing continuity and may still block a workflow under their own approved policies.

### Final-package release gate

If the member's subscription is not entitled when a newly completed final package is ready:

1. Complete the notarization and finalization pipeline.
2. Store the exact final package, hash records, acknowledgment, and audit evidence.
3. Mark the member-facing release as `billing_held`.
4. Do not show or download the newly completed sealed/acknowledged package in the member workspace.
5. Do not publish that held package through public IDN verification until release; otherwise the member gate would be bypassable.
6. Preserve the notary's required completion evidence and records.
7. When a qualifying membership becomes active again, release and publish the existing package idempotently. Do not regenerate, re-sign, re-notarize, or re-hash different bytes.

Public IDN verification continues to expose the actual final PDF for documents whose release status is `released`. A billing-held package is finalized but not yet publicly released.

This withholding policy requires client terms and CA/OH legal review before live paid launch. It can be tested in Stripe test mode before that approval.

## Explicitly Excluded From Current Implementation

- The $249 Trust registration charge.
- Trust activation subscriptions.
- Signer-count pricing or included-POA calculations.
- Dynamic POA creation, activation, active/editable state, or subscription billing.
- Annual subscription prices or discounts.
- Pro verification as a billing condition.
- Pro credit bundles, wallets, lots, expiration, reservation, or consumption runtime.
- Pro-to-client or other delegated payment requests.
- Notary subscriptions, notary capacity, or per-signature/per-document notary charges.
- Usage-based Stripe metering and automatic overage invoices.
- Product features that differ by member tier.

Existing database scaffolding for excluded features may remain dormant. It must be inactive, unreachable from Checkout, absent from public pricing, and clearly marked as deferred rather than partially enabled.

## Private Beta And Production Modes

Provider environment and enforcement mode are separate server-authoritative settings.

Provider environments:

| Environment | Behavior |
| --- | --- |
| `test` | Stripe test customers, test cards, test invoices, test subscriptions, and signed test webhooks. No real funds move. |
| `live` | Real customers, payment methods, invoices, and funds. Disabled until the paid-launch gate passes. |

Enforcement modes:

| Mode | Behavior |
| --- | --- |
| `disabled` | Subscription and allowance do not block member actions. Emergency or deliberately free fallback only. |
| `observe` | Decisions are calculated and audited but do not block. Useful during staging diagnosis. |
| `enforced` | Trusted subscription state and allowance gate new creation/submission and final-package release. |

The confirmed private-beta target is `test + enforced`: users complete the production-like Checkout, webhook, entitlement, usage, plan-change, cancellation, and recovery flows using Stripe test payment methods, but no real payment is collected.

Do not use a zero-dollar product or permanent 100% coupon to represent the free private beta. Those shortcuts would avoid the payment-success, failure, retry, invoice, and recovery behavior the beta needs to test.

Every enforcement-mode change must be restricted and audited. Client applications must consume the server's current mode; they must not implement independent billing bypasses.

## Current Repository Reality

### Existing foundation

The Phase 2 billing migration already provides:

- `billing_accounts` and `billing_customers`;
- catalog products and prices;
- orders and order items;
- subscriptions and subscription items;
- entitlements and payment transactions;
- dormant Pro credit and delegated payment tables; and
- a basic `stripe_webhook_events` inbox.

The backend mounts `/webhooks` before the global JSON parser, so raw-body Stripe signature verification can be added correctly. The web sidebar already links to `/app/billing`, although the page is not implemented, and iOS currently has only a static membership row.

### Incorrect or missing foundation

- Existing catalog seeds describe Trust activation, Dynamic POA, Pro credit, and notary membership products that are not in current scope.
- Catalog constraints do not include a `member_membership` family or `document_workflow_capacity` entitlement.
- Existing seeded notary tier prices and landing-page notary pricing are obsolete.
- The single `provider_price_id` column does not safely map separate Stripe test and live environments.
- `billing_entitlements.quantity_used` is not an immutable request-level usage ledger and is unsafe as the only concurrency control.
- No usage record ties one allowance unit to a specific document/workflow and subscription period.
- No atomic database operation both verifies remaining allowance and records first submission.
- Stripe SDK, Checkout, Customer Portal, webhook fulfillment, reconciliation, and billing APIs are not implemented.
- Web and iOS do not have a shared server-derived membership read model.
- No `billing_held` final-package release state exists.
- The webhook table lacks robust retry, lease, dead-letter, object-reference, and retention fields.

All schema changes must be additive migrations. Do not edit an already-applied migration.

## Target Architecture

### Catalog, not hardcoded plans

Add an active internal product:

- product code/family: `member_membership`;
- billing model: `recurring`;
- role scope/context: `member`;
- entitlement type: `document_workflow_capacity`.

Add the three monthly price records with allowance values 3, 10, and 25. Keep amounts unavailable for live Checkout until approved.

Deactivate—not delete—the obsolete notary membership prices and every currently deferred product price. Checkout must use an allowlisted internal price code and must never accept an arbitrary Stripe Price ID, amount, limit, role, or product family from a client.

### Environment-specific provider mapping

Add a provider mapping table rather than relying on a single environment-ambiguous Price ID. It should link:

- internal catalog price;
- provider (`stripe`);
- environment (`test` or `live`);
- Stripe Product ID;
- Stripe Price ID;
- active/verified state and timestamps.

Require uniqueness by provider/environment/provider object and by active internal price/environment mapping. A startup/catalog verification command must fail closed when active mappings are missing or mixed across environments.

### Generic entitlement and usage boundary

Use `billing_entitlements` for the current-period grant and add an immutable generic usage ledger such as `billing_usage_events` with:

- billing account, subscription, subscription item, entitlement, and document references;
- metric code (`document_workflow` now; additional metrics only in later paid phases);
- product-flow and document-type snapshots;
- event kind (`consume`, `reverse`, or controlled `adjustment`);
- signed quantity;
- subscription-period start/end snapshot;
- idempotency key;
- actor/source, reason, metadata, and timestamps.

`billing_entitlements.quantity_used` may be a transactionally maintained cache, but the immutable usage ledger is the evidence and reconciliation source.

Add a database function/RPC that locks the active period entitlement and atomically:

1. verifies account/subscription/entitlement status;
2. verifies remaining allowance;
3. inserts the unique consumption event for the document;
4. advances the workflow submission state;
5. updates the cached used quantity; and
6. emits required audit/outbox evidence.

If any step fails, none of them commit. Concurrent attempts for the final available unit must allow exactly one submission. Retrying the same document/idempotency key must return the existing result.

### Billing actor and beneficiary separation

For the current scope, payer, subscriber, beneficiary, and document owner normally resolve to the same member billing account. Keep the existing fields separate and validate that current flow explicitly. Do not remove them or collapse them into the active profile role; that separation is the extension point for a later, separately paid delegated-client-payment phase.

### Single billing-policy service

Controllers, web, and iOS must not interpret Stripe states or plan names independently. A backend billing-policy service returns decisions such as:

- `may_create_workflow`;
- `may_submit_workflow`;
- `must_hold_new_final_package`;
- `may_release_held_package`;
- `reason_code`;
- current plan and subscription status;
- period start/end;
- allowance, used, and remaining quantity; and
- cancellation/past-due state.

This service consumes DARCi's trusted internal billing state. Clients never use redirect parameters or direct Stripe reads as authorization.

## Phase 0 — Scope, Pricing, And Policy Lock

Implementation status: **complete for engineering scope**. The locked record is `docs/stripe-phase-0-scope-lock-2026-08-26.md`; unresolved live-launch inputs remain explicit blockers.

Purpose: prevent product ambiguity from driving another incorrect implementation.

Work:

- Record member/document owner as the only current payer.
- Record notaries and invited participants as free.
- Confirm `Member Starter`, `Member Plus`, and `Member Volume` with 3/10/25 monthly workflows.
- Obtain the three monthly price amounts before creating production catalog mappings.
- Confirm no trial, promotion code, annual price, unlimited tier, rollover, or overage billing unless separately approved.
- Approve the usage definition and first-submit consumption point.
- Approve immediate upgrades and period-end downgrades.
- Approve the `billing_held` final-package policy, customer terms, notices, support path, and legal-review owner.
- Record private beta as `test + enforced`, with controlled `observe` and `disabled` fallbacks.
- Identify every web/iOS/landing-page surface containing old Trust, Dynamic POA, Pro-credit, or notary pricing.

Exit criteria:

- Counts and policies are recorded as product decisions.
- Price amounts either are approved or are explicitly marked as blocking live catalog creation, not schema/backend work.
- Current and future-paid scope are visibly separated.
- Old notary-pays requirements are marked obsolete across active roadmaps.

## Phase 1 — Additive Schema And Catalog Correction

Implementation status: **implemented and applied to staging** by `supabase/migrations/20260826120000_add_member_subscription_phase01.sql`; rollback-only and post-apply regression validation passed on 2026-08-26.

Purpose: make the existing billing foundation correct for member subscriptions and safe under concurrency.

Work:

- Add `member_membership`, `member` billing context, and `document_workflow_capacity` to the applicable constraints.
- Seed the member membership product and three inactive-until-linked monthly prices.
- Set allowance metadata/columns to 3, 10, and 25.
- Deactivate obsolete notary membership, Dynamic POA, Trust activation/registration, and Pro bundle catalog rows without deleting historical references.
- Add environment-specific provider product/price mappings.
- Add the immutable generic usage-event table and indexes.
- Add atomic consume/reverse/reconcile database functions.
- Enforce one effective member membership per billing account and period.
- Add final-package release state/evidence sufficient for `billing_held` and `released` transitions.
- Harden `stripe_webhook_events` with object ID, attempt count, next-attempt time, processing lease, error code, dead-letter time, and payload-retention fields.
- Review and test RLS so members can read their own safe billing status but cannot mutate catalog, provider mappings, subscriptions, entitlements, usage, webhook data, or release holds.

Tests:

- Two concurrent submissions competing for the last unit produce one consumption and one quota denial.
- A duplicate submit/retry consumes once.
- A Trust package with multiple output artifacts consumes once.
- A system reversal preserves evidence and restores derived availability once.
- Wrong members, invited signees, notaries, anonymous users, and unrelated authenticated users cannot read or mutate another account's billing data.
- Deferred catalog prices cannot be selected through Checkout.

## Phase 2 — Stripe Test Environment And Catalog

Implementation status: **complete in staging** on 2026-08-26. Stripe Node `22.5.0` is pinned to API `2026-07-29.dahlia`; one test member Product, the $49/$99/$199 monthly Prices, their verified environment mappings, and a restricted test Customer Portal configuration were created and independently verified.

Purpose: build a production-shaped Stripe environment without collecting real funds.

Work:

- Add the official Stripe Node SDK and pin a reviewed API version.
- Create one Stripe member-membership Product with three monthly recurring Prices in test mode.
- Link test Product/Price IDs through the environment mapping table.
- Configure Checkout, invoice collection/retry behavior, Customer Portal, success/cancel URLs, and allowed plan changes.
- Keep Customer Portal plan switching disabled while the three same-interval tiers remain Prices on one Stripe Product. Stripe's Portal requires unique billing intervals per Product for its price-switch list; DARCi plan changes therefore remain server-controlled rather than splitting the membership into three Products.
- Keep live mappings and credentials absent or disabled until the live gate.
- Validate currency, interval, amount, active state, internal price code, and allowance for every enabled mapping.
- Store only reconciliation-safe metadata such as environment, DARCi user/account/order IDs, internal product/price codes, and subscription correlation IDs.

Do not send legal-document names, signer names, identity information, addresses, GPS data, or document contents to Stripe metadata.

Exit criteria:

- A verification command proves every enabled internal test price maps to exactly one expected Stripe test Price.
- Test/live IDs cannot be mixed.
- The Portal permits payment-method management, invoice history, and period-end cancellation. It does not expose arbitrary or unsupported plan changes.

## Phase 3 — Checkout And Durable Webhook Fulfillment

Implementation status: **implemented and staging-schema validated** on 2026-08-26. Authenticated allowlisted Checkout, Portal-session creation, raw-body signed webhook ingress, minimized durable event storage, leased retry processing, and transactional subscription/entitlement/order/invoice fulfillment are implemented. The deployed staging webhook endpoint still must be registered in Stripe after this backend revision is deployed; the current Stripe test account has no registered webhook endpoint, and a new endpoint secret must be stored through the approved staging secret-management path before an end-to-end delivery smoke test.

Purpose: establish trusted subscription state before enforcing product access.

Checkout:

- `POST /billing/member-membership/checkout` accepts only an allowlisted internal price code and a client idempotency token.
- Require an authenticated, confirmed-email, active DARCi account.
- Resolve/create the member's default billing account and Stripe customer.
- Prevent conflicting active subscriptions and duplicate pending Checkout Sessions.
- Create an internal pending order/item snapshot before calling Stripe.
- Use stable server-generated Stripe idempotency keys.
- Treat success/cancel redirects as display state only.

Webhook inbox:

- Add `POST /webhooks/stripe` to the raw-body webhook router.
- Verify `Stripe-Signature` against exact raw bytes.
- Durably and idempotently record the event envelope before returning success.
- Process asynchronously with leases, bounded retries, dead-letter alerts, and operator replay.
- Do not assume event order; retrieve current Stripe objects when needed before applying a transition.
- Minimize retained payloads and define access and deletion/retention rules.

Minimum event families:

- `checkout.session.completed` and `checkout.session.expired`;
- `customer.subscription.created`, `updated`, and `deleted`;
- pause/resume events only if that behavior is enabled;
- `invoice.paid`, `invoice.payment_failed`, and `invoice.payment_action_required`; and
- refund/dispute events required by the approved support policy.

Fulfillment:

- Initial activation requires trusted server-side subscription/invoice evidence.
- Renewal advances entitlement periods idempotently.
- Price changes update the plan limit without resetting current-period usage.
- Scheduled downgrade applies on the verified new period.
- Cancellation-at-period-end preserves entitlement to the paid end date.
- Terminal inactive states block new creation/submission and drive the final-package release decision.
- Event processing, subscription/item upsert, entitlement mutation, order/payment update, and audit/outbox evidence occur transactionally or through a proven recoverable saga.

## Phase 4 — Usage And Product-Workflow Integration

Purpose: enforce member allowance without duplicating business rules or damaging workflow integrity.

Work:

- Add the single billing-policy service and shared reason codes.
- Identify the authoritative first-submit transition for Trust, POA, and uploaded-document workflows.
- Call the atomic usage function from each product flow at that boundary.
- Require active entitlement for new workflow creation and first submission in `enforced` mode.
- Keep drafts/viewing behavior explicit and consistent across products.
- Preserve submitted work through signing, notary approval, in-person session, and finalization after later billing changes.
- Apply the `billing_held` gate after final bytes and hashes exist but before member/public release.
- Add an idempotent release worker/action triggered by qualifying membership reactivation.
- Add narrowly scoped support reversal/override actions with recent reauthentication, reason, actor, and audit evidence.

Exit criteria:

- All three product families consume the same metric at the same conceptual boundary.
- No workflow or retry can double-consume.
- Quota cannot be exceeded under concurrency.
- Billing lapse cannot strand a notary or corrupt an accepted workflow.
- Held packages cannot be reached through member APIs, storage URLs, or public verification.
- Reactivation releases the original finalized bytes exactly once.

## Phase 5 — Web Billing Experience And Pricing Truth

Purpose: give members an accurate, minimal subscription experience.

Work:

- Implement `/app/billing` for the authenticated member billing account.
- Show plan, subscription status, period end, allowance, used, remaining, and cancellation/past-due guidance.
- Offer the three member tiers with identical feature descriptions and only volume differences.
- Create Checkout and Customer Portal sessions server-side.
- Show “activation pending” until webhook fulfillment completes.
- Show quota reached with two actions only: upgrade or wait for renewal.
- Explain that upgrades do not reset used quantity.
- Explain the held-final-package behavior in approved customer-facing language.
- Remove obsolete notary pricing and the old Trust/Dynamic POA/Pro billing claims from purchasable landing-page surfaces.
- Hide deferred products rather than displaying nonfunctional purchase controls.

## Phase 6 — iOS Status And Purchase Decision

Purpose: keep iOS truthful while the hybrid digital/in-person payment classification is resolved.

DARCi's membership unlocks digital document workflows, while every notarization includes an in-person service. Apple separately addresses in-app feature unlocks and qualifying person-to-person or outside-the-app services, so the final treatment is not safe to infer solely from the in-person step.

Work:

- First ship a status-only membership view backed by the same API as web.
- Show plan, status, remaining workflows, period end, and support guidance.
- Do not grant access from a browser return or client-side payment result.
- Provide App Review with a precise description of generated documents, uploaded documents, signing, notary selection, and the mandatory in-person session.
- Ask App Review to classify the intended Stripe/Apple Pay purchase path.
- Prepare a U.S. app-to-web Stripe checkout option using universal links and Apple Pay-capable Stripe Elements, but ship it only after review/distribution requirements are recorded.
- Use native Stripe PaymentSheet/Apple Pay only if the approved classification permits it.
- Keep storefront-specific behavior server-configured and documented.

Exit criteria:

- Web and iOS display identical trusted membership and usage state.
- No iOS purchase CTA ships without an approved policy path.
- Universal-link return cannot activate a subscription before webhook fulfillment.

## Phase 7 — Reconciliation, Support, And Recovery

Purpose: make billing explainable and recoverable without direct database edits.

Reconciliation must detect:

- Stripe subscription with no DARCi subscription;
- DARCi active entitlement with a missing, canceled, or unpaid Stripe subscription;
- internal price/Stripe Price mismatch;
- period or allowance mismatch;
- paid invoice not fulfilled;
- missing, stuck, or dead-letter webhook event;
- duplicate customer or effective subscription;
- usage ledger/cached counter drift;
- held package eligible for release but not released; and
- test/live environment mismatch.

Operations:

- Add operator views for account, order, subscription, invoice/payment, entitlement, usage, webhook attempts, release holds, and reconciliation drift.
- Add controlled event replay, subscription resync, usage reversal, held-package release retry, cancellation, refund, and support override actions.
- Alert on signature failures, backlog, dead letters, fulfillment failures, counter drift, release failures, and repeated Checkout abuse.
- Document Stripe outage, webhook outage, queue outage, database outage, failed finalization, duplicate charge, refund/dispute, and account-takeover runbooks.
- Record Stripe request IDs and DARCi correlation IDs without logging secrets or sensitive document data.

Stripe Sync Engine may be evaluated later as a reporting/reconciliation mirror. It is not required for the first working slice and must never become the authorization source.

## Phase 8 — Hardening And Live-Payment Gate

Security and reliability:

- Rate-limit Checkout, Portal, billing reads, webhook abuse paths, and administrative mutations.
- Apply browser origin/CSRF protections to billing mutations.
- Require recent reauthentication and appropriate MFA for refunds, support overrides, and sensitive account changes.
- Keep all Stripe secrets server-side and separate by environment.
- Define webhook/event/payment-data retention and backup treatment.
- Complete RLS, API authorization, idempotency, concurrency, and recovery tests.

Live-mode exit criteria:

- Prices and tax/customer terms are approved.
- The final-package withholding policy has legal and product approval.
- App Store distribution/payment treatment is approved for every enabled purchase surface.
- No entitlement activates from a redirect or unsigned event.
- Duplicate, delayed, and out-of-order webhooks and worker crashes are proven safe.
- Usage cannot exceed the plan under concurrency.
- Submitted work continuity and held-package release are tested end to end.
- Reconciliation detects and repairs a deliberately skipped event without double fulfillment.
- Support can explain every subscription, usage, denial, reversal, and release decision.
- Web/iOS/landing-page copy matches the runtime.
- Stripe test-to-live mapping is verified without shared IDs or secrets.
- The relevant private-beta security, integrity, legal, and operations gates are complete or explicitly accepted.

## Minimal API Surface

Authenticated member endpoints:

- `GET /billing/member-membership`
- `POST /billing/member-membership/checkout`
- `POST /billing/customer-portal-session`
- `GET /billing/orders/{id}` when needed for pending activation/support

Provider endpoint:

- `POST /webhooks/stripe`

Internal policy/service operations:

- evaluate creation/submission entitlement;
- atomically consume a document-workflow unit;
- reverse a unit under controlled support/system policy;
- determine and apply final-package hold/release; and
- reconcile subscription, entitlement, usage, and release state.

Admin/support endpoints should be added only for specific operator workflows and must not expose generic unrestricted mutations.

Do not publish Dynamic POA, Trust-fee, Pro-credit, delegated-payment, or notary-membership Checkout endpoints in the current phase.

## Required Test Matrix

Subscription lifecycle:

- no subscription, pending Checkout, incomplete, trialing, active, cancel-at-period-end, past due, unpaid, paused, expired, and canceled;
- initial payment success/failure/action required;
- renewal success/failure and recovery;
- immediate upgrade with preserved usage;
- scheduled downgrade and period reset;
- duplicate/out-of-order events and worker restart.

Usage:

- 3/10/25 limits;
- last-unit concurrency;
- no rollover;
- one Trust package with multiple artifacts;
- POA and uploaded-document paths;
- duplicate submit and technical regeneration;
- support reversal and reconciliation;
- plan upgrade after quota exhaustion.

Workflow continuity and release:

- subscription lapses before submission;
- subscription lapses after submission but before signing;
- after signing but before notary acceptance;
- during the in-person session;
- during finalization; and
- after a held package is created and membership later reactivates.

Authorization:

- member owner, Pro acting as owner, invited signer, selected notary, wrong notary, unrelated member, admin/support, anonymous user, and service worker;
- clients cannot choose amounts, limits, provider IDs, payer/beneficiary identities, usage quantities, or release states.

## Future Paid Expansion Path

The following sequence describes compatibility goals, not authorized implementation:

1. **Annual member billing** — add annual provider Prices mapped to the same membership product and entitlement metric.
2. **One-time Trust registration** — activate a separate one-time catalog product/order fulfillment path.
3. **Dynamic POA** — define a separate product entitlement and lifecycle; do not overload `document_workflow` usage.
4. **Pro credit bundles** — activate wallet/lot/ledger logic, with 12-month expiry and its own atomic reservation/commit policy.
5. **Delegated client payment** — use the existing payer/requester/beneficiary separation and a dedicated payment-request state machine.
6. **Signer-count bundles** — add explicit order/subscription-item quantities and entitlement grants only after the product rules are approved.
7. **Notary billing** — remains contrary to the current payer decision; it would require an explicit new product decision before any dormant architecture is activated.

Each future phase requires its own estimate, authorization, product rules, checkout UX, refund/reversal policy, privacy review, tests, and reconciliation. “Schema-ready” does not mean included in the current delivery.

## Remaining Decisions And Owners

1. Is a free trial disabled for private beta and initial live launch?
2. Are promotion codes disabled initially?
3. Are upgrades prorated immediately through Stripe and downgrades scheduled at period end?
4. What customer notice and legal terms govern a `billing_held` final package?
5. What refund/dispute outcomes, if any, permit a usage reversal?
6. Who owns daily reconciliation and failed-fulfillment/release response?
7. Which iOS purchase implementation and storefronts receive App Review approval?
8. Is Stripe Tax required, and who owns taxability and billing-address policy?
9. How long are minimized Stripe webhook/event records retained?

## Primary Technical References

- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe webhook delivery and signature handling](https://docs.stripe.com/webhooks)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe Customer Portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal)
- [Stripe iOS app-to-web checkout for digital subscriptions](https://docs.stripe.com/mobile/digital-goods/custom-checkout)
- [Stripe fixed-price subscriptions on iOS](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=mobile&platform=ios)
- [Apple App Review Guidelines, Payments](https://developer.apple.com/app-store/review/guidelines/)
