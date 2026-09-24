# Private production notification rollout — 23 September 2026

## Scope and safety

Jorge approved continuing the notification work and removing the generic Phase 1
re-verification gate. This is a configuration-only rollout using the already
deployed production image, not another billing or SMS acceptance cycle.

- Read-only inventory: **3 existing jobs, all completed; zero pending jobs**.
  No backlog of client messages is being released.
- The overlay changes exactly one setting: worker
  `NOTIFICATION_OUTBOX_RUNNER_ENABLED=false → true`. API remains `false` for its
  background runner; existing authenticated product endpoints can dispatch their
  own notifications inline, as they already did before this change.
- Scheduled processing serves the private production cohort, not a campaign.
  The worker is not an operator-recipient allowlist: future authorized product
  actions can enqueue notifications for their intended recipients. Review client
  access/invitations before widening the cohort. There is no current queued client
  backlog or approved bulk send.
- APNs activation remains disabled pending Phase 4 production-device acceptance.
  No push token is registered/copied in this pass; no SMS is sent.
- Public signup/access, general purchases and iOS purchases remain closed. Stripe
  callback/reconciliation processing and the already-paid membership remain intact.
- No new service, credential, IAM permission, capacity or recurring paid resource.
  Existing GitHub image promotion preserves the deployed configuration/template.

## Acceptance

The real product check uploads an existing, visually inspected two-page unsigned
TEST PDF under Jorge's synthetic production member, then calls the authenticated
`upload-finalize` endpoint. It stops at `pending_review`: no signature, notary
request, acknowledgment or legal finalization. Expect one normal product email,
**“Your documents are ready for review”**, only to Jorge.

The real email path must prove Resend delivery through the signed callback.
Repeating upload-finalize must create no new jobs. A separate synthetic **in-app
only** scheduled probe proves that the persistent AWS worker processes due jobs;
it does not send an additional external message or pretend to be a second product
event. Do not confuse provider delivery with Jorge's inbox confirmation.

Local verification passed: **90 infrastructure tests**, **67 notification tests**,
script syntax and whitespace checks. The first webhook-test attempt was blocked by
the local sandbox's HTTP listener restriction (`EPERM`); the permitted rerun passed
all 67. Retry/idempotency regressions use mocked providers, not live failure spam.

## Verified result — 22:31 UTC

- CloudFormation `UPDATE_COMPLETE` at **22:28 UTC**; worker revision **13** healthy.
  API13/web6, image digests, pinned secret and all non-notification settings remain
  unchanged. Worker logs show the real scheduler starting at 60-second intervals.
- Real authenticated document creation, signed upload and upload-finalize passed.
  Synthetic document `d5f09f5c-74de-4627-aad2-7904345f6cf0` remains unsigned,
  `pending_review`; its bytes are the existing recovery TEST fixture unchanged.
- Exactly one product email to Jorge: signed Resend `delivered` callback recorded;
  email job completed. Jorge confirmed inbox receipt on 23 September.
  Exact lookup: sent **23 September, 16:29:14 Mexico City** (22:29:14 UTC),
  delivered callback at 22:29:14.803 UTC, subject **“Your documents are ready for
  review”**, from `DARCi <notifications@notify.illuminotary.com>` to
  `lopezb.jl@gmail.com`. This lookup sent no new email.
- Repeating the same product upload-finalize created **zero additional jobs**.
- Push companion correctly suppressed: no eligible production device. No push/SMS.
- Scheduled in-app-only job completed with `workerId=worker-scheduled` in its
  outbound events. All test jobs are completed or suppressed, not waiting to retry.
- Initial probe stopped after successful email delivery because the acceptance
  script incorrectly assumed upload-ready had an in-app template. It has only
  email/push templates. The script was corrected to create a separate labeled
  in-app probe; guarded scheduler-only resume sent **no second email**. No product
  template or application behavior was changed to make the test pass.

Private evidence:
`.recovery-private/production-notification-rollout-iH4GuM/report.json` and
`.recovery-private/production-product-notification-20260923.json`.

**Engineering acceptance is complete for the enabled notification paths.** Jorge
confirmed commercial/legal approval on 23 September; production-build push activation and
physical tap/device acceptance remain Phase 4. Neither is a generic earlier-phase
re-verification task.

## Operations

- `infra/production/deploy-notification-worker.mjs` refuses activation with any
  queued/scheduled/processing/failed/partially-sent job or unexpected open gates.
- `infra/production/product-notification-acceptance.mjs` uses a durable exclusive
  local receipt to prevent accidental repeat emails. Inspect it before any retry.
- Rollback: restore only the worker flag to `false` through reviewed configuration;
  this stops scheduled processing, not existing inline endpoint dispatch. Do not
  roll back images, payment processing or other runtime settings for this purpose.
- Evidence stays ignored under `.recovery-private/`; no credentials, signed URLs,
  OTPs, device tokens or customer document contents belong in Git.
