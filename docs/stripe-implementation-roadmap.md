# DARCi Stripe Implementation Roadmap

Status: draft; implementation deferred until core auth process is production-ready
Date: 2026-04-30

## Goal

This roadmap captures the future Stripe implementation path without pulling Stripe into the immediate auth work. The auth roadmap should first establish confirmed accounts, active account enforcement, role/verification gates, reauthentication, and MFA policies. Stripe can then plug into those guarantees without becoming a second identity or authorization system.

Stripe should own payment collection, subscription billing, invoices, refunds, disputes, and customer billing artifacts. DARCi should own product authorization, order fulfillment, Pro credits, notary capacity, entitlements, audit events, and all role/verification policy.

## Current Foundation

Relevant files:

- [docs/DARCi_Payment_Logic_Spec.md](DARCi_Payment_Logic_Spec.md)
- [supabase/migrations/20260419220000_add_phase2_billing_and_entitlements.sql](../supabase/migrations/20260419220000_add_phase2_billing_and_entitlements.sql)
- [backend/src/routes/webhooks.ts](../backend/src/routes/webhooks.ts)
- [backend/src/index.ts](../backend/src/index.ts)
- [backend/package.json](../backend/package.json)
- [api/openapi.yaml](../api/openapi.yaml)

What already exists:

- Billing accounts and customers.
- Product and price catalog tables.
- Orders, order items, subscriptions, and subscription items.
- Billing entitlements.
- Pro credit wallets, lots, reservations, and transactions.
- Payment transactions and delegated payment requests.
- `stripe_webhook_events` for provider event idempotency and processing status.
- `/webhooks` is mounted before `express.json()`, which is compatible with raw-body Stripe signature verification.

What is missing:

- Stripe SDK dependency.
- Stripe customer/checkout/subscription services.
- `POST /webhooks/stripe` route.
- Runtime fulfillment logic that updates DARCi billing, entitlement, and credit state.
- Stripe Sync Engine installation/configuration.
- Reconciliation jobs comparing Stripe data with DARCi internal state.
- Public/admin billing APIs in OpenAPI.

## Auth Prerequisites

Stripe implementation should wait for these auth guardrails or explicitly depend on them:

- Public users can only start app payment flows after email confirmation.
- `public.users.status` is enforced, so suspended/revoked accounts cannot start new payments or consume entitlements.
- `pro`, `notary`, and `admin` are granted through DARCi role services, not through Stripe payments.
- Pro credit purchases and credit usage are gated by the `pro` role and any required verification policy.
- Notary memberships and notary capacity are gated by the `notary` role and commission verification policy.
- Admin billing overrides, refunds, credit adjustments, and high-value payment actions require recent reauthentication and MFA where policy requires it.
- Stripe webhooks run as service/system operations and do not require or trust a browser user session.
- Stripe success redirects are treated as UX signals only; fulfillment comes from trusted webhooks or backend Stripe verification.

## Product Mapping

Map the payment spec into existing billing product families:

| Payment spec item | Internal product family | Stripe shape | Fulfillment output |
| --- | --- | --- | --- |
| Trust registration one-time fee | `trust_registration` | Checkout one-time price | Paid order and trust registration entitlement |
| Trust activation / included Dynamic POA subscription | `trust_activation` or `dynamic_poa` | Recurring subscription price | Active document/trust entitlement |
| Standalone Dynamic POA | `dynamic_poa` | Recurring subscription price | Active/editable POA entitlement |
| Pro credit bundles | `pro_credit_bundle` | Checkout one-time price | Credit lot with 12-month expiry |
| Notary membership tiers | `notary_membership` | Recurring subscription price | Notary signing-capacity entitlement |

Stripe metadata should include:

- `environment`
- `darci_user_id`
- `supabase_user_id` when available
- `billing_account_id`
- `billing_order_id`
- `billing_product_family`
- `billing_catalog_product_id`
- `billing_catalog_price_id`
- `document_id`, `trust_id`, or `notarization_request_id` when relevant
- `pro_credit_bundle_size` when relevant

## Phase 0: Catalog And Policy Alignment

Purpose: make the internal catalog and policy model ready before adding Stripe runtime.

Work items:

- Translate [docs/DARCi_Payment_Logic_Spec.md](DARCi_Payment_Logic_Spec.md) into `billing_catalog_products` and `billing_catalog_prices` rows.
- Define canonical product slugs for trust registration, Dynamic POA monthly/annual, Pro bundles, and notary tiers.
- Decide final monthly/annual pricing and display names before creating Stripe Prices.
- Define which products require confirmed account, active account, verified Pro, verified notary, or admin step-up.
- Define entitlement outputs for each product family.
- Define refund/cancel/revocation behavior for each entitlement type.

