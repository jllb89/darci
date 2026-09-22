# Production-readiness acceptance — 22 September 2026

## Decision

**Continue Phase 1; not a production go.** The hardening release is deployed to staging. Post-deployment tests improved billing lifecycle evidence from **9/15 to 13/15** and exposed a real downgrade failure. Its approved local fix passes tests and a real Stripe test-clock rollover, but is **not deployed**. A clock-related reconciliation gap remains below.

Authorized scope: isolated synthetic staging users and Stripe test subscriptions; subsequently, a local downgrade patch/regression test. No real charges, client emails/SMS, client subscriptions/PDF changes, production resources, commits, pushes or deployments. Sentry remains deferred.

## Deployed baseline

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
| Downgrade | Local corrected service creates a real schedule and reuses the request. Deployed membership shows pending Starter, keeps 10 current units. Synthetic clock advancement changes Stripe price at renewal; deployed worker synchronizes Starter's 3-unit next period. | Patched API still needs deployment/retest. Synthetic future time is not a device period-rollover proof. |
| Recovery | Complete snapshot `2026-09-22T20-00-50.575Z-0fba2016-a34b-4fbc-a3e9-72998701d9b0`, manifest version `9rh0_SDh3Psmvu4mn0IR8Hsegi3lfRa_`, 2,533 objects; archive size/key presence checked. Both recovery alarms OK. | Freshness/receipt check, not another full application restore. |

## Defect and local validation

Deployed downgrade returned 500 because Stripe rejects `metadata` alongside `from_subscription`. The fix creates the schedule with that one parameter and applies metadata with the subsequent phase update, as required by [Stripe's two-call contract](https://docs.stripe.com/api/subscription_schedules/create). Service-level regressions now cover this restriction, phase timing, metadata and existing-schedule reuse; previous route tests mocked the whole service.

- Focused billing suite **24/24**, backend build and observability validation pass.
- Full backend suite **617/617** on the second run. First run: **616 passed, one socket-hang-up** in `document-review-get.test.ts`; that suite then passed **7/7** alone. No retries/timeouts/assertions were weakened. Keep the intermittent socket failure as an unresolved test-reliability observation, not a conclusively diagnosed product defect.
- Initial local Supertest execution was denied sandbox sockets; it passed with loopback permitted. This was not a staging service failure.

## Reconciliation gap

Before fixtures: complete provider reconciliation, zero issues/backlog. After the clock drill: **one critical `internal_subscription_missing_in_stripe`**, zero high/medium issues, zero backlog. Stripe's [unscoped subscription list omits test-clock subscriptions](https://docs.stripe.com/api/subscriptions/list); direct retrieval and webhook evidence confirm the synthetic subscription exists and is terminal. Do not delete evidence or suppress genuine missing-subscription alerts. Approval was requested for a local direct-lookup fallback and regression coverage.

## Fixture handling

Run `phase1-acceptance22-6b5c25b0`: three `@example.invalid` app users, Stripe customer email removed before payments; four test subscriptions including the clock subscription, all terminal and synchronized. Global logout verified for all three users. Records/events remain as labeled evidence; clock is frozen and subscription canceled. No customer documents or legal artifacts were changed.

Harness corrections are not product defects: an earlier Auth-only fixture was rejected before required session sync and logged out; the main harness adopted the real bootstrap. Its cancellation wait expected only `canceled`; Stripe correctly terminalized unpaid subscriptions as `incomplete_expired`. Independent provider/database checks confirmed cleanup, and subsequent global logout completed session cleanup.

Private operator receipts contain no passwords/access/refresh tokens: `/private/tmp/phase1-acceptance22-6b5c25b0-receipt.json`, `/private/tmp/darci-acceptance22-downgrade-receipt.json`, `/private/tmp/darci-acceptance22-final-receipt.json`. This durable summary, not temporary receipts alone, records the acceptance limitations.

## Next pass

1. Deploy/retest downgrade through the actual API; resolve clock-aware reconciliation and obtain a clean deployed report.
2. Finish **final-package billing hold** and **controlled usage reversal** evidence. Prove hold → resubscribe → same-byte release, accepted-work continuity, authorized operator actions and all download/read boundaries. Add last-unit concurrency and missed/out-of-order-event exercises. Do not manufacture acceptance from 13/15.
3. Finish Phase 1A–1C role/held-access, identity/legal-hold, full CA/OH product/crash-recovery and whole-application restore exercises. Preserve 50 known beta PDF exceptions and fresh production separation.
4. Finish critical-category alerts/outbox/OTP/bounce/suppression proof. Sentry deferred; Jorge sole responder.
5. Only after integrated Phase 1 acceptance: isolated production provisioning, provider/legal/commercial/App Store approvals and separately authorized real-payment smoke tests.

The [iOS optimization handoff](ios-workflow-optimization-handoff.md) is ready for another task; keep it separate from server deployment/readiness changes.
