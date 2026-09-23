# Private production recovery acceptance — 23 September 2026

**Later scheduled-backup follow-through:** the 02:00 Mexico City run completed automatically with the same three synthetic PDF objects. Independent exact-version object/checksum/readability and database-index validation passed. [Evidence](production-release-verification-2026-09-23.md). This supersedes the first-run-pending note below; consecutive cadence and representative-volume recovery are still open.

## Result and boundary

**PASS: controlled recovery of approved unsigned production fixtures, all three private object buckets, Auth/API access, identity-key usability and selective document-worker recovery.** Not a public launch approval, completed legal-package acceptance, full production-scale disaster test or proof of automatic backup cadence.

Jorge explicitly approved a clearly labeled synthetic member and unsigned TEST PDFs in private production, followed by isolated local restore and retention of the fixtures/evidence. No client account/document, signature, acknowledgment, charge or message was created or changed. The production source remained a draft. Selected client access is deferred until tomorrow's allowlist handoff; current production network access is unchanged.

## Source and backup

- Source: production Supabase `jdrgluisxhgegdsesman`, AWS account `427057633951`, region `us-east-1`.
- Read-only preflight proved the source had **exactly one synthetic Auth user/member, one draft, one non-final document version and three TEST objects**. Signatures, notarization requests, final hash records, subscriptions and notification jobs were all empty. A safety review initially paused the whole-database backup; it proceeded only after this exact source-scope verification.
- Each private bucket (`documents`, `signatures`, `notarized-copies`) contains one two-page PDF prominently labeled **SYNTHETIC RECOVERY TEST / UNSIGNED - NO LEGAL EFFECT**. A test PDF in the signatures bucket is an object-recovery fixture, not a signature record.
- Existing short-lived backup task `a00512c94c8e426e921b693f54e9c507` exited **0**. No new AWS infrastructure was provisioned.
- Snapshot: `2026-09-23T06-15-38.253Z-0dde21e0-ca73-4bfb-96aa-4fd47159adaa`.
- Manifest: `snapshots/2026-09-23T06-15-38.253Z-0dde21e0-ca73-4bfb-96aa-4fd47159adaa/manifest.json`, exact S3 version `X_rLsguyhPoRlUNZCQV2rkDylcvxNovm`.
- Independent reader-role restore: **3/3 exact SHA-256 object checksums, 3/3 readable PDFs, all six pages rendered, zero failures**; 6.644 seconds for object/index verification. Visual inspection of all six recovered pages passed.

## Reconstructed runtime and actual checks

The guarded restore now requires explicit production source selection and immutable production API/worker image digests. It refuses a staging manifest, mutable/local images or missing production digests. Production restores neither mount local `backend/dist` over the image nor apply the historical staging-only migration set.

The exact deployed API digest `dac6286c8a8bb4d7516aa55bd9c90f5b6fded8e50c9aafeb66706f84a0b7ab18` and worker digest `472e0e2b2e69c84e5a7f9a182d65040b2ca7698c75b440a24b8127f8e32c6a67` ran locally. Reconstructed database, Auth, PostgREST, Storage, gateway, Redis, API and worker used a Docker **internal-only network with no published ports**. Restored service credentials were newly generated locally; no Stripe/Resend/APNs/SMS credentials were passed. Provider runners and normal queue replay stayed quarantined. The restored billing namespace stayed live while live activation remained disabled.

Actual functional checks:

1. Restored Auth generated and verified a login internally, without sending email; the original owner linkage remained valid.
2. Owner API access succeeded; anonymous and unrelated-user access failed.
3. Restored Storage served exact original bytes; direct member signed-URL minting was denied.
4. All three restored buckets served their exact test objects through authorized service access and rejected anonymous/unrelated callers.
5. The backed-up identity key successfully encrypted/decrypted synthetic content and rejected incorrect record context. No real identity number was created.
6. Public verification did not expose filenames or download/storage URLs. The source is a draft; this does not claim successful completed-package verification.
7. Missing-object and corrupted-copy faults were detected only in the isolated copy, then exact bytes were restored.
8. Document version/hash/release records remained unchanged by fault injection.
9. Outbound access to the hosted application was denied by network isolation.
10. Stopping the isolated worker caused readiness to fail after natural heartbeat expiry; restart restored readiness with durable queues unchanged.

Selective queue checks then passed:

1. Only explicitly selected new synthetic queued work was reconstructed; stable IDs deduplicated repeat delivery and other lifecycle states stayed untouched.
2. The actual renderer generated one readable version; duplicate delivery preserved its exact bytes.
3. Abrupt process exit after upload did not publish completion/release or automatically re-render the interrupted run. Operator review is still required for that state.

Customer/provider queues were not replayed. The queue proof completed at **06:21:30 UTC**, approximately **5m52 after snapshot capture began**. This small controlled fixture run is within the 4-hour objective; it is not a production-volume RTO guarantee or evidence of restoring an unavailable AWS region.

## Retention, cleanup and remaining gates

- Local production/recovery safety suite: **47 tests passed**; syntax and whitespace checks passed. Recovery-tool and documentation changes remain local, not committed/deployed. No application runtime deployment was required for the drill.
- Exact source PDFs and the synthetic draft are retained as approved. Private receipts, restore artifacts and local containers are retained; the eight drill containers are stopped after checks. The temporary ECR login is removed.
- Source post-check requires the same draft/non-final version, all three matching source hashes and zero signatures/notarizations/subscriptions/notification jobs. No PDFs are overwritten or deleted.
- Production remains API 2 / web 2 / worker 1 on accepted revision 3 task definitions. Ten production alarms (eight application plus recovery/scheduler) read **OK**, actions enabled.
- Backup schedule is enabled at **02:00 and 14:00 America/Mexico_City**. At this check, its first scheduled 02:00 run had not yet occurred. On-demand success is not marked as scheduled-cadence acceptance; consecutive scheduled runs and 24-hour RPO coverage remain open.
- Also open: actual GitHub OIDC production promotion, application-health-triggered rollback, broader production RLS/Realtime/load/edge/audit/cost coverage, production provider setup, client/device matrix and legal/commercial approval. These are not failures of this recovered unsigned-fixture test, nor are they silently passed by it.
- Deployment readback: staging CI/deploy at `452fe26` passed, but iOS run `35825002577` failed `testLaunchesOnboardingSplash` at `DARCiMobileUITests.swift:337` (profile-completion Continue disabled). 115 unit tests and 16/17 UI tests passed, including the new keyboard and notary-sheet cases. This pass inspected that failure; it did not diagnose its root cause or change iOS code.

Private evidence: ignored `.recovery-private/production-fixture-d25ecf0c-1d9b-413f-9163-64629ff568c8`, `.recovery-private/darci-app-recovery-fd8a6d62` and the system-temporary exact-version restore directory. These contain restricted runtime material and must not be committed, emailed or distributed to testers. Only sanitized evidence appears here.

See [provider handoff](production-provider-setup-guide-2026-09-23.md) and [team test checklist](release-team-test-checklist-2026-09-23.md).
