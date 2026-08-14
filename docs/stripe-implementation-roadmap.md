# DARCi Stripe Implementation Roadmap

Status: active implementation roadmap for final blocking payment functionality
Date: 2026-08-11

## Goal

This roadmap turns the client payment clarification into a smaller implementation plan for DARCi's final blocking payment functionality. The launch scope is now illuminotary subscription billing only. Member trust/POA pricing, Pro credit packages, delegated client payment, and Pro-dashboard-dependent workflows are deferred.

Stripe should own payment collection, subscription billing, invoices, refunds, disputes, and customer billing artifacts. DARCi should own product authorization, order fulfillment, illuminotary capacity, entitlements, audit events, and all role/verification policy.

The Supabase Stripe Sync Engine should be used as a local Stripe mirror for reporting, reconciliation, and support tooling. It should not replace trusted webhook fulfillment or DARCi's internal billing state.

## Revised Scope

Source: [docs/DARCi_Payment_Logic_Spec.md](DARCi_Payment_Logic_Spec.md), the 2026-08-11 client attachment, and the client clarification that Pro packages and member pricing are scratched for launch.

Launch scope:

- Verified illuminotaries subscribe monthly to a tier.
- Tiers remain Basic $9.99/month for 10 docs/month, Plus $19.99/month for 25 docs/month, and Elite $59.99/month for unlimited docs/month unless client revises pricing.
- Stripe subscription state is mirrored into DARCi billing state and used to grant `notary_signing_capacity` entitlements.
- The notary workspace enforces capacity before a notary can accept/start/process paid illuminotary work.
- Billing management uses Stripe Customer Portal unless a custom management screen becomes necessary.

Deferred scope:

- Consumer trust registration: $249 one-time Stripe charge plus trust activation subscription.
- Trust activation tiers: 1 signer at $10/month or $99/year; 2 signers at $15/month or $159/year.
- Standalone Dynamic POA: free document creation, activated by $5/month or $50/year subscription.
- Member-side paid trust/POA activation surfaces.
- Pro bundle tiers: Starter 5 credits for $1,145, Growth 10 for $2,200, Practice 25 for $5,125, Firm 50 for $9,450.
- Pro payment choice: use an available Pro credit or send payment to the client.
- Client invite after Pro initiation: client signs up, accesses dashboard, adds trusted persons, and subscribes where needed.

## Current Foundation

Relevant files:

- [docs/DARCi_Payment_Logic_Spec.md](DARCi_Payment_Logic_Spec.md)
- [supabase/migrations/20260419220000_add_phase2_billing_and_entitlements.sql](../supabase/migrations/20260419220000_add_phase2_billing_and_entitlements.sql)
- [backend/src/routes/webhooks.ts](../backend/src/routes/webhooks.ts)
- [backend/src/index.ts](../backend/src/index.ts)
- [backend/package.json](../backend/package.json)
- [api/openapi.yaml](../api/openapi.yaml)

What already exists:

- Billing accounts and customers via `billing_accounts` and `billing_customers`.
- Product and price catalog tables via `billing_catalog_products` and `billing_catalog_prices`.
- Seeded catalog rows already include the launch products:
  - `notary_membership_basic_monthly` at $9.99/month with 10-doc capacity.
  - `notary_membership_plus_monthly` at $19.99/month with 25-doc capacity.
  - `notary_membership_elite_monthly` at $59.99/month with unlimited capacity.
- Seeded catalog rows also include deferred member and Pro products:
  - `trust_registration_base` at $249.
  - `trust_activation_1_signer_monthly` at $10/month.
  - `trust_activation_1_signer_annual` at $99/year.
  - `trust_activation_2_signer_monthly` at $15/month.
  - `trust_activation_2_signer_annual` at $159/year.
  - `dynamic_poa_monthly` at $5/month.
  - `dynamic_poa_annual` at $50/year.
  - `pro_credit_bundle_starter`, `growth`, `practice`, and `firm` with the requested credit counts and prices.
