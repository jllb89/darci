# DARCi recovery runbook

Status: **controlled staging recovery demonstrated — not production recovery certification**.

Responder: Jorge, `lopezb.jl@gmail.com`. Sole-responder coverage is explicitly accepted for now (18 September); no secondary coverage is claimed.
Approved targets: RPO ≤24 hours; RTO ≤4 hours. The 22–23 September controlled exercise met both: snapshot approximately 2h44 old at start, approximately 1h46 through recovered authentication, exact PDF access, selective generation and the held/signer access matrix. This is selective, quarantined resumption, not approval to replay historical customer/provider queues.

23 September update: the independently restored 20:00 UTC snapshot has **2,533/2,533 exact object checksums**, 2,405 readable PDFs and 50 preserved historical source exceptions. Auth/Storage/API/Redis and a quarantined worker were reconstructed; eight functional checks, selective queue reconstruction/real rendering/interruption checks and a 32-request held/signer/notary/admin access matrix pass. See the [final-pass evidence](phase1-final-pass-2026-09-23.md). Historical unreadable files remain exceptions, not repaired artifacts.

## Safety boundaries

- Current backup source is **staging only**, Supabase project `oqferisuloumoojgbjde`. Operator CLI reads `/darci/staging/app`; the unattended task can read only `/darci/staging/recovery-source`, containing database/Storage and protected-identity recovery settings. Stripe, email, SMS and other app keys are excluded from that subset.
- Destination is CloudFormation stack `darci-recovery`, in AWS account `427057633951`. It is a private, versioned, KMS-encrypted S3 destination. Application roles cannot access it. Writer and recovery-reader roles are separate.
- Use full TLS certificate and hostname verification. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`, `sslmode=require`, or `rejectUnauthorized:false` as a recovery workaround.
- Do not restore over the source, run a linked database reset, replay notification/payment queues, or replace a historical PDF. Restore into an explicitly isolated environment with outbound email, SMS, push, payment and webhook processing disabled.
- Keep dumps, object names, identity keys and raw restore logs private. Do not attach them to tickets, chat, Git, or email. The backup manifest contains sensitive object metadata.
- No automatic deletion or retention expiry is approved. Legal holds and a retention policy remain outstanding. The $15/month budget is an alerting target, not a hard spending cap.

## Make a staging snapshot

Prerequisites: approved AWS CLI session; Node 24; PostgreSQL 17 client tools; the Supabase CA certificate downloaded from the authenticated project dashboard. The project must already be correctly linked by the Supabase CLI when using its session pooler.

From `/Users/jorge/Desktop/darci`:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node backend/scripts/recovery-snapshot.mjs backup \
  --stack=darci-recovery \
  --pg-bin=/opt/homebrew/opt/postgresql@17/bin \
  --ca-file=/Users/jorge/Downloads/prod-ca-2021.crt \
  --session-pooler=true
```

The IPv4 **session** pooler on port 5432 is an alternative to the direct IPv6 database address. The script takes its host and project identity from the existing CLI link, not a guessed hostname. It does not update the application's database configuration.

A successful run prints a snapshot ID and the **exact S3 manifest key and version**. Keep both. The manifest is committed last, after the database archive and all enumerated Storage objects have uploaded. A failed run may leave partial private artifacts, but must never be counted as a complete backup. Do not delete its retained versions just to silence a failure.

## Automatic snapshots

Infrastructure is versioned in `infra/recovery/stack.json`; the runtime is `infra/recovery/Dockerfile`. The **enabled** schedule runs a short-lived ARM64 Fargate task at **02:00 and 14:00 America/Mexico_City**. Twelve-hour spacing allows retry headroom before the 24-hour data-loss objective and the existing 20-hour missing-success alarm. There is no always-on recovery server or paid test database. It was enabled on 18 September only after a real scheduler dispatch completed a 2,474-object backup and the separate reader verified its receipt/database/key plus exact object-version reuse; see the execution record. Ongoing regular runs and whole-application RPO/RTO acceptance remain to be measured.

