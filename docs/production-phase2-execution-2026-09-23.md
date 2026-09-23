# Phase 2 execution — 23 September 2026

## Current status

**The private production application and HTTPS routing are deployed; broader Phase 2 acceptance and public launch remain open.** Staging remains the team's test environment. No client documents, subscriptions, signatures or PDF bytes were changed.

### Decisions confirmed in this pass

- $350 USD/month production AWS + Supabase planning budget, excluding staging, payment fees, SMS/email/Maps usage and taxes. This is not an automatic billing hard cap.
- The initial separate-AWS-account choice was **superseded by Jorge**: keep isolated production resources in the existing client-owned AWS account `427057633951`, using current access. No new human AWS login/password is required.
- AWS Organization `o-rlbw1svgnk` was created after explicit approval, before the account-boundary decision changed. **No child account was created.** Existing workloads were not moved; the organization is left in place.
- Production domain: `illuminotary.com`, registered at Namecheap. Application origins: `https://app.illuminotary.com` and `https://api.illuminotary.com`. Namecheap access is now available; Jorge added both certificate CNAMEs and authoritative DNS matches. Do not replace existing website, mail records or nameservers.
- Fresh production data, separate beta preservation, hash-only verification and no automatic identity deletion remain unchanged.

## Staging and pricing handoff

- At the start of the provisioning pass, hosted staging history matched **103 local / 103 applied**. Pricing migration `20260923030000` was already applied and not rerun destructively. The subsequent production-only preactivation migration brings this checkout/production to **104**; staging still needs that reviewed additive migration through its normal process.
- All six prepared Stripe TEST Prices and Portal mappings verify with `npm run stripe:catalog:verify -- --prepared`. The default verification mode expects activated sales and intentionally fails while prices are inactive; use `--prepared` before activation.
- Stripe provider scan complete: **0 critical / 0 high / 0 medium**, existing lifecycle acceptance **15/15**. This is the legacy acceptance baseline, not proof of six new hosted Checkout flows.
- **41 focused pricing/Checkout/reconciliation tests passed**. The first sandboxed attempt could not open Supertest's local socket; rerun with socket permission passed without a code workaround.
- During this pass, revision `ccb9171d3deec8cf92a465dd1b8b03a515b93de3` was pushed/redeployed by the user. CI, iOS and Deploy Staging completed successfully. The deployed API `/health/ready` returned `ready`; deployment database/encryption preflight passed.
- New catalog sales remain inactive until the compatible TestFlight build is available. Then activate/verify using the [pricing rollout sequence](member-pricing-v2-rollout-2026-09-23.md) and run new-catalog hosted acceptance. Do not infer TestFlight distribution from green iOS CI.
- Team instructions: [release test checklist](release-team-test-checklist-2026-09-23.md). Existing login/document testing can proceed on staging independently of production provisioning.

## Provisioned production resources

| Area | Actual resource/state |
| --- | --- |
| AWS region/account | `us-east-1`, existing account `427057633951` |
| Foundation stack | `darci-production-foundation`, CREATE_COMPLETE |
| VPC | `vpc-00c8644fb0efe2db8`; two public and two private subnets, separate NAT per zone; app tasks have no public-IP default |
| Private subnets | `subnet-0360e5d7daa53b3ad`, `subnet-0275cac9c927e707e` |
| ECS | `darci-production`; API 2, web 2, worker 1 deployed behind private-task networking; final corrected-image rollout evidence is recorded below |
| Network boundaries | Edge `sg-0900a4d6e17de09fa`: HTTP/HTTPS only from the approved operator `/32`; host rules also enforce that source. App `sg-0b1d6c133a17dd3b2`; cache `sg-0cebae72a699759c8`; backup `sg-06e20ac36bb3735d7` |
| ECR | Separate immutable, scan-on-push API/worker/web/recovery repositories; production backup image has its own `darci-production-backup` repository |
| Cache stack | `darci-production-cache`, CREATE_COMPLETE; Valkey 8 with machine-password authentication, private app-only ingress and TLS endpoint |
| Cache bounds | 1 GB maximum storage / 1,000 ECPUs/sec maximum; launch capacity still requires load/queue testing. Database-driven queue reconstruction remains necessary; this is not a proven cache recovery drill. |
| Supabase | `illuminotary-production`, project `jdrgluisxhgegdsesman`, healthy in `us-east-1`, DARCi organization `crtrwwmuscgueqlsgjdj` |
| Supabase data | 103 original rehearsed migrations plus tested `20260923050000` = **104**. Production namespace `live`, activation **false**; live mutations and test entitlements rejected. No beta import or customer fixtures |
| Storage | `documents`, `signatures`, `notarized-copies` private; no production PDF objects yet |
| Auth | Production app origin configured; public/email signup disabled during provisioning; no production messaging provider activated |
| Secrets | `/darci/production/app` and `/darci/production/recovery-source`; newly generated production credentials/key, no staging-secret copy. Values are never committed. |
| Recovery vault | Stack `darci-production-backup`; private versioned S3 bucket `darci-production-backup-427057633951-us-east-1`; rotating KMS key; scoped no-delete writer and separate recovery reader |
| GitHub | `production` environment, required reviewer `jllb89`, only `master`. Approved machine release roles created; public anon key configured as an environment variable. Workflow/script files prepared locally, **not yet published or exercised through OIDC**. Master branch protection unchanged |
| TLS | ACM certificate `c700d210-3e78-4a4f-931e-4bb3e5697d45`, **ISSUED** 23 September 04:33:35 UTC; both app/API domain validations SUCCESS |