- Orders, order items, subscriptions, and subscription items via `billing_orders`, `billing_order_items`, `billing_subscriptions`, and `billing_subscription_items`.
- Billing entitlements via `billing_entitlements`, including the `notary_signing_capacity` entitlement type needed for launch.
- Pro credit wallets, lots, reservations, and transactions via `pro_credit_wallets`, `pro_credit_lots`, `pro_credit_reservations`, and `pro_credit_transactions`.
- Payment transactions and delegated payment requests via `payment_transactions` and `billing_payment_requests`.
- `stripe_webhook_events` for provider event idempotency and processing status.
- RLS policies and authenticated read grants for billing state, with service-role write access.
- Notification schema/template foundations for delegated client payment requests.
- `/webhooks` is mounted before `express.json()`, which is compatible with raw-body Stripe signature verification.
- Web pricing copy exists in `apps/web/src/components/PricingSection.tsx`, but it is presentational only.
- Mobile settings has a static `Membership & Billing` row, but no billing surface.

What is missing for the illuminotary-only launch:

- Stripe SDK dependency.
- Stripe customer/checkout/subscription services.
- `POST /webhooks/stripe` route.
- Runtime fulfillment logic that updates DARCi billing, subscription, and notary-capacity entitlement state.
- Stripe Sync Engine installation/configuration.
- Reconciliation jobs comparing Stripe data with DARCi internal state.
- Public/admin billing APIs in OpenAPI for notary membership and billing management.
- Checkout entry point for verified illuminotaries.
- Billing state readers for subscription status and notary capacity.
- Notary workflow gates that prevent over-capacity or inactive-membership processing.
- Stripe Customer Portal integration or custom subscription-management screens.

## MVP Recommendation

The clarified MVP is much smaller than the original client spec. Build illuminotary subscription billing first and keep all member/Pro flows out of the launch payment path.

MVP slice:

1. Stripe runtime foundation, webhook verification, and webhook fulfillment.
2. Supabase Stripe Sync Engine mirror for Stripe customers, subscriptions, invoices, and payments.
3. illuminotary membership checkout for Basic, Plus, and Elite monthly tiers.
4. Billing state display for active, pending, past-due, canceled, unpaid, and incomplete subscription states.
5. Stripe Customer Portal for payment-method, invoice, cancellation, and subscription-management flows.
6. Notary capacity entitlement enforcement in the notary workflow.

Deferred sequence:

1. Admin billing support, refunds, reconciliation, and manual membership overrides.
2. Member trust/POA pricing if the client reintroduces member subscriptions.
3. Pro dashboard.
4. Pro credit bundle purchase and credit balance display.
5. Pro credit reservation/consumption for trust registration.
6. Delegated client payment request flow.

The smaller scope should be meaningfully faster: it still needs correct Stripe webhook fulfillment, but it avoids Pro credits, delegated payment requests, member trust/POA entitlement gates, and multi-beneficiary checkout.

## Concerns And Open Product Decisions

- Confirm whether capacity means documents, notarization requests, completed notarizations, or signatures. The client phrasing says docs/month; existing schema names the entitlement `notary_signing_capacity`.
- Confirm where to enforce membership: before notary profile access, before accepting a request, before starting the in-person session, or before final package submission. Recommended: allow profile access, require active capacity before accepting/starting paid work.
- Confirm whether unverified illuminotaries can subscribe before approval. Recommended: require active/verified `notary` role before checkout to avoid charging people who cannot use the product.
- Confirm whether Basic/Plus capacity resets monthly by Stripe billing period or calendar month. Recommended: use Stripe subscription period boundaries.
- Confirm what happens when a notary downgrades mid-cycle after using more docs than the new tier permits. Recommended: apply downgrade at next period via Stripe.
- Confirm past-due behavior. Recommended: grace/read-only state for existing appointments, block new accepted work until subscription is active.
- Confirm whether Elite is truly unlimited or subject to an abuse/fair-use admin policy.
- Refund/cancellation behavior is not specified for partially completed notarization workflows.
- Stripe redirect success must remain advisory. Fulfillment must come from trusted webhook processing or backend verification.
- Stripe credentials may exist in `.env.staging`, but implementation should validate required env var names without printing secrets.

