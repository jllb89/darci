# Phase 1 acceptance closeout — 23 September 2026 UTC

Owner: Jorge (`lopezb.jl@gmail.com`). Scope: staging and isolated recovery; no production traffic, live payments or client-document changes. This record supersedes the remaining **automated** work listed in the previous final-pass note. It does not impersonate legal approval or physical-device acceptance.

## Defects actually found and corrected

1. **Held final PDF exposed by the signing read endpoint.** Signing now filters final/acknowledgment versions with the same billing policy as review/version reads, before minting any download URL. Accepted pre-final signing remains available. Held/released regression tests cover both outcomes.
2. **Crash after atomic completion, before workflow/billing release decision.** Completed retries revalidate the actor, package and stored bytes, resume the interrupted workflow projection, then recover only an explicitly `pending` release decision whose version/hash match. A failed workflow repair blocks release. Existing held/released decisions stay unchanged. Missing/mismatched evidence fails closed. All ten crash cases were rerun with actual workflow rows and assert completed workflow status (01:48 UTC).
3. **Empty Stripe claim represented as an all-null PostgreSQL composite.** No acquired event ID means no work; duplicate workers do not process an undefined event.
4. **Auth-provider outage returned as invalid credentials.** Provider 429/5xx/network errors now return sanitized 503 plus Retry-After, and emit actionable auth signals. Genuine invalid credentials remain 401. Web clears credentials only for 400/401, not this outage response.
5. **Terminal provider bounce/suppression/complaint rescheduled jobs.** Only retryable `failed` deliveries schedule another attempt; terminal outcomes do not cycle through the worker.
6. **Suppressed delivery events rejected by the database.** Additive migration `20260923012000` extends the existing event-type allowlist. Rehearsed on the populated recovery database, applied to staging at **01:21:47 UTC**, preserving all **11,193 existing event rows** exactly. No grants, documents, signatures or subscriptions changed.

## Acceptance evidence

| Control | Observed result |
| --- | --- |
| Abrupt payment interruption | Three actual child-process exits: after subscription projection, after the first of two held releases, and before event resolution. Natural 90-second lease expiry; retry completes on attempt two; duplicate claim does nothing. Original usage, versions and hashes unchanged. Actual processor/PostgreSQL; provider transport deliberately synthetic. Complements previous real Stripe lifecycle receipts. |
| Finalization interruption | CA and OH × upload exit, first-output exit, post-completion exit, database error, malformed second source: **10 cases pass**. Twenty independently rendered final PDFs; committed outputs reused, source bytes preserved, retries unchanged, held until eligible. |
| Resource limits | Actual compiled runtime rejects >50 MiB input and >200 pages. No customer files used. |
| Accepted-work continuity | Actual Auth/API upload and review consumes one unit. After lapse, owner and bound invited signer capture signatures; selected notary opens/approves, starts session, records synthetic co-presence/identity/venue, appends acknowledgment, completes and finalizes. Final package held; reactivation releases original bytes and leaves the original single usage event unchanged. |
| Access matrix | **125 HTTP requests**, seven read surfaces × seven roles × held/released states, plus workflow/public verification checks. Anonymous/unrelated/wrong-notary denied; authorized positive reads pass; revoked signer denied; direct Storage signing denied for every human role. Generation-output and signing routes included. Public endpoint hides held evidence and never exposes a PDF path. |
| Native PDF compatibility | Apple PDFKit opens/renders CA/OH crash fixtures and the three-page CA continuity package. Poppler visual inspection confirms source/signature-addendum/acknowledgment composition of that synthetic package. Not a CA/OH Trust/POA legal review or physical-iPhone test. |
| Application failure sources | Actual auth controller, audit helper, watchdog, notification worker, Stripe worker, retention worker and PDF failure paths emit sanitized critical signals. Dependency recovery checked inside the clone. |
| Alert route | Twelve captured signals forwarded, explicitly labeled synthetic, through existing staging log filters, metrics, alarms and SNS. All seven categories alarmed; SNS alarm/recovery actions observed; all eight alarms naturally returned to OK. No fake heartbeat or forced alarm state. Existing recipient confirmation remains on record; no claim of a new inbox acknowledgment. |
| Delivery callbacks | Actual isolated delivered/deferred/bounced/suppressed persistence; duplicate event ID stored once; no extra worker attempt. No external email/SMS delivery claimed from these callbacks. Prior actual Resend delivery/recipient confirmation remains valid. |
| Environment separation | Real Stripe SDK signature tests reject opposite-mode signed events, wrong endpoint secrets and modified raw bytes before inbox persistence; existing key/production activation tests pass. |
| Consolidated gate | **725 backend tests / 102 files**, 72 web tests, shared/backend builds, web typecheck, catalog/KPIs, 28 infrastructure/workflow checks, diff validation: all pass. |
| Hosted access extension | **98 deployed matrix requests**, all six human JWTs denied direct Storage signing; held public verification 404, released 200 with no PDF path; revoked signer denied; exact finalized bytes unchanged. Three privileged roles revoked, six sessions logged out. Synthetic fixture prerequisites, not a legal notarization. |
| Real email OTP | One actual operator-owned alias email reported delivered by Resend; immediate repeat sends nothing extra, wrong code 401, correct code 200, replay 401. Test session globally logged out. Actual phone delivery is not inferred. |
| Browser operator MFA | Real staging browser enrollment, wrong-code rejection, successful TOTP/AAL2, setup-key removal and sensitive API authorization through input validation pass. Synthetic administrator privilege, factor and session removed; no valid customer mutation submitted. |

