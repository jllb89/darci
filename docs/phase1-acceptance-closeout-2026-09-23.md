# Phase 1 acceptance closeout — 23 September 2026 UTC

Owner: Jorge (`lopezb.jl@gmail.com`). Scope: staging and isolated recovery; no production traffic, live payments or client-document changes. This record supersedes the remaining **automated** work listed in the previous final-pass note. It does not impersonate legal approval or physical-device acceptance.

## Defects actually found and corrected

1. **Held final PDF exposed by the signing read endpoint.** Signing now filters final/acknowledgment versions with the same billing policy as review/version reads, before minting any download URL. Accepted pre-final signing remains available. Held/released regression tests cover both outcomes.
2. **Crash after atomic completion, before billing release decision.** Completed retries revalidate the actor, package and stored bytes, then recover only an explicitly `pending` release decision whose version/hash match. Existing held/released decisions stay unchanged. Missing/mismatched evidence fails closed.
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
| Consolidated gate | **724 backend tests / 102 files**, 72 web tests, shared/backend builds, web typecheck, catalog/KPIs, 28 infrastructure/workflow checks, diff validation: all pass. |

### Evidence locations

- Ignored private recovery directory: `.recovery-private/darci-app-recovery-4886104a/`, reports `payment-crash`, `finalization-crash`, `continuity`, `source-failures`, `notification-delivery`.
- Final local gate: `darci-phase1-gate-80uKzh/report.json` in the operator's private temporary directory.
- Staging schema receipt: `/private/tmp/darci-suppression-migration23-receipt.json`.
- Alert stream: `/ecs/darci-staging-api`, `phase1-detector-drill-e3abe328-9366-4f23-aa60-6bb612dc727a`, 01:15:10 UTC.

The recovery topology has no external provider keys or published ports. Realtime transport is explicitly disabled in the continuity drill; its success is not asserted. Identity, coordinates, commission, seal and invited-signature placement are synthetic test scaffolding, not a legal notarization. Temporary privileged roles are revoked and sessions logged out in the drill cleanup.

## What is still not certified

This closes the specific automated interruption/continuity/source-callback gaps; **it does not justify checking every original Phase 1 box**. Remaining acceptance must stay explicit:

- Physical-device/cross-device network/refresh/Apple Pay and the full CA/OH Trust/POA/upload product-content matrix; exact legal/commercial/retention reviewer approval.
- Full hosted equivalent of the expanded recovered-role matrix, actual operator UI interaction, and actual OTP/SMS delivery/failure acceptance. Existing deployed API/MFA/Resend proofs cover narrower cases.
- Final production origins, credentials, cost/rotation/isolation policy and repeat verification against the fresh production environment. These are distinct from staging engineering correctness.
- Branch protection and Sentry remain **explicitly deferred**, not unanswered questions or passed controls. No automatic identity deletion. Sole responder remains Jorge.

Deployment and post-deployment results are appended below only after verification. This document is not production launch authorization.
