# Phase 1 final engineering pass

**Superseded status:** this is the earlier batch's historical evidence. The [23 September acceptance closeout](phase1-acceptance-closeout-2026-09-23.md) now proves the broader held-route/continuity, abrupt-payment, originating-failure, combined incident, hosted-role, email OTP and browser MFA checks described as remaining at the bottom of this note. Use that record and Section 7 of the production roadmap for current status; do not reopen completed checks from this historical list.

## Fixed execution order

Requested by Jorge: implement the remaining engineering work first, then perform one consolidated verification stage. Do not expand this pass into another production audit or repeat already accepted legacy backfills.

### Implementation batch

- Reconstruct lost Redis generation delivery from PostgreSQL `queued` runs, bounded per sweep and idempotent by run ID. Never reset `rendering`, `rendered`, blocked, canceled or failed runs automatically.
- Make `APP_ENV=recovery` a hard quarantine for BullMQ and all notification, Stripe, reconciliation and retention runners. Recovery remains internal-network-only with no provider credentials.
- Add a selective synthetic queue/renderer recovery drill, including abrupt exit after Storage upload and unchanged customer outbox/payment/release fingerprints.
- Add repeatable real Stripe test-mode Starter → Plus acceptance with one previously consumed workflow, webhook synchronization, duplicate upgrade, preserved period/usage and cleanup.
- Strengthen held/released final download regression checks and retain pre-final access for accepted work.
- Require an exact claimed-user binding on signer invites, including legacy/incomplete rows; recipient email or a claimed-looking status alone is insufficient.
- Disable unverified OTLP in both staging API/worker task definitions, as explicitly approved. Preserve AWS alarms/logs; Sentry work remains deferred.
- Report real/test payment mode from validated configuration instead of a hardcoded false value.
- Provide one local verification command: `cd backend && npm run phase1:verify`. Receipts record revision, working-diff hash, stage results and private log locations.

### Consolidated verification stage

1. Run shared/backend builds, all backend tests, catalog/KPIs, infrastructure/workflow checks, web tests/typecheck and diff validation in one gate.
2. Reconstruct a fresh isolated application from the already checksum-verified snapshot. Run functional recovery and selective queue/interruption checks; preserve source exceptions and every hosted artifact.
3. Run only the approved synthetic staging nonzero-usage upgrade fixture; cancel its subscription and log out afterward. Reconcile without changing client accounts.
4. Deploy the scoped changes through CI, then check exact running revision, OTLP-disabled configuration, health, genuine worker signals and alarm states.
5. Update the main roadmap once with observed results. Failed checks stay failed until corrected and reverified; preparing a script is not passing its test.

## Separate release approvals, not new coding scope

These remain visible gates, not silently waived or declared passed: exact legal/commercial specimen approval, real physical-device/Apple Pay and CA/OH product acceptance, production domains/capacity, final production-origin/provider configuration, and the explicitly deferred branch protection/Sentry work. No live charges, production infrastructure, retention deletion or legal decisions are authorized by this pass.

The existing roadmap remains authoritative for the full Phase 1 acceptance matrix. This execution note does not move failed technical checks to a later phase or certify all routes from a narrower test.

## Results from the consolidated verification stage