### Evidence locations

- Ignored private recovery directory: `.recovery-private/darci-app-recovery-4886104a/`, reports `payment-crash`, `finalization-crash`, `continuity`, `source-failures`, `notification-delivery`.
- Final local gate: `darci-phase1-gate-WTR790/report.json` in the operator's private temporary directory.
- Hosted access, real OTP and browser receipts: `/private/tmp/darci-hosted-access23-receipt.json`, `/private/tmp/darci-otp23-receipt.json`, `/private/tmp/darci-admin-ui23-receipt.json`.
- Staging schema receipt: `/private/tmp/darci-suppression-migration23-receipt.json`.
- Alert stream: `/ecs/darci-staging-api`, `phase1-detector-drill-e3abe328-9366-4f23-aa60-6bb612dc727a`, 01:15:10 UTC.

The recovery topology has no external provider keys or published ports. Realtime transport is explicitly disabled in the continuity drill; its success is not asserted. Identity, coordinates, commission, seal and invited-signature placement are synthetic test scaffolding, not a legal notarization. Temporary privileged roles are revoked and sessions logged out in the drill cleanup.

## What is still not certified

This closes the specific automated interruption/continuity/source-callback gaps; **it does not justify checking every original Phase 1 box**. Remaining acceptance must stay explicit:

- Physical-device/cross-device network/refresh/Apple Pay and the full CA/OH Trust/POA/upload product-content matrix; exact legal/commercial/retention reviewer approval.
- Actual SMS delivery/failure acceptance needs an authorized operator phone number; requested once, no client number used. Hosted role matrix, operator MFA browser interaction and actual email OTP are now demonstrated above.
- Final production origins, credentials, cost/rotation/isolation policy and repeat verification against the fresh production environment. These are distinct from staging engineering correctness.
- Branch protection and Sentry remain **explicitly deferred**, not unanswered questions or passed controls. No automatic identity deletion. Sole responder remains Jorge.

Deployment and post-deployment results are appended below only after verification. This document is not production launch authorization.

## Verified deployment and integrated recovery