Deliverables:

- Catalog seed migration or admin seed script.
- Product metadata convention.
- Entitlement policy matrix.

## Phase 1: Stripe Runtime Foundation

Purpose: add the Stripe service boundary and webhook ingestion without product-specific fulfillment complexity.

Backend work:

- Add the Stripe SDK to [backend/package.json](../backend/package.json).
- Add Stripe env vars: secret key, webhook signing secret, publishable key if needed by web, customer portal configuration id if used.
- Add a Stripe service module for customer creation, checkout session creation, subscription lookup, and event verification.
- Add `POST /webhooks/stripe` in [backend/src/routes/webhooks.ts](../backend/src/routes/webhooks.ts) using raw body verification.
- Use `stripe_webhook_events` for idempotent event receipt, processing state, retry metadata, and dead-letter handling.
- Add structured audit events for checkout creation, webhook received, webhook processed, webhook failed, and fulfillment failed.

Testing:

- Webhook signature success/failure.
- Duplicate event idempotency.
- Event processing status transitions.
- Unknown/unhandled event behavior.

## Phase 2: Consumer Checkout And Entitlements

Purpose: support end-consumer trust registration and Dynamic POA subscription flows.

Backend work:

- Add checkout-session creation for trust registration one-time payment plus selected recurring plan.
- Add checkout-session creation for standalone Dynamic POA monthly/annual subscription.
- Create or reuse `billing_accounts` and `billing_customers` before checkout.
- Create `billing_orders` in `pending_payment` before redirecting to Stripe.
- On trusted payment events, mark orders paid, create payment transactions, create/update subscriptions, and activate entitlements.
- Handle failed, expired, refunded, canceled, past-due, unpaid, and incomplete states.

Frontend work:

- Add product checkout entry points only for confirmed/active accounts.
- Show pending payment, active, past-due, canceled, and expired states from DARCi internal billing state.
- Never activate UI features based only on a Stripe success redirect.

Testing:

- Trust registration checkout success/failure.
- Dynamic POA subscription active/past-due/canceled.
- Success redirect before webhook does not grant entitlement.
- Suspended user cannot start checkout or consume entitlement.

## Phase 3: Pro Credit Bundles

Purpose: let verified Pros buy and consume prepaid trust-registration credits.

Backend work:

- Gate Pro bundle checkout by active `pro` role and verification policy.
- Map Stripe one-time payment success to `pro_credit_lots` with credit quantity and 12-month expiry.
- Write `pro_credit_transactions` for purchase, reservation, consumption, release, expiration, and admin adjustment.
- Use `pro_credit_reservations` to avoid race conditions when a Pro starts a trust registration.
- Support the Pro choice to use credits or send the client a delegated payment request.

Testing:

- Verified Pro can buy credits.
- Non-Pro cannot buy or use Pro credits.
- Credit lot expires after 12 months.
- Reservation prevents double spend.
- Refund/cancel behavior reverses or freezes credits according to policy.

## Phase 4: Delegated Client Payment Requests

Purpose: support Pro-initiated flows where the client pays directly.

Backend work:

- Use `billing_payment_requests` for client payment links.
- Bind request beneficiary, payer, requested-by Pro, and target document/trust context.
- Require invite/auth matching before the client can pay from inside the app.
- Allow public Stripe checkout only when the payment request token is valid, unexpired, and scoped.
- Fulfill the beneficiary entitlement after trusted payment confirmation.

Testing:

- Pro creates client payment request.
- Client pays and beneficiary entitlement activates.
- Expired/revoked payment request cannot be paid.
- Payment request cannot be replayed for another document/user.

## Phase 5: Notary Memberships

Purpose: support verified notary membership tiers and capacity limits.

Backend work:

- Gate notary membership checkout by active/verified `notary` role.
- Map Basic, Plus, and Elite subscriptions to signing-capacity entitlements.
- Enforce capacity by internal entitlement state, not by Stripe state alone.
- Handle subscription upgrades, downgrades, cancellation, past-due, unpaid, and renewal.

Testing:

- Verified notary can subscribe.
- Unverified notary cannot activate live capacity.
- Tier changes update capacity.
- Past-due/unpaid behavior follows policy.

## Phase 6: Stripe Sync Engine And Reconciliation

Purpose: make Stripe data queryable locally without letting the mirror become the sole fulfillment source.

Sync Engine role:

