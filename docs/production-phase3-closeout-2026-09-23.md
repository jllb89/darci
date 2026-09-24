# Phase 3 closeout — 23 September 2026

**Status: Phase 3 closed for enabled private-production providers;
commercial/legal approval and final email receipt confirmed by Jorge on 23 September.** Scheduled private email/in-app processing is
enabled and tested. No client messages were sent; public signup/access and new
purchases remain closed. Production-device/push activation belongs to Phase 4.

**Notification closeout, 22:31 UTC:** worker13 healthy, backlog empty before
activation, one real operator upload-ready email delivered through the signed
Resend callback, repeated product action created no duplicate jobs, and the real
scheduled worker completed an independent in-app-only probe. All fixture jobs are
completed/suppressed. Jorge confirmed the latest product email arrived.
**90 infrastructure and 67 notification tests passed.**
[Exact scope, evidence and corrected probe assumption](production-notification-rollout-2026-09-23.md).

**Live billing acceptance passed:** Jorge personally paid the exact **$9.99**
Starter monthly Checkout. The invoice is paid, DARCi's webhook-derived membership
is active with **3 available / 0 used**, and `cancel_at_period_end=true` is set in
Stripe and projected in DARCi. Two signed synthetic replays of the real processed
`invoice.paid` event returned duplicate acknowledgments without changing the event
receipt or entitlements. Authorized Portal session creation passed (not a manual
Portal UI/Apple Pay test). A read-only task using the deployed AWS image completed
live-provider reconciliation with **zero blocking issues**, exit 0 (one account,
one local/provider subscription, zero webhook backlog). The temporary operator
purchase window was **closed and verified at 22:09 UTC**: authenticated Checkout
and new Portal sessions return 403, while membership remains active with 3 available,
0 used and period-end cancellation. Webhook/reconciliation processing remains
enabled. CloudFormation is `UPDATE_COMPLETE`; services are stable. Do not repeat
payment or create a second subscription. No refund was made.

**SMS follow-up:** Jorge explicitly authorized one additional code. The fresh
request at **15:44:40 Mexico City / 21:44:40 UTC** produced message
`26546e36-ceba-491b-b75d-c32e7486c8ac`; AWS reported DELIVERED and **Jorge confirmed
receipt**. This closes receipt acceptance for that retry, not a completed login
or the unexplained absence of the earlier 15:31 message. No automatic retries.
Evidence: `.recovery-private/production-operator-sms-receipt-20260923-2144.json`.

**SMS acceptance correction, 23 September:** Jorge reports that the recent code
did **not** arrive; the last visible SMS was approximately 90 minutes earlier.
Read-only correlation confirms a new request at **15:31:40 Mexico City / 21:31:40 UTC**
to the approved number ending 0675, followed by a carrier `DELIVERED` event at
15:31:45 for the same message ID and hook/destination hashes. This is not an older
receipt and is not user-confirmed delivery. Retain this as a separate intermittent
delivery incident; the later 15:44 retry was received. Completed login/device
acceptance belongs to Phase 4, not a repeat of provider setup.
No additional SMS was sent in response to the report. Jorge also checked filtered
messages and confirmed absence. Carrier/handset filtering or inaccurate delivery
reporting remain hypotheses, not a diagnosed cause. The sender is active with
completed registration, international sending enabled, and no operator opt-out.
An [AWS carrier-trace draft](production-sms-delivery-incident-2026-09-23.md) is
prepared, not submitted: the technical Support API returned
`SubscriptionRequiredException`. No paid support upgrade was made.

## Completed this pass

- Jorge authorized one operator-only US$9.99 Starter monthly checkout, personally
  paid by him, and cancellation of only that subscription at period end. No refund
  or saved-card charge is authorized.
- Production API device registration, one AWS outbox email and one AWS outbox
  push, real signed Resend delivery callback, repeat-job no-send behavior, anonymous
  open denial, authenticated open idempotency and test-device deactivation passed.
  Jorge confirmed both messages. The open request was synthetic, not a physical
  production-app tap. No client device/account records were changed.
- Production SMS replay receipts are deployed in migration `20260923220000`.
  Signed completed-hook replays returned 200 without resending; processing and
  uncertain receipt replays returned 503 without resending. The hosted drill used
  preseeded synthetic receipts and sent **zero SMS**. No phone/OTP/body is retained
  in the receipt table; it stores a hook hash, keyed body digest and provider ID.
- SMS SDK implicit retries disabled; email outbox retries now use a stable Resend
  delivery idempotency key. Provider idempotency does not replace the durable
  outbox, operator recovery, or provider retention/window constraints.
- Fail-closed production purchase gate added: exactly the operator fixture,
  Starter monthly only, bounded expiry, no plan changes, no other member purchase
  or Portal access. It does not stop processing previously accepted payments.
