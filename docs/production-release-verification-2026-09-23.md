# Production release verification follow-through — 23 September 2026

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

Commit `5fa2526` fixed the onboarding test and passed server CI/staging deployment. Its iOS run `35887526166` passed onboarding but failed the largest-text login test because it scrolled away from an offscreen Continue action. Follow-up `6e5b8f3` adds direction-aware, full-software-keyboard coverage, passing the focused local regression. Run [35891083154](https://github.com/jllb89/darci/actions/runs/35891083154) is monitored in the background; its final result is not asserted here. No UI test was skipped or removed.

The existing tester-IP reminder for **24 September at 14:00 Mexico City** is preserved in the same background follow-up. iOS validation does not block independent production infrastructure work.