The first backup-stack create failed during validation because a inherited log-group name collided with staging. No resources were created by that failed attempt. Only its verified-empty failed stack record was removed; the corrected production log group is `/darci/production/recovery/backup`. Staging backup resources were preserved.

## Rehearsal and recovery evidence

- A new local Supabase instance on separate ports installed all 103 migrations with seed loading disabled. Fresh-bootstrap checks passed: **19 empty customer/operational tables**, private buckets and RLS on critical tables. Reference counts: 2 jurisdiction rules, 44 template bindings, 69 notification templates, 23 catalog prices, none active for sale.
- Actual auth/session SQL, protected identity/provenance SQL and all three billing SQL suites passed against that fresh instance. All fixtures rolled back; fresh-bootstrap recheck still passed. No hosted test subscriptions or client messaging were produced by these tests.
- Fresh-bootstrap and production infrastructure tests were added to existing CI jobs; no duplicate build/test workflow or iOS workflow change was introduced.
- **53 production/recovery/workflow boundary tests passed** in the initial foundation run; the deployment follow-through below supersedes this with 60 passing checks. `git diff --check` passed.
- First real production backup: `2026-09-23T03-55-35.248Z-cee88906-6fc9-414b-957b-a617f2073afc`; manifest S3 version `qhaO7QzqiXxAW9Tw1.2ii5rM9EXnAvfI`; 1,439,508 bytes including database/key; zero Storage objects. Verified TLS used for the hosted database.
- Exact-version download/checksum and isolated database reconstruction passed. The restore container had **network=none**. The restored encryption key and key ID matched the current production secret in memory; no key material was printed.
- These are **empty-production database/key restore proofs**, not a production PDF/customer-workflow recovery claim. Phase 1's beta PDF recovery evidence remains separate. Production-configured PDF, Auth/Storage/API and document-worker reconstruction still need acceptance.
- Production backup image runnable ARM64 digest: `sha256:b70f7010bc1e17b98e6f7e280fd5e17f4fe69f795a33d39c446f10928c423423`; ECR scan COMPLETE with no findings reported.
- Real private-network backup task `fc563d6dd65947f3a7102416c3f5800b` exited **0**. It created snapshot `2026-09-23T04-08-46.771Z-c991b9b7-30d9-441b-96e3-1bc481e2622a`, manifest version `nDQZENCXrRZVhhjGE0FQcAL0J21q7cxL`, in 14.891 seconds. This demonstrates production task IAM/network/TLS and vault writes.
- Backup stack final readback: **UPDATE_COMPLETE**; schedule `darci-production-backup-production` in group `darci-production-backup` is **ENABLED**. Missing-snapshot and scheduler dead-letter alarms have actions enabled and read back **OK**. Activation followed the successful task; subsequent scheduled cadence is not yet demonstrated. Existing confirmed `darci-recovery-critical` SNS route is reused; no duplicate email subscription.
- Operational-alert stack `darci-production-operational-alerts` initially installed eight production-only detectors with actions disabled. After actual app/worker startup and healthy heartbeat acceptance, its update completed and **all eight actions are enabled, with all alarms OK**. The earlier predeployment missing-heartbeat state was not treated as a healthy-worker claim.

Private local evidence is under `/private/tmp/darci-production-rehearsal.ORLeVR`, `/private/tmp/illuminotary-production-bootstrap-dIlhls` and the private recovery-artifact directories. These contain restricted operational/credential material and must not be committed or sent to testers.

## Namecheap certificate validation records

Add only these **CNAME** records in the authoritative DNS zone. If Namecheap is not the authoritative DNS host, apply them at the actual host. Namecheap's Host field normally uses the relative name shown below; preserve existing website/MX/TXT records.

| Host | Target |
| --- | --- |
| `_11e82a1be56e1658b920c3c3b09f50aa.app` | `_04a9a1fb3133a1bea0c04f3b2670a622.wzccmgtwzk.acm-validations.aws.` |
| `_e21acc485b181bff05ade4d8ebd43765.api` | `_7318fbd5342468adb01a8b95fe6b6679.wzccmgtwzk.acm-validations.aws.` |