- The guard is deployed and the production Stripe callback/worker are enabled.
  Runtime activation passed; only Starter monthly was available to the exact
  operator. Its planned expiry was 24 September at 20:20 UTC; it was instead
  explicitly closed after successful acceptance on **23 September at 22:09 UTC**.
  Other-member Checkout/plan-change/Portal denial and no billing-account mutation
  passed. The temporary negative fixture was revoked/suspended/banned.
  One $9.99 live Checkout was personally paid by Jorge. Same-key reuse passed
  after correcting the acceptance script's expected HTTP status from 201 to 200;
  the existing session was reused, not recreated. No saved card was charged.
- Fixed reconciliation incorrectly treating every live subscription as a mode
  mismatch. Matching live/test modes pass; opposite modes still alert.
- Full backend regression: **110 files / 819 tests** with four workers. One earlier
  unconstrained rerun had an intermittent pre-existing notary-IDN fixture 401;
  isolated rerun passed and the subsequent full bounded run passed. CI for the
  follow-up revision also passed. Do not present that intermediate run as green.
- Infrastructure, workflow and SMS routing checks: **116 passed**, including
  operator closeout preservation/fail-closed tests. TypeScript build
  and observability catalog validation passed.
- Existing 20 production application/capacity/recovery alarms were `OK`, actions
  enabled. This was a read-only state check, not a fresh alert-delivery test.
- Created `darci-production-sms-delivery`: production-only SMS configuration set,
  sanitized receipt Lambda/logs and two routing/handler alarms using the existing
  confirmed operator alert topic. No new sender or client messages. API attachment
  is deployed. The first operator request was denied before handoff because the
  task role lacked SendTextMessage on the configuration set. The exact
  production-only permission is now deployed. The first IAM update/rollback hit
  the restricted machine release role; the established temporary operator deploy
  path recovered it without changing running tasks, images, billing or routing.
  CloudFormation is `UPDATE_COMPLETE`, and temporary IAM permission is removed.
  A new operator request produced real `SUCCESSFUL` then **`DELIVERED`** carrier
  receipts for one message ID. The earlier denied attempt sent no message.
  Operator inbox confirmation and completed login are not inferred from delivery.
  The inspection script was corrected to parse Lambda's text-log prefix;
  inspection sent no additional message.
- Corrected stale prices in the old policy package and supplied the consolidated
  [billing disclosures review draft v0.1](member-billing-review-draft-2026-09-23.md).
  This is not an approved legal/tax/refund policy.

## Releases / evidence

- `c454d61`: deployed through protected production run
  [35919014183](https://github.com/jllb89/darci/actions/runs/35919014183), succeeded.
  API10 (2 tasks), worker9 (1), web5 (2) healthy. Secret version unchanged:
  `3feb06a0-52ec-4e45-9869-d89f182f953d`.
- `e33c05c`: includes live reconciliation correction and operator acceptance tools.
  [CI 35920188817](https://github.com/jllb89/darci/actions/runs/35920188817) passed.
  [Production run 35920215734](https://github.com/jllb89/darci/actions/runs/35920215734)
  **succeeded after GitHub environment approval**. After the separate approved
  operator configuration overlay: API12 (2 tasks), worker11 (1), web6 (2) healthy;
  image digests verified against this release, secret version unchanged.
- Private evidence (ignored, not published):
  `.recovery-private/production-operator-outbox-20260923.json`,
  `.recovery-private/production-sms-replay-FN50rx/report.json`,
  `.recovery-private/sms-receipt-migration-uL0Wxi/report.json`,
  `.recovery-private/production-provider-acceptance-5DbFWw/report.json`,
  `.recovery-private/production-operator-billing-W6VAum/activation.json`,
  `.recovery-private/production-operator-billing-W6VAum/checkout.json`,
  `.recovery-private/production-operator-billing-W6VAum/closeout.json`,
  `.recovery-private/production-sms-permission-aSEQnA/report.json`,
  `.recovery-private/production-operator-sms-receipt-20260923.json`.

## Remaining work, without reopening completed acceptance

Commercial/legal approval is confirmed by Jorge; do not reopen that gate.
Approved prices/defaults are not reopened. The enabled notification rollout is
complete, and Jorge confirmed inbox receipt. No remaining Phase 3 receipt check.
Push activation stays with Phase 4 production-device acceptance.

**Phase 4:** production-build login/recovery, push registration/tap/navigation and
invalid-token lifecycle, applicable Checkout/Portal/Apple Pay UI acceptance, and
client product-flow acceptance. Current TestFlight targets staging. The historical
15:31 SMS non-receipt remains in its incident document; do not repeat payment or
OTP sends as a generic phase gate.

Completed earlier-phase acceptance is not reopened. Only targeted regressions for
actual changes apply.

## Scoped acceptance commands

```sh
# Activation and Checkout creation already completed. Do not repeat them.
# Paid verification and cancellation completed. Do not rerun the payment.
# Closeout completed; do not repeat activation, payment, verification or closeout.
# Read-only carrier inspection; sends nothing:
node infra/production/operator-sms-receipt-acceptance.mjs --inspect
```

Billing verification canceled future renewal of the exact test subscription. It
did not refund or create a charge. Session URLs stay in private evidence; share only
with the operator. Inspect an existing receipt before retrying a partially
completed operation. No automatic resending of outbox tests is authorized.

**Do not mark the full phase complete while these gates remain open.**
