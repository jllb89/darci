# DARCi Stripe Phase 0 Scope Lock

- Status: **engineering scope locked; live-launch inputs remain open**
- Recorded: 2026-08-26
- Implementation roadmap: `docs/stripe-implementation-roadmap.md`
- Historical client request only: `docs/DARCi_Payment_Logic_Spec.md`

## Current Authorized Scope

- The member/document owner is the only current payer.
- Notaries, invited signees, witnesses, and trusted persons do not pay and do not consume allowance.
- A Pro who owns a document uses the same member membership; there is no Pro billing or credit behavior in this phase.
- DARCi has one member membership product with three monthly volume-only tiers:
  - Member Starter: 3 document workflows per billing period for $49 USD/month.
  - Member Plus: 10 document workflows per billing period for $99 USD/month.
  - Member Volume: 25 document workflows per billing period for $199 USD/month.
- Every tier has the same product features.
- There is no rollover, unlimited tier, automatic overage charge, or annual billing in the current scope.
- Private beta uses Stripe test mode with enforcement enabled. Test payment methods exercise real lifecycle logic, but no real funds move.

## Usage And Continuity Lock

- One unit is consumed on the first successful server-side transition from a draft workflow into signing/notarization execution.
- A Trust package, regular POA, or uploaded-document notarization workflow consumes one unit.
- Multiple Trust artifacts, rendering retries, signatures, notary steps, finalization, and downloads do not consume extra units.
- Successfully submitted work continues after a later billing lapse so the notary and signers are not interrupted.
- A new sealed/acknowledged package completed while the membership is not entitled is finalized and retained as `billing_held`.
- A billing-held package is unavailable in the member workspace and public IDN verification until membership reactivation releases the exact existing finalized bytes.
- Previously released documents remain available.

## Explicitly Deferred And Unpaid

- One-time Trust registration fees.
- Trust activation and signer-count billing.
- Dynamic POA generation, activation, and subscriptions.
- Annual plans.
- Pro credit purchases, wallets, expiration, and consumption.
- Delegated or client payment requests.
- Notary subscriptions, notary capacity, and notary transaction charges.
- Stripe usage metering and automatic overages.

The additive Phase 1 schema preserves extension boundaries for this list. It does not activate or implement any deferred runtime.

## Staging Configuration Inventory

The repository staging environment already declares these Stripe variable names:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_RETURN_URL`
- `STRIPE_CURRENCY_DEFAULT`
- `STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

No credential values were copied into source, logs, documentation, migrations, or tests. Phase 1 does not call Stripe. Phase 2 must validate the credentials and create/link test-mode Product and Price objects without exposing secret values.

## Live-Launch Inputs Still Required

These are recorded blockers, not permission to invent defaults:

1. Confirmation that trials and promotion codes remain disabled.
2. Final upgrade proration and downgrade timing configuration.
3. Approved customer language and CA/OH legal review for `billing_held` packages.
4. Refund/dispute rules for controlled usage reversals.
5. Stripe Tax and billing-address responsibility.
6. App Review approval for the selected iOS Stripe/Apple Pay path and storefronts.
7. Named owners for reconciliation and failed fulfillment/release response.

The approved price rationale is recorded in `docs/member-membership-pricing-rationale.md`. The Stripe test Product, all three environment-specific test Price mappings, and the restricted Customer Portal configuration were created and verified during Phase 2 on 2026-08-26. Live mappings remain absent and live Checkout remains disabled.

## Phase 0 Exit Assessment

Phase 0 is complete for engineering purposes because the payer, approved prices, plan structure, allowances, usage boundary, workflow continuity, private-beta mode, exclusions, and unresolved live blockers are explicit. Live payment remains blocked by the inputs above.