- `cb1cacbd79a9e0192b0266e5399968ed54aea728`: exact CI **35806787496** and staging deployment **35806787493** succeeded. API **106**, worker **92**, unchanged web **65** have completed 1/1 rollouts. Readiness, four genuine worker heartbeats, explicit OTLP disablement and eight enabled/OK alarms verified at 01:41 UTC. Receipt: `/private/tmp/darci-phase1-runtime23b-receipt.json`.
- Integrated continuity rerun at **01:45 UTC** injects a real PDF failure during the same accepted-work session. No final package or extra usage is published; a correlated document signal is emitted. Retrying completes and holds the package; eligibility restoration releases the original bytes. Run `68f4d099-78c1-45b6-a3cb-c3f4543302ba`, document `43445a76-3d67-4c64-98b1-fbd1f8bc26c2`, SHA-256 `5a9635b617d6a4584c9ebc900886052ebb18b45256a522ba04937f4b4a3bef73`.
- Its one captured failure signal was forwarded, explicitly synthetic, to the existing staging detector at **01:48 UTC**, correlation `ebbd74d8-79f3-4de7-8c7d-9a01dcd27399`. CloudWatch recorded ALARM and successful SNS action at **01:49:00 UTC**, then natural OK and successful recovery SNS action at **01:54:00 UTC**. No forced state or artificial heartbeat; no new recipient acknowledgment invented.
- Final workflow-projection follow-up **`d1208268ada32e6b9490ef4b3b3dbeb5c6ac21fd`**: [CI 35808198644](https://github.com/jllb89/darci/actions/runs/35808198644) and [deployment 35808198685](https://github.com/jllb89/darci/actions/runs/35808198685) succeeded. Deployment 01:54:08–02:01:00 UTC (**6m52**). Runtime verified 02:01 UTC: API **107**, worker **93**, unchanged web **65**, all completed at 1/1; exact scanned digests match; three genuine new-worker heartbeats, readiness and all eight enabled/OK alarms pass. Both API/worker retain explicit OTLP disablement.
- Final deployed regression passes: assigned-notary completed retry 200, wrong-notary 403, six full-row evidence/release sets unchanged; AAL1 admin mutation denied and actual TOTP reaches validation; two simultaneous refresh tokens usable, global logout denies both before expiry; reconciliation remains clean. Temporary factors/grants/sessions cleaned up, no cleanup failures.
- Final read-only reconciliation: **22 internal / 22 provider subscriptions**, zero issues, zero webhook backlog, zero overdue notification/Stripe/generation work and zero recent failed notifications; lifecycle evidence **15/15**. Team lifecycle sign-off remains unset: technical readiness is not invented human acceptance.
- Cleanup independently verified **17 synthetic browser/access fixture accounts, 11 revoked privileged grants, zero remaining MFA factors** at 01:57 UTC. Each harness logged out its sessions. Both disposable recovery stacks stopped after all five reports passed; reports and source backup retained. Only disposable clone runtime state was discarded; no hosted/client records deleted.

## Five-track closure register

| Track | Engineering evidence now complete | Acceptance not fabricated |
| --- | --- | --- |
| 1A Secure access | Current-grant/Auth/RLS/Storage, atomic invites, held-file routes, protected identity, deployed MFA browser and API boundaries | Physical-device/cross-device scenarios; policy and final production-origin approval |
| 1B Truthful finalization | Hash-only evidence, exact immutable bytes, native PDF checks, ten crash/failure cases, interrupted workflow/release recovery | Full CA/OH Trust/POA/upload legal composition and supported-device product acceptance |
| 1C Restorable backups | Scheduled encrypted backups; 2,533 exact restored objects; selective application/queue recovery in approximately 1h46, within 4h | Production isolation/credentials and retention policy; repeat proof after production provisioning |
| 1D Payment correctness | Real test-mode lifecycle/upgrade/concurrency, abrupt payment crashes, held/released access and accepted-work continuity | Commercial approval and final production pause/rollback acceptance; no live charges authorized |
| 1E Actionable alerts | Actual source failures, thresholds/SNS/recovery, real email OTP, callbacks/no-resend, sole-responder route | Real SMS delivery to an authorized operator number; Sentry explicitly deferred |

This register separates finished engineering from remaining acceptance. It does **not** mark the complete Phase 1 acceptance gate or production launch approved. No new engineering approval is pending for the fixes delivered in this pass; the only unanswered test-input question is the operator's SMS destination.

Final runtime receipt: `/private/tmp/darci-phase1-runtime23c-receipt.json`. Final deployed-regression receipt: `/private/tmp/darci-phase1-postdeploy22-receipt.json` (revision field identifies this rerun). Nine private receipts are retained with a checksum manifest under ignored `.recovery-private/phase1-closeout-20260923/`; interruption reports remain under the recovery instance directory. No secrets or private request logs are committed.
