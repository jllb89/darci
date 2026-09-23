# DARCi critical operations runbook

Status, 23 September UTC / 22 September local 2026: cumulative runtime hardening deployed at `cbc19b9`; API/worker have OTLP explicitly disabled as approved. All eight AWS operational alarm actions remain enabled and all eight are OK; three genuine new-worker heartbeats and readiness were verified. This is staging proof, not production monitoring acceptance or proof of every incident source.

Responder: Jorge, `lopezb.jl@gmail.com`. No secondary responder is configured. Sentry provider work remains deferred.

## Scope and cost

`infra/monitoring/stack.mjs` defines `darci-staging-operational-alerts`: seven category detectors on the existing API/worker log groups plus a missing-watchdog detector. Eight fixed-cardinality custom metrics and eight standard alarms; no new compute, secrets, IAM roles or subscriptions. Existing SNS policy permits only the `darci-recovery-*` alarm prefix in this account.

Jorge approved **up to $6/month additional staging monitoring spend**. Eight classic metrics at $0.30 and eight standard alarms at $0.10 give a planning estimate of **$3.20/month**, before existing free-tier allowances and variable log/SNS/API charges. Verify the regional bill; this is not a hard cap. No per-user/document/request metric dimensions are created. [AWS CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/).

Structured signals contain only a fixed category, environment, timestamp, generated/validated UUID correlation and optional document UUID. They exclude errors/stacks, arbitrary tags, identities, tokens, URLs and PDF contents. The original generic audit helper still reports failure without blocking analytics; material evidence remains protected by database transactions/triggers. An alert does not substitute for those transactions.

## Deploy and enable

```sh
node infra/monitoring/deploy-staging.mjs --approve-six-dollar-monitoring
```

This validates the account, confirmed recipient and existing SNS permission before creating/updating the versioned detector stack. Category actions are enabled. Missing-watchdog actions default **disabled** until the application emits real heartbeats. The alarm may correctly read ALARM while disabled: do not claim it is covering worker outages yet.

After API/worker deployment, inspect genuine `darci_watchdog_heartbeat` events and queue results. Then:

```sh
node infra/monitoring/deploy-staging.mjs --approve-six-dollar-monitoring --enable-watchdog
```

The command requires at least three recent heartbeat metric periods before enabling actions. Do not inject synthetic success/heartbeat events to pass this guard. Subsequent infrastructure updates preserve an already-enabled heartbeat action and recheck the recent metrics; omission of the flag does not silently disable existing protection.

## Detection and response

Seven failure metrics aggregate API and worker events. `auth` requires five actionable failures in five minutes; the other categories require one. Expected invalid-credential/expired-session warnings are excluded. CloudWatch sends ALARM and OK transition emails—not one email per poll. OK indicates that the metric is below threshold; confirm application recovery before closing an incident.

### auth

Correlate the signal with request logs. Check Auth provider availability, session-sync errors, role grants and deployed origins. Do not grant a role, bypass JWT verification, email tokens or force logout of unrelated members to resolve an alert. Reproduce with a dedicated fixture; confirm login/refresh and revoked-token denial.

### notification

Check outbox jobs overdue by five minutes and recent failed/partially sent jobs. Inspect provider callback evidence and suppression/bounce reason privately. Retry only the affected eligible job through the authorized operator route, preserving its dedupe key. A provider acceptance response is not proof of inbox/SMS delivery. Never replay the whole queue or override an intentional opt-out.

### document

Check generation queued/rendering beyond five minutes or PDF/storage/signing/finalization exceptions. Preserve the source, current version, hash and release control. Diagnose by correlation and document UUID; inspect bytes only through authorized tooling. Resume safe idempotent work. Never overwrite a final PDF or manufacture acknowledgment/signature evidence. Completed retries must verify and return the existing package.

The generation dispatcher can reconstruct lost Redis delivery from durable `queued` runs once per minute; stable IDs prevent duplicate delivery creation. Existing jobs and non-queued states are not reset. A stale `rendering` run, including death after upload but before version creation, remains an operator investigation, not an automatic retry. Set `GENERATION_RECOVERY_RUNNER_ENABLED=false` to pause reconstruction without changing document state. Recovery environments hard-disable provider runners and normal queues regardless of per-runner flags.

### audit

Treat a missing material audit as an integrity incident. Verify the related transaction rolled back, then restore database access and retry the authorized operation. Generic audit-helper failures are separately signaled. Do not insert an invented completion record or change ledger/hash evidence to make an alert disappear.

