# DARCi deployment and environments guide

Updated: 23 September 2026. Owner/release approver: Jorge (`jllb89`).

## What is deployed, and what is not a launch

Production is an **IP-restricted candidate**, not an open customer service. App/API HTTPS routing and API/web/worker infrastructure are provisioned. Signup, outbound messaging and live payment activation remain closed. Do not invite clients to use this environment until the production-readiness roadmap's remaining provider, security, legal and acceptance gates pass.

The initial workflow was published in `4f29c95`; release-verification hardening was published in `442baee`. Jorge approved **Deploy Production Candidate** run **35894433475**, which passed through actual GitHub OIDC, scans, promotion and exact running-image/configuration verification. The two production-scoped ECS read permissions are applied. See [release evidence](production-release-verification-2026-09-23.md). This validates a private release, not signup/provider activation or public launch.

## Environment map

| Setting | Staging / beta | Production candidate |
| --- | --- | --- |
| Purpose | Team acceptance and Stripe test-mode exercises | Fresh, isolated production infrastructure |
| Web | `https://app.staging.darciregistry.dev` | `https://app.illuminotary.com` |
| API | `https://api.staging.darciregistry.dev` | `https://api.illuminotary.com` |
| AWS account / region | `427057633951` / `us-east-1` | Same account/region; separate resources |
| ECS cluster | `darci-staging` | `darci-production` |
| ECS services | `darci-staging-api`, `darci-staging-worker`, `darci-staging-web` | `darci-production-api`, `darci-production-worker`, `darci-production-web` |
| ECR repositories | `darci-api`, `darci-worker`, `darci-web` | `darci-production-api`, `darci-production-worker`, `darci-production-web` |
| Supabase project | `oqferisuloumoojgbjde` | `jdrgluisxhgegdsesman` |
| AWS application secret | `/darci/staging/app` | `/darci/production/app` |
| Recovery source secret | `/darci/staging/recovery-source` | `/darci/production/recovery-source` |
| Recovery stack | `darci-recovery` | `darci-production-backup` |
| Payment environment | `test`; existing acceptance configuration preserved | `live` namespace selected, **live activation false**; live keys saved locally, six prices/Portal mapped, runtime callback/key rollout pending |
| Data | Existing beta retained | Fresh, no beta import |
| Deployment trigger | Existing master-push/manual staging workflow | **Manual** production workflow and required environment approval |

Check actual secret names through Secrets Manager before accessing recovery credentials; secrets are not copied between environments. The repository's Supabase link remains staging. Never run an unqualified `supabase db push` assuming it targets production.

Production backup bucket: `darci-production-backup-427057633951-us-east-1`; encrypted, versioned, separate writer/recovery permissions. Schedule: 02:00 and 14:00 America/Mexico_City. Initial recovery objectives: 24-hour RPO / 4-hour RTO. An enabled schedule is not proof of continued successful recovery; monitor completed snapshots and repeat drills.

## Why there are roles but no new passwords

These are machine roles, not human accounts. GitHub obtains a short-lived AWS session through OpenID Connect after approval. There is no permanent AWS access key/password to paste into GitHub.

| Role | Job | Deliberate boundary |
| --- | --- | --- |
| `darci-production-github-release` | Upload production images, inspect scans, request an update of the existing production runtime stack | Trusts only `repo:jllb89/darci:environment:production`; no direct runtime-secret read, DNS/network write or staging deployment permission |
| `darci-production-cfn-release` | Register task definitions and update the three existing production ECS services | Cannot create IAM roles, change network/DNS controls or administer the database |
| `darci-production-task-execution` | Let ECS fetch production images, inject the pinned application-secret fields and write logs | Scoped to production repositories/logs and the production app secret |
| `darci-production-app-task` | Runtime AWS identity for app containers | No application AWS API policy currently attached |

The GitHub environment `production` requires Jorge's approval and allows only `master`. Self-approval is allowed because Jorge is the current sole operator. Master branch protection remains unchanged by explicit decision.

**Important:** reviewed application code naturally receives its own injected runtime credentials. Restricting a deployment role's direct Secrets Manager access is not protection against malicious code approved for deployment. Exact-commit CI and the human production approval remain meaningful security gates.

## Normal staging release