These validate the certificate only and remain installed for renewal. The separate app/API routing CNAMEs are now configured as recorded below. Do not point them to staging.

## App deployment and routing follow-through

- Runtime stack: `darci-production-runtime`; ALB `darci-production-1695242078.us-east-1.elb.amazonaws.com`. Both Namecheap `app` and `api` CNAMEs now target this endpoint. The app record initially omitted its first letter; Jorge corrected it. Authoritative DNS and public resolvers agree; the operator's ISP retained the old 1,800-second cached CNAME temporarily.
- Real TLS/SNI checks through the production ALB passed: API `/health/ready` **200/ready**, web **200**, unauthenticated `/documents` **401**, unknown host **403**, allowed-origin CORS preflight **204**, HSTS and nosniff headers present.
- Five production containers were healthy on initial deployment. Real worker watchdog heartbeats appeared and all eight production alarms read **OK**, then actions were enabled. No synthetic failure email was sent merely to exercise the route.
- Initial native-tool smoke exposed **EACCES writing `/tmp`**: Fargate's default bind mount ownership did not match the non-root process. Fixed API/worker Dockerfiles with owned `VOLUME /tmp`; web also gets its own writable Next cache volume. Root filesystem remains read-only and processes remain UID 1000. Added deployment regression checks and scratch-writability container health checks.
- Corrected v2 worker task smoke `dce1701daf744ddc99115078f0162e08` passed actual database/Redis/identity/worker readiness, blocked live SQL writes and Stripe client activation, PDFKit/pdf-lib/qpdf/Poppler processing and **denial of edge access from the unapproved production NAT address**. All PDF smoke files stayed in the ephemeral task; no PDF, signature or customer object was persisted.
- First corrected-image update through the new restricted role triggered **CloudFormation rollback** after healthy task replacement: `elasticloadbalancing:DescribeLoadBalancers` was missing when reading the existing `DNSName` output. Added only that read-only permission and reran the role tests. This is real configuration-update rollback evidence, not a successful deliberate application-health circuit-breaker drill. Final redeployment is recorded below after completion.
- Production GitHub role simulation denies direct production secret reads; the CloudFormation release role simulation denies staging-service updates. The release role has no network/DNS mutation permissions. Application code approved for deployment still receives its own runtime credentials normally.
- The initial rollback also encountered task-definition cleanup permission denial. Rather than grant account-wide `ecs:DeregisterTaskDefinition`, the updated template retains task-definition revisions for rollback and removes that ineffective permission from the release role. Old unused revision metadata is not a running/billable task or a customer document. Automatic cleanup retry completion is recorded with the final stack status.
- Post-migration backup task `aeabcfcccc494deeb3eaa194091e7024` exited **0**: snapshot `2026-09-23T05-05-44.644Z-1da835a7-6a75-4f8f-af5a-42c368b404f6`, manifest version `Z2lYZx6smqbcK4Vwvz0bSJYQZxW60Y_p`, 1,440,009 bytes, zero Storage objects, 11.321 seconds. This includes the 104-migration production database/configuration; it is not an additional full application restore claim.
- That exact new snapshot passed checksum/index verification in 5.692 seconds and actual offline database reconstruction in 2.035 seconds with `network=none`. Zero accounts/documents/Storage objects were restored, matching source. Full Supabase Auth/Storage/worker reconstruction and production PDF-object restore remain separate gates; the native PDF smoke is not a stored-object recovery drill.
- Initial update rollback finished at **05:11:30 UTC**. The three unused v2 task-definition revisions could not be deregistered by the restricted role and remain as harmless metadata; no account-wide deletion permission was granted. The next update uses explicit Retain policies so this cleanup failure does not recur.
- **60 consolidated production/recovery/workflow tests passed**, plus the three full local SQL billing suites and 104-migration fresh-schema recheck. Production workflow YAML parses. No entire backend/web/iOS suite rerun is implied by these targeted checks.
- New [deployment and environment guide](deployment-and-environments-guide.md) documents manual production approval, exact-CI/image scans, environment-specific configuration, secret-version pinning, DNS/private access, recovery and rollback. No additional human AWS account/password was created.

### Corrected release readback

**Final runtime stack status: UPDATE_COMPLETE**, using `darci-production-cfn-release`. API/web/worker services each report a single COMPLETED rollout, desired running counts and zero pending tasks. The retained-task-definition policy avoided the earlier cleanup problem on this final update.

Five tasks read back **RUNNING / HEALTHY** on task definitions `darci-production-api:3` (2), `darci-production-web:3` (2), `darci-production-worker:3` (1), with scratch-writability included in health checks. All eight operational alarms read OK with actions enabled. Actual running digests match the scanned v2 manifest:

| Service | Immutable digest |
| --- | --- |
| API | `sha256:dac6286c8a8bb4d7516aa55bd9c90f5b6fded8e50c9aafeb66706f84a0b7ab18` |
| Worker | `sha256:472e0e2b2e69c84e5a7f9a182d65040b2ca7698c75b440a24b8127f8e32c6a67` |
| Web | `sha256:053a4328b892e0f266455dc79ca9f4fda95dc374369622ce794885ce930ad450` |

Image source base is `ccb9171d3deec8cf92a465dd1b8b03a515b93de3` plus the documented local Docker scratch/cache fix, not a claim of an already committed clean release. The build records tracked runtime diff SHA-256 `dc412bffe269cdd2ac991e9a35e2275d05965f5ebca17b0a71eecb75ec641229`; manifest `/private/tmp/darci-production-images-20260923-v2.json`. After committing, future GitHub builds require a clean tracked source tree and exact-revision CI.

The deployed web landing response and actual Next image optimization return 200 (optimized asset 32,791 bytes). API real-hostname readiness returns ready. App HTTPS routing is independently verified against the correct public-DNS answer with certificate validation intact; ordinary local browser navigation still depended on expiration of the earlier ISP-cached typo at the time of this check. No DNS or certificate warning was bypassed and no local network settings were changed.

## Remaining Phase 2 work — not marked complete

1. **DNS, certificate, ALB/HTTPS and operator-only routing implemented.** No public customer cutover; local stale DNS cache must expire before ordinary browsing from that resolver works.
2. **Corrected-image native PDF checks, task health, scanned-digest matching and private ECS services are verified.** The v1 bootstrap remains excluded as an accepted PDF rollback target. Preserve the final stack/service completion evidence with this record.
3. Commit/publish and exercise the prepared manually approved exact-CI production workflow through GitHub OIDC. The role was exercised by CloudFormation directly; that is not a GitHub workflow run.
4. **Preactivation mismatch resolved without approving payments:** tested migration allows the production namespace with approval false and adds an explicit approval check to the shared Stripe mutation boundary. No live keys, provider Prices or charges. Provider activation remains Phase 3.
5. Operational detectors are connected, healthy and enabled. Finish edge/WAF/audit/availability coverage, cost coverage, throughput/load sizing, full RLS/Storage/Realtime/auth boundaries and the application-health-triggered failed-release rollback drill. Existing staging evidence is not substituted for these production checks.
6. Repeat full PDF/object/application/document-worker reconstruction using isolated production-shaped fixtures/configuration; confirm scheduled backup cadence and 24-hour RPO / 4-hour RTO over actual runs. No PDFs currently exist in the fresh project.

Namecheap access/certificate validation are no longer blockers. Routing records will use the verified production load-balancer endpoint once provisioned. New TestFlight availability is separately needed to activate staging pricing v2. No further human AWS account/password is requested. Completing these prerequisites does not waive product/legal/device acceptance or approve public customer access/live payments.

## Budget basis

Planning estimate: roughly $250–325/month at low traffic for two API tasks, two web tasks, one worker, two-zone private networking, load balancer, small cache/database and baseline recovery/monitoring; approved planning envelope $350. Actual spend varies with throughput, data transfer, logs, backups and plan/billing allocation. Only the resources actually provisioned above are billing now; the full runtime estimate is not today's deployed configuration.

Sources checked 23 September: [AWS Fargate](https://aws.amazon.com/fargate/pricing/), [VPC/NAT and IPv4](https://aws.amazon.com/vpc/pricing/), [load balancing](https://aws.amazon.com/elasticloadbalancing/pricing/), [ElastiCache](https://aws.amazon.com/elasticache/pricing/), [Supabase](https://supabase.com/pricing/). [AWS Budgets](https://aws.amazon.com/aws-cost-management/aws-budgets/faqs/) provides notifications, not a guaranteed spending cap.

Budget `darci-production-monthly-planning` is installed: **$315/month AWS**, reserving **$35 of the approved $350 envelope for Supabase**, with actual-spend 80% and forecast 100% notifications to Jorge. The `Environment` cost-allocation tag is verified **Active**; the filter is `Environment=production`. This covers tagged AWS costs, not untagged/shared charges or Supabase invoices. Cost reporting can lag; reconciliation and confirmation of the actual Supabase billing allocation remain required. The staging $15/$6 approvals were not reused as production-budget controls. No automated shutdown action was installed.

All code/document changes from this Phase 2 provisioning pass remain local and uncommitted. The green `ccb9171` staging deployment does not include them; the AWS resources above were provisioned directly through the reviewed local templates.