### billing

Check the admin reconciliation report, durable webhook inbox and held-release eligibility. The watchdog flags inbox events older than five minutes in received/processing/failed/dead-letter states; the existing reconciliation worker checks provider drift and eligible-but-held packages. Use recent TOTP, a support reason and an idempotency key for relevant operator recovery. Never charge a client, issue a refund, change a plan or reverse client usage merely as an alert drill.

### retention

Investigate retention-runner failures without enabling identity deletion. Identity retention periods and legal holds still need approval. Do not delete old keys, backups, evidence or held material to silence an alert. Stripe webhook-payload retention is a separate existing policy, not approval to delete identity records.

### platform

Check readiness, database/configuration, protected-key availability, Redis and ECS worker health. The worker probes durable queues every minute with bounded queries and no overlapping runs. A completed probe emits a heartbeat; errors do not. Missing heartbeat for five consecutive minutes alerts independently through AWS once enabled. No background monitor can prove an unconfigured API/ALB outage detector: wider production availability/capacity checks remain required.

The hardened runner preserves a single platform-probe failure as `darci_watchdog_transient`, then emits a critical platform signal after **two consecutive** failures. Healthy probes reset that count. This applies only to watchdog platform probes: durable backlog signals and direct critical application errors remain immediate. A failed queue query never emits a success heartbeat.

Use `diagnostic.reason` and its allowlisted labels: `dependency_unready` names failed readiness `checks`; `queue_probe_failed` names the failed bounded queue `probe`; `probe_failed` means the probe did not complete without a more specific safe label. No provider errors, URLs, credentials, arbitrary context or identity values are copied. The older signals at 23:30/23:37 UTC on 22 September lacked these labels; their exact failing dependency cannot be reconstructed from the category alone.

## Safe detector exercise

With explicit approval to send a batch of test email:

```sh
node infra/monitoring/drill-staging.mjs --approve-staging-alert-drill
```

The command writes eleven clearly labeled synthetic events to a dedicated stream in the existing staging API log group: five auth and one for each other category. It does not affect client requests, queues, database records, files or heartbeat metrics. Check actual metric thresholds, alarm history and successful SNS actions; ask the responder to confirm receipt. Let normal metric evaluation return alarms to OK. Do not use `set-alarm-state` or artificial success data to claim detector recovery.

This exercises **log → metric → alarm → SNS**, not all originating application failure paths. Source failure injections, actual worker-loss detection and full incident recovery remain separate acceptance gates after deployment.

## Current limitations

### 23 September acceptance update

See [the acceptance closeout](phase1-acceptance-closeout-2026-09-23.md) for actual source-failure, callback, crash and continuity results; the older limitations below retain their dated scope.

- Auth provider outages now return 503/Retry-After rather than an invalid-session 401. Retry without clearing otherwise valid credentials; actual invalid credentials still return 401.
- Completed finalization with a matching **pending** release control can resume billing evaluation after actor/package/exact-byte validation. Do not manually set release status or re-render. Terminal held/released controls remain unchanged; missing/mismatched evidence needs review.
- Bounces, complaints and suppression are terminal for automatic outbox retries. A deferred provider delivery stays sent; it is not permission to send another email. Migration `20260923012000` permits suppression-event persistence without rewriting history.
- To forward captured isolated source signals through the existing approved email drill, add `--source-receipts <private-recovery-directory>` to the detector command. This explicitly labels them synthetic and preserves correlation; it does not manufacture hosted errors or watchdog success.

- Source emitters/watchdog and completed-package retry are deployed and verified at `d166019`. Remaining originating-failure drills are tracked separately in the Phase 1 record.
- Human non-billing step-up/enrollment UI is deployed and its API boundary tested; full UI interaction acceptance remains. Controlled deployed deferral/no-resend, recovered-app/worker restart, selective restored-job resumption and the recovered held/signer access matrix pass. Remaining scope includes OTP/bounce/suppression and physical-device faults.
- Jorge approved disabling unverified OTLP. Running staging API `104`/worker `90` explicitly set `OTEL_SDK_DISABLED=1`, verified against their exact deployed image digests with no conflicting secret entry. CloudWatch logs and all eight operational alarms remain enabled; this route does not depend on OTLP or Sentry. Recheck effective task configuration on future rollouts; an old value in the source app secret is not the task's effective override.
- Production has no equivalent stack yet; this staging-only template must not be pointed at production by changing its account checks.