1. Review and commit the intended changes; preserve unrelated local work.
2. Push to `master`. Existing CI and Deploy Staging run; iOS has its own workflow.
3. Confirm the exact revision's CI and rollout succeed. The server workflow reuses exact-commit CI instead of rerunning the entire suite.
4. Verify `/health/ready`, the relevant team flows and alerts.
5. API/web deployment does **not** distribute a new TestFlight build. Device release/acceptance is separate.

Production has 105 migrations, including `20260923050000_production_billing_preactivation.sql` and `20260923190000_close_backend_only_table_access.sql`. Both were rehearsed before production application. Staging remains at the prior 103; **Jorge explicitly requested production-only application of the backend-table access fix**. Do not push pending migrations to staging without new approval or treat the histories as equal. Clean disposable CI installs the full checkout; that is not a staging mutation.

## Normal production application release

After these files have been committed/pushed and server CI has passed:

1. Open GitHub → Actions → **Deploy Production Candidate**.
2. Choose **Run workflow**, branch **master**.
3. Review the pending deployment to the `production` environment and approve the intended revision.
4. The workflow requires passing `types`, `backend`, `web` and `database-security` jobs for that exact SHA; it does not rebuild iOS or rerun server tests unnecessarily.
5. It builds three ARM64 images. The web image is rebuilt with **production** public URLs/key; do not reuse the staging web bundle.
6. It resolves immutable ECR digests and requires completed scans with zero HIGH/CRITICAL findings.
7. CloudFormation updates **only the three image parameters**, keeping the previous template, secret version, IP allowlist and closed-payment configuration.
8. ECS rolls tasks with readiness checks and a deployment circuit breaker with rollback enabled. The workflow verifies actual running digests/task health, completed rollouts/counts and unchanged template, non-image parameters and service configuration.
9. From the approved network, check the app, API readiness, document access denials and monitoring. Full product acceptance is separate from a green service rollout.

CLI equivalent for starting the workflow:

```sh
cd /Users/jorge/Desktop/darci
gh workflow run deploy-production.yml --ref master --repo jllb89/darci
gh run list --workflow deploy-production.yml --repo jllb89/darci --limit 5
```

The workflow uploads `production-image-manifest` containing the source revision and immutable image references. Keep accepted manifests for rollback. Automated releases refuse tracked runtime modifications; the initial CLI bootstrap separately records its local patch fingerprint.

The one-time local CLI deployment and actual approved GitHub OIDC release **35894433475** passed. The workflow preserves a sanitized `production-release-receipt` artifact; a rollback/failure remains a failed release. Deliberate health-failure recovery is tracked separately from successful promotion.

## Where configuration belongs

| Configuration | Where to maintain it | Release implication |
| --- | --- | --- |
| Browser API/Supabase URLs | `infra/production/build-images.mjs` / production workflow | Rebuild web image; `NEXT_PUBLIC_*` values are baked in |
| Public Supabase anon key | GitHub `production` environment variable `PRODUCTION_SUPABASE_ANON_KEY` | Public client identifier, not a service-role key; rebuild web |
| Private Supabase, Redis, identity encryption and abuse-key values | AWS `/darci/production/app` | Never commit/print values; runtime references an explicit secret VersionId |
| Runtime flags, CORS, proxy CIDRs, mounts and service sizing | `infra/production/runtime.mjs` | Reviewed infrastructure/config release, **not** the image-only workflow |
| Payment database namespace/approval | Protected `billing_runtime_configuration` | Owner-only audited DB change; app roles cannot update it |
| Signup and redirect configuration | Production Supabase Auth settings | Review independently; do not enable production providers by copying beta settings |
| DNS | Namecheap Advanced DNS | Preserve certificate records, root website and existing mail records |
| Alerts and cost notifications | `infra/production/monitoring.mjs`; AWS alarms/budget | Verify signals before enabling new alarm actions |

Editing a Secrets Manager value does **not** automatically restart containers or change an already pinned VersionId. Make a reviewed config release after validating the new version; never assume a secret edit deployed itself. Identity-key changes require an explicit encryption/restore plan and coordinated recovery-source update—do not rotate the key casually.

No production Stripe/Resend/Maps/APNs keys were copied from staging. Those providers have separate remaining setup/acceptance. The approved $350/month envelope covers planned AWS + Supabase infrastructure; AWS's $315 tagged-production budget reserves $35 for Supabase. It is a notification budget, not a spending cap, and does not cover untagged/shared costs or Supabase directly.

## DNS and private access