- Existing `darci-staging` cluster/public subnets, a dedicated no-ingress security group, and outbound TCP 443/5432. No new NAT gateway. Public task IPs and source-provider transfer still have usage costs.
- Digest-pinned private ECR image; non-root process, read-only root, writable ephemeral scratch only, 0.5 vCPU/2 GiB, 45-minute hard runtime limit. Temporary artifacts disappear with the task; S3 evidence is retained.
- Scheduler can run only the exact task definition in the existing cluster and pass only its two roles. Task credentials are short-lived; the writer cannot read/delete backup objects. A PostgreSQL advisory lock prevents overlapping snapshots.
- This is **not a fully read-only source credential**: the existing PostgreSQL and Supabase service credentials remain privileged. The script uses a read-only exported database snapshot and Storage GETs; further source-role minimization remains a hardening opportunity. Treat the backup task/image/secret as privileged recovery infrastructure.
- Failed scheduler delivery and failed task startup/nonzero exit go to the encrypted failure queue, whose CloudWatch alarm uses the existing SNS route. EventBridge's SQS grant is restricted to this account's recovery rules. The script additionally publishes sanitized failure context. A committed manifest is required before the success metric is emitted. These controls are separate: a successful `RunTask` call is not a successful backup.
- Recovery resources carry `CostCenter=darci-recovery`; that cost-allocation tag is activated and the $15/month budget filters on it. Billing visibility can lag, and notifications do not impose a spending cap. Watch both AWS costs and Supabase transfer/quotas; no automatic source-data deletion is authorized.

After an intentional database/Storage credential or identity-key change, refresh the subset from the existing approved app secret:

```sh
node backend/scripts/prepare-recovery-source-secret.mjs --approve-scheduled-backup
```

This does not rotate keys or change app configuration. It checks the source version twice, writes the subset to the KMS-protected recovery secret, reads it back and prints only version IDs/counts. **Rotation is not automatically synchronized**: run a fresh snapshot and independently test recovery before considering the rotation accepted. Preserve all historical keys required to decrypt older evidence.

The public Supabase CA is pinned in the recovery image (`infra/recovery/supabase-ca.crt`); replace it through a reviewed rebuilt/scanned image when the provider rotates it. Never weaken TLS to keep a schedule green.

Inspect the actual configuration without exposing secrets:

```sh
aws scheduler get-schedule --group-name darci-recovery --name darci-recovery-staging --region us-east-1
aws ecs list-tasks --cluster darci-staging --family darci-recovery-backup --region us-east-1
aws logs tail /darci/recovery/backup --since 1h --region us-east-1
```

Pause/resume by updating the existing CloudFormation `BackupScheduleState` parameter to `DISABLED`/`ENABLED` while preserving all other parameters, particularly the scanned `BackupImage` digest. A pause is an operational incident if the next accepted snapshot cannot meet the RPO; never clear the alarm with an invented success metric.

## Verify recovered objects

Use the exact successful receipt, not “the latest object” or an unversioned manifest:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node backend/scripts/recovery-snapshot.mjs restore-check \
  --stack=darci-recovery \
  --manifest=EXACT_MANIFEST_KEY \
  --version=EXACT_MANIFEST_VERSION \
  --pg-bin=/opt/homebrew/opt/postgresql@17/bin
