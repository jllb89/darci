# Stripe Phases 4–5: Frontend Completion Status

Date: 2026-08-27  
Scope: web implementation status after the `/app/billing` pass.

## Activation rule

Staging intentionally uses `BILLING_ENFORCEMENT_MODE=observe`. The backend calculates and audits every decision, but it does not block members or hold final packages yet. Switch to `enforced` only after the member billing page, quota errors, and held-package states below are available and tested with Stripe test subscriptions. Migration `20260827120000_backfill_final_package_release_controls.sql` marks existing completed packages as released; enforced mode then fails closed on any new final package that somehow has no release decision, preventing a finalization race from exposing bytes.

## Required screen

### `/app/billing`

Implemented on 2026-08-27. The route consumes `GET /billing/member-membership` and includes:

- A visible **Private beta / Stripe test mode** notice. Payments are simulated and are not real.
- The current membership state: none, activation pending, trialing, active, past due, paused, unpaid, canceled, or expired.
- Current plan, billing period end, and cancel-at-period-end state.
- Document workflow allowance: total, used, and remaining.
- The three volume-only tiers with identical features:
  - Starter: 3 document workflows/month — $49/month.
  - Plus: 10 document workflows/month — $99/month.
  - Volume: 25 document workflows/month — $199/month.
- A subscribe action that calls `POST /billing/member-membership/checkout` with an internal `priceCode` and a fresh client idempotency token, then opens the returned Stripe-hosted URL.
- A manage billing action that calls `POST /billing/customer-portal-session`, then opens the returned Stripe-hosted Portal URL.
- An activation-pending state after Checkout return. It must poll/refetch membership status and must never treat the browser redirect as proof of activation.
- Past-due, unpaid, paused, cancellation, and renewal guidance driven by server status.

Plan switching should not be presented yet. The API reports `planChangeAvailable: false` because upgrade proration and downgrade timing still require client approval. Portal remains limited to payment-method management, invoice history, and cancellation.

## Remaining member-flow elements

### Workflow creation and review submission

Handle the shared billing reason codes returned by creation and first submission:

- `billing_membership_required`
- `billing_membership_inactive`
- `billing_period_inactive`
- `billing_workflow_limit_reached`
- `billing_entitlement_unavailable`

The quota-reached state should offer only **View membership / upgrade** and **Wait for renewal**. It should explain that changing plans will not reset already-used workflows in the current period.

### Document list and document detail

Use the workspace summary `release` object to show a clear `billing_held` state. For a held document:

- Explain that notarization completed successfully and the original finalized package is preserved.
- Explain that the final sealed/acknowledged package becomes available after membership reactivation.
- Do not render final-package download buttons, hash/ledger values, or public verification links.
- Keep pre-final workflow history and permissible pre-final documents visible.

The notary workspace must not show a billing block; notaries do not pay and retain the access needed to finish accepted work.

### Checkout return state

The configured return currently lands on `/app` with a billing result query value. Either route that state to `/app/billing` or show a short result banner with a link to the billing page. Success means “Checkout completed; activation pending,” not “membership active.”

## Pricing and navigation cleanup

- [x] Add a member navigation entry to `/app/billing` and hide billing from notary profiles.
- [x] Forward Stripe result parameters from `/app` to `/app/billing` without treating the redirect as activation proof.
- Remove obsolete purchasable notary pricing. Notaries do not pay.
- Remove or hide purchasable claims for standalone Trust registration/activation, Dynamic POA, and Pro credit bundles.
- Keep future-product copy only when it is clearly non-purchasable and does not conflict with the three current member tiers.

## Optional support UI (backend actions already exist)

An admin screen is not required to activate member billing, but the backend now provides narrowly scoped actions for usage reversal and forced release. A future support UI would need recent reauthentication, a mandatory reason, an idempotency key for reversals, confirmation, and visible audit results.

## Not part of the billing-screen pass

- No iOS purchase control should be added in Phase 5. The iOS status/purchase classification remains Phase 6.
- No dynamic POA fee, notary fee, per-product add-on, signer surcharge, overage charge, annual plan, coupon, tax workflow, or live Stripe payment was introduced.