**24 September tester-access update:** the production app/API HTTPS gate now also permits Claire, Adam and Ann's four explicitly approved IPv4 `/32`s. Existing operator access remains intact. [Current tester inventory and deployment evidence](production-tester-access-2026-09-24.md). Historical operator-only descriptions below describe the earlier setup; signup, purchases and account authorization remain separate gates.

Both app/API CNAMEs point to:

```text
darci-production-1695242078.us-east-1.elb.amazonaws.com
```

Keep the two underscore-prefixed ACM validation CNAMEs; they support certificate renewal. Do not point production to staging or delete the validation records when the certificate is issued.

Application host-routing rules restrict access to the approved operator IPv4 `/32`. The approved email setup adds one public exception: **POST `api.illuminotary.com/webhooks/resend`**, validated by the backend's separate Resend signing secret. HTTPS port 443 is reachable to support provider callbacks, but the listener defaults to 403 and all other app/API routes remain operator-only. Port 80 remains operator-only. If Jorge changes networks, a 403 can mean the allowlist needs updating, not an outage. Inspect `OperatorCidr` and request a reviewed replacement/additional tester boundary. **Never remove source-IP conditions or make the default listener action forward publicly.**

### Production email configuration release

The approved 23 September email configuration was deployed with `infra/production/deploy-email.mjs` and the tested `email-setup.mjs` overlay. It preserves the running image digests, private application routes, database/storage and disabled payment/signup gates. Only Resend credentials were merged into a new pinned version of `/darci/production/app`; existing values were preserved. Sender: `DARCi <notifications@notify.illuminotary.com>`; Reply-To: `lopezb.jl@gmail.com`. Auth email failures are strict, not silent fallback. The notification runner remains **disabled**; installing credentials is not approval to drain client jobs.

Normal image releases use the **previous deployed template** and preserve this overlay. Do not run the original bootstrap `deploy-runtime.mjs` to update email configuration: its pre-provider guard intentionally refuses provider-bearing secrets. For later key/configuration changes, review the current deployed template and secret version, preserve all existing fields, and perform a separate scoped configuration release. Never copy the secret to logs or Git. Temporary CloudFormation listener/security-group permissions for this setup were removed after `UPDATE_COMPLETE`.

The operator-only acceptance tool is `run-email-acceptance.mjs --send-approved-operator-test`. It starts one short-lived task using the deployed API image/config, checks public denial and callback signatures, sends only to Jorge, and retains explicitly labeled notification evidence. It does not start the general runner. Do not rerun casually; inspect its retained delivery record before any repeat send. See the [provider evidence](production-email-acceptance-2026-09-23.md).

On 23 September, a real network change caused exactly this timeout. After Jorge approved the replacement, only `OperatorCidr` was changed through CloudFormation; the old firewall rules were removed and both host routes adopted the new `/32`. API readiness and web returned **200** afterward. The normal image-release role deliberately cannot change ingress. The operator temporarily granted the stack execution role access to only the production edge security group and the two routing-rule ARNs, plus required read APIs; the temporary policy was removed after the stable update. No new permanent network permission, extra CIDR, service/image/secret change or public access was retained.

After changing a CNAME, authoritative DNS can be correct while an ISP or device retains a previous negative/incorrect result. Compare authoritative DNS and a public resolver; do not keep rewriting a correct record.

## Read-only health checks

**Server Maps config release, 23 September 19:05 UTC:** API7/worker6/web4 use the same accepted images. The runtime now pins `cb42c704-cd85-49a0-8884-48d83502f7e3`; only API injects `GOOGLE_MAPS_SERVER_API_KEY` and enables `GOOGLE_MAPS_GEOCODE_USE_SERVER`. Existing Resend values are preserved. `maps-setup.mjs` defines this overlay; `deploy-maps.mjs` records the exact operator-approved rollout. Production browser Maps remains disabled. Shared-key Geocoding fallback passed in both zones; legacy Places remains denied and browser restriction review needs the Google project owner. Preserve the current deployed template on image releases.

Direct production PostgreSQL/pooler access also has an allowlist: NAT egress `18.213.200.166/32`, `34.231.72.82/32`, and current operator `187.247.134.158/32`. On a future operator-network change, update the operator entry in both the ALB gate and Supabase DB network restrictions, preserving both NATs. Client testers need application access only, not direct DB access. Supabase HTTPS Auth/Storage/REST is not protected by the DB IP allowlist; RLS and application authorization remain required.

