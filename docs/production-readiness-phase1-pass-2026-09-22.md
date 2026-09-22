# Phase 1 completion pass — 22 September 2026

## Current decision

**Final runtime verification:** revision **`c15680ac01be17a0e2807402ad78ac47683c3ae8`** passed [CI](https://github.com/jllb89/darci/actions/runs/35799347787) and [staging deployment](https://github.com/jllb89/darci/actions/runs/35799347779). API task 102 and worker task 88 settled at 1/1 with completed rollouts; `/health/ready` returned 200. The new worker emitted genuine heartbeats at 23:55:30, 23:56:29 and 23:57:29 UTC. All eight operational alarms and the missing-snapshot alarm were enabled/OK on the closeout check. Backend baseline is **679 passing tests**. Recovery-tooling deployment `b18e154` also succeeded. Separate iOS changes remain untouched.

Final read-only cleanup/reconciliation: six privileged fixture grants revoked, zero remaining MFA factors, four test subscriptions canceled; notification/Stripe/generation overdue counts and recent notification failures all zero; 21 internal/21 provider subscriptions, zero reconciliation issues, 15/15 lifecycle categories. Team acceptance is still unset (`technicalReady=true`, `enforcementReady=false`); no live-payment or enforcement configuration was changed. The two recovery application container groups were stopped, with private evidence preserved. OTLP remains configured but unverified; the proposed disablement awaits approval and was not performed.

**Resumed pass, verified update:** Jorge authorized the scoped commit/push. Revision **`d166019262cf52b429b3a82b1cef562ac33b670d`** passed [server CI](https://github.com/jllb89/darci/actions/runs/35793653613) and [staging deployment](https://github.com/jllb89/darci/actions/runs/35793653647). Separate iOS-workflow edits were excluded. Backend 676 tests, web 72 tests and both builds passed. The historical sections below describe earlier checkpoints; this update supersedes their “local/undeployed” statements.

### Newly closed evidence

- Actual completed finalization retry: selected notary 200, wrong notary 403, six complete evidence/release row sets unchanged; evidence fingerprint `61492612102828a7733318830ff667cc91118cee539238a8e3dd52b1c085fbed`.
- Shared web admin authenticator enrollment/verification and router-wide non-billing mutation step-up deployed. Actual AAL1 team mutation 403 before write; recent real TOTP reaches input validation. Two simultaneous real refresh requests yield usable tokens; global logout invalidates both before JWT expiry.
- Live operator replay: subscription-deleted → delayed subscription-created → duplicate created maintains canceled state and unchanged usage. Three reason-bound audits identify the actual admin; role/MFA/session removed afterward. This does not claim missed-event/crashed-worker acceptance.
- All eight AWS operational alarms now enabled and OK after genuine deployed watchdog heartbeats. No additional broad synthetic alarm batch. Latest source scan: notification overdue/failed, Stripe overdue and generation overdue all zero. Reconciliation 21 internal/21 provider subscriptions, zero issues; 15/15 category evidence retained. Team enforcement sign-off remains unset.
- With explicit approval, frozen legacy inventory `858ae554f70233abeb244a3c56366badcacb0440089390198001b0d2af7bb0b7` passed an isolated transaction rehearsal/rollback, then committed at **23:10:54 UTC**. Exactly 44 legacy identifier metadata copies encrypted (22+22), all decryption checks pass, all eight protected document/evidence table fingerprints unchanged. 44 dedicated audits added; unrelated metadata remains exact. Existing `updated_at` triggers remain enabled. Post-commit counts: zero legacy plaintext copies, 44 protected records, zero scheduled deletion dates. Historical protected backups retain original values; no deletion or PDF modification occurred.
- Independent latest-snapshot restore: `2026-09-22T20-00-50.575Z-0fba2016-a34b-4fbc-a3e9-72998701d9b0`, manifest version `9rh0_SDh3Psmvu4mn0IR8Hsegi3lfRa_`. **2,533/2,533 exact checksums**, 2,405 readable PDFs, 50 preserved source exceptions. Interrupted object transfers were retried with the original CLI and checksum-verified; no partial transfer was accepted. Experimental SDK dependency was removed, preserving the original dependency manifest.
- Restored Auth/Storage/API checks pass on Docker internal networking: genuine login and unchanged owner linkage; owner access; anonymous/unrelated rejection; direct member Storage URL denial; exact final PDF bytes; no public download data; missing/corrupt-copy detection; evidence rows unchanged; hosted network egress blocked. Auth migration search path/JWT issuer, Colima-shared private paths and native Storage metadata reconstruction were fixed in the local drill tooling. These are recovery configuration fixes, not changes to hosted artifacts.
- Recovery credentials/bytes are private in ignored `.recovery-private/`; no port is published. Outbox/provider runners are quarantined. Restored Auth/Storage use isolated privileged DB connections, not recovered production passwords. Queue reconstruction, all held/signer routes and physical-device acceptance are **not** implied by the seven recovered-application checks.

Evidence receipts are private temporary files (`darci-phase1-postdeploy22-receipt.json`, `darci-phase1-replay22-receipt.json`, `darci-legacy44-applied22.json`) plus the ignored functional recovery report. Durable outcomes and limitations are recorded here; never commit manifests, runtime credentials or customer files.

### Additional checks completed before closeout

- Recovery tooling/evidence commit: `b18e154162d28f53d4ad2e1d6d0a442210e8c099`; [CI](https://github.com/jllb89/darci/actions/runs/35798464973) passed. This commit excludes all separate iOS-workflow edits.

- **Deployed billing recovery:** intentionally stale cancellation projection on the labeled fixture is corrected through recent-TOTP admin resync, not ad hoc repair. An expired synthetic processing lease is reclaimed by the actual worker exactly once and processed without changing canceled state or usage. Fault injection is explicitly audited. The shared worker was not stopped, and no live-money subscription was touched. All temporary privileges/factors removed afterward.
- **Deployed notification deferral:** two operator-signed `email.delivery_delayed` callbacks using one event ID against an existing labeled `example.invalid` delivery; 75-second observation confirms zero new send attempts or delivery rows. This deliberately controlled callback does not masquerade as a new genuine provider event. No customer email sent.
- **Distributed safety:** two isolated real API replicas, shared Redis, 30 concurrent attempts: 20 validation responses and 10 shared-limit 429s. Arbitrary `X-Forwarded-For` values cannot evade the limit. Redis stopped only in the clone: both APIs return 503. Allowed Origin accepted, unrelated Origin receives no CORS grant; no-store/nosniff/frame denial confirmed.
- **Recovered worker:** real local process stop, natural heartbeat expiry, readiness 503, restart/readiness 200; notification/Stripe/generation table fingerprints unchanged. Eight recovered-app checks complete at **23:24:07 UTC**. The latest restore directory was created at **22:44:25 UTC**; the approximately 40-minute transfer/debug/bootstrap/functional timeline is recorded, but selective queue replay remains quarantined and a full operational RTO is not claimed.
- **Recovered identity key:** the key independently downloaded from the exact snapshot decrypts all 44 currently protected values; comparison with exact pre-backfill values in the isolated restored DB passes without logging plaintext. These encrypted rows were created after the snapshot, so this is key recovery proof, not a claim they were already backed up then.
- **Backup cadence:** nine completed scheduled manifest versions, 18 September 20:00 through 22 September 20:00 UTC, approximately 12-hour intervals. Snapshot age at app acceptance approximately 3h24, inside the 24-hour target. The 50 source exceptions match the previous restore by the complete multiset of SHA-256 hashes, not count alone.
- **Database cross-check:** latest snapshot also restored independently into a network-none PostgreSQL container: 779 documents, 2,466 versions, 2,533 exact Storage records, **242/242 document hashes matched**, 30 Auth identities, 18,879 audit rows. The one pre-existing unmatched app/Auth identity remains preserved and disclosed; it was not silently repaired.
- Revalidation: **676 backend tests / 98 files**, **25 local infrastructure/workflow checks** (including five new recovery safety checks), observability catalog and `git diff --check` pass. The local workflow checks include the separate task's uncommitted iOS changes; those files are excluded from this Phase 1 commit.

**Phase 1 is not yet fully complete and production is not approved.** Remaining acceptance includes selective restored-queue resumption, upgrade with nonzero usage, abrupt mid-effect interruption, the complete held/signer route matrix, real-device/CA/OH full-product paths, broader originating-incident drills and policy approvals. Stale-projection resync and expired-lease worker recovery are already passed, not remaining work. Branch protection and Sentry remain explicitly deferred. Do not convert scoped successful tests into blanket launch approval.

### Platform alarm follow-up

Real staging worker signals at **23:30:26** and **23:37:28 UTC** reached the AWS platform alarm/SNS route. The first accompanied a completed but unready dependency probe; the second lacked that heartbeat, then a successful probe followed about 55 seconds later. The old signal contains no dependency/probe label, so the exact failed dependency cannot be honestly reconstructed from that payload. API readiness and subsequent probes recovered. No alarm state was forced and no detector was disabled.

The follow-up adds allowlisted dependency/probe labels without provider errors, credentials, URLs or arbitrary context. A single platform watchdog failure is retained as a transient diagnostic; two consecutive failures page. Healthy probes reset the counter. Durable queue alerts and captured critical application errors remain immediate; five missed heartbeat periods remain a separate alarm. **679 backend tests** and compilation pass. An actual isolated Redis stop produces exactly one transient first probe, one critical second probe, and correct `redis`/`worker` diagnostic labels; Redis/worker are restored afterward. This code is now deployed at `c15680a`, with three genuine new-worker heartbeats and readiness verified. No additional incident was injected into shared staging to manufacture a new alarm; the short healthy observation window does not establish a long-term SLO.

The authoritative checklist is [the production roadmap](production-readiness-roadmap-2026-09-17.md). This record supersedes the latest-state claims in the earlier [22 September acceptance record](production-readiness-acceptance-2026-09-22.md); historical results there remain valid.

## Earlier checkpoint: deployment and scope (superseded by the update above)

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

## Completed-package retry defect (now deployed and reverified)

After successful completion, the finalization endpoint looked only for an **active** request, so a retry conflicted despite valid completed evidence. The old hash-only retry path could also re-run completion/release evaluation rather than behave as a read-only retrieval.

The fix permits completed-request lookup only for completed watermark retries, retains assigned-notary checks, verifies complete stored PDF/hash evidence, and returns the existing package/release decision. Acknowledgment append cannot reuse that completed-session fallback. Rejected/unfinished/unregistered/wrong-notary cases remain denied.

Six focused authorization regressions pass. The locally compiled service checked the real completed synthetic fixture: correct version/hash, wrong-notary rejection and six unchanged full row sets. The subsequent deployed API checks at `d166019` prove the same boundary and preservation. Comparison fingerprint: `61492612102828a7733318830ff667cc91118cee539238a8e3dd52b1c085fbed`. No further redeployment is required for this fix.

## Independent AWS alerts

- Installed `darci-staging-operational-alerts`: seven failure-category detectors plus one missing-watchdog detector; eight fixed-cardinality metrics/alarms, existing log groups/SNS route, no added compute/roles/secrets. See [operator runbook](production-operations-runbook.md).
- Drill `phase1-detector-drill-41c162b9-4b5c-48d4-93fe-33c4eab10aa7`, **21:53:38.938 UTC**: eleven synthetic log events crossed actual thresholds (five auth, one each notification/document/audit/billing/retention/platform). All seven ALARM SNS actions succeeded between **21:54:00–21:54:35 UTC**. Jorge reported receiving the AWS email batch.
- All seven category alarms subsequently returned to **OK naturally**. No alarm state was forced and no success/heartbeat metric was fabricated. Initial detector creation can also send an OK transition; this explains additional setup emails.
- At initial installation, missing-watchdog actions were intentionally disabled. **Superseded:** source is now deployed, genuine heartbeats verified, guarded enablement completed and the alarm is OK/actions enabled. Full originating-incident routing remains separately tracked.
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

1. Deployment, completed API retry, genuine watchdog enablement and controlled deployed provider-deferral proof are now closed. Complete remaining originating failure/recovery proofs without another broad synthetic email batch.
2. Delayed/duplicate replay, stale-projection resync and expired-lease worker recovery now pass. Remaining: abrupt mid-effect interruption/nonzero-usage upgrade, signer/legacy-code/worker full access matrix, actual-device refresh/network/accessibility and CA/OH full products/signing variants.
3. Complete isolated **whole-application** Auth/Storage/key/queue restore and measured RTO/RPO. Earlier byte/database component restores are not whole-application proof; preserve historical beta exceptions. The old `darci-phase1-fullrestore` container is an offline PostgreSQL container, not an authenticated restored application.
4. Legacy backfill and non-billing admin step-up are now implemented/deployed and verified as described above. Remaining: broader retention/hold policy, operator UI interaction acceptance, OTP/bounce/suppression delivery proof, OTLP ingestion or explicit disablement, and production-origin/abuse acceptance.
5. Obtain exact policy/document/commercial approvals via [the assigned review checklist](production-policy-review-package-2026-09-22.md); confirm production domains/cohort/distribution. Jorge's reviewer assignment does not approve unseen legal wording.
6. Repository protection/release review: `master` is unprotected and no ruleset was returned. Jorge expressly requested **leave settings unchanged for now**. Do not describe this as a completed mandatory-merge gate.

Fresh production provisioning and real-money smoke tests remain later, separately authorized phases.