- Final local gate passed: **701 backend tests / 99 files**, web **72 tests**/typecheck, shared/backend builds, catalog/KPIs, **28 infrastructure/workflow checks** and diff validation. Web production build separately passed. Gate receipt: `darci-phase1-gate-T0XSPW/report.json` in the operator's private temporary directory. The local gate included the separate task's uncommitted iOS-workflow source checks; only the explicitly scoped Phase 1 files are committed/deployed, and exact-revision CI remains mandatory.
- Real Stripe test fixture `phase1-upgrade-8610328b-1148-43ed-88b8-448cb52d665d`: actual upload/review consumes one Starter unit; actual plan-change/webhook upgrades to Plus with **10 total / 1 used / 9 remaining**, original period preserved, duplicate change safe. Test subscription canceled and session logged out. No client subscription or live charge.
- Recovery drill found a substantive compatibility defect: Storage 1.35 could read restored files but could not upload against the snapshot's versioned-object schema (PostgreSQL 42P10). Fixed by pinning compatible Storage **1.79.14 by digest** and its current metadata-attribute API. No hosted schema changes. The pinned service may apply its own reviewed storage-grant migration inside the isolated clone.
- Recovery instance `darci-app-recovery-64a4b415`: all eight existing functional checks passed with the compatible server. The selective queue drill passed at **23 September 00:25:36 UTC**: reconstruct absent queued delivery, stable-ID deduplication, real generation once, unchanged bytes/version on retry, and abrupt process exit after real upload before version creation. The interrupted run remains `rendering`, is not automatically retried and cannot be falsely released; operator triage is required. Original customer notification, Stripe and release rows remained identical during that drill.
- Exact synthetic output SHA-256: `539b2dc0e366b9dc48ddff221cca86432ef2ddc61ca293161bf9a6dd4d55f66b`. Native PDF rendering and visual inspection passed; the fixture is prominently labeled **NO LEGAL EFFECT**. This is renderer/recovery evidence, not legal template approval.
- Real recovered Auth/API/Storage access matrix passed at **00:30:03 UTC**, **32 HTTP requests**: anonymous/unrelated/wrong-notary denial across five routes; held owner and bound signer access without final bytes; signer revocation; selected-notary/admin access; no human direct Storage URL minting; hidden held public verification; legacy code cannot take over an assigned request; synthetic controlled release preserves bytes. Synthetic hold/release setup is not represented as a Stripe payment or an actual IPEN session.
- Whole recovery exercise window: original exact-byte restore directory created **22 September 22:44:25 UTC** through the final access check **23 September 00:30:03 UTC**, approximately **1h46**, below the four-hour goal. Source snapshot was **20:00:50 UTC**, approximately 2h44 old at exercise start, below the 24-hour goal. This includes earlier compatibility/debugging attempts, not just database import seconds. Service resumption is deliberately selective; old customer notifications/payment events remain quarantined pending operator reconciliation.

Private receipts are under the ignored recovery directory and `/private/tmp/darci-phase1-upgrade-final-receipt.json`. Do not commit provider credentials, snapshot bytes or private request logs. All separate iOS-workflow edits remain excluded.

## Deployed closeout

- Runtime commit: **`cbc19b9ab694dea85a0b62eaff3787763e7c888c`**. [Exact-revision CI](https://github.com/jllb89/darci/actions/runs/35802935651) and [staging deployment](https://github.com/jllb89/darci/actions/runs/35802935650) succeeded. Deployment ran 00:38:27–00:45:33 UTC, approximately **7m06**, including parallel builds/scans, CI reuse and rolling replacement.
- Runtime verified at **00:46 UTC**: API task **104**, worker **90**, web **65**, all completed at **1/1**, no pending tasks. Each task image matches the commit's ECR digest. API and worker have `OTEL_SDK_DISABLED=1` and no conflicting secret entry. Readiness returns 200/ready; the new worker emitted **three genuine watchdog heartbeats**; all **eight operational alarms enabled/OK**. Receipt: `/private/tmp/darci-phase1-runtime23-receipt.json`.
- Final read-only billing/source scan: **22 local / 22 provider subscriptions**, zero reconciliation issues, zero overdue notification/Stripe/generation jobs, zero recent failed notifications, lifecycle categories **15/15**. Existing six temporary privileged grants revoked and MFA factors removed; original four test subscriptions canceled. This pass's additional upgrade receipt independently confirms its test subscription cancellation and global logout. The team lifecycle signoff remains unset; the report still recommends observe. No live-mode activation.
- All **20** isolated recovery containers created during this pass stopped. Private evidence retained. No client PDF, signature, acknowledgment or subscription changed by these drills; the already-approved legacy protection work is not rerun.

### What this does not certify

The engineering batch and its listed verification are complete and deployed. Full Phase 1 acceptance is **not** silently marked complete: the main checklist still requires broader held-route/accepted-work continuity and abrupt payment mid-effect interruption acceptance, originating failure/delivery and combined incident drills, physical-device/product PDF acceptance, operator interaction acceptance and exact policy/specimen decisions. Deferred branch protection/Sentry and fresh production configuration remain explicitly documented. Green CI or an approved OTLP disablement cannot substitute for those checks.
