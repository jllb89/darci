# Member pricing v2 — approved decisions

Requested and approved by Jorge, 23 September 2026 UTC: defaults 1–6 accepted, USD/monthly document allowances confirmed, notary fees separate, displayed prices before applicable taxes. Implementation and inactive Stripe test preparation are complete; the compatible application release and catalog activation remain separate. See [the implementation/rollout record](member-pricing-v2-rollout-2026-09-23.md). Existing beta subscriptions remain unchanged.

## 1. Requested amounts and recommended presentation

Currency: USD. Display names: Starter, Plus, Unlimited. Features stay identical; only document-workflow volume and payment cadence differ. Notaries and invited signers remain free in those roles; no Dynamic POA.

| Plan | Included workflows (proposed monthly reset) | Monthly charge | Annual charge, paid up front | Stripe amounts in cents: month / year |
| --- | --- | --- | --- | --- |
| Starter | Up to 3 each month | $9.99 | $99 | 999 / 9900 |
| Plus | Up to 25 each month | $19.99 | $199 | 1999 / 19900 |
| Unlimited | No document-workflow quota while eligible | $59.99 | $599 | 5999 / 59900 |

Annual prices save $20.88, $40.88 and $120.88 respectively against twelve monthly payments (approximately 17%). Prefer “Save with annual billing” over an inaccurate universal “20% off” or “two months free.” If showing monthly equivalents, clearly pair $8.25 / $16.58 / $49.92 with **billed $99 / $199 / $599 annually**; rounding must never determine the actual invoice amount.

## 2. Approved defaults and remaining legal boundaries

1. **Annual allowance:** recommend the same 3/25 monthly allowance whether payment is monthly or annual. Annual means prepayment, not only 3/25 for an entire year or 36/300 immediately available. Reset on the subscription's monthly anniversary; no rollover. This requires a monthly entitlement window separate from the annual invoice period.
2. **What counts:** retain one unit per submitted workflow: one Trust package (even with several PDFs), standalone POA or uploaded-document notarization. Drafts, regeneration/retries, extra package artifacts, signatures, notary steps and downloads do not consume more. Use “document workflows” in explanatory copy so “3 documents” does not imply three PDFs inside one Trust package exhaust the plan.
3. **Unlimited:** genuine no-count-limit member workflows, not an arbitrary large quota. Retain disclosed file/page/size/security/concurrency limits and prohibit abusive automated use through reviewed terms. No hidden monthly fair-use cap. Continue usage auditing, cost monitoring and per-account isolation. These prices do not themselves prove unlimited usage is profitable.
4. **Plan changes:** recommend same-cadence upgrades immediately after the required payment, with proration and existing monthly usage preserved; downgrades at the next paid renewal. Any monthly↔annual change at the existing paid-through date for the initial simple implementation, clearly previewed. Annual downgrade therefore waits until annual renewal. Do not infer upgrade/downgrade from dollar amount alone or grant more quota just by changing cadence.
5. **Cancellation:** cancel future renewal; access lasts until the paid-through date. Annual members continue receiving their monthly allowance during the paid year. Accepted work continues after lapse; newly completed final packages remain held until reactivation; already released packages remain accessible. No blanket refund entitlement or exclusion is approved here.
6. **Existing subscriptions:** preserve all current beta subscriptions, invoices, usage and historical Price mappings. Publish the new catalog for new controlled fixtures after approval. No silent mass migration; fresh production starts with approved new catalog only.
7. **Commercial copy:** notary fees are separate; prices are USD before applicable taxes. No new trials, coupons, automatic overages or one-time charges are introduced. Tax registration/collection and exact refund/support exceptions still require their own configuration/review; tax-exclusive Prices do not establish tax compliance.

Items 1–6 are approved. The remaining legal/tax boundaries do not reopen the approved amounts, allowances or notary-fee separation.

## 3. Historical gap analysis before this implementation

The original scope lock excluded annual and unlimited plans. The approved v2 decision supersedes that restriction. The original monthly prices ($49/3, $99/10 and $199/25) remain historical contracts, not the new catalog. This table records the starting gaps; current completion evidence is in the rollout record.

| Area | Evidence in repository | Required change |
| --- | --- | --- |
| Stripe sync/verification | `backend/scripts/sync-stripe-member-catalog.ts` creates month-only prices; verifier pins old amounts and allowances | Six new versioned prices, interval-aware verification/mappings and controlled portal configuration; preserve old history |
| Checkout/changes | `backend/src/services/memberBillingService.ts` allowlists three old monthly codes, uses finite numeric allowance and month-only schedule phase | Separate tier, cadence, version and quota type; approved timing, safe interval changes, payment confirmation and idempotency |
| Entitlement periods | `20260917122000_stripe_environment_isolation.sql` projects entitlement boundaries from Stripe invoice/subscription period | Independent monthly usage windows for annual billing; idempotent rollover/catch-up, no extra charges, atomic consumption |
| Unlimited | Consumption/reversal paths in `20260826120000_add_member_subscription_phase01.sql` reject null totals; finite models/UI arithmetic remain | Explicit limited/unlimited entitlement type, distinguish missing/invalid state from unlimited, audited counters without finite exhaustion |
| Web | Billing page says /month and renders numeric quotas throughout | Monthly/annual selector, accurate totals, Unlimited text, separate allowance-reset/payment-renewal dates and change preview |
| iOS | `MemberBillingModels.swift` has fixed three codes, old fallback amounts and nonoptional integer plan allowance; membership view uses monthly copy | New payload decoding and presentation, safe unavailable-catalog state, annual/unlimited labels and accessibility; preserve current design/fonts |
| Ops/reconciliation | Existing evidence is monthly/finite | Annual-window/unlimited-aware drift checks, support controls and new regression/drill evidence |