```

This downloads through the recovery-reader role, verifies sizes and SHA-256 checksums, checks the database archive index and runs native PDF validation/rendering on every page. A checksum match does not excuse a malformed source PDF. Failures are retained in a private report and cause a nonzero exit. **This is not a full database, authentication, authorization or application restore.**

An interrupted local check can add `--resume-directory=/ABSOLUTE/PRIVATE/TEMP/darci-recovery-...` with the **same exact manifest key/version**. Only private system-temporary recovery directories are accepted. The manifest is fetched again; every reused file is size/SHA-256 checked again, and PDF validation/rendering reruns. A partial, mismatched or symlinked file is never accepted as complete. The default remains AWS CLI transfer; there is no extra SDK dependency.

### Isolated authenticated application rehearsal

With a verified object directory and cached compatible Docker images:

```sh
node backend/scripts/recovery-application-drill.mjs /ABSOLUTE/PRIVATE/RESTORE_DIRECTORY --confirm-isolated
node backend/scripts/recovery-functional-drill.mjs /ABSOLUTE/WORKSPACE/.recovery-private/EXACT_PRINTED_RUN --confirm-isolated
node backend/scripts/recovery-queue-drill.mjs /ABSOLUTE/WORKSPACE/.recovery-private/EXACT_PRINTED_RUN --confirm-isolated
node backend/scripts/recovery-access-drill.mjs /ABSOLUTE/WORKSPACE/.recovery-private/EXACT_PRINTED_RUN --confirm-isolated
```

The bootstrap requires all object checksums, allowing only explicitly reported source-readability exceptions. It creates a new Docker `--internal` network with no published ports, restores a fresh database, reconstructs file Storage metadata, and starts Auth, PostgREST, gateway, API, Redis and worker. API/worker code comes from the current compiled `backend/dist`; record its tested revision before accepting a run. The runtime image and Supabase versions are currently pinned in the script to the rehearsed versions; this is a local operator tool, not a generic production launcher.

Private runtime files live in ignored, mode-0700 `.recovery-private/` so Colima can share the files. Credentials are mode 0600. Never commit this directory. Auth must use the `auth` database search path and the recovered gateway JWT issuer. Native file Storage requires its cache/content-type extended attributes as well as exact bytes; copying only the file is insufficient.

The functional test generates an internal magic link without sending email and verifies it against restored Auth. It checks owner linkage, anonymous/unrelated denial, Storage URL restrictions, exact final bytes, safe public verification, missing/corrupt-copy detection and denied external egress. It stops **only its own recovered worker**, waits for the real heartbeat to expire, observes readiness 503, restarts it and verifies readiness 200 with unchanged durable queues. Fault injection changes only the isolated file copy and restores exact bytes afterward.

Run the three drills sequentially: each fingerprints preserved state and must not overlap another fixture mutation. The queue drill uses a separate queue prefix and explicitly selected new synthetic run IDs; it does not resume customer queues. The access drill requires that queue receipt and changes only its synthetic documents/accounts. It revokes its temporary privileged roles and logs out fixture sessions afterward.

All provider/outbox runners and normal BullMQ replay are hard-disabled by `APP_ENV=recovery` or `RECOVERY_QUARANTINE=1`; no hosted provider credentials are passed. Auth/Storage use isolated privileged DB credentials, so restored production role ownership/password rotation is not claimed. Individual script timings exclude prior transfer/bootstrap/debugging; use a complete incident timeline for an RTO claim. Stop the exact named containers after collecting the private reports; do not prune unrelated Docker resources or erase preserved source exceptions.

### Storage compatibility and interrupted generation

The versioned-object snapshot requires the digest-pinned Storage 1.79.14 in the bootstrap. Storage 1.35.3 could read existing files but failed new uploads with PostgreSQL 42P10. Do not weaken the recovered uniqueness constraints to accommodate an old server. The compatible server may apply its own reviewed Storage grant migration inside the isolated clone. Native metadata reconstruction uses the current synchronous extended-attribute API; exact bytes alone do not restore content-type/cache behavior.

In normal staging operation, the dispatcher reconstructs missing Redis delivery only for durable `queued` generation runs, with stable job IDs. It never resets `rendering`, completed, failed, blocked or canceled runs. The abrupt-exit drill proves an upload followed by process death cannot create a published version or release a package. A remaining `rendering` run requires operator inspection of its private uploaded bytes and evidence; do not automatically reset it, overwrite a final artifact, or replay a whole restored queue. Existing queue-age alerts remain the escalation path.

For the offline database component, use the private artifact directory printed by that check:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node backend/scripts/recovery-database-drill.mjs \
  /ABSOLUTE/PRIVATE/RESTORE_DIRECTORY --confirm-isolated
```

This verifies the dump checksum, starts a disposable PostgreSQL 17 container with no network, restores the full archive transactionally, preserves ACLs using no-login role placeholders, and checks restored Storage inventory/version and document-hash relationships. It stops its container when done. It does not restore over any existing database or execute an application worker. Original role ownership/passwords are deliberately not reconstructed, so this is **not** authorization acceptance. Full Phase 1C acceptance still requires Supabase service reconstruction, identity/key access, held/private-document denial and safe worker recovery.

The first successful snapshot/component receipts and source-PDF exceptions are recorded in [the Phase 1 execution record](production-hardening-phase1-execution-2026-09-17.md). A component restore time is not the full application RTO.