## Auth Prerequisites

Stripe implementation should wait for these auth guardrails or explicitly depend on them:

- Public users can only start app payment flows after email confirmation.
- `public.users.status` is enforced, so suspended/revoked accounts cannot start new payments or consume entitlements.
- `pro`, `notary`, and `admin` are granted through DARCi role services, not through Stripe payments.
- Notary memberships and notary capacity are gated by the `notary` role and commission verification policy.
- Admin billing overrides, refunds, credit adjustments, and high-value payment actions require recent reauthentication and MFA where policy requires it.
- Stripe webhooks run as service/system operations and do not require or trust a browser user session.
- Stripe success redirects are treated as UX signals only; fulfillment comes from trusted webhooks or backend Stripe verification.

## Product Mapping

Map the launch payment scope into existing billing product families:

| Payment spec item | Internal product family | Stripe shape | Fulfillment output |
| --- | --- | --- | --- |
| Notary membership tiers | `notary_membership` | Recurring subscription price | Notary signing/doc capacity entitlement |

Deferred mappings already supported by schema:

| Deferred payment spec item | Internal product family | Stripe shape | Fulfillment output |
| --- | --- | --- | --- |
| Trust registration one-time fee | `trust_registration` | Checkout one-time price | Paid order and trust registration entitlement |
| Trust activation / included Dynamic POA subscription | `trust_activation` or `dynamic_poa` | Recurring subscription price | Active document/trust entitlement |
| Standalone Dynamic POA | `dynamic_poa` | Recurring subscription price | Active/editable POA entitlement |
| Pro credit bundles | `pro_credit_bundle` | Checkout one-time price | Credit lot with 12-month expiry |

Stripe metadata should include:

- `environment`
- `darci_user_id`
- `supabase_user_id` when available
- `billing_account_id`
- `billing_order_id`
- `billing_product_family`
- `billing_catalog_product_id`
- `billing_catalog_price_id`
- `notary_membership_tier` when relevant
- `notary_capacity_limit` when relevant
- `document_id`, `trust_id`, `notarization_request_id`, or `pro_credit_bundle_size` only for deferred flows when they are reintroduced

## Phase 0: Notary Catalog Verification And Stripe Price Linkage

Purpose: verify the already-seeded notary membership catalog, create/link real Stripe Products and Prices, and lock fulfillment policy before runtime checkout is enabled.

Work items:

- Confirm `notary_membership_basic_monthly`, `notary_membership_plus_monthly`, and `notary_membership_elite_monthly` match the final client-approved prices and capacities.
- Create matching Stripe Products and monthly recurring Prices in staging.
- Backfill `billing_catalog_prices.provider_price_id` for the three notary prices.
- Decide whether production Stripe Products/Prices are created manually, via seed script, or via a controlled admin sync.
- Define verified-notary checkout requirements.
- Define notary capacity entitlement output and period reset behavior.
- Define refund/cancel/revocation behavior for notary memberships.
- Define idempotency keys for checkout creation by notary user and membership tier.

Deliverables:

- Stripe Product/Price creation checklist or script.
- Catalog/provider Price ID verification script.
- Product metadata convention.
- Notary membership entitlement policy matrix.
- Notary refund/cancel/revocation matrix.

## Phase 1: Stripe Runtime Foundation

Purpose: add the Stripe service boundary and webhook ingestion without product-specific fulfillment complexity.

Backend work:

- Add the Stripe SDK to [backend/package.json](../backend/package.json).
- Add Stripe env vars: secret key, webhook signing secret, publishable key if needed by web, customer portal configuration id if used.
- Validate required Stripe env vars at startup or billing service initialization without logging secret values.
- Add a Stripe service module for customer creation, checkout session creation, subscription lookup, and event verification.
- Add `POST /webhooks/stripe` in [backend/src/routes/webhooks.ts](../backend/src/routes/webhooks.ts) using raw body verification.
- Use `stripe_webhook_events` for idempotent event receipt, processing state, retry metadata, and dead-letter handling.
- Add structured audit events for checkout creation, webhook received, webhook processed, webhook failed, and fulfillment failed.
- Add Stripe Customer Portal session creation for subscription/payment-method management.