Changing only Stripe or setting a quota to `null` would be incorrect. An annual invoice period must not accidentally become an annual quota period, and invalid/missing entitlement data must never grant unlimited access.

## 4. Proposed Stripe setup

- Keep one member-membership Product with **six new recurring Prices** (three tiers × month/year), quantity 1, flat rate—not metered billing or Stripe graduated/volume tiers.
- New amounts/intervals require new Prices rather than changing old price amounts. Preserve old records/subscriptions; remove old prices from new-sale selection only in the approved rollout. Stripe's [price management documentation](https://docs.stripe.com/products-prices/manage-prices) describes price immutability and archiving behavior.
- Version internal catalog/lookup keys and metadata; store tier, cadence, quota type, allowance reset rule and environment explicitly. Do not repoint an existing historical price mapping to a different financial contract.
- Stage all six in Stripe test mode first. Live Prices and IDs are separate and remain inactive/unmapped until production activation is explicitly authorized.
- Restrict Portal to the approved actions/prices. DARCi must control change timing consistently; generic Portal changes must not bypass monthly-window or annual-transition rules. Stripe explains interval-change/proration behavior in [changing subscription prices](https://docs.stripe.com/billing/subscriptions/change-price).
- Retain signed webhook inbox, account/mode verification, reconciliation, actor-bound recovery and idempotency. Never grant an annual/unlimited entitlement from a redirect or UI fallback.

## 5. Proposed member-facing copy for review

Paywall title/CTA: **Make it official**. Toggle: **Monthly / Annual**.

- Starter: “Up to 3 document workflows each month.”
- Plus: “Up to 25 document workflows each month.”
- Unlimited: “Unlimited document workflows.”
- Annual disclosure: “Billed $[annual amount] annually. Your document allowance renews monthly.” The allowance-reset sentence is unnecessary for Unlimited, but payment cadence remains explicit.
- Shared explanation: “A Trust package, power of attorney or uploaded-document notarization counts as one workflow. Signatures, package PDFs and downloads don't use additional allowance.”
- Usage reset: “Unused monthly allowance does not roll over.”
- Cancellation: “Cancel renewal anytime. Your membership remains active until [paid-through date].” Avoid suggesting a full annual payment is month-to-month or promising refunds before policy approval.
- Unlimited detail: “No monthly workflow quota. Standard file, security and processing limits apply.” Not a license to hide a numerical quota elsewhere.
- Notary-fee sentence, now confirmed: “Notary fees are separate. Prices are in USD before applicable taxes.”

This is product copy for review, not legal approval of subscription/consumer terms. Exact refund, tax, retention, identity and jurisdiction wording belongs in the existing review package.

## 6. Implementation sequence after approval

1. Lock decisions above and update scope/pricing rationale as approved, keeping the old scope/history dated.
2. Add backward-compatible catalog/quota/window schema and service logic; preserve historical subscriptions/usage, signed bytes and final release controls. Document a code/config rollback that never rewrites paid history.
3. Add interval-aware test-mode sync/verification and six new Price mappings. No live charge or client subscription mutation.
4. Update web/iOS catalog, cadence selector, active-plan/settings/change screens and support reports, preserving DARCi styling and accessibility.
5. Test all six plans, monthly windows within annual coverage, month-end/leap-year boundaries, outages/catch-up, finite concurrency, Unlimited >25, plan/cadence transitions, failed payments, cancellation, held/released continuity and duplicate/out-of-order events. Track usage through upgrades/downgrades without resets or double counting.
6. Deploy staging backend/web; then generate the TestFlight build with the new payload support. Verify old-build behavior and new-storefront disclosure before enabling new prices broadly. Current Phase 1 payment evidence is a baseline, not automatic certification of annual/unlimited behavior.
7. Team completes the new-pricing section of [the release checklist](release-team-test-checklist-2026-09-23.md); review terms and production activation separately.

## 7. Approval received

Jorge approved **USD; annual billing with monthly 3/25 reset and no rollover; true Unlimited; one workflow per Trust/POA/upload; immediate paid same-cadence upgrades and renewal-effective downgrades/cadence changes; existing beta subscriptions unchanged.**

Jorge confirmed **notary fees separate** and **prices before applicable taxes**. Refund/support rules and actual tax configuration are not silently invented. No further pricing-default question is pending.