To rehearse the reviewed Phase 1 candidate migrations on a **new offline copy** of that restored archive, add `--rehearse-phase1-upgrade` to the database drill command. The script checks the explicit nine-migration candidate set, skips installed versions, records the exact applied SQL digests, and compares whole-row fingerprints across 16 evidence/billing tables before and after. It writes a separate private `database-upgrade-report.json`, preserving the original restore report. Any changed existing evidence fails the drill. It never migrates the source database, sends notifications, or writes Storage objects; successful rehearsal does not authorize deployment.

## Legacy verification-only corrections

The separately approved correction command is `backend/scripts/reverify-legacy-hashes.mjs`. Default mode is read-only; `--apply` adds only immutable audited attestations for matching, readable completed final PDFs. `--install-evidence-schema` with apply installs **only** its additive migration, not the rest of Phase 1. Both modes require `--approval-reference=approved_beta_hash_only_correction` and `--ca-file=/Users/jorge/Downloads/prod-ca-2021.crt`. It is restricted to the approved staging account/project. Existing receipts and PDF bytes remain unchanged; failures stay in the private review report. Do not use it to relabel or repair an unreadable/mismatched PDF.

## Respond to a recovery failure

1. Acknowledge the `darci-recovery-critical` email; record the correlation ID and failure stage without copying secrets or object names.
2. Preserve the last accepted manifest and its exact object versions. Check its age; escalate immediately if the 24-hour objective is breached or no accepted snapshot exists.
3. Diagnose the reported stage: CLI identity/role access; TLS/hostname; database export; source-object consistency; KMS/S3 upload; or manifest commit. Fix the cause before retrying. A missing/changed source object must be investigated, not silently skipped.
4. Retry the snapshot, then independently verify recovered bytes. Record notification receipt, acknowledgment, recovery duration and any data gap.
5. Never declare the incident resolved merely because an upload or SNS publish API succeeded. Confirm the recipient received the alert and the required recovery checks passed.
6. For a failure-queue incident, inspect only the relevant message, preserve its correlation/task ARN in the incident record, fix the cause and verify a successful backup. Then acknowledge/delete **that exact resolved message** using its receipt handle. Never purge the queue, remove unrelated failures or clear it merely to return the alarm to OK. Message contents may include dispatch diagnostics; keep them private.

## Outstanding operational gates

- Verified full isolated restore, including PDF rendering and final-hash relationships, identity/key access and negative authorization checks.
- Ongoing regular-schedule acceptance after the successful one-time cloud dispatch and recurring activation. Missing-success and a real controlled task-failure alarm have been exercised; the failure-queue action reached SNS. Separate scheduler delivery/startup failure cases and other critical-category detectors remain outstanding. Do not equate a shared alert route with every detector being tested.
- Whole-application RPO/RTO measurement, capacity/cost monitoring and approved retention/holds. Sole-responder coverage is explicitly accepted for now, not redundant coverage.
- Independent-account recovery protection remains a production follow-up; the current destination is isolated within the existing AWS account.

## Current beta isolation and backup monitoring

Production will start fresh, as explicitly approved on 17 September. Preserve this beta environment, its exact backup versions and exception reports; do not import beta accounts/documents/test entitlements into production or delete them during provisioning.

`darci-recovery-staging-snapshot-success-missing` checks `DARCi/Recovery / SnapshotCompleted` (`Environment=staging`). Twenty hourly periods without a success, including missing metric data, trigger an alert before the 24-hour objective. It is an alarm, separate from the automatic backup schedule. Do not publish success manually to clear it. Fix the cause, run the real snapshot command, and let its completed-manifest metric restore OK. The controlled test ALARM and automatic return to OK both successfully executed the existing SNS action.

Staging identity key preparation is additive/idempotent via `backend/scripts/provision-staging-identity-key.mjs --approve-protected-storage`. It preserves existing secret values and refuses to rotate an existing key. The prepared key is included in the second encrypted snapshot. Recovery writes it only inside the private restored-artifact directory and checks its exact checksum; never copy it into a ticket, terminal output, source file or public report. Production needs its own independent key during provisioning.