Testing:

- Webhook signature success/failure.
- Duplicate event idempotency.
- Event processing status transitions.
- Unknown/unhandled event behavior.

## Phase 2: illuminotary Membership Checkout And Entitlements

Purpose: support verified illuminotary membership subscription flows.

Backend work:

- Add checkout-session creation for Basic, Plus, and Elite notary membership tiers.
- Create or reuse `billing_accounts` and `billing_customers` before checkout.
- Create `billing_orders` in `pending_payment` before redirecting to Stripe.
- On trusted payment events, mark orders paid, create payment transactions, create/update subscriptions, and activate notary capacity entitlements.
- Handle failed, expired, refunded, canceled, past-due, unpaid, and incomplete states.
- Add backend entitlement checks to the notary workflow step that product decides is membership-gated.

Frontend work:

- Add membership checkout entry points only for confirmed, active, verified notary accounts.
- Show pending payment, active, past-due, canceled, unpaid, incomplete, and expired states from DARCi internal billing state.
- Never activate UI features based only on a Stripe success redirect.
- Use Stripe Customer Portal for billing management until custom management screens are justified.

Testing:

- Notary membership checkout success/failure.
- Basic and Plus capacity enforcement.
- Elite unlimited capacity enforcement.
- Past-due/canceled/unpaid subscription handling.
- Success redirect before webhook does not grant entitlement.
- Suspended or unverified notary cannot start checkout or consume entitlement.

## Phase 3: Notary Billing State And Capacity UX

Purpose: make the paid membership visible and understandable to illuminotaries.

Backend work:

- Add billing-state reader for the current notary membership, current period, capacity limit, usage count, and remaining capacity.
- Add membership status to notary profile/bootstrap responses where useful.
- Add Customer Portal session endpoint for membership management.

Frontend work:

- Wire the settings `Membership & Billing` row to notary membership status and Stripe Portal entry.
- Show current tier, subscription status, period end, capacity used, and capacity remaining in the notary profile/settings surface.
- Show upgrade prompt when the notary reaches Basic/Plus capacity.

Testing:

- Billing status renders for no subscription, active subscription, past due, canceled, and incomplete states.
- Capacity remaining matches internal entitlement state.
- Customer Portal session opens only for the authenticated notary billing account.

## Phase 4: Stripe Sync Engine And Reconciliation

Purpose: make Stripe data queryable locally without letting the mirror become the sole fulfillment source.

Sync Engine notes from Supabase docs:

- The Supabase dashboard integration can install Stripe Sync Engine and automatically configure webhooks plus scheduled backfills.
- The sync mirror stores Stripe data in a local `stripe` schema so customers, subscriptions, invoices, payments, products, and prices can be queried with SQL.
- The dashboard integration recommends a restricted Stripe key with write access to webhook endpoints and read-only access to other Stripe resources.
- The standalone library package, `@supabase/stripe-sync-engine`, can process Stripe webhooks directly inside a Node/Express backend or Supabase Edge Function.
- The standalone library also supports migrations for the `stripe` schema and `processWebhook(payload, signature)` for raw webhook payload processing.
- For DARCi launch, prefer the dashboard integration if available in the project. Use the standalone library only if we need app-owned webhook control or the dashboard integration cannot be enabled in staging/prod.

Sync Engine role:

