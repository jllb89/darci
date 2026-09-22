# Production-readiness acceptance — 22 September 2026

## Decision

**Superseded latest state:** see [the later Phase 1 pass](production-readiness-phase1-pass-2026-09-22.md): user deployed `c5acd9b`; reconciliation passes the actual admin API; hold/reversal/reactivation and last-unit concurrency passed; 15/15 lifecycle categories now present. Local completed-retry and independent monitoring source changes still need deployment. The rest of this document is the earlier same-day acceptance record.

**Continue Phase 1; not a production go.** Latest staging release `eeec032` includes the downgrade fix, which now passes through the actual deployed API. Billing lifecycle evidence is **13/15**. The subsequently approved reconciliation fix passes local tests and a read-only staging scan, but **that reporting fix is not deployed**. The roadmap distinguishes these two release states.

Authorized scope: isolated synthetic staging users and Stripe test subscriptions; subsequently, local downgrade and reconciliation patches/regression tests. The user deployed `eeec032`; the agent did not commit, push or deploy. No real charges, client emails/SMS, client subscriptions/PDF changes or production resources. Sentry remains deferred.

## Follow-up after the user's redeployment

- [CI `35784026499`](https://github.com/jllb89/darci/actions/runs/35784026499) and [deployment `35784026517`](https://github.com/jllb89/darci/actions/runs/35784026517) succeeded on `eeec032bf9945326b669e89c8dd000db7a832647`. Deployment took approximately **7m02s**, CI **3m26s**. No new iOS run was required for this backend/docs-only commit; another task's uncommitted iOS optimization files were preserved.
- API task definition **98**, worker **84**, unchanged web **62**: all desired/running 1/1, pending 0, rollouts complete. API image `sha256:db70cabcdb884c874658089848c6f8cb8e1ae364da7c163f7432c133bd076ca6`, worker `sha256:466abe3d56194ba128b4dd882f17e6edc9c64f75c48b7da058effc90ab298d3d`; web digest unchanged from the initial baseline below. Health/live/ready 200; anonymous member endpoints 401; unknown verification IDN 404/no-store.
- Reused only a labeled non-clock fixture customer, created a new test subscription, and called the **deployed** `/billing/member-membership/plan-change`: **202 scheduled**, repeated request **202 reused**, provider metadata correct and downgrade effective exactly at renewal. Membership retained **10 current units** with **Starter pending**. The earlier clock exercise already proved 3-unit renewal synchronization; it was not repeated in this deployed-API test.
- Canceled that additional synthetic subscription without proration/new invoice, verified terminal webhook synchronization and denied new-workflow eligibility, then verified global logout. Private receipt: `/private/tmp/darci-deployed-downgrade22-receipt.json`. This brings the two passes to five test subscriptions, all terminal; no client subscription was touched.
- Reconciliation patch: **15 focused tests** across three suites, **626/626 full backend tests across 94 files**, backend compilation and whitespace checks pass. Locally patched read-only staging report finds **17 internal / 17 provider subscriptions**, **zero critical/high/medium/low issues**, **zero webhook backlog**; lifecycle stays **13/15**, no acceptance ID. Local log `/private/tmp/darci-reconciliation22-live-report.log`; full test log `/private/tmp/darci-reconciliation22-all-tests.log`.
- **Remaining immediate deployment:** reconciliation report only. The user approved its local implementation, not another deployment. Existing missing-subscription warnings from the deployed list-only implementation are not evidence of a missing customer payment; verify the affected ID directly before intervention.

## Initial deployed baseline — superseded by follow-up above

- Revision `105a3e1e9ba2ab84565bd344903f8f7c168ce5de`: [server CI](https://github.com/jllb89/darci/actions/runs/35775144985), [deployment](https://github.com/jllb89/darci/actions/runs/35775145143) and [independent iOS validation](https://github.com/jllb89/darci/actions/runs/35775145255) succeeded.
- Deployment approximately **7m59s**, including **4m40s** ECS rollout. Independent iOS job **16m46s**: build/tests **14m08s**, simulator selection/Xcode initialization **1m58s**. This pass did not rebuild iOS.
- API/worker/web ECS desired/running `1/1`, pending `0`, rollout `COMPLETED`; task-definition revisions `97/83/62`. Container health is `UNKNOWN`; service rollout is not a container probe.
- Running digests: API `sha256:2fe8b023589a226c4ff3ad541d682752d5dc44bb4ef0b6fa890c858ce7d887a9`; worker `sha256:0be93470e7b65c8cf599477e27bbacda4e16914bba3ad816a2a244a562937913`; web `sha256:91004521d61d7dca4903c70812cd4660d80c4313ed238bef789cfc8a38a4fc46`.
- API/worker: staging, `NODE_ENV=production`, `BILLING_ENFORCEMENT_MODE=enforced`, `LEDGER_ANCHOR_MODE=hash_only`, stub disabled. API iOS checkout flag enabled. Credentials/database remain Stripe test mode. **Actual enforced mode differs from the report's remain_observe recommendation. Neither was changed here.**

## Fresh results

| Area | Evidence | Limit |
| --- | --- | --- |
| Runtime/schema | Health/live/ready all 200; 101 migrations installed, zero missing; six Phase 1 RPCs restricted to service role; preflight passes. | Not a complete application/role matrix. |
| Sessions | Three genuine password sessions with normal session-sync bootstrap work. Invalid JWT, ungranted notary/admin roles and revoked member role denied. Fixture role restoration works. Real logout invalidates the same unexpired token; global logout verified for all three app users. | No real-device concurrent refresh/network-loss drill. |
| Public verification | OH `ONX2O7GV2PXS` and CA `EUDOXFSANSN4`: allowlisted metadata only, null external-anchor fields, empty documents, private/no-store, with and without authentication. Unknown IDN 404. | Proves non-disclosure, not readability or valid completion of those historical PDFs. |
| Private billing | Other member's subscription hidden by authenticated RLS. Canceled/incomplete-expired fixture memberships report no entitlement and no permission to create workflows under enforced mode. | Held/private PDF role matrix remains open. |
| Checkout | Three real API creations; duplicate idempotency tokens reuse sessions; provider expiration synchronized by signed webhook. | Hosted Checkout UI was not completed this pass; its existing evidence is historical. |
| Payments | Real test-mode paid, declined and authentication-required subscriptions synchronized. Correlated invoice/subscription events processed on first attempt. | Not real-money or native Apple Pay acceptance. |
| Downgrade | Corrected service and subsequent deployed API both create/reuse the schedule and keep 10 current units with Starter pending. Earlier synthetic clock advancement changes price at renewal and synchronizes the 3-unit next period. | Deployed API acceptance now passed; synthetic clock time is not a device period-rollover proof. |
| Recovery | Complete snapshot `2026-09-22T20-00-50.575Z-0fba2016-a34b-4fbc-a3e9-72998701d9b0`, manifest version `9rh0_SDh3Psmvu4mn0IR8Hsegi3lfRa_`, 2,533 objects; archive size/key presence checked. Both recovery alarms OK. | Freshness/receipt check, not another full application restore. |

## Defect and local validation

Deployed downgrade returned 500 because Stripe rejects `metadata` alongside `from_subscription`. The fix creates the schedule with that one parameter and applies metadata with the subsequent phase update, as required by [Stripe's two-call contract](https://docs.stripe.com/api/subscription_schedules/create). Service-level regressions now cover this restriction, phase timing, metadata and existing-schedule reuse; previous route tests mocked the whole service.

- Focused billing suite **24/24**, backend build and observability validation pass.
- Full backend suite **617/617** on the second run. First run: **616 passed, one socket-hang-up** in `document-review-get.test.ts`; that suite then passed **7/7** alone. No retries/timeouts/assertions were weakened. Keep the intermittent socket failure as an unresolved test-reliability observation, not a conclusively diagnosed product defect.
- Initial local Supertest execution was denied sandbox sockets; it passed with loopback permitted. This was not a staging service failure.

## Reconciliation gap

Before fixtures: complete provider reconciliation, zero issues/backlog. After the clock drill, the old report produced **one critical `internal_subscription_missing_in_stripe`**, zero high/medium issues, zero backlog. Stripe's [unscoped subscription list omits test-clock subscriptions](https://docs.stripe.com/api/subscriptions/list); direct retrieval and webhook evidence confirm the synthetic subscription exists and is terminal. Jorge subsequently approved the local fix: retrieve known same-environment IDs missing from the list, retain real 404/resource-missing alerts and fail closed on provider outages/auth/rate limits or wrong-mode objects. Account mismatches remain visible. Nine new tests cover these cases plus deduplication and offline mode. The corrected local scan is clean; deployed report acceptance awaits release. No audit evidence, fixture history or genuine alerts were deleted/suppressed.

## Fixture handling

Run `phase1-acceptance22-6b5c25b0`: three `@example.invalid` app users, Stripe customer email removed before payments; four test subscriptions including the clock subscription, all terminal and synchronized. Global logout verified for all three users. Records/events remain as labeled evidence; clock is frozen and subscription canceled. No customer documents or legal artifacts were changed.

Harness corrections are not product defects: an earlier Auth-only fixture was rejected before required session sync and logged out; the main harness adopted the real bootstrap. Its cancellation wait expected only `canceled`; Stripe correctly terminalized unpaid subscriptions as `incomplete_expired`. Independent provider/database checks confirmed cleanup, and subsequent global logout completed session cleanup.

Private operator receipts contain no passwords/access/refresh tokens: `/private/tmp/phase1-acceptance22-6b5c25b0-receipt.json`, `/private/tmp/darci-acceptance22-downgrade-receipt.json`, `/private/tmp/darci-acceptance22-final-receipt.json`. This durable summary, not temporary receipts alone, records the acceptance limitations.

## Earlier next-pass list — superseded by the linked later pass

1. Deploy/retest the locally verified clock-aware reconciliation report. Downgrade deployment/API acceptance is complete.
2. Finish **final-package billing hold** and **controlled usage reversal** evidence. Prove hold → resubscribe → same-byte release, accepted-work continuity, authorized operator actions and all download/read boundaries. Add last-unit concurrency and missed/out-of-order-event exercises. Do not manufacture acceptance from 13/15.
3. Finish Phase 1A–1C role/held-access, identity/legal-hold, full CA/OH product/crash-recovery and whole-application restore exercises. Preserve 50 known beta PDF exceptions and fresh production separation.
4. Finish critical-category alerts/outbox/OTP/bounce/suppression proof. Sentry deferred; Jorge sole responder.
5. Only after integrated Phase 1 acceptance: isolated production provisioning, provider/legal/commercial/App Store approvals and separately authorized real-payment smoke tests.

The [iOS optimization handoff](ios-workflow-optimization-handoff.md) is ready for another task; keep it separate from server deployment/readiness changes.
