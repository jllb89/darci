# Production release verification follow-through — 23 September 2026

**Later configuration release — 18:17 UTC:** approved production Resend setup is deployed and operator delivery/callback/replay/private-route acceptance passed; Jorge confirmed receipt. Exact image digests below are unchanged, but current task definitions are **API6/worker5/web4**, healthy **2/1/2**. Stack is now **UPDATE_COMPLETE**, both operator HTTP probes return 200, and ten alarms are OK. Temporary email-deployment permissions were removed. See [current email configuration evidence](production-email-acceptance-2026-09-23.md). Earlier revision-4/rollback-complete statements below describe the successful rollback drill, not the latest configuration state.

## Protected release and actual automatic rollback accepted

The local/pending publication notes below are historical. Jorge committed the batch in **`442baeee4a5ba7d1e9d8f403bc0beb682ffe086e`**. Exact server CI and staging deployment passed. The two approved production-only ECS read permissions were applied to `darci-production-release-roles`; policy simulation permits production task listing and denies staging task listing.

Jorge approved [production workflow 35894433475](https://github.com/jllb89/darci/actions/runs/35894433475), which **passed**. Its receipt verifies the deployed template and non-image parameters were preserved, all five running tasks are healthy, and their actual digests match the release manifest. API/web/worker now use task-definition revision **4**, with counts **2/2/1**. Image digests:

- API: `sha256:12d2647d88c4ba3e288be4785c7adbea9c1a3ab2e69f1d6faf36522df71ad293`.
- Worker: `sha256:5aa4f1d76799d30ca0fc07e16c35edf25c6674370a65d38c8639ef01d8ed5872`.
- Web: `sha256:36e009f39972a0bc5db8eb769ccd801d9b82eae9788e42b44dfad7e06125813c`.

The source fixture recheck at **17:38 UTC** preserved all three exact PDFs, one unsigned draft/non-final version, and zero signatures/notarizations/final hashes/subscriptions/notification jobs.

Jorge approved the controlled API rollback drill. The local guarded tool changes only the candidate API startup command to an HTTP **503-only** server that never imports application code or touches database/object/provider data. It preserves the two healthy baseline tasks, network, payment settings, worker and web, and records a saved recovery baseline. It requires observed 503 target-health failure, an actual circuit-breaker event and exact restored configuration/healthy digests to claim automatic recovery. Manual recovery is reported separately, not passed as automatic rollback.

**Operator access recovered:** Jorge approved replacing the old operator IP after changing networks. The CloudFormation parameter, HTTP/HTTPS firewall rules and both host routes now use only the approved new `/32`; old rules were removed. Temporary resource-scoped network permissions were removed after completion. API readiness and web returned **200**. Images and all other parameters were unchanged. The approved rollback drill then started at **17:46:49 UTC**, with two healthy baseline API tasks and its private baseline/evidence retained. Completion is recorded separately below; startup is not a passed drill.

Provider status: Stripe payments/payouts enabled per Jorge, outstanding requirements unclear. Resend setup and operator-only delivery are subsequently verified in the linked email evidence; general client messaging and live payments remain closed.

### Actual rollback result

**PASS — automatic recovery, no manual cancellation or fallback.** The drill began **17:46:48.907 UTC**. Candidate API task revision **5** started the synthetic 503-only server; ALB explicitly reported the candidates unhealthy with 503 response failures. CloudWatch recorded both synthetic startup markers. The server never imported application code or performed database/object/provider calls.

ECS marked the candidate deployment **FAILED** and automatically returned to the prior completed deployment at **17:51:16 UTC**. CloudFormation subsequently recorded `ECS Deployment Circuit Breaker was triggered`, reverted the task/template change and reached **UPDATE_ROLLBACK_COMPLETE** at the **17:53:51 UTC** sample. Final exact-image/configuration verification passed at **17:54:02.333 UTC** (approximately **7m13** after drill start; the stack-terminal sample was at 423 seconds).

- All **12** operator API readiness samples returned **200**, with at least **two healthy original API tasks** throughout. This is sampled continuity evidence, not a claim of continuous request tracing or load-test coverage.
- Final API/web/worker task definitions remain **revision 4**, healthy **2/2/1**, with the exact accepted release digests above. Worker and web were not redeployed by the drill.
- The saved deployed template matches the pre-drill template exactly; all non-image parameters, service network/deployment settings, capacity and actual image digests match the baseline. The intentional prior operator-IP change is part of that baseline.
- Production stack **UPDATE_ROLLBACK_COMPLETE** is the expected successful state of this deliberately failed update, not an unhealthy production deployment. The failed revision is retained as non-running metadata under the existing Retain policy; no faulty task remains serving.
- Final API readiness and web return **200**. All **ten** production alarms remain **OK**. No artificial alarm state or extra notification subscription was created.
- Source fixture checks preserve the three exact unsigned PDFs, one draft/non-final version and zero signatures/notarizations/final hashes/subscriptions/notification jobs.
- **98** local production/recovery/monitoring/workflow tests pass; syntax and whitespace checks pass. The new guarded drill tool/tests and this follow-through documentation are local until committed; the successful release itself is already deployed.

Private baseline, fault template, samples, CloudFormation events and final verified receipt: `.recovery-private/production-rollback-DHGz9W`. Do not distribute its operational metadata. The temporary operator-IP permission was removed before the drill; the image-release role retains no network mutation rights.

### Remaining production gates

Actual approved GitHub OIDC release and health-failure rollback are **closed**. Still open: consecutive automatic backup cadence/representative-volume recovery, complete AWS/Supabase acceptance, edge/audit/availability/load/cost coverage, final providers, client/device/product and policy/commercial acceptance. Read-only inventory still finds no configured CloudTrail trails (including shadow trails) or regional WAF ACL in `us-east-1`; this does not mean AWS Event History is absent. These broader controls are not silently passed by this drill.

## Completed in this pass

- Read-only production readback: API **2/2**, web **2/2**, worker **1/1**, zero pending tasks, one completed deployment per service. All five actual task containers are healthy and match their pinned production image digests.
- All **ten** production alarms are **OK**, actions enabled. This is current state, not a new source-to-email alarm drill.
- The first automatic **02:00 America/Mexico_City / 08:00 UTC** backup completed in **12.970 seconds**, including three approved unsigned synthetic PDFs and the database/key backup. Schedule remains enabled at 02:00 and 14:00.
- Independent reader-role verification of that exact scheduled snapshot recovered **3/3 byte-identical, readable PDFs**, rendered all pages, checked the database archive index and returned zero failures in **9.903 seconds**. It did not rerun the full restored application drill; that separate proof is already recorded in the [recovery acceptance](production-recovery-acceptance-2026-09-23.md).
- Fixed a local release-verification gap: healthy service counts alone did not prove the requested images had arrived. The verifier now checks the exact stack image parameters, running container digests/image references, task-definition alignment, task health, completed rollout and unchanged capacity. It also compares the deployed template, non-image parameters and service network/deployment configuration against the pre-release snapshot.
- Added a sanitized release receipt, uploaded even if the promotion step fails. Failure/rollback is not relabeled a successful release. Configuration is fingerprinted rather than copied into the artifact; receipts contain no injected credentials or allowlist values. Failure before promotion/receipt initialization may produce no receipt and remains a failed job.
- **90 production/recovery/monitoring/workflow tests pass**, including acceptance of a genuine new-image rollout and rejection of healthy old images, rollback-complete stacks, wrong running digests, incomplete/unhealthy tasks, staging images, changed allowlists/secret versions/payment flags and service-network drift. Production workflow passes `actionlint`; whitespace checks pass.

## Exact scheduled backup evidence

- Snapshot: `2026-09-23T08-00-25.064Z-c4637d39-53ee-4ad7-8787-13bb5e9d11f0`.
- Manifest: `snapshots/2026-09-23T08-00-25.064Z-c4637d39-53ee-4ad7-8787-13bb5e9d11f0/manifest.json`.
- S3 version: `L1JEqLenkInnJP5zVSOx.XkkMFtQEcT9`.
- Snapshot total: **1,449,385 bytes**, **3 objects**.
- Private restore directory: `/var/folders/lh/sn6jzvdn11jbjq_zj57xr9fr0000gn/T/darci-recovery-lhB1w9`. Do not commit or distribute its database/key files.

The scheduled backup's first success is proven. **Consecutive scheduled runs, sustained 24-hour RPO coverage and representative-volume RTO remain open**; the next scheduled run is at 14:00 Mexico City on 23 September.

## Deployment boundary and next steps

The verification changes are **local**, not yet deployed. The published production workflow still predates these changes. The verifier's live check used operator credentials read-only; it is not proof of GitHub OIDC execution.

1. Review/commit the production recovery and release-verification batch; preserve unrelated work.
2. Apply the two read-only IAM additions before using the new workflow: `ecs:ListTasks` restricted by the production cluster condition, and `ecs:DescribeTasks` restricted to production task ARNs. No added secret reads, network writes, staging service mutation or task execution. No account-wide task-definition metadata read is needed.
3. Run exact-revision server CI, dispatch the manual production workflow and obtain Jorge's GitHub environment approval. Verify the saved receipt and exact running images.
4. Separately approve and rehearse an **application-health failure/rollback** with a precise fault, rollback target and stopping condition. Do not break the private production candidate merely to turn a checkbox green.
5. Continue provider setup: existing Stripe live merchant status and Resend sending-domain records; design narrowly scoped signed webhook access before making callbacks reachable. Keep signup/payments and general public access closed.

No production deployment, IAM change, failure injection, charge, client message or access expansion occurred in this pass. The existing production fixtures and all beta documents remain unchanged.

## Independent iOS track

Commit `5fa2526` fixed the onboarding test and passed server CI/staging deployment. Its iOS run `35887526166` passed onboarding but failed the largest-text login test because it scrolled away from an offscreen Continue action. Follow-up `6e5b8f3` adds direction-aware, full-software-keyboard coverage. Run [35891083154](https://github.com/jllb89/darci/actions/runs/35891083154) **passed 115 unit + 17 UI tests, zero failures/skips**, including both regressions. The completed watch is stopped; tomorrow's tester reminder is retained. No UI test was skipped or removed.

The existing tester-IP reminder for **24 September at 14:00 Mexico City** is preserved in the same background follow-up. iOS validation does not block independent production infrastructure work.
