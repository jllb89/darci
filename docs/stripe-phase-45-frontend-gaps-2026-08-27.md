# Stripe Phases 4–5: Frontend Completion Status

Date: 2026-08-27  
Scope: web implementation status after the cross-flow billing completion pass.

## Activation rule

Staging intentionally uses `BILLING_ENFORCEMENT_MODE=observe`. The backend calculates and audits every decision, but it does not block members or hold final packages yet. The member billing page, quota errors, held-package states, pricing cleanup, and active-plan changes are implemented locally; switch to `enforced` only after the Stripe test-mode lifecycle matrix passes in staging. Migration `20260827120000_backfill_final_package_release_controls.sql` marks existing completed packages as released; enforced mode then fails closed on any new final package that somehow has no release decision, preventing a finalization race from exposing bytes.

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

Active-plan switching is now implemented outside Customer Portal. The member API reports whether plan change is available; `/app/billing` sends only an internal target price code and idempotency token. Upgrades are prorated immediately and remain pending until trusted webhook state catches up. Downgrades are scheduled for the current period end. Portal remains limited to payment-method management, invoice history, and cancellation.

## Completed member-flow elements

### Workflow creation and review submission

Implemented. Workflow creation and first submission handle the shared billing reason codes:

- `billing_membership_required`
- `billing_membership_inactive`
- `billing_period_inactive`
- `billing_workflow_limit_reached`
- `billing_entitlement_unavailable`

The quota-reached state links directly to membership/upgrade and explains renewal timing; changing plans does not reset already-used workflows in the current period.

### Document list and document detail

Implemented using the workspace summary `release` object. For a held document:

- Explain that notarization completed successfully and the original finalized package is preserved.
- Explain that the final sealed/acknowledged package becomes available after membership reactivation.
- Do not render final-package download buttons, hash/ledger values, or public verification links.
- Keep pre-final workflow history and permissible pre-final documents visible.

The notary workspace must not show a billing block; notaries do not pay and retain the access needed to finish accepted work.

### Checkout return state

Implemented. The configured return lands on `/app` with a billing result query value and is forwarded to `/app/billing`. Success means “Checkout completed; activation pending,” not “membership active.”

## Pricing and navigation cleanup

- [x] Add a member navigation entry to `/app/billing` and hide billing from notary profiles.
- [x] Forward Stripe result parameters from `/app` to `/app/billing` without treating the redirect as activation proof.
- [x] Remove obsolete purchasable notary pricing. Notaries do not pay.
- [x] Remove or hide purchasable claims for standalone Trust registration/activation, Dynamic POA, and Pro credit bundles.
- [x] Keep public pricing limited to the three current member tiers.

## Billing operations UI

Implemented at `/app/admin/billing`. It presents provider-backed reconciliation, lifecycle evidence, webhook backlog, held-package counts, and narrow replay/resync/release-retry/retention actions. Mutations require recent reauthentication and a mandatory reason and are recorded in the audit log. Usage reversal and exceptional forced release remain backend-only support actions because they require case-specific authorization and should not become casual UI controls.

## Not part of the billing-screen pass

- No iOS purchase control should be added in Phase 5. The iOS status/purchase classification remains Phase 6.
- No dynamic POA fee, notary fee, per-product add-on, signer surcharge, overage charge, annual plan, coupon, tax workflow, or live Stripe payment was introduced.