- Stripe Sync Engine should sync Stripe objects into a local `stripe` schema for reporting, dashboards, analytics, reconciliation, and support workflows.
- It should complement DARCi webhook fulfillment. It should not replace internal order, entitlement, subscription, or credit state.

Work items:

- Install/configure Supabase Stripe Sync Engine for the staging/prod projects.
- Store enough provider IDs in DARCi tables to join internal rows to Stripe customers, subscriptions, checkout sessions, invoices, payment intents, charges, refunds, and prices.
- Add reconciliation views or jobs that compare Stripe mirror state to DARCi `billing_*` state.
- Emit ops/audit events for drift, missing webhooks, failed fulfillment, duplicate Stripe objects, and mismatched subscription status.
- Add backfill procedure for historical Stripe objects.

Testing:

- Internal state matches Stripe mirror after checkout.
- Missing webhook is detected by reconciliation.
- Manual Stripe dashboard changes surface as drift.
- Backfill does not double-fulfill orders or credits.

## Phase 7: Admin, Support, And Operations

Purpose: make billing operable for staff without unsafe manual database edits.

Admin work:

- Add billing account/customer search.
- Add order, subscription, entitlement, payment request, and credit-lot detail views.
- Add refund/dispute/cancel support workflows with audit events.
- Add Pro credit adjustment workflow requiring admin MFA and reason capture.
- Add notary membership override workflow requiring admin MFA and reason capture.

Notification work:

- Send payment success/failure receipts or status messages through the notification outbox.
- Send subscription past-due/canceled notices.
- Send Pro credit purchase/expiry notices.
- Send delegated client payment request reminders.

## Phase 8: Hardening And Compliance

Purpose: reduce financial and authorization risk.

Security controls:

- Rate-limit checkout creation, payment request creation, and admin billing actions.
- Require recent reauth for payment-method changes and high-value actions.
- Require MFA for admin billing overrides and Pro credit adjustments.
- Validate all Stripe webhook signatures and reject unsigned event payloads.
- Keep browser-returned checkout state advisory only.

Audit controls:

- Record billing audit events with actor, service actor, order id, billing account id, Stripe event id, and entitlement changes.
- Track state transitions for orders, subscriptions, entitlements, payment requests, and credit lots.
- Alert on fulfillment failures, reconciliation drift, duplicate webhook failures, and suspicious admin billing behavior.

Testing controls:

- Unit tests for catalog mapping and fulfillment policy.
- Integration tests for webhook-driven fulfillment.
- Contract tests for OpenAPI billing endpoints.
- Stripe CLI/test-mode smoke tests before staging deployment.

## API Backlog

Candidate endpoints, to finalize after auth Phase 1:

- `GET /billing/catalog`
- `GET /billing/accounts/me`
- `POST /billing/checkout/trust-registration`
- `POST /billing/checkout/dynamic-poa`
- `POST /billing/checkout/pro-credit-bundle`
- `POST /billing/checkout/notary-membership`
- `POST /billing/payment-requests`
- `GET /billing/payment-requests/{token}`
- `POST /billing/payment-requests/{token}/checkout`
- `GET /billing/orders/{id}`
- `GET /billing/subscriptions`
- `GET /billing/entitlements`
- `GET /billing/pro-credits`
- `POST /webhooks/stripe`
- `GET /admin/billing/accounts`
- `GET /admin/billing/orders`
- `GET /admin/billing/subscriptions`
- `GET /admin/billing/reconciliation`
- `POST /admin/billing/pro-credits/adjustments`

## Implementation Order Recommendation

1. Finish auth Phase 0 and Phase 1 guardrails first.
2. Align catalog/products/prices and entitlement policy.
3. Add Stripe SDK, service boundary, and webhook ingestion.
4. Implement consumer checkout and subscription fulfillment.
5. Implement Pro credit bundles and credit consumption.
6. Implement delegated client payment requests.
7. Implement notary memberships and capacity entitlements.
8. Add Stripe Sync Engine and reconciliation.
9. Add admin/support workflows.
10. Harden rate limits, MFA/reauth gates, audit events, and alerts.

## Open Decisions

- Whether Stripe Customer Portal is sufficient for subscription/payment-method management or DARCi needs custom billing-management screens.
- Whether Pro verification is required before buying credits, before using credits, or both.
- Whether notary membership can be purchased before commission verification, with capacity locked until verification.
- Exact refund/cancel rules for consumed Pro credits and generated trust registrations.
- Whether delegated client payment requests can be paid without an authenticated DARCi account or must always require account creation/claim.
- Whether Sync Engine reconciliation should be a worker job, database view, scheduled query, or admin-triggered process.