The separate `darci-production-edge-audit` stack owns production WAF, retained CloudTrail logs and ten capacity alarms. Its source is `infra/production/edge-audit.mjs`; supply the production ALB ARN plus API/web target-group full names when deploying, preserving existing parameters on updates. Managed common rules start count-only. Do not remove those controls during an image-only runtime release. Current evidence: [provider/access hardening](production-provider-hardening-2026-09-23.md).

```sh
aws sts get-caller-identity
aws ecs describe-services --region us-east-1 --cluster darci-production \
  --services darci-production-api darci-production-worker darci-production-web \
  --query 'services[].{Name:serviceName,Running:runningCount,Desired:desiredCount,Pending:pendingCount,Rollout:deployments[].rolloutState}'
curl --fail --show-error https://api.illuminotary.com/health/ready
aws logs tail /ecs/darci-production-worker --since 10m --region us-east-1
```

`/health/ready` checks the database, matching payment namespace, configured identity encryption, Redis and fresh worker heartbeat. The isolated runtime smoke additionally exercises PDFKit/pdf-lib/qpdf/Poppler and scratch-file permissions. A process listening on a port alone is not sufficient PDF readiness.

Containers run as UID 1000 with read-only root filesystems. Explicit Docker `VOLUME` declarations preserve writable ownership for `/tmp`; web has a separate `/app/.next/cache` mount. Do not remove these while retaining ECS bind mounts: default root-owned volumes caused a real PDF scratch-write failure found during this deployment.

## Failed release and rollback

1. Do not disable readiness or remove the circuit breaker to force a green deployment.
2. Inspect the production stack events, service events and correlated application logs; do not dump runtime secrets.
3. ECS/CloudFormation revert a failed rolling deployment to a prior completed deployment. The approved **23 September API HTTP-503 drill passed automatic ECS and CloudFormation rollback**, preserving original healthy capacity and exact configuration/images. See [the measured drill and limits](production-release-verification-2026-09-23.md); this does not guarantee recovery from every failure class.
4. For a controlled operator rollback, use the previous **accepted production image manifest**, keep the deployed template and all non-image parameters unchanged, and update the three image parameters through CloudFormation. Recheck scans, dependencies, service counts and exact digests. Do not substitute staging images or rebuild an old tag.
5. Never restore the entire database simply to roll back app images. Migrations need backward-compatible planning; document bytes and billing effects must not be overwritten to undo a deployment.
6. An image-only role cannot modify IAM/network/secret configuration. Infrastructure failures require the authorized operator, not wider GitHub permissions added ad hoc.

Task definitions use `Retain` on replacement/removal. This preserves revision metadata for rollback without granting the release role account-wide task-definition deregistration. Retained definitions do not run or bill compute; only running tasks do. Cleanup of old definitions, if desired, is a separately scoped operator action, not a release permission.

The initial v1 bootstrap images failed the non-root PDF scratch-write check and are **not** an accepted rollback target. Use the corrected, smoke-tested release recorded in the execution document.

## Adding another environment later

These production templates are intentionally bound to known production resources. Do **not** mass-replace the word `production`, copy its keys or reuse its database/cache.

For a new environment: approve its purpose/budget/data policy; allocate an isolated database, buckets, cache, network, secrets and encryption/recovery key; create a distinct GitHub environment and narrowly scoped OIDC subject; configure separate origins/certificates/provider callbacks; build the web bundle for those origins; rehearse migrations and recovery; and prove negative cross-environment access before enabling traffic. Use machine roles rather than creating a human account/password for each environment.

For an additional configuration variable in an existing environment: identify whether it is public-build-time, private-runtime or infrastructure configuration using the table above, add it only to the relevant environment, document its default/failure behavior, test it, and deploy through the matching image or configuration process.

## References and current acceptance

- [Production readiness roadmap](production-readiness-roadmap-2026-09-17.md)
- [Phase 2 execution evidence and final resource state](production-phase2-execution-2026-09-23.md)
- [Team acceptance checklist](release-team-test-checklist-2026-09-23.md)
- [AWS bind-mount ownership behavior](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/bind-mounts.html)

Serving the candidate successfully does not close production provider activation, full Auth/Storage/Realtime/document-worker restore, CA/OH/legal/device review, open-cohort acceptance, WAF/audit coverage or a measured failed-release rollback drill. Track these explicitly in the roadmap.
