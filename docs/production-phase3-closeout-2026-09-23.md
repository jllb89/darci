# Phase 3 closeout — 23 September 2026

**Status: not signed off.** Completed work and the remaining gates are separated
below; no general sales, public signup or client messaging was enabled.

**SMS acceptance correction, 23 September:** Jorge reports that the recent code
did **not** arrive; the last visible SMS was approximately 90 minutes earlier.
Read-only correlation confirms a new request at **15:31:40 Mexico City / 21:31:40 UTC**
to the approved number ending 0675, followed by a carrier `DELIVERED` event at
15:31:45 for the same message ID and hook/destination hashes. This is not an older
receipt and is not user-confirmed delivery. Keep end-to-end SMS acceptance open.
No additional SMS was sent in response to the report. Carrier/handset filtering
or inaccurate delivery reporting remain hypotheses, not a diagnosed cause.

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
  Runtime activation passed, only Starter monthly is available to the exact
  operator, and the window expires **24 September 2026 at 20:20:20 UTC**.
  Other-member Checkout/plan-change/Portal denial and no billing-account mutation
  passed. The temporary negative fixture was revoked/suspended/banned.
  One $9.99 live Checkout exists, unpaid at this checkpoint. Same-key reuse passed
  after correcting the acceptance script's expected HTTP status from 201 to 200;
  the existing session was reused, not recreated. No saved card was charged.
- Fixed reconciliation incorrectly treating every live subscription as a mode
  mismatch. Matching live/test modes pass; opposite modes still alert.
- Full backend regression: **110 files / 819 tests** with four workers. One earlier
  unconstrained rerun had an intermittent pre-existing notary-IDN fixture 401;
  isolated rerun passed and the subsequent full bounded run passed. CI for the
  follow-up revision also passed. Do not present that intermediate run as green.
- Infrastructure, workflow and SMS routing checks: **114 passed**. TypeScript build
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
  `.recovery-private/production-sms-permission-aSEQnA/report.json`,
  `.recovery-private/production-operator-sms-receipt-20260923.json`.

## Exact remaining sequence

1. Release **35920215734** and bounded operator activation are **done**. Do not
   repeat activation or create another Checkout. The approved callback endpoint
   `we_1UIw8CETAqmB3GAqJE15Ottu` is enabled; general sale/client-message gates remain closed.
2. Production SMS configuration-set permission, stable CloudFormation, removal of
   temporary IAM access and the real carrier **DELIVERED** receipt are **done**.
3. Have Jorge personally pay the existing operator Checkout. Verify the paid invoice, real webhook projection, three-unit
   entitlement, duplicate-event behavior, restricted Portal and reconciliation.
   Cancel only that test subscription at period end, verify that state, and close
   the purchase window after acceptance. Do not grant entitlement from a redirect.
4. Resolve the operator's **reported non-receipt** of the 15:31 Mexico City SMS.
   The receipt pipeline is verified, but carrier `DELIVERED` conflicts with the
   user's observation. Check the phone's filtered messages and, if absent,
   investigate the exact carrier trace; do not count this as successful login
   acceptance or resend automatically. Entering/verifying an OTP is separate.
5. Obtain client/counsel/finance review of the exact billing draft and the missing
   tax/refund decisions. Approved prices/defaults are not reopened.
6. Complete production-build push tap/navigation and invalid-token lifecycle with
   the Phase 4 archive. Current TestFlight targets staging; the worker drill does
   not replace device acceptance. Review the initial cohort/queued notifications
   before enabling general notification runners and complete product-triggered
   client email acceptance with isolated fixtures.

## Scoped acceptance commands

```sh
# Activation and Checkout creation already completed. Do not repeat them.
# After Jorge personally completes that exact Checkout:
node infra/production/operator-billing-acceptance.mjs .recovery-private/production-operator-billing-W6VAum \
  --approved-operator-live-test --verify
# Read-only carrier inspection; sends nothing:
node infra/production/operator-sms-receipt-acceptance.mjs --inspect
```

The billing verification command cancels future renewal of the exact test subscription. It does
not refund or create a charge. Session URLs stay in private evidence; share only
with the operator. Inspect an existing receipt before retrying a partially
completed operation. No automatic resending of outbox tests is authorized.

**Do not mark the full phase complete while these gates remain open.**