- Stripe Sync Engine should sync Stripe objects into a local `stripe` schema for reporting, dashboards, analytics, reconciliation, and support workflows.
- It should complement DARCi webhook fulfillment. It should not replace internal order, entitlement, subscription, or notary capacity state.
- Reference docs:
  - [Stripe Engine as sync library](https://supabase.com/blog/stripe-engine-as-sync-library)
  - [Stripe Sync Engine integration](https://supabase.com/blog/stripe-sync-engine-integration)

Work items:

- Install/configure Supabase Stripe Sync Engine for the staging/prod projects.
- Store enough provider IDs in DARCi tables to join internal rows to Stripe customers, subscriptions, checkout sessions, invoices, payment intents, charges, refunds, products, and prices.
- Add reconciliation views or jobs that compare Stripe mirror state to DARCi `billing_*` state.
- Emit ops/audit events for drift, missing webhooks, failed fulfillment, duplicate Stripe objects, and mismatched subscription status.
- Add backfill procedure for historical Stripe objects.

Testing:

- Internal state matches Stripe mirror after checkout.
- Missing webhook is detected by reconciliation.
- Manual Stripe dashboard changes surface as drift.
- Backfill does not double-fulfill subscriptions or entitlements.

## Deferred Phase: Pro Credit Bundles

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

## Deferred Phase: Delegated Client Payment Requests

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

## Phase 5: Admin, Support, And Operations

Purpose: make billing operable for staff without unsafe manual database edits.

Admin work:

- Add billing account/customer search.
- Add order, subscription, entitlement, and notary membership detail views.
- Add refund/dispute/cancel support workflows with audit events.
- Add notary membership override workflow requiring admin MFA and reason capture.

Notification work:

- Send payment success/failure receipts or status messages through the notification outbox.
- Send subscription past-due/canceled notices.
- Send notary membership capacity warning notices.

## Phase 6: Hardening And Compliance

Purpose: reduce financial and authorization risk.

Security controls:

- Rate-limit checkout creation, Customer Portal session creation, and admin billing actions.
- Require recent reauth for payment-method changes and high-value actions.
- Require MFA for admin billing overrides and notary membership overrides.
- Validate all Stripe webhook signatures and reject unsigned event payloads.
- Keep browser-returned checkout state advisory only.

Audit controls:

- Record billing audit events with actor, service actor, order id, billing account id, Stripe event id, and entitlement changes.
- Track state transitions for orders, subscriptions, entitlements, and notary capacity.
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
- `POST /billing/customer-portal-session`
- `POST /billing/checkout/notary-membership`
- `GET /billing/orders/{id}`
- `GET /billing/subscriptions`
- `GET /billing/entitlements`
- `GET /billing/notary-membership`
- `POST /webhooks/stripe`
- `GET /admin/billing/accounts`
- `GET /admin/billing/orders`
- `GET /admin/billing/subscriptions`
- `GET /admin/billing/reconciliation`
- `POST /admin/billing/notary-membership/overrides`

Deferred endpoints:

- `POST /billing/checkout/trust-registration`
- `POST /billing/checkout/trust-activation`
- `POST /billing/checkout/dynamic-poa`
- `POST /billing/checkout/pro-credit-bundle`
- `POST /billing/payment-requests`
- `GET /billing/payment-requests/{token}`
- `POST /billing/payment-requests/{token}/checkout`
- `GET /billing/pro-credits`
- `POST /admin/billing/pro-credits/adjustments`

## Implementation Order Recommendation

1. Confirm notary membership pricing/capacity semantics with the client.
2. Verify the existing notary catalog seed and link Stripe Price IDs.
3. Add Stripe SDK, service boundary, webhook ingestion, and Customer Portal sessions.
4. Install/configure Supabase Stripe Sync Engine for staging.
5. Implement illuminotary membership checkout and webhook fulfillment.
6. Add notary membership/capacity entitlement enforcement.
7. Add billing state readers and membership UI in the notary/settings surface.
8. Add reconciliation checks against the Sync Engine `stripe` schema.
9. Add admin/support workflows for subscriptions and overrides.
10. Harden rate limits, MFA/reauth gates, audit events, and alerts.

## Open Decisions

- Whether Stripe Customer Portal is sufficient for subscription/payment-method management or DARCi needs custom billing-management screens.
- Whether notary membership can be purchased before commission verification, with capacity locked until verification. Recommended answer: no for launch.
- Whether capacity counts documents, notarization requests, completed notarizations, or signatures.
- Whether notary capacity resets by Stripe billing period or calendar month. Recommended answer: Stripe billing period.
- Whether Sync Engine reconciliation should be a worker job, database view, scheduled query, or admin-triggered process.
- When to reintroduce member pricing and Pro packages after the Pro dashboard exists.
