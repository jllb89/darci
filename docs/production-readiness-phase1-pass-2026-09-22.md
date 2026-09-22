# Phase 1 completion pass — 22 September 2026

## Current decision

**Resumed completion pass:** Jorge authorized committing/pushing this Phase 1 work and deploying it to staging, excluding the separate iOS-workflow edits. Local non-billing admin mutation step-up is now implemented, with an authenticator enrollment/verification panel on shared admin pages. Backend: 676 tests pass; backend and web builds pass. Live deployment and recovered-application acceptance are in progress; the earlier acceptance limits below remain until evidence explicitly supersedes them.

**Substantial additional gates passed; Phase 1 is not yet fully complete and production is not approved.** Local retry/monitoring changes need deployment. Whole-application recovery, full real-device/CA/OH acceptance, legacy identity handling and policy approvals remain open. Branch protection is explicitly deferred by Jorge. Do not convert this record into a blanket launch approval.

The authoritative checklist is [the production roadmap](production-readiness-roadmap-2026-09-17.md). This record supersedes the latest-state claims in the earlier [22 September acceptance record](production-readiness-acceptance-2026-09-22.md); historical results there remain valid.

## Deployment and scope

- User-deployed revision: `c5acd9b6e5e2b5e5cbe7b255cdd185ae5efb89ea`.
- [Server CI](https://github.com/jllb89/darci/actions/runs/35786350001), [staging deployment](https://github.com/jllb89/darci/actions/runs/35786349758) and [independent iOS run](https://github.com/jllb89/darci/actions/runs/35786349739) passed. CI about 3m40s; deployment about 7m15s. Uncommitted iOS optimization files belong to another task and were preserved.
- ECS API/worker/web each running 1/1, rollout complete. API `sha256:048c550fd5fe706a4e1424bcf33714d766252045abf24358a966823fe99dde08`; worker `sha256:40b7c285d322a2f3c656c7d9dcdb101b8720ecc624dccea7a02629f2485efd63`; unchanged web `sha256:91004521d61d7dca4903c70812cd4660d80c4313ed238bef789cfc8a38a4fc46`. Container health remains UNKNOWN; actual `/health`, `/health/live`, `/health/ready` were 200/no-store.
- Anonymous member endpoints 401; unknown public verification 404/no-store. Actual staging remains Stripe **test + enforced**, hash-only. No mode flip, live payment, production change, commit, push or app deployment by the agent.
- Additional authority: isolated temporary notary/admin fixtures, real test MFA, privilege revocation afterward; up to $6/month additional staging alert spend; Jorge assigned as policy reviewer. Client records/subscriptions/PDF bytes were not changed. All test addresses are `@example.invalid`; fixture Stripe customers have no billing email.

## Deployed billing and access proof

### Hold, reactivation and operator recovery

Fixture run `phase1-held22-f38d616d`, synthetic document `86630282-fd85-4e88-b96f-a1bf14cd35ba`, IDN `T3OUHJDKFNKQ`:

1. A genuine paid Stripe test subscription synchronized through the deployed webhook/worker. The real document upload/finalize/review API consumed exactly one workflow unit.
2. The subscription was canceled and synchronized; new-workflow eligibility became false.
3. A selected synthetic notary used the deployed watermark/finalization endpoint after lapse. It produced a readable final PDF and `billing_held` release control. Wrong-notary finalization was denied before completion.
4. Anonymous/unrelated-member/wrong-notary document reads were denied (401/403/404 as appropriate); held owner version listing excluded the final version. Assigned-notary context and admin version access worked. Direct Storage signed-URL minting was denied for owner, unrelated member, selected notary and wrong notary JWTs. Held public verification returned 404 without PDF data.
5. Member and AAL1-admin usage reversal were denied. A newly enrolled **real Supabase TOTP factor** produced AAL2/recent signed TOTP evidence. An invalid short reason was rejected. Repeating the accepted reversal produced exactly one minus-one usage record with the correct admin actor.
6. Real payment reactivation/webhooks released the same final version. Final bytes before/after matched exactly: **2,121 bytes**, SHA-256 `fe24e3e4a4db0e814e5f9c8987610525bea68b49ef98873ce00c9ea7f32bbabe`. Native page rendering was visually checked.
7. MFA-protected admin subscription resync and duplicate release retry passed without changing the final version. Deployed admin reconciliation returned **zero issues/backlog**, complete provider scan.

**Evidence limit:** session/acknowledgment prerequisites were seeded solely for this clearly labeled “NO LEGAL EFFECT” fixture. This is real deployed billing/access/finalization proof, not a witnessed IPEN session, legal acknowledgment, signature-variant acceptance or the entire owner/signer/legacy-code/worker route matrix.

The report now derives **15/15 actual lifecycle categories**, acceptance ID `stripe-observe-ca05ebe96a55eee1` at the recorded query. No audit marker or acceptance ID was manually invented. Historical Checkout/Trust/POA/upgrade records still contribute; this is not proof every category was fully rerun today.

Independent post-cleanup reconciliation: **21 internal / 21 provider subscriptions, zero issues/backlog**, 15/15 coverage (later report snapshot ID `stripe-observe-e9ce33b83d2556fb`). Snapshot IDs vary with the report window/evidence; neither is a manual team sign-off. `technicalReady=true`, `enforcementReady=false`, recommendation `remain_observe`: the explicit team acceptance marker remains unset. Actual staging is still test/enforced as previously requested; neither setting was changed.

### Last-unit concurrency

Fixture run `phase1-capacity22-cf0cd01a`: real Starter test subscription, zero of three units. Four synthetic OH uploads were created and finalized, then their review approvals were submitted concurrently. Results: **one 409 `billing_workflow_limit_reached`, three 200 approvals**. Exactly three consume records totaling three units; the rejected document had none. Repeating all three successful approvals remained 200/idempotent and did not increase usage. Exhausted membership denied new-workflow eligibility.

### Cleanup and harness corrections

- Six temporary privileged identities across the initial/resumed drills: every notary/admin grant revoked. Enrolled test MFA removed and fixture sessions globally logged out. Four new Stripe test subscriptions across this pass, including the capacity drill: all canceled and synchronized. Synthetic documents/evidence remain labeled and preserved; no blanket deletion was performed.
- Initial harness expected a nonexistent `documents.title` column; corrected to the actual ownership field. It also initially expected 404 for every notary denial and public metadata for a held package; real 403 denial and held-public 404 were valid. Assertions were corrected to the documented boundaries, not to allow data leakage.
- Private receipts: `/private/tmp/phase1-held22-aabff3b3-receipt.json`, `/private/tmp/phase1-held22-f38d616d-receipt.json`, `/private/tmp/phase1-capacity22-cf0cd01a-receipt.json`. They contain no passwords/session/TOTP secrets. Durable conclusions are recorded here, not dependent on temporary receipts surviving.

## Defect found and fixed locally

After successful completion, the finalization endpoint looked only for an **active** request, so a retry conflicted despite valid completed evidence. The old hash-only retry path could also re-run completion/release evaluation rather than behave as a read-only retrieval.

The fix permits completed-request lookup only for completed watermark retries, retains assigned-notary checks, verifies complete stored PDF/hash evidence, and returns the existing package/release decision. Acknowledgment append cannot reuse that completed-session fallback. Rejected/unfinished/unregistered/wrong-notary cases remain denied.

Six focused authorization regressions pass. The locally compiled service also checked the real completed synthetic fixture: correct version/hash returned, wrong notary rejected, and **six complete row sets** (document, request, versions, execution runs, hashes, release controls) unchanged. Comparison fingerprint: `61492612102828a7733318830ff667cc91118cee539238a8e3dd52b1c085fbed`. This was service-level validation of local code, not a new deployed API result. **Redeployment required.**

## Independent AWS alerts

- Installed `darci-staging-operational-alerts`: seven failure-category detectors plus one missing-watchdog detector; eight fixed-cardinality metrics/alarms, existing log groups/SNS route, no added compute/roles/secrets. See [operator runbook](production-operations-runbook.md).
- Drill `phase1-detector-drill-41c162b9-4b5c-48d4-93fe-33c4eab10aa7`, **21:53:38.938 UTC**: eleven synthetic log events crossed actual thresholds (five auth, one each notification/document/audit/billing/retention/platform). All seven ALARM SNS actions succeeded between **21:54:00–21:54:35 UTC**. Jorge reported receiving the AWS email batch.
- All seven category alarms subsequently returned to **OK naturally**. No alarm state was forced and no success/heartbeat metric was fabricated. Initial detector creation can also send an OK transition; this explains additional setup emails.
- Missing-watchdog alarm reads ALARM with **actions disabled**, intentionally: the source watchdog is not deployed. After genuine deployed heartbeats, the guarded deployment script enables its notifications. This is an explicit pending gate, not active worker-loss coverage.
- Local source now emits sanitized critical signals independently of Sentry/OTLP and probes durable notification/Stripe/generation queues plus readiness every minute, with bounded queries, five-second query timeouts and no overlapping runs. Probe failures do not emit success heartbeats. Expected auth warnings do not page. Generic audit-helper failure now emits a dedicated signal; required material audit transactions remain authoritative.
- Predeployment source check found zero overdue notifications, zero recent failed notification jobs and zero overdue Stripe events, but **21 abandoned generation runs** (April/May: 20 queued, one rendering; 13 unfinished draft/pending-review documents; none superseded). Jorge explicitly approved their audited cancellation. At **22:19:29 UTC**, operation `phase1-stale21-cancellation-20260922` canceled exactly the frozen 21 IDs in a serializable transaction and added 21 audit entries; no queued/rendering runs remained afterward. Only `status`, `canceled_at` and `cancellation_reason` changed. No rows/PDFs were deleted, no bytes regenerated, no notifications sent and no automatic retry requested. Whole-row fingerprints across 30 document/evidence/billing/notification table sets remained identical, including all 13 documents and three existing version records. These canceled jobs remain inspectable; a future regeneration is a separate action, not something this cleanup accomplished.
  - Frozen candidate fingerprint: `656cce9f2c7b982c4b06022c5856a1552dec92a48125778fcd62f05d298fc593`; protected-row-set fingerprint: `7616493aab29f931aeb91a54bd0c7b1a5cb6d98ebbf96c5f9a8076d188f531b7`. Each immutable audit entry records the operation, authorization, prior status and before/after run hashes. Database triggers were inspected before execution; neither updated table had a notification trigger. This is database-state preservation proof, not an additional PDF readability test.
  - The preflight also caught/corrected a candidate query referencing nonexistent generation `updated_at`; the implementation now uses actual `created_at`/`started_at` lifecycle fields, with a retry-timing regression. Historical cleanup does not weaken detection of future stalled runs.
- Staging secret metadata shows OTLP endpoint configured and SDK not disabled; ingestion remains unverified. No exporter credentials or endpoints were printed or changed.
- Detector routing proof does not replace actual application-failure injection, callback delivery acceptance or full incident recovery. Sentry provider work remains deferred.

### Additional closeout finding: provider-delayed notifications

The final read-only scan found three synthetic fixture emails repeatedly alternating between sent and queued, with successive `deferred` callbacks and fresh sends. This is separate from the AWS alarm drill and the generation cleanup. The current application maps provider deferral back to its own send queue, even though the provider already accepted the message. [Resend's official webhook guidance](https://github.com/resend/resend-skills/blob/main/skills/resend/references/webhooks.md) says soft-bounce delivery retries are provider-managed.

Fixed locally: a deferral keeps accepted mail outside the send queue and preserves any existing success/failure outcome; invite state does not regress. Ten status regressions plus the mocked webhook → due-worker path prove no new provider send. This patch **requires API/worker redeployment and deployed recheck**; no live notification was manually replayed, suppressed, canceled or rewritten. Previously accepted provider copies may still finish their own retries. This does not close all callback-ordering, send-idempotency or suppression acceptance gaps.

The same closeout scan still reports 15/15 billing evidence categories, 21/21 internal/provider subscriptions and zero reconciliation issues/Stripe backlog. Six privileged grants remain revoked, zero fixture MFA factors remain, and all four new test subscriptions are canceled. Generation backlog is zero; notification health is **not** claimed clean until the new fix is deployed and verified.

## Validation

- Backend compilation; **663 tests / 97 files passed**, including the additional provider-deferral regressions.
- **20 infrastructure/workflow safety tests passed**, including new fixed-cardinality/scoped-route/heartbeat-gating assertions; recovery and monitoring tests are wired into server CI.
- Observability catalog: **44 entries, 43 emitted codes, eight declared rules, five owners**. These declared Sentry rules are distinct from the new installed AWS detectors.
- `git diff --check` passed. No web/iOS runtime code changed or fresh device test claimed.
- Rechecked all **101 installed migrations**, zero missing, matching reviewed SQL hashes and six service-only capabilities. Latest accepted backup receipt remains the 22 September 20:00 UTC snapshot with 2,533 objects; no new full application restore is claimed.

## Remaining gates — do not hide these behind 15/15

1. Deploy completed-package retry + notification deferral fix + critical emitters/watchdog; retest completed API retry, provider deferral without duplicate sends, genuine watchdog health/loss and originating failures. Do not send another broad synthetic email batch by default.
2. Complete missed/out-of-order webhook and worker-crash recovery, signer/legacy-code/worker full access matrix, actual-device refresh/network/accessibility and CA/OH full products/signing variants.
3. Complete isolated **whole-application** Auth/Storage/key/queue restore and measured RTO/RPO. Earlier byte/database component restores are not whole-application proof; preserve historical beta exceptions. The old `darci-phase1-fullrestore` container is an offline PostgreSQL container, not an authenticated restored application.
4. Resolve legacy identity/backfill/hold behavior, non-billing admin step-up/enrollment UX, OTP/bounce/suppression delivery proof, OTLP ingestion or explicit disablement, and production-origin/abuse acceptance.
5. Obtain exact policy/document/commercial approvals via [the assigned review checklist](production-policy-review-package-2026-09-22.md); confirm production domains/cohort/distribution. Jorge's reviewer assignment does not approve unseen legal wording.
6. Repository protection/release review: `master` is unprotected and no ruleset was returned. Jorge expressly requested **leave settings unchanged for now**. Do not describe this as a completed mandatory-merge gate.

Fresh production provisioning and real-money smoke tests remain later, separately authorized phases.
