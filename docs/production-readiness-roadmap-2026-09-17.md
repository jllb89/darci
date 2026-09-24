# DARCi Production Readiness Roadmap

**Current status — Phase 3 closed for the enabled private-production scope;
Phase 4 started (23 September).** Engineering acceptance passed, commercial/legal
approval is confirmed, and Jorge confirmed the 16:29 upload-ready email arrived.
Jorge explicitly reconfirmed commercial/legal approval on 23 September; do not
reopen this approval gate. Runtime sales/access restrictions remain unchanged.
Private notification processing is deployed on worker13 after verifying an empty
backlog. One real document-upload email to Jorge has a signed delivered callback;
repeating the product action created no duplicate jobs. A separate in-app-only
probe passed through the persistent scheduled worker. No client messages, SMS or
push were sent in this pass. New regression results: **90 infrastructure and 67
notification tests passed**. [Notification evidence](production-notification-rollout-2026-09-23.md).
Jorge's inbox receipt confirmation for this latest product email is complete.
Production-build login/push/tap and applicable payment UI acceptance live in
**Phase 4**. The generic earlier-phase re-verification task has been removed.
Signup/public access and new purchases stay closed; push activation stays disabled.

**Phase 4 engineering checkpoint — 23 September:** signed production iOS archive
**0.1.0 (21)** built and passed embedded-configuration, signature/profile and app/Sentry
dSYM verification. **120 iOS unit tests and 17 configuration/routing/workflow tests pass.**
Only the two approved GET Apple-association routes are now public; Apple CDN retrieval
passed and app/API restrictions are preserved. Deployed web login chunks use production
API/Supabase. A local well-known-file billing-link correction still needs web release;
TestFlight upload, production-device acceptance and final review materials remain open.
[Exact artifacts, completed work and next steps](production-phase4-execution-2026-09-23.md).

**Latest live billing result — 23 September:** Jorge personally paid **$9.99**.
Paid invoice, real webhook-derived **3-document allowance**, duplicate-event
protection, authorized Portal session creation and deployed reconciliation
(**zero blocking issues**) passed. Future renewal was canceled at period end in
Stripe and verified in DARCi. The temporary purchase window is **closed**:
hosted Checkout/new Portal requests are denied while paid access remains active.
Webhook/reconciliation processing stays enabled, CloudFormation is stable, and
general sales remain prohibited. **116 infrastructure/workflow tests passed**.
This supersedes the unpaid/awaiting-payment checkpoints below; see the
[current closeout](production-phase3-closeout-2026-09-23.md) for remaining gates.

**Latest SMS result — 23 September, 15:44 Mexico City:** the separately authorized
retry was sent once, received a carrier DELIVERED receipt, and **Jorge confirmed
it arrived**. Actual receipt of this retry is passed; completed login and the
earlier intermittent non-delivery are separate, still-unresolved acceptance items.
The existing $9.99 operator checkout was subsequently paid and verified above.

### Historical provider checkpoints — superseded by the current results above

The entries in this section preserve chronology, not pending tasks. Use the Phase 3
checklist and linked closeout for current status; do not repeat a completed payment,
provider setup or receipt test because an older checkpoint says it was pending.

**Historical SMS acceptance correction — 23 September:** Jorge
reports **no recent SMS received**. The request at **15:31:40 Mexico City** matched
his approved destination and a carrier `DELIVERED` event five seconds later, but
that is not confirmation the code is visible to him. Receipt infrastructure is
verified; **end-to-end SMS acceptance remains open with a delivery discrepancy**.
No further code was sent. Filtered messages were also checked and absent. Sender,
registration, international sending and opt-out checks passed; an AWS carrier
trace is needed. Technical Support API access is unavailable under the current
account plan; no case or paid upgrade was made. [Incident and prepared escalation](production-sms-delivery-incident-2026-09-23.md).

**Latest Phase 3 checkpoint — 23 September:** protected production release **35920215734 / `e33c05c` succeeded**. API12 (2), worker11 (1), web6 (2) are healthy after the operator-only runtime overlay; signup, public access, general notification runners and iOS purchases remain closed. The exact live Stripe callback and billing worker are enabled, but purchases/Portal are restricted to Jorge's synthetic test member and Starter monthly until **24 September, 20:20 UTC**. Other-member denial and same-key Checkout reuse passed; one **unpaid $9.99 Checkout** is ready for Jorge. No card charge or paid entitlement has been asserted. Email/push outbox messages were received. Production SMS receipt routing is deployed and a real operator request has a **DELIVERED** carrier receipt. The missing configuration-set permission was repaired, CloudFormation is stable, and temporary operator IAM permissions were removed; phone inbox confirmation remains open. **819 backend tests and 114 infrastructure/workflow tests passed.** See the [current closeout and exact remaining gates](production-phase3-closeout-2026-09-23.md). This checkpoint supersedes the historical states below.

**APNs follow-through — 23 September, 20:33 UTC:** key `QW4JZ2X6DU` securely imported and deployed to private production (**API9/worker8/web4**, healthy, images unchanged). Apple returned **HTTP 200** for exactly one approved operator TestFlight push; **Jorge confirmed device receipt**. **13 APNs/device tests + four configuration checks pass.** General push/notification runners, signup and purchases remain disabled. This closes credential deployment and the scoped operator device test, not production-app registration or worker end-to-end acceptance. [Scope and evidence](production-apns-acceptance-2026-09-23.md).

**Current Phase 2/3 status — 23 September, 20:15 UTC:** production provider configuration is deployed (**API8/worker7/web4**, healthy 2/1/2, images unchanged). Stripe credentials/exact callback are ready but the endpoint and purchases remain disabled. Existing-user email/SMS login and TOTP are enabled with signup closed; **Jorge received both production messages**. Hosted acceptance found and fixed assigned-notary Realtime authorization: production now has **106 migrations**; API/Storage/private-channel/queue/MFA/revocation/logout checks pass, and temporary fixture privileges are revoked. **104 infrastructure/workflow tests + 48 SQL assertions pass.** Two scheduled production backups completed at the intended 12-hour cadence; representative-volume recovery is still open. APNs/device receipt, controlled live checkout, legal/commercial sign-off and the explicitly scoped remaining acceptance are **not complete**. [Exact results, SMS follow-up, safety-blocked restore and remaining gates](production-phase23-acceptance-2026-09-23.md). [Consolidated human sign-off checklist](production-phase23-signoff-2026-09-23.md). This supersedes older pending provider/configuration statements below.

**Latest Phase 2/3 pass — 23 September, verified through 19:07 UTC:** production-only access migration applied after rollback rehearsal (**105 migrations, 97/97 public tables with RLS, 41 rows unchanged, anonymous denied/service access retained**); direct DB access restricted to production NATs/operator. Production WAF and durable CloudTrail are deployed; blocked-request and first audit-digest checks pass. Ten additional platform alarms are installed with the existing approved email route and read OK. Post-hardening backup and independent **3/3 readable-PDF checksum recovery pass**. Supabase SMTP is configured with login/signup still closed. **All six approved live Stripe prices and the restricted Portal are created/mapped, sales still inactive**; the misrouted live-to-staging webhook was disabled with explicit approval. **Server Maps is deployed**, with Geocoding/place-ID/reverse fallback verified in both zones; API7/worker6/web4 are healthy with unchanged images and private routing. Legacy Places is denied and Google-owner access is unavailable. APNs, production SMS, Stripe callback/activation, browser Maps/restriction review and remaining operational/human acceptance are **still open**. **92 infrastructure/workflow checks, 10 focused backend tests and typecheck pass. Staging access migration explicitly deferred by Jorge.** [Completed work, exact resources, evidence and remaining gates](production-provider-hardening-2026-09-23.md).

**Provider update — 23 September, after the infrastructure verification below:** production Resend configuration is **deployed and acceptance passed**. The dedicated key/signing secret are pinned in AWS; the exact signed callback is reachable, while app/API routes remain operator-IP-only. Real sent/delivered callbacks persisted, invalid/expired signatures were rejected, replay did not duplicate the delivery event, and **Jorge confirmed inbox receipt**. The one-off test task stopped successfully. Images remain release `442baee`; notification runners, signup and payments remain closed. **73 infrastructure + 7 webhook tests pass.** [Email evidence and remaining boundaries](production-email-acceptance-2026-09-23.md). This supersedes all pending Resend setup statements below.

**Current status — 23 September, 17:54 UTC:** protected production release **35894433475** at `442baee` and the real **API health-failure automatic rollback drill both passed**. AWS restored the exact prior template/configuration and revision-4 images without manual recovery. All 12 sampled API requests returned **200**, with two healthy baseline API tasks throughout; API/web/worker remain **2/2/1**, and ten alarms are OK. The approved new operator `/32` replaced the old address in firewall and app/API routing; temporary network permissions were removed. iOS **132/132** passes, zero skips. **98 local infrastructure/recovery/workflow tests pass.** First scheduled production backup/restore is verified; consecutive cadence, broader edge/audit/capacity controls, provider setup and human acceptance remain open. Stripe payments/payouts are enabled per Jorge; requirements are unclear and Resend verification is pending. Signup/payments/public access remain closed. [Current evidence](production-release-verification-2026-09-23.md).

### Historical pass snapshots

The dated entries below preserve earlier evidence; pending/local statements are superseded by the current status above and the Section 7 checklist.

**Latest Phase 2 continuation — 23 September:** all five production tasks remain healthy on exact pinned digests, with all ten alarms OK. The first automatic 02:00 backup and independent exact-version PDF/index restore check passed (3/3 readable, byte-identical PDFs). Consecutive scheduled backups remain open. Release verification is strengthened locally to reject healthy-but-wrong images, rollback states and configuration drift; **90 focused tests and workflow lint pass**. Publishing/role update and the protected GitHub release still require follow-through; no production rollout or public/provider activation occurred. [Current evidence and next actions](production-release-verification-2026-09-23.md). iOS fixes are now pushed (`5fa2526`, `6e5b8f3`); run `35891083154` is monitored independently. This supersedes the older “not yet pushed” iOS note below.

**23 September recovery follow-through:** the approved unsigned production-fixture drill passed: **3/3 exact private PDF objects, six rendered pages, ten restored application/access/key checks and three selective worker-recovery checks**, using the exact deployed production images on a network-isolated local restore. Source fixtures remain unsigned and preserved; no client data, legal act, message or charge was involved. [Evidence and limitations](production-recovery-acceptance-2026-09-23.md). The production workflow was committed in `4f29c95`; its actual GitHub OIDC run and failed-release health rollback remain open. Staging CI/deploy at `452fe26` are green. **iOS run 35825002577's onboarding failure is fixed locally: the test typed the email into Last name because it targeted outside the visible form; Continue correctly remained disabled. Unique profile-input identifiers, a keyboard-safe test scroll and value assertions now pass the focused regression and full 115-unit/17-UI suite, with zero failures or skips.** Workflow changes preserve compilation before UI tests and add concise failure summaries; 17 workflow/helper checks and actionlint pass. The corrected changes are not yet pushed; remote validation and cold/warm timing remain open. See [iOS evidence](ios-ci-performance.md). Jorge reports successful mobile POA generation; full client acceptance remains unrecorded. Selected client production access waits for tomorrow's exact allowlist. Jorge confirmed the sender `notifications@notify.illuminotary.com`, with support/Reply-To `lopezb.jl@gmail.com`; provider/DNS activation is still pending. [Provider setup guide](production-provider-setup-guide-2026-09-23.md).

**Phase 2 execution — 23 September:** production API/web/document-worker services and an IP-restricted HTTPS load balancer are deployed in the existing AWS account. Namecheap app/API routing and certificate validation are complete; the earlier app-record typo is corrected (some resolvers retain its old cached value temporarily). The production database has **104 migrations**, selecting the live namespace with **live approval false**; staging remains at the prior 103. Production machine release roles are created and a manual approved image-release workflow is prepared locally. The native PDF smoke found and verified a fix for non-root scratch permissions; all five corrected tasks are healthy with matching scanned digests and stronger health checks. **This is not public launch or full Phase 2 acceptance.** See the [resource inventory and verification results](production-phase2-execution-2026-09-23.md) and the new [deployment/environment guide](deployment-and-environments-guide.md).

**Pricing v2 update — 23 September:** Jorge approved 3/$9.99, 25/$19.99 and Unlimited/$59.99 monthly; $99/$199/$599 annual with monthly allowances, USD before taxes, notary fees separate, defaults 1–6 accepted. Compatible code is implemented locally; the additive staging migration and six Stripe test mappings are prepared and verified. **New catalog sales remain inactive until API/web/TestFlight deployment.** Existing beta contracts are unchanged. See [rollout/evidence and remaining new-catalog acceptance](member-pricing-v2-rollout-2026-09-23.md). This supersedes annual/Unlimited exclusions in older dated scope records; it does not close SMS, device, tax/legal or production-provisioning gates.

**23 September follow-through — read this first:** **`d120826` is deployed and verified**, API **107**, worker **93**, web **65**. The [acceptance closeout](phase1-acceptance-closeout-2026-09-23.md) records six defects fixed, **725 backend tests**, ten finalization crashes/failures, three payment crashes, **125 isolated + 98 hosted continuity/access requests**, real delivered email OTP and actual browser MFA interaction. The same-workflow PDF failure recovered with unchanged usage/bytes; its correlated AWS alarm and SNS actions succeeded, then naturally recovered. Exact-revision CI, scans, rollout and live retry/MFA/refresh/logout/reconciliation pass. The open acceptance items are separated below; completed engineering is not still a TODO.

- Audit date: **2026-09-17**
- Execution priorities revised: **2026-09-17** — Phase 1 consolidates secure access, truthful finalization, restorable PDF backups, payment correctness and actionable alerts into one mandatory hardening gate. No implementation or acceptance is implied by this reordering.
- Audited repository revision: `4e7f3ff91d9a6078525e8c6562ebe5b94432db51` (`pdf fix`)
- Target: controlled production launch of web and iOS, initially California/Ohio, with real member subscriptions if the paid-launch gates pass.
- Recommendation: **not yet a production go**. The core product is substantially implemented; production isolation, security/integrity work, live-payment support and operational acceptance remain.
- This supersedes the launch priorities/status in [DARCi Private Beta Readiness Roadmap](private-beta-readiness-roadmap-2026-08-25.md). That document remains the historical product-decision register.
- **Current runtime:** `d120826`, API107/worker93/web65, verified 23 September 02:01 UTC. Completed-package retry, MFA/refresh/logout, legacy encryption, billing recovery/nonzero-usage upgrade, selective PDF recovery and held/signer authorization are demonstrated. **Phase 1 still has the explicitly unchecked human/product/SMS acceptance gates in Section 7; production is not approved.** See [the acceptance closeout](phase1-acceptance-closeout-2026-09-23.md). Sections 2–6 retain the dated audit background; Section 7 is the authoritative current checklist.
- **Approved launch-data decision (17 September): fresh production accounts/documents, with beta preserved separately.** No beta migration or deletion; no conversion of Stripe test subscriptions into paid entitlements. The 50 historical beta PDF readability exceptions remain under separate review.
- **18 September decisions:** automatic AWS backups approved within the existing $15/month total recovery target; public verification links retained with status/hash only and PDFs restricted to authorized in-app access; Sentry work deferred; Jorge is the sole alert responder for now. None of these four questions remains pending. Secondary coverage and Sentry acceptance are not claimed.
- **Automatic recovery is enabled:** 02:00/14:00 Mexico City, short-lived tasks only; nine scheduled manifest versions confirmed at approximately 12-hour spacing. Latest independent restore: 2,533 exact objects, 242/242 stored document hashes matching, 2,405 readable PDFs and the same 50 historical source exceptions. Auth/Storage/API/Redis/quarantined-worker reconstruction, eight functional checks and selective queue resumption pass; full measured controlled exercise approximately 1h46, within the 4h goal. Historical external-effect queues stay quarantined for reconciliation. All 44 approved legacy identity copies are encrypted and independently verified with the recovered key.
- **22 September billing acceptance: 15/15 actual evidence categories**, plus deployed delayed/duplicate replay, stale-projection repair, expired-lease worker recovery and last-unit concurrency. **21/21 subscriptions, zero billing issues/Stripe backlog** on recheck. This is not full CA/OH/device/mid-effect-outage acceptance; team sign-off remains unset. Backend baseline: **679 passing tests**, including watchdog diagnostic regressions. Staging remains `test + enforced`; no live-payment activation. Deployed provider-deferral callback drill passed across 75 seconds without a new send; notification backlog is zero.
- **22 September decisions:** Jorge reviews policy; exact legal/commercial wording remains unapproved. Monitoring allowance up to $6/month approved. All eight AWS operational alarms have actions enabled after genuine heartbeat verification. Two transient platform probes exposed a diagnostic/noise issue; bounded diagnostics and consecutive-failure paging are being hardened, not treated as evidence of a healthy dependency during those probes. `master` remains unprotected by explicit instruction.
- Historical foundation proof (17–19 September): backend 614 tests; web 72 tests and production build; iOS 110 unit + 12 UI tests; actual Auth logout/revocation and SQL/Storage boundaries. Candidate API/worker/web `phase1-19` images cleared HIGH/CRITICAL scans. All 101 migrations installed cleanly; the populated-beta upgrade preserved whole-row fingerprints across 16 evidence/billing tables. Two encrypted, version-pinned snapshots restored all 2,474 objects byte-for-byte; source-PDF exceptions were retained, not repaired. A cloud-scheduler run subsequently completed a 2,474-object backup in 306 seconds. Latest deployment/tests supersede those counts where noted above; neither component proof nor green CI closes all Phase 1 acceptance gates.

## 1. Executive assessment

We should not rebuild the billing experience or repeat completed mobile/PDF work. Production is not simply replacing staging URLs and Stripe keys. The **current** remaining work falls into these groups:

1. **Remaining hardening acceptance:** physical-device/full-product-content review, phone-login/failure acceptance and exact policy sign-off. **Operator SMS receipt is now confirmed** for the authorized 23 September 03:21 UTC retry. Held/signer/legacy-route tests, selective queue restoration, nonzero-usage upgrades/mid-effect interruptions and originating incident diagnostics now pass. Final production CSP/origins require the final provisioned environment. Environment isolation, hash-only completion, atomic invites, protected identity, material audit transactions and required server CI are implemented—not still the original audit's missing features.
2. **Production provisioning:** isolated AWS runtime and secrets, Supabase project/data/storage, production domains/TLS, provider callbacks/keys, iOS production configuration, deployment approvals and recoverable releases.
3. **Acceptance evidence:** Stripe failure/recovery scenarios, real-device end-to-end workflows, data/object restoration, concurrency/load/outage drills, alert delivery and production smoke tests.
4. **Client/legal/distribution decisions:** exact domains/cohort, member terms/taxes, final CA/OH specimens, retention/holds and App Store purchase/distribution scope. Fresh production/separate beta, hash-only launch, private PDFs and no automatic identity deletion are already decided.

**Fastest defensible path:** freeze the existing three products and member tiers; close the blockers; provision an isolated production stack; rehearse it; launch to a capped cohort. Do not add Dynamic POA, notary billing, scheduling, new jurisdictions or remote online notarization to this release.

**First delivery milestone:** complete the five-track Phase 1 below as one coordinated hardening release, including working recovery procedures and test evidence—not five separate reports. Broader production provisioning and public rollout follow it. Infrastructure or provider setup strictly needed to prove a Phase 1 control belongs in Phase 1; optional infrastructure complexity and general refactoring do not.

## 2. Audit method and evidence limits

Reviewed the old umbrella roadmap; Stripe roadmap and services/SQL; auth/invites; identity/session/finalization; web/iOS release configuration; Dockerfiles and GitHub workflows; storage/catalog metadata; and provider documentation.

Read-only live checks covered:

- AWS account ending **3951**, primarily **us-east-1**: ECS, task definitions, Secrets Manager metadata and selected non-secret flags, ElastiCache, ECR, Route 53, ACM, ALB, CloudFront, CloudWatch, regional WAF, CloudTrail trail configuration, ECS autoscaling and SMS account/number status.
- The accessible Supabase project list and DARCi staging bucket/template/catalog metadata.
- Resend sending-domain and webhook status using the existing staging integration.
- Stripe test-mode reconciliation and lifecycle-evidence reporting.
- Recent GitHub CI/deployment results and fresh npm production-dependency audits.
- Fresh web lint and standalone TypeScript checks.

No secret values are included here. Resource absence means **not found in the inspected account/region/access scope**, not proof that no other client-owned environment exists. Supabase plan/PITR, Auth dashboard settings, Google Cloud key restrictions/budgets, Stripe live-account activation, App Store Connect approval, Sentry alert configuration, Grafana ingestion and all provider contracts/DPAs remain unverified unless explicitly stated below. This is not a penetration test or legal certification.

The 2026-09-16 implementation run passed 571 backend tests, 69 web tests, 108 iOS unit tests, the notary-selection accessibility UI test, web/backend builds and iOS Release compilation. Those are dated baseline results, not a claim that this audit reran every suite or proved production acceptance. Fresh 2026-09-17 standalone web typechecking still fails; see section 4.

## 3. What has progressed since the private-beta roadmap

| Area / old register | Revised assessment | What remains |
| --- | --- | --- |
| Member billing, BILL-01–04 | Core implementation exists: three volume tiers, hosted Checkout/Portal, signed webhook inbox, subscriptions/entitlements, atomic usage, continuity, final-package holds/releases, plan changes and operator recovery | Live-mode engineering, provider setup, remaining lifecycle evidence and commercial approval; not another paywall project |
| Web/iOS membership | Paywall, active-plan/settings states, shared usage/recovery information and iOS presentation coordinator implemented | Production endpoints, actual storefront purchase policy, device Apple Pay and release acceptance |
| PDF/signing/finalization, INT-04 / SESSION-01 | Encryption-related PDF corruption fixed; independent validation added before transformed bytes are released; API/worker fix deployed to staging | Rehearse final production image and actual team workflows; separately resolve existing damaged beta artifacts |
| Session/auth reliability, SESSION-01 | Coalesced/proactive mobile refresh, transient-failure preservation and granted request-scoped profile selection implemented | Cross-device/expiry/revocation acceptance; these fixes do not close invite or broad auth-security gaps |
| Accessibility | Native scrollable notary selection with pinned actions; regression test at standard/max text | Broader critical-path device/VoiceOver/keyboard/display-size acceptance, especially signing and IPEN |
| Observability, OPS-02 | Error catalog/runbooks, document/session/billing signals, correlation and operational reports exist | Deployed alert routing, source maps/dSYMs, dependency health, worker heartbeat, production retention and incident drill |
| Jurisdiction boundary, LEGAL-02 | Live staging catalog query returned only `US-CA` and `US-OH` enabled across 208 availability rows | Reproduce approved config in production and test direct API/admin bypasses |
| Storage privacy | All three staging buckets inspected are private | Full RLS/service-role negative tests, object backup/restore, limits and retention |
| Shipping baseline, BETA-03/04 | iOS tests now compile/pass; latest GitHub CI and staging deployment succeeded | Web standalone typecheck remains broken; CI still does not test/build everything that ships |
| Admin/operator controls | Admin configuration plus billing replay/resync/release/support tooling exists | Least-privilege roles, MFA/recent reauthentication, approved production bootstrapping and operator acceptance |

Current membership pricing document proposes **$49 / $99 / $199 USD monthly**, for **3 / 10 / 25 workflows**, identical features. Notaries pay DARCi nothing; their in-person fees are separate. A Trust package consumes one workflow, not one unit per PDF. Keep the continuity and release policy already agreed; obtain approval of its live customer/legal wording. See [pricing rationale](member-membership-pricing-rationale.md).

## 4. Original 17 September blockers and evidence (historical baseline)

**Do not read the following original findings as today's implementation status.** Phase 1 has since implemented Stripe environment isolation, hash-only completion, atomic verified invite claims, identity protection/backfill, Node 24/non-root runtime, broader CI and independent operational alerts. Current acceptance and unresolved items are checked individually in Section 7; this original evidence is retained for traceability.

### PROD-01 — Stripe live support is not implemented end to end

**Priority: P0 for paid launch. Owner: backend/billing.**

`backend/src/config/stripe.ts` hardcodes `STRIPE_PROVIDER_ENVIRONMENT = "test"`, rejects non-`sk_test_` keys and rejects live objects. `memberBillingService.ts`, `stripeWebhookService.ts` and `billingOperationsService.ts` repeatedly filter/persist `provider_environment = "test"`. Catalog scripts are test-only. SQL in `20260826153000_add_stripe_phase23.sql` and subsequent corrections also embeds test-mode mappings, locks and subscription assumptions.

Although schema constraints allow `test` and `live`, **changing the key alone will fail**. Implement a validated environment boundary throughout clients, lookups, writes, reconciliation, idempotency namespaces, webhook validation and database functions. Add forward migrations; do not edit already-applied migration history. Verify that a live event cannot affect test entitlements and vice versa.

Staging report on this audit:

- Provider scan complete; **0 critical / 0 high / 0 medium reconciliation findings**.
- **9/15 lifecycle evidence checks** present; no acceptance ID; report recommendation `remain_observe`.
- Six missing evidence categories: payment failure, payment action required, cancellation/deletion synchronization, period-end downgrade, final-package billing hold and controlled usage reversal.
- Actual staging remains `test + enforced`; this audit did not change it. The report recommendation and actual flag differ and must be reconciled by the release owner. Lack of evidence is not proof those code paths fail.

Completion requires live catalog/customer/portal/webhook separation, approved commercial settings, complete test-mode evidence, and an explicitly authorized low-value real-payment/receipt/refund or cancellation exercise. No real charge is authorized by this audit. Stripe documents separate test objects and production webhook registration in its [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live).

### PROD-02 — Ledger decision is a functional completion gate

**Priority: P0. Owner: product, backend and counsel.**

`ledgerService.ts` implements only `stub` / `unconfigured`; staging API and worker explicitly allow the stub. `documentFinalizationService.ts` completes the document/request and invokes final-package release only when all ledger attempts are `anchored`.

Choose one before launch:

- **Real ledger required:** implement the selected provider, real proof/finality validation, retries/reconciliation, outage handling and privacy-safe hash-only external payloads.
- **Hash-only launch approved:** implement explicit finalized/hash-verified/released states independent of external anchoring; preserve audit history and distinguish optional pending/failed/confirmed anchors. Update public verification, billing release, notifications and both clients. Remove external-ledger promises.

Simply disabling the stub will strand completion in the current flow. Continuing the stub and calling it a real anchor is unacceptable. Public landing-page FAQ currently promises distributed-ledger anchoring and broad compliance (`apps/web/src/app/page.tsx`); correct these claims to match the approved deployment.

### PROD-03 — Invite claims still need verified recipient binding and atomicity

**Priority: P0. Owner: auth/backend.**

The public claim controller passes token, optional viewer ID and client-provided `claimAddress`. `claimInviteToken` does not establish a verified-email match before inserting the claim, then separately updates invite/token/recipient rows. The authenticated open path has additional recipient logic, but does not eliminate the public-path risk.

Require the intended verified account email for signer claim/acceptance, make claim/use-count/assignment transitions transactional, and reject mismatched/revoked/expired/concurrent claims without partial mutation. Add negative tests for unauthenticated, wrong-email, already-claimed-by-another-user, forwarding and retry cases. Preserve preview/signup onboarding without granting signing authority prematurely.

### PROD-04 — Identity protection and retention remain incomplete

**Priority: P0. Owner: privacy/security/backend/counsel.**

`identityDocumentSchemaService.ts` labels some `maskedIdentifier` fields as full passport/card identifiers. `identityDocumentPolicy.ts` accepts those values without masking; the notary controller copies them into identity/check-in metadata. This is not evidence of field-level encryption or minimization.

Define accurate field semantics, protected storage/encryption and role/audit controls; prevent replication into broad read models, logs, crash reports and caches. Obtain a retention/legal-hold policy for identifiers, evidence, GPS, signatures, documents, audit and backups. The meeting-artifact retention endpoint and Stripe retention runner do **not** demonstrate comprehensive identity/GPS deletion automation. Implement and schedule the missing cleanup with proof and alerts.

### PROD-05 — Security/runtime and CI are not at a production baseline

**Priority: P0. Owner: security/platform/web/backend.**

Fresh `npm audit --omit=dev` results:

| Scope | Critical | High | Moderate | Low | Total package entries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Backend | 2 | 9 | 63 | 1 | 75 |
| Web | 1 | 7 | 7 | 1 | 16 |

These are dependency findings, not a count of independently exploitable DARCi vulnerabilities. Triage reachability and remediate direct/reachable exposure; do not use `npm audit fix --force` blindly. Backend critical entries include `fast-xml-parser` and `protobufjs`; web includes direct Next.js `16.1.6`. The audit offers a newer compatible-major Next.js fix; re-check exact supported versions when implementing. Include OS/native PDF parser scanning, not only npm.

Docker still uses Node 20 while CI uses Node 24. Node 20 is listed as EOL by the [official release schedule](https://nodejs.org/en/about/previous-releases). Move runtime/build/CI to an agreed supported LTS baseline and test native PDF tooling on the shipped ARM64 image. Backend runtime also copies the full installed dependency tree rather than a pruned production set; audit the actual final image.

Additional findings:

- No broad application rate-limiter/Helmet policy found in the inspected ingress; auth cooldowns exist but do not cover all abuse paths. Protect OTP, public invites/verification, uploads/PDF transforms, Checkout and expensive session actions, with proxy-aware distributed limits.
- Next.js headers configure assets/AASA, not a full CSP/security-header baseline. Web access/refresh tokens remain in localStorage. Assess cookie-based sessions or a documented hardened alternative, and test CSP with maps/PDF/auth. Restrict production CORS/origins rather than retaining local-development allowances.
- API catch-all returns `err.message`; sanitize public failures while preserving private correlation. Review telemetry scrubbing beyond the newly added safe events.
- CI runs backend tests/observability, web observability test/lint and types build, but not an explicit backend build gate, full web test/typecheck/production-build gate, iOS tests/build/archive validation, migration/RLS suite or dependency/image scan. Deployment runs independently on master pushes rather than requiring a successful promoted release.
- Fresh web lint: zero errors, one hook dependency warning. Fresh standalone `tsc --noEmit`: **fails** at `apps/web/src/app/app/notary/requests/identityDocument.test.ts:12`, obsolete `government_id` comparison (TS2367).

Exit: no unreviewed critical or reachable unmitigated high exposure; remaining findings have an owner, mitigation and expiry; every shipping gate is reproducible and required for promotion.

### PROD-06 — Legal-document audit and provenance are not fully closed

**Priority: P0 for critical transitions; P1 for wider coverage. Owner: backend/counsel.**

`auditService.ts` still logs and continues if generic audit insertion fails. Inventory material signing/notary/identity/release transitions and make their required evidence transactional or durably recoverable. Do not indiscriminately make every analytics event blocking.

Live active template registry entries still contain descriptive labels such as `sha256:ca-poadoc-v1`, not hashes of exact template bytes. Store actual content digests and immutable versions/provenance, including rules/bindings and rendering version. Rehearse reconstruction and CA/OH package composition. Preserve the hidden internal trust artifact where legally required without exposing it incorrectly as a standalone review item.

The September PDF fix is committed and deployed to staging API/worker, and must remain in production with qpdf/Poppler installed. Existing corrupted beta derivatives were not automatically repaired. Follow the [recorded recovery boundary](mobile-pdf-session-regression-fix-2026-09-16.md): never overwrite already-hashed/anchored bytes or fabricate signatures. Decide whether those beta records are retained separately or migrated with approved corrections.

## 5. External-service and production configuration register

Statuses below describe what was observed, not blanket approval of a vendor account. “Owner” is an accountable role to assign to a named person at the Phase 1 kickoff (1.0).

### A. AWS foundation, edge and runtime

| ID | Current evidence | Required production work and exit evidence | Owner |
| --- | --- | --- | --- |
| AWS-01 Account/IAM | CLI access works; GitHub staging deployment uses OIDC | Choose isolated production account preferably, or explicitly isolated resources/roles in the existing account. Root/admin MFA, break-glass access, billing ownership, scoped GitHub OIDC subject/environment and separate task/execution roles. Review least privilege for secrets, SMS, ECR and logs; no long-lived developer keys in tasks. | Platform/security/client |
| AWS-02 ECS/network | Only `darci-staging` found; API/web/worker each 1 running/desired task, 0.5 vCPU/1 GiB, public IP enabled; no scalable targets | Provision production API, worker and web with documented task definitions/IaC. Prefer private tasks with controlled egress; restrict ingress to ALB security groups. Use multiple AZs; target at least two API/web tasks unless a smaller controlled-launch availability tradeoff is signed off. Size PDF CPU/memory/temp disk using load tests. | Platform |
| AWS-03 Worker/queues | Dedicated worker exists; Redis is Valkey 8 serverless; snapshot retention 0 | Separate production Redis/credentials/prefix, TLS/security groups, appropriate persistence/eviction and recovery strategy. Verify BullMQ hash-slot prefix, concurrency and durable job reconstruction. Prove crash/restart does not lose or duplicate generation, notification, webhook, usage or release work. Multi-worker scheduled tasks need distributed deduplication, not only in-process flags. | Platform/backend |
| AWS-04 DNS/TLS/CDN | `.dev`/`.com` zones exist; `.dev` app/API staging names point directly to ALB. Existing CloudFront alias is only `app.staging.darciregistry.com`. Inspected ACM certificates are staging wildcards. | Confirm final domains first. Add production ALB routing, ACM certs and DNS; configure CloudFront for the actual production web hostname if used. Do not assume `.dev` currently uses the old CDN. HTTPS redirect/HSTS, certificate renewal alerts, AASA serving and correct origin headers. Never cache authenticated/billing/signed-document responses as shared public content. | Platform/web |
| AWS-05 Secrets/KMS | Only `/darci/staging/app` found; local `.env.production` has empty DB/auth/Redis/Stripe/public URL fields | Create least-privilege production secret references and rotation/redeploy procedure. Do not copy the staging secret wholesale. Separate Supabase service role/JWT, webhook signing, Stripe, Resend, APNs and OTLP credentials. Encryption-at-rest baseline plus policy-approved customer KMS where required. | Platform/security |
| AWS-06 Deploy/rollback | Staging task revisions API 96 / worker 82 use `staging-4e7f3ff91d9a`; web revision 61 uses earlier web-only image `staging-ddad6f95f0bf`. Circuit breakers disabled. No production workflow found. | Promote a reviewed release manifest containing each image digest, migration set and config version. Protected GitHub production environment, approval and CI dependency; no auto-production deploy on ordinary master push. Enable failed-deployment rollback, verify prior compatible image/config recovery, and define forward-only migration limits. | Platform |
| AWS-07 ECR/supply chain | Repositories have mutable tags, scan-on-push false; registry BASIC scan config has no rules | Scan actual release images, remediate findings, pin/rebuild supported bases, produce inventory/SBOM as appropriate and promote digests. Lifecycle rules must retain rollback images. Run as non-root; constrain filesystem/egress while allowing required private PDF temp storage. | Platform/security |
| AWS-08 Health/alerts | `/health` only returns `ok`; inspected tasks have no container health checks. No CloudWatch metric alarms, regional WAF ACLs or configured CloudTrail trails found; logs retained 30 days. | Separate liveness/readiness and worker heartbeat; dependency and queue-age checks. ALB errors/latency, ECS restarts/CPU/memory, Redis, email/SMS spend, certificate, webhook, PDF/finalization and synthetic checks. WAF/abuse policy, durable audit trail, budgets/cost alerts, notification ownership. “No trails” does not mean AWS event history is absent. | Platform/on-call |
| AWS-09 Backup/DR | Redis snapshots disabled; DB/object restore not demonstrated | Define RPO/RTO, retention/legal hold, encrypted backups and separate restore destination. Restore DB **and document/signature object bytes**, compare hashes and test app access. Decide regional recovery requirements and rehearse the runbook. | Platform/privacy |

AWS documents automatic rollback behavior and its prerequisites in the [ECS deployment circuit-breaker guide](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html). Use dependency-aware readiness without making a noncritical telemetry outage remove every healthy API task.

### B. Supabase: database, Auth, Storage and Realtime

**Owner: backend/platform/security. Priority: P0.**

One accessible DARCi project was found, `oqferisuloumoojgbjde`, active/healthy in us-east-1 and used by staging. No separately identified DARCi production project was found in this access scope. The `documents`, `signatures` and `notarized-copies` buckets are private, but their inspected bucket-level MIME/size restrictions are unset; this does not mean API upload validation is absent.

- [ ] Provision an isolated production project with appropriate compute/plan/quotas, region, connection pooling, SSL verification, network/access restrictions and owned billing.
- [ ] Rehearse full schema installation plus forward migrations in a disposable environment. Review historical migrations for development-user repairs, admin grants, staging provider IDs, legacy release backfills and notification seeds; do not blindly import staging users, pending outbox rows or test entitlements.
- [ ] Promote counsel-approved CA/OH rules/templates/bindings, catalog and email templates as versioned release data. Verify required grants/functions/extensions, immutable hash provenance, reference data and notary eligibility.
- [ ] Run actual SQL/RLS tests for member, signer, assigned/wrong notary, admin, anonymous and service-role-mediated APIs. Existing RLS files and billing SQL tests are not evidence of comprehensive production enforcement.
- [ ] Configure Auth Site URL, exact web/native redirect allowlists, email confirmations, token/refresh/session policy, password/recovery settings, abuse controls and admin step-up/MFA. Verify custom email OTP and Supabase-originated recovery/confirmation delivery separately. Configure any enabled OAuth provider's own console callbacks/consent; do not add unused social providers as launch scope.
- [ ] Configure production Send SMS Hook endpoint and signing secret; validate signed requests, replay rejection, delivery and failure behavior. Local `.env.staging` says hook disabled, whereas the live secret says enabled: use effective runtime, not local-file assumptions.
- [ ] Create/verify private buckets, storage policies, signed URL expiry, upload content/size limits and cleanup. Validate held/private versions cannot be obtained through alternate endpoints or stale URLs. Test realtime publication/private channels and JWT rotation/reconnect on actual devices.
- [ ] Enable policy-appropriate backups/PITR and separately back up storage object bytes. Supabase explicitly states DB backups exclude Storage API objects; DB restoration alone cannot restore deleted PDFs. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups)
- [x] Launch-data strategy decided: fresh production; beta remains separate and preserved. **Provisioning is not complete.** Production must have independent Auth/storage/database/provider configuration and must not import beta accounts, legal artifacts or Stripe test entitlements.

See the vendor's [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) for dashboard-side controls; their existence has not been verified here.

### C. Stripe, subscriptions and Apple Pay

**Owner: billing/backend/client finance. Priority: P0 for paid launch.**

Keep the implemented model. Complete PROD-01 before installing live keys. Then:

- [ ] Confirm merchant activation, legal business/contact details, payout bank, charges/payout capabilities and ownership/MFA; establish taxability/billing address/invoice/receipt settings with the client's adviser.
- [ ] Create/verify separate live product/Price mappings for the approved three tiers and a restricted live Customer Portal. Approve cancellation, proration, downgrade, no-rollover/no-overage, notary-fee exclusion and final-package hold wording.
- [ ] Register the production `POST /webhooks/stripe` endpoint with the approved SDK-compatible API version and existing required events: Checkout completed/expired; subscription created/updated/deleted; invoice paid/payment_failed/payment_action_required. Preserve raw-body signature validation, durable inbox and retries. Version changes require contract tests, not an unreviewed dashboard upgrade.
- [ ] Inject the live key, endpoint-specific signing secret and approved HTTPS return URL; verify both API and worker environment isolation. Build-time public keys, if used, must match live mode. Do not reuse test customer/price/portal IDs.
- [ ] Exercise all six currently missing test evidence categories and the wider concurrency/out-of-order/worker-restart/byte-identical-release matrix. An evidence marker is not a substitute for the actual test.
- [ ] Verify Apple Pay on the actual enabled hosted Checkout flow using a supported physical device/wallet. For custom/embedded payment surfaces, configure required payment domains; native Apple Pay would additionally need the appropriate Merchant ID/certificates/entitlements and is not what the present hosted-checkout implementation ships. Follow the applicable [Stripe Apple Pay integration guide](https://docs.stripe.com/apple-pay?platform=web).
- [ ] Assign daily reconciliation, refund/dispute, fraud and webhook-incident ownership. Perform a deliberately authorized live smoke test only after the preceding gates.

### D. Resend email and delivery evidence

**Owner: backend/client domain administrator. Priority: P0.**

The connected Resend account reports `darciregistry.com` as verified. Both existing staging webhook endpoints (`.dev` and `.com`) are **disabled**. A configured signing secret is therefore not proof that delivery/bounce events are reaching DARCi. Sending may still work; this finding concerns missing callback evidence and recovery visibility.

- [ ] Decide whether sender addresses remain on `.com` even if the app uses `.dev`; that is valid when deliberate. Verify SPF/DKIM, DMARC policy and alignment, sender/reply-to/support mailboxes and ownership.
- [ ] Use a production-scoped key/domain policy. Create and enable the production Resend webhook with matching secret, necessary event subscriptions and deduplication. Separately restore/verify staging callback delivery before acceptance.
- [ ] Test OTP, signup/confirmation/recovery, signer invite, notary assignment/contact exchange, session and final-package notification. Correlate sent→delivered/bounced/suppressed; account for delays and avoid claiming “email delivered” from API acceptance alone.
- [ ] Verify resend/cooldown, retries, suppression, opt-outs where relevant, retention, expiry and links/logos pointing to production. Keep `.com` support addresses that remain intentional.

Delivery events and replay behavior are described in [Resend's webhook documentation](https://resend.com/docs/webhooks/introduction).

### E. AWS End User Messaging SMS / SNS

**Owner: platform/auth/client messaging owner. Priority: P0 if phone OTP remains enabled.**

AWS SMS account tier is already **PRODUCTION**—do not repeat sandbox removal as unfinished. The account has one ACTIVE SMS-capable toll-free number and another PENDING number. Verify the number actually selected by the hook, its registration/compliance status and approved use case. The live secret enables the Supabase SMS hook; general notification SMS remains `internal` with SNS sending disabled. These are separate delivery paths.

- [ ] Explicitly set approved origination identity and region rather than relying on the hardcoded number fallback; confirm IAM `SendTextMessage` permissions, spend limits, registration, allowed countries and consent/STOP/HELP handling as applicable.
- [ ] Point production Supabase to production `/webhooks/supabase/auth/send-sms`, with its own hook secret. Test delivery, wrong-code/replay/rate limiting, account-linking, pending-number failure and provider outage without exposing tokens or reallocating a phone belonging to another account.
- [ ] Either configure general SNS notification SMS with consent/cost controls, or keep it intentionally disabled and ensure no required workflow depends on it. Do not enable both paths merely because SMS credentials exist.
- [ ] Monitor spend/delivery failures and document account/phone recovery. Ensure recipients are not stranded if email or phone recovery is unavailable.

AWS ends Amazon Pinpoint support on October 30, 2026, but states that its renamed End User Messaging delivery channels continue. Do **not** infer that DARCi's SMS Voice v2 delivery API must be replaced solely from the Pinpoint name. Confirm the used APIs, not legacy campaign/analytics features. [AWS migration notice](https://docs.aws.amazon.com/pinpoint/latest/userguide/migrate.html)

### F. APNs, Apple Developer and App Store Connect

**Owner: iOS/client Apple account holder. Priority: P0 for iOS launch.**

Staging APNs configuration is present/enabled at 100% rollout, with `APNS_ENVIRONMENT=production`, appropriate to distribution/TestFlight tokens. This does not mean the DARCi backend is production. Production signing/submission and actual delivery were not verified through App Store Connect in this audit.

- [ ] Verify paid program/team ownership, agreements, current distribution profile/certificates, app identifier, APNs key scope and revocation/rotation access. Keep APNs transport environment distinct from DARCi deployment environment.
- [ ] **Fix Release configuration:** `Config/Release.xcconfig` explicitly points at staging API and Sentry environment. `generate-release-config.sh` defaults to `.env.staging` and writes Supabase/Sentry values, **not the API URL**. Passing `.env.production` alone does not produce a correct production build. Add explicit environment selection plus an archive-time rejection of staging/localhost/missing config.
- [ ] Align API, Supabase, Sentry, associated domains, invite/session/document/billing trusted hosts and production AASA paths. Existing entitlements include both staging and production `.dev`; avoid cross-environment invite/payment links resolving in the wrong app. If `.com` is chosen, update all relevant allowlists, not just DNS.
- [ ] Validate Release archive signing/dSYMs, symbol upload, install/upgrade, push registration/invalidation, cold-start universal links and logged-out invite/checkout return. September's successful Release compilation is not App Store acceptance.
- [ ] Complete privacy labels/policy, SDK data-use inventory, required-reason API/privacy manifest review, encryption/export answers, screenshots/metadata/age rating, support URL, account deletion and reviewer access. No app-owned `PrivacyInfo.xcprivacy` was found in the source inventory; assess actual API use and the archive's aggregated SDK manifests rather than assuming all dependencies are noncompliant. [Apple privacy-manifest guidance](https://developer.apple.com/documentation/BundleResources/privacy-manifest-files)
- [ ] Validate Dynamic Type, Display Zoom, VoiceOver, keyboard avoidance, location-denied/retry states and nonblocking access to accepted work. Test actual physical devices as well as simulator automation.

**Payment-policy revision:** Apple's current guidelines allow external-purchase links/CTAs in United States storefront apps without the external-link entitlement; person-to-person/outside-app services have separate provisions. A mandatory in-person step alone does not establish that DARCi's membership—which also unlocks digital workflows and excludes notary fees—qualifies for every native Stripe purchase method. The existing hosted-checkout path is the practical starting point for a U.S.-scoped submission; document it accurately, restrict distribution/behavior appropriately, and obtain acceptance of the submitted app. Do not equate a California/Ohio document jurisdiction with an App Store storefront. Other storefronts/native payment methods require their own policy analysis. [Apple App Review Guidelines §3.1](https://developer.apple.com/app-store/review/guidelines/)

### G. Google Maps / Places / Geocoding

**Owner: platform/web/iOS/client Google Cloud owner. Priority: P0 for enabled venue assistance.**

Browser and backend geocoding integrations exist; the staging API references the server key. Google Cloud billing, quotas, API enablement and key restrictions were not inspected through the provider console.

- [ ] Use separate browser/server credentials and production restrictions: exact HTTPS referrers for browser Maps/Places; API restrictions plus appropriate server egress controls for server geocoding. Never ship the server key in web/iOS bundles.
- [ ] Confirm the precise Maps/Places/Geocoding APIs used, billing project, budgets/quotas, required attribution and production hostname allowlists. Add an iOS-specific key only if a native Google SDK actually uses it; do not create unnecessary integrations.
- [ ] Test autocomplete, reverse geocoding, manual address completion, rate-limit/provider-denial behavior and accessibility. A map result is address assistance, not legal proof of co-presence. Approve GPS thresholds/accuracy/freshness and notary fallback policy separately.

Follow [Google's key-restriction guidance](https://developers.google.com/maps/api-security-best-practices).

### H. Sentry, Grafana/OTLP and incident operations

**Owner: platform/engineering on-call. Priority: P0 for actionable launch coverage.**

Sentry integrations and the error catalog exist across clients/backend. The staging OTLP destination points to Grafana Cloud. The inspected API/worker task definitions reference an OTLP endpoint but do not show an `OTEL_EXPORTER_OTLP_HEADERS` secret injection; authenticated ingestion and resulting traces remain unverified. A local `.env` header is not evidence that ECS has it.

- [ ] Configure intentional production Sentry projects/environments, release tags and sampling; supply upload credentials through CI secrets, not app bundles. Verify web source maps and iOS dSYMs by resolving a controlled event to source.
- [ ] Configure/verify Grafana endpoint/auth headers, TLS, service/environment/release attributes and exporter compatibility. Avoid duplicate auto-instrumentation. Decide whether OTLP is required or intentionally disabled; silently broken telemetry is not an acceptable state.
- [ ] Verify scrubbing of auth headers, invite tokens, signed URLs/query strings, full identity identifiers, signatures and document content in all capture paths—not just the new helpers.
- [ ] Create/deliver real production alerts with owner/runbook: auth/SMS/email failures, wrong-role spikes, queue age/dead letters, PDF validation/finalization, webhook/reconciliation, held-release failures, public verification, retention/backup failures and infrastructure health. Test escalation and recovery.
- [ ] Approve telemetry retention/data residency/access, usage budgets, support access and incident/breach procedures. Local catalog/KPI-readiness checks are not live SLO evidence.

### I. Domain ownership, provider governance and intentionally unused services

**Owner: client/product/security. Priority: P0 for required services.**

Confirm billing owners, MFA/admin recovery, approved subprocessors/DPAs, privacy disclosures, renewal dates and emergency contacts for AWS, Supabase, Stripe, Resend, Google Cloud, Apple, Sentry and Grafana. Include registrar/DNS ownership and the working support mailbox. Do not assume all credentials belong permanently to a developer account.

`POSTMARK_SERVER_TOKEN` and `LEDGER_ANCHOR_URL` appear in old configuration; Postmark is not the active email provider and setting a ledger URL does not implement a provider. Generic outbound webhooks/SNS are conditional, not mandatory new vendors. Inventory any enabled OAuth or other client-managed service before launch; do not provision integrations solely because an obsolete example variable exists.

## 6. Production configuration handoff

Use placeholders below until the client chooses `.dev` versus `.com`. `<APP>`, `<API>` and `<VERIFY>` are not deployable values. Record a reviewed manifest outside plaintext secret files.

| Configuration family | Production requirement |
| --- | --- |
| Environment | `APP_ENV=production`, supported runtime with `NODE_ENV=production`; explicit production telemetry env/release; debug/test/mock paths off |
| Routing | `API_BASE_URL=<API>`, `APP_BASE_URL=<APP>`, `WEB_APP_URL=<APP>`, deliberate `PUBLIC_VERIFICATION_BASE_URL=<VERIFY>`; exact `AUTH_ALLOWED_ORIGINS` and `CORS_ALLOWED_ORIGINS`; auth/invite/contact/payment/verification links and asset origins agree |
| Supabase | Production URL, anon/public key, service-role key, applicable JWT validation settings, DB connection/SSL/pool and private bucket names; no staging host/key in production |
| Queue | Production `REDIS_URL`, `DISABLE_REDIS_QUEUES=false`, isolated `BULLMQ_KEY_PREFIX`; runner/concurrency/retention settings documented |
| Stripe | Validated mode setting **to be implemented**, live key and webhook secret, production return URL, approved catalog/portal mappings; `BILLING_ENFORCEMENT_MODE=enforced` only after acceptance; real acceptance evidence; iOS purchase gate tied to approved distribution |
| Email | `NOTIFICATION_PROVIDER=resend`, production key/webhook secret, sender/from/reply-to and strict failure behavior; review provider rollout/allowlist controls |
| SMS | Production hook enablement/secret, explicit origination identity/region/message policy; general SNS remains disabled unless deliberately required and tested |
| Push | APNs key/team/bundle/private key, correct distribution endpoint, enabled provider/allowed app environments/rollout; separate device-token data from beta |
| Maps | Restricted `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, appropriate libraries/enablement, backend-only `GOOGLE_MAPS_SERVER_API_KEY` and server-geocode flag |
| Telemetry | Sentry DSN/env/release/sampling and CI upload credentials; OTLP endpoint/auth/protocol if retained; no local-only config assumption |
| Ledger | No stub allowed in real production; either real provider with proof verification or implemented, approved hash-only completion mode |
| Web/iOS build | Web public values are baked into the image; iOS values into the archive. Rebuild with reviewed production inputs. `with-local-next-env.mjs` can fill missing public values from `.env.staging` locally; production builds must fail on missing inputs instead. Never assume updating an ECS runtime secret rewrites a shipped bundle. |

Callback checklist: Supabase auth returns; `POST <API>/webhooks/supabase/auth/send-sms`; `POST <API>/webhooks/resend`; `POST <API>/webhooks/stripe`; Stripe Checkout/Portal returns; production AASA invite/document/session/billing routes; any explicitly enabled OAuth console callbacks.

## 7. Ordered execution roadmap

P0 = required before opening the relevant production surface. P1 = must close before increasing exposure, or receive a named, dated, expiring acceptance with a real mitigation. Proposed roles below must be assigned to people. No calendar estimate is reliable until the ledger/migration/legal decisions are made.

### Phase 1 — Non-negotiable production hardening

**Current closeout, superseding the historical paragraphs immediately below:** secure access, identity encryption, hash-only finalization, PDF-restoring backups, billing continuity/crash recovery and AWS source-to-alert recovery are implemented and demonstrated. Actual browser MFA and email OTP pass. The final workflow-projection fix passed its consolidated gate, ten crash drills, exact CI/deployment and live regression checks. Remaining acceptance is limited to: **(1)** physical-device/cross-device and full CA/OH Trust/POA/upload content review, **(2)** real SMS delivery to an explicitly authorized operator number, **(3)** exact policy/specimen/commercial and team lifecycle approval plus final production decisions. Branch protection and Sentry remain explicit deferrals. Final production provisioning is Phase 2–4, not an unimplemented staging control. These distinctions do not waive the original human/release gates.

**23 September consolidated pass (local date: 22 September):** implementation batch completed; final local gate passes **701 backend tests / 99 files, 72 web tests, 28 recovery/monitoring/workflow checks**, builds/typechecks/catalog/KPIs and separate web production build. Real Stripe upgrade preserves nonzero usage (10 total / 1 used / 9 remaining). Recovery now proves new PDF generation as well as restored reads, interrupted-generation fail-closed behavior and 32 real authorization requests. Deployment verification for this batch is recorded in [the final-pass evidence](phase1-final-pass-2026-09-23.md). This records completed work without silently waiving the remaining device, legal, incident-source and cross-track acceptance below.

**Latest verified deployment: `d120826` (23 September 02:01 UTC / 22 September local).** Exact-revision CI and staging rollout passed, API107/worker93/web65 are 1/1 with completed rollouts, readiness and three genuine watchdog heartbeats pass. Both API/worker task definitions set `OTEL_SDK_DISABLED=1` with no conflicting secret entry; all eight operational alarms remain enabled and OK. The cumulative pass closed deployed retry/MFA/refresh, protected all 44 approved legacy identity copies, verified delayed/duplicate Stripe recovery and nonzero-usage upgrade, and reconstructed authenticated PDF reads plus selective generation and held/signer access from backup. Remaining unchecked items below are acceptance gaps, not a claim that those completed implementations are still undeployed. Production remains unopened.

**Goal:** prove that only authorized people can act, completed documents tell the truth, lost PDFs can be restored, payments cannot corrupt entitlements or accepted work, and failures reach someone who can recover them.

This is the first substantial delivery phase. It absorbs the former decision kickoff and pulls backup/restore, billing failure acceptance and actionable monitoring forward from later phases. Keep the implemented product/billing screens; fix and verify the underlying controls. A green build or a new dashboard alone does not complete this phase.

#### 1.0 — Resolve essential decisions and establish the baseline

- [x] Record the starting/current revisions, migration inventory, active configuration, damaged-beta exceptions and evidence gaps. Staging has all 101 migrations; customer artifacts are excluded from destructive drills.
- [x] Record the launch direction: CA/OH in-person products, member-only billing, no Dynamic POA/notary billing, fresh production data with beta preserved separately.
- [x] Resolve the requested engineering decisions: genuine hash-only launch; protected identity with no automatic deletion; RPO 24h/RTO 4h; recovery budget up to $15/month; public status/hash verification without public PDFs; Sentry deferred.
- [x] Assign Jorge (`lopezb.jl@gmail.com`) as sole alert responder and confirm the recovery/email route. Lack of secondary coverage is an explicitly recorded limitation.
- [x] Assign Jorge (`lopezb.jl@gmail.com`) as policy reviewer and prepare the [review checklist](production-policy-review-package-2026-09-22.md).
- [ ] Confirm production domains, concurrency and App Store scope. Obtain exact document, retention/legal-hold and commercial approvals. Reviewer assignment is not legal approval; final CA/OH specimens still need review.

Unrelated work can continue while a decision is pending, but do not invent legal retention periods, overwrite artifacts or silently change finalization/payment policy to complete the checklist.

#### 1A — Secure access and sensitive-data boundaries

**Owner:** auth/backend + security/privacy. **Maps to:** PROD-03, PROD-04, PROD-05; Supabase authorization and identity controls.

- [x] Implement verified matching-recipient invite claim/token/assignment/audit transactions. Isolated wrong-email/unverified/expired/revoked negatives, audit rollback and 20 concurrent idempotent claims pass.
- [x] Implement current-grant/session authorization, reject metadata-based service-role escalation and prevent revoked-role resurrection. Deployed genuine login, invalid JWT, ungranted notary/admin, role revocation/restoration and real/global logout tests pass.
- [x] Pass isolated SQL/Storage/Auth boundary suites and deployed cross-member billing RLS. Six new Phase 1 RPCs deny anon/authenticated execution and permit only service role.
- [x] Implement AES-256-GCM protected identity storage, restricted transaction RPC, no plaintext fallback and new-write metadata minimization. SQL envelope/actor/grant/provenance/audit-rollback tests pass; key is configured for staging.
- [x] Implement shared Redis rate limits, public-error/token-path redaction and API/browser safety headers. Move runtime to Node 24/non-root containers; candidate native-PDF checks and HIGH/CRITICAL image scans pass, and deployment scans/pins shipped digests.
- [x] Require signed AAL2 plus recent TOTP evidence for human billing support mutations; do not count token refresh as recent MFA.
- [x] Prove a scoped deployed held-document matrix: anonymous/unrelated member/wrong-notary denied; owner final-version listing hidden; selected notary context and admin access allowed; direct Storage URL minting denied even for owner/notary JWTs. Real MFA enrollment, AAL1/member rejection, reason validation and actor-bound idempotent usage reversal pass. All six temporary privileged fixtures revoked; sessions globally logged out.
- [x] Complete the deployed seven-role read matrix: **98 requests** across document, versions, review, signing, generation outputs, request and notary context in held/released states; direct Storage denied for all human JWTs, revoked signer denied, public metadata-only boundary and unchanged exact bytes. Complements isolated service/worker, atomic invite and legacy notary-code coverage recorded above/below; no claim of physical-device acceptance. Synthetic grants/sessions cleaned up.
- [x] Complete the recovered production-shaped extension: 32 real Auth/API/Storage requests cover owner/bound signer/revoked signer/selected and wrong notary/admin/anonymous, held artifacts, direct Storage denial and legacy-code assignment takeover denial. Controlled release exposes the same bytes. Tighten signer resolution so a claimed-looking row without the exact bound user never grants access. This complements deployed checks above; it is not a physical-device or every-route hosted test.
- [ ] Complete actual-device expiry/concurrent-refresh/cross-device/network-loss acceptance; preserve the existing mobile refresh/profile fixes.
- [x] Freeze, rehearse/rollback and apply the approved **44-copy legacy identity backfill** (22 check-ins/22 verification events). All encrypted values decrypt correctly, plaintext identifier metadata count is zero, 44 dedicated audit entries exist, and eight complete evidence/document table sets plus unrelated metadata remain unchanged. Existing update timestamps advance normally. No PDFs, signatures, acknowledgments, GPS, notes or retention periods changed; no deletion enabled. Historical KMS-protected backups still retain their original data.
- [ ] Accept the remaining retention/legal-hold treatment across GPS, caches, metadata and logs. No automatic deletion until approved.
- [x] Deploy shared web authenticator enrollment/verification and non-billing admin mutation step-up. Actual AAL1 team mutation denied before any write; genuine recent TOTP passes the boundary to input validation. Twelve unit cases and the integration rejection pass. Actual concurrent refresh produces two usable tokens; real global logout rejects both before expiry. This is API acceptance, not physical-iPhone or complete operator-UI acceptance.
- [x] Prove shared abuse controls on two isolated real API replicas/one Redis: 30 concurrent auth attempts yield exactly 20 validation responses and 10 shared 429s; spoofed forwarding headers cannot bypass the counter. Both fail closed (503) on Redis loss. Allowed/untrusted Origin and API no-store/nosniff/frame-denial checks pass.
- [x] Complete actual deployed operator browser MFA interaction: enrollment, invalid-code rejection, TOTP/AAL2, cleared setup key and protected-action authorization to validation. Temporary factor/admin grant/session removed.
- [ ] Accept actual production-origin/CSP configuration using the final provisioned domains in Phase 2–4. Staging browser/API checks do not certify nonexistent production DNS.

**Exit evidence:** automated negative authorization/RLS tests, wrong-email/concurrent-claim tests, session/revocation scenarios, sensitive-data/log inspection and retention/hold tests pass. No unresolved authorization bypass, unreviewed critical finding or reachable unmitigated high exposure. Any other accepted security risk has a named approver, concrete mitigation and expiry.

#### 1B — Truthful finalization and durable legal evidence

**Owner:** document/backend + product/counsel. **Maps to:** PROD-02, PROD-06; finalization/public-release controls.

- [x] Implement hash-only completion independent of simulated anchoring, distinct finalized/anchored states, client/copy changes and exact-byte hash requirements. Staging API/worker run `hash_only` with stub disabled.
- [x] Implement non-overwriting finalization uploads, byte read-back, material-state audit controls and immutable render provenance. Isolated concurrent output/completion, wrong-actor, partial-package and injected-audit-failure rollback tests pass.
- [x] Preserve the encrypted-PDF fix; implement native input/page/concurrency limits and independently validate transformed PDFs. ARM64 read-only/non-root runtime tests cover normal/protected PDFs and malformed rejection.
- [x] Deploy and verify the public status/hash-only boundary: anonymous and authenticated CA/OH probes expose no filenames, PDF previews or signed URLs. Public web viewer removed; backend/web leakage regressions pass. Authorized in-app held/private access remains separately gated below.
- [x] Classify historical beta exceptions and apply only the authorized additive correction: 194 exact-byte/readable hash attestations; eight legacy final files left unverified. No PDFs/signatures/acknowledgments/old receipts changed. Preserve all 50 historical PDF readability exceptions separately from fresh production.
- [x] Prove one synthetic uploaded-PDF finalization after membership lapse: actual deployed notary endpoint creates readable hash-only final bytes and a billing hold; real Stripe test reactivation releases the exact same version/SHA-256. Session/acknowledgment prerequisites were explicitly seeded test scaffolding, not a real legal IPEN session.
- [x] Fix completed-package retry locally: resolve the completed assigned request, verify existing evidence/bytes and return it without re-holding/re-rendering. Six authorization regressions and a real staged-fixture service check preserve six full-row evidence/billing sets exactly.
- [x] Deploy/retest completed-package retry through the real API at `d166019`: assigned notary 200, wrong notary 403, six full-row evidence/release sets unchanged. Returned final bytes/version remain the previously approved package.
- [ ] Complete CA/OH Trust, POA and uploaded-document composition/content review and end-to-end web/Apple PDFKit acceptance, including signing/no-signing variants and hidden trust artifacts.
- [x] Complete storage/database/crash/partial-package and resource-limit drills: CA/OH × five interruptions (10 cases), 20 native-validated final outputs, unchanged committed/source bytes, pending-release recovery, duplicate retries unchanged; >50 MiB and >200-page rejection. Apple PDFKit representative checks pass. See [closeout](phase1-acceptance-closeout-2026-09-23.md); synthetic prerequisites are not legal acceptance.
- [x] Prove selective real rendering after backup restore and Redis-delivery reconstruction; duplicate processing preserves the version/bytes. Abrupt process exit immediately after actual Storage upload but before version creation leaves the run for operator triage, with no published version or false release. Preserve original customer notification/payment/release fingerprints; do not infer this generation-specific proof covers every finalization or Stripe interruption point.
- [x] Prove finalized/held/released transitions across the seven authorized read surfaces, retries and billing reactivation: 125 isolated plus 98 hosted requests, native validation, unchanged version/hash/usage and revoked-signer denial. Fix the signing-route final-file leak found by this matrix. Physical-device/full-product-content acceptance remains the separate item above; no historical PDF repair authorized.

**Exit evidence:** CA/OH Trust, POA and uploaded-document paths (with/without signing) produce readable, correctly composed outputs on Apple PDFKit and web; byte/hash checks and injected-failure recovery pass. No false “completed,” “released” or “anchored” state; no silent loss of material audit evidence. Any existing-artifact corrections remain separately authorized and versioned.

#### 1C — Backups that restore actual PDFs

**Owner:** platform/backend + privacy. **Maps to:** AWS-09; Supabase database/object recovery.

- [x] Implement database plus actual Storage-byte/key backups with consistent read-only snapshots and version/path/size/SHA-256 manifests. Verified TLS, private versioned S3, KMS and scoped independent writer/reader roles are provisioned within the approved recovery stack.
- [x] Perform two independent reader-role component restores: 2,474/2,474 object checksums each; database/object identities preserved; 229/229 completed hashes match exact bytes. Record 2,346 readable PDFs, 50 source exceptions and one unmatched app/Auth identity without declaring a clean application restore.
- [x] Enable short-lived automatic backups at 02:00/14:00 Mexico City; verify real scheduler dispatch and subsequent complete snapshots. Latest checked snapshot contains 2,533 objects.
- [x] Configure/test recovery failure and missing-backup alert routes; recipient confirmation recorded, both alarms returned to OK. Publish recovery runbook, prerequisites and component timing evidence; no automatic retention deletion enabled.
- [x] Independently restore the 22 September 20:00 snapshot: **2,533/2,533 exact object checksums**, 2,405 readable PDFs and the same 50 preserved source readability exceptions. Reconstruct isolated Auth, PostgREST, native file Storage, gateway, API, Redis and quarantined worker; actual login/unchanged owner mapping, owner/anonymous/unrelated API boundaries, exact final PDF retrieval, blocked direct member Storage URL minting, safe public verification and denied network egress pass. Missing-object/corrupted-copy injection detects failures and preserves version/hash/release rows. Outbound provider processing remains disabled; no customer messages, charges or source-file changes.
- [x] Stop only the restored worker, allow its heartbeat to expire naturally, observe readiness 503, restart and recover readiness 200; durable notification/Stripe/generation rows remain unchanged. Verify the independently recovered encryption key decrypts all 44 newly protected staging values against the exact older values in the isolated backup. Those post-snapshot ciphertext rows are not falsely described as already present in that older snapshot.
- [x] Recheck nine complete scheduled manifests from 18 September 20:00 through 22 September 20:00 UTC at approximately 12-hour spacing, within the 24-hour RPO target. The restored snapshot was about 3h24 old at functional acceptance. This is a measured window, not a guarantee of future recovery. Complete queue-resumption RTO remains open below.
- [x] Complete the restored held/signer access matrix and selective queue/job reconstruction. Eight functional checks, three queue/interruption groups and 32 access requests pass. Hard recovery quarantine excludes provider credentials and disables provider/outbox runners regardless of individual flags. Only new labeled fixture runs are selectively processed; historical customer/payment queues remain quarantined for reconciliation.
- [x] Measure the complete controlled exercise from restore start at 22 September 22:44:25 UTC through final access acceptance at 23 September 00:30:03 UTC: approximately **1h46**, including compatibility debugging, within the 4h target. Snapshot age at start approximately **2h44**, within 24h; nine scheduled manifests independently establish the observed backup interval. This proves selective quarantined application resumption, not blind replay of historical external effects or a guarantee of future RPO.
- [ ] Accept retention/cost/credential-rotation policy and stronger separate-account production isolation. Production provisioning must repeat the actual recovery proof with its final credentials/configuration.

**Exit evidence:** a completed restore report with snapshot identifiers, restored object counts, checksum comparisons, actual PDF readability/access checks and measured RPO/RTO. Missing objects or mismatched hashes fail the drill. An already-corrupted source needs recorded correction—not a backup label declaring it healthy. A configured backup schedule without a successful restore does not pass.

#### 1D — Payment correctness and accepted-work continuity

**Owner:** billing/backend + product/finance. **Maps to:** PROD-01; Stripe lifecycle/usage/release recovery.

- [x] Implement application/SQL live-test boundaries, catalog/environment/idempotency separation and live activation guard. Forward migration and isolated cross-environment negatives pass; no real charge/live entitlement activated.
- [x] Retain implemented web/iOS paywall, active-plan/settings and allowance experiences. Pricing/features remain member-only; notaries and invited signers are not payers.
- [x] Prove deployed Checkout creation/idempotent reuse/expiration, paid subscription, failed payment, action-required and cancellation webhooks using isolated fixtures. Terminal memberships deny new-workflow eligibility; cross-member subscription RLS passes.
- [x] Fix and deploy the Stripe downgrade contract. Actual API returns 202, reuses requests, preserves current 10-unit allowance and schedules Starter at renewal. Prior fixture-only clock rollover synchronized the 3-unit next period through the deployed worker.
- [x] Record **15/15 actual lifecycle evidence categories**; the deployed report derives acceptance ID `stripe-observe-ca05ebe96a55eee1`. No marker was manually inserted. Some Checkout/product/upgrade evidence is historical; category coverage does not prove every scenario this pass.
- [x] Complete the missing **final-package billing hold and controlled usage reversal** categories. Actual paid fixture → lapse → finalized hold → real reactivation webhook → same-byte release; genuine enrolled TOTP reversal repeated safely with one minus-one usage event and exact actor.
- [x] Fix clock-aware provider reconciliation locally: directly retrieve known same-environment IDs absent from the general list; only explicit provider 404/resource-missing preserves the missing alert, while outages/auth/rate limits fail the report. Nine new regressions cover omission, real missing IDs, mode/account mismatches, failure handling, deduplication and offline mode. All 626 backend tests and read-only staging reconciliation pass.
- [x] Deploy the reconciliation fix in `c5acd9b` and reverify through a real admin session: complete provider scan, zero issues/backlog. No genuine missing-subscription alert was suppressed.
- [x] Exercise delayed/out-of-order/duplicate replay, last-unit concurrency, expired worker-lease recovery and operator repair of an intentionally stale synthetic cancellation projection. Real deployed worker reclaims the interrupted synthetic event exactly once, processes it, retains canceled provider state and leaves usage unchanged. This tests the persisted crash state without killing the shared staging worker.
- [x] Complete a fresh deployed Starter → Plus upgrade with nonzero usage: actual uploaded-document review consumes one unit, real plan-change/webhook yields **10 total / 1 used / 9 remaining**, original billing period and all usage rows preserved, duplicate change safe. Synthetic subscription canceled and session logged out afterward; no client subscription changed.
- [x] Complete abrupt mid-effect Stripe crash acceptance: actual process exit after subscription projection, during partial held release and before event resolution; natural lease expiry/retry, duplicate claim rejection, original usage and finalized bytes preserved. Provider transport synthetic inside the isolated clone; complements real hosted lifecycle evidence. See [23 September closeout](phase1-acceptance-closeout-2026-09-23.md).
- [x] Deployed last-unit concurrency: four simultaneous real review approvals on a three-unit Starter fixture yielded exactly three 200s, one 409 limit rejection and three consume records. Approved-document retries consumed nothing extra; exhausted eligibility denied new work. Delayed/out-of-order and expired-lease recovery subsequently passed; abrupt mid-effect interruption remains open above.
- [x] Prove accepted-work continuity in the isolated production-shaped API: actual review, both signatures after lapse, assigned-notary review/session/identity/acknowledgment/completion; held final, same-byte reactivation and unchanged single usage. **125 requests** cover seven read surfaces × seven roles × held/released, direct Storage denial and public verification. Fix the held-final leak discovered in signing reads. Realtime and physical co-presence are not simulated as passed; hosted matrix completion remains separately listed in 1A.
- [x] Test operator replay/resync/release/reversal through authorized, recently reauthenticated, reason-bound, audited actions; reconcile Stripe and DARCi state using the deployed operator API. Deliberate fixture-only stale-state injection was separately audited; repair used actual MFA-protected resync, not an ad hoc repair. Notaries and invited signers remain outside the payer/allowance model.
- [x] Actual deployed operator resync, duplicate held-release retry and controlled reversal pass with recent TOTP. Subsequent delayed replay, stale-projection repair and expired-lease recovery also passed; broader mid-effect interruption cases remain distinct.
- [x] Actual deployed operator replay/out-of-order drill: genuine TOTP admin replays subscription-deleted, then delayed subscription-created, then duplicate created. Provider-authoritative state remains canceled; no usage rows change; all three reason-bound audits record the exact operator. AAL1 is rejected; temporary role/factor/session removed. Stale-projection resync and expired-lease worker recovery subsequently passed; abrupt mid-effect interruption remains a distinct open scenario.
- [x] Test environment/key/webhook mismatch rejection and activation prerequisites: genuine Stripe signature verification rejects opposite-mode events, wrong endpoint secret and altered raw bytes before persistence; production rejects test entitlement mode and staging rejects live mode. Live keys alone cannot activate live processing. Held/pending finals stay denied in both observe/enforced modes, accepted work continues after lapse, and released evidence remains unchanged.
- [ ] Accept customer terms/held-package policy and final production rollback/pause procedure before activation. No live payment or policy approval inferred from test-mode acceptance.

**Exit evidence:** complete staging lifecycle evidence plus concurrency/outage/recovery results, environment-mixing rejection tests and clean reconciliation after recovery. Public production key/catalog/webhook activation and an explicitly authorized real-payment smoke test occur in Phase 3; those do not justify postponing correctness tests until launch.

#### 1E — Actionable alerts and operator recovery

**Owner:** platform/on-call + auth/billing/document owners. **Maps to:** AWS-08; Resend delivery evidence; Sentry/Grafana operations.

- [x] Implement separate liveness/dependency readiness and recent Redis worker heartbeat; deployed health/ready checks pass with database/configuration/protected-key/Redis/worker checks.
- [x] Repair staging Resend callback configuration; signed callbacks succeed, provider sent/delivered events arrive and Jorge confirms the controlled test email. No client email used.
- [x] Provision/version recovery alert routing/runbook and prove controlled task failure → queue → alarm → SNS action plus recovery. Jorge confirmed the recovery route; sole-responder limitation is recorded.
- [x] Maintain catalog/runbooks/correlation/redaction tests: 44 catalog entries, 43 emitted codes, eight declared rules and five declared owners validated. Declared rules are not proof all provider detectors are installed.
- [x] Install versioned staging CloudWatch category metrics/alarms using existing confirmed SNS routing, within the separately approved $6/month monitoring allowance. Synthetic category signals crossed actual thresholds and all seven SNS actions succeeded; Jorge confirmed receiving the email batch. All seven category alarms naturally returned to OK. No fake watchdog success was emitted.
- [x] Implement/test local independent sanitized critical signals and bounded durable-queue/readiness watchdog; preserve Sentry deferral. Add monitoring infrastructure safety tests to server CI and publish [the operator runbook](production-operations-runbook.md).
- [x] Resolve the detector's historical backlog with explicit authorization: cancel exactly 21 abandoned April/May generation runs, insert 21 audit entries and preserve all 13 underlying documents and related evidence/billing/notification records. No PDFs changed, notifications sent or automatic regeneration requested; no queued/rendering runs remained after the transaction. This does not replace future failure/recovery acceptance.
- [x] Trace three synthetic notification retries to provider `deferred` callbacks incorrectly requeueing accepted emails; fix locally and add status plus webhook-to-worker no-resend regressions. Full backend suite now passes 663 tests.
- [x] Deploy the provider-deferral fix at `d166019`; subsequent source scan reports zero overdue notifications and zero recent failed jobs. Two operator-signed delayed-delivery callbacks with the same event ID were submitted to the deployed endpoint for an existing labeled `example.invalid` fixture. After 75 seconds (longer than the default worker poll), no additional application send attempt/delivery appeared and the job stayed outside the sending queue. This is a controlled callback drill, not a claim of a new actual provider delay. No client email or manual notification-state rewrite.
- [x] Deploy independent source emitters/watchdog, verify genuine heartbeat metrics, then enable missing-heartbeat actions using the guarded infrastructure script. All **eight alarms enabled and OK** on live recheck. No success metric or forced alarm state fabricated.
- [x] Prove originating failure/recovery paths for auth, audit, platform, notification, billing, retention and PDF processing in an isolated real runtime; captured signals traverse staging filters/alarms/SNS and naturally recover. This proves the named instrumented paths, not every possible provider incident. See [closeout](phase1-acceptance-closeout-2026-09-23.md).
- [x] Complete the seven instrumented critical-source/category and queue-threshold recovery drills: captured actual runtime failures traverse staging filters/metrics/alarms/SNS; all seven alarm and recovery actions succeed, all eight alarms naturally return to OK. Earlier Jorge-confirmed delivery establishes the recipient route; this pass proves source paths and correlated recovery, not a fresh human inbox acknowledgment or every possible provider incident.
- [x] Resolve OTLP configuration: Jorge explicitly approved disabling it. Deployed API `104` and worker `90` both set `OTEL_SDK_DISABLED=1`, with no conflicting secret injection. Exact images, readiness, three new-worker heartbeats and all eight enabled/OK alarms verified at 23 September 00:46 UTC. Sentry remains deferred.
- [x] Complete isolated delivered/deferred/bounced/suppressed callback persistence, duplicate-event and no-resend proof. Fix terminal retry cycling and rehearse/apply the missing suppression-event allowlist without changing existing events. Prior actual Resend delivery remains accepted.
- [x] Complete real email OTP delivery/cooldown/wrong-code/success/replay acceptance: one operator-owned alias email reported delivered by Resend; repeated start sends no extra message, wrong code/replay 401, correct code 200, session logged out. Provider-outage controller returns 503 without forcing valid-session logout.
- [x] Confirm actual operator SMS receipt. The initial 23 September 02:22 UTC request was not received; Jorge explicitly authorized one retry at 03:21:55 UTC and subsequently confirmed **“code arrived!”**. No account reassignment. See [SMS acceptance evidence](phase1-sms-acceptance-2026-09-23.md).
- [ ] Complete remaining phone-login and failure acceptance: successful in-app verification, wrong/expired/replayed-code and linked-email step-up where applicable, and provider delivery/failure correlation. Receipt alone does not establish the first attempt's failure cause or all phone-auth behavior. Version final production destinations with production provisioning.
- [ ] **Deferred by Jorge:** Sentry provider rules, release attribution and symbolication. Not passed/waived; revisit before relying on Sentry in production. Secondary responder remains explicitly absent, not an unanswered question.

**Exit evidence:** an alert exercise log showing injected incident, detection/notification timestamps, recipient, correlation, action taken and recovery. Every critical failure category reaches a responsible person with enough context to act. Production-specific destinations/thresholds are installed and rechecked in Phases 2–3, not invented for the first time there.

#### Integrated Phase 1 delivery and exit gate

Recommended sequence: establish the baseline/owners and early alert visibility; implement access and finalization foundations; finish payment isolation/recovery; run restore and cross-track failure drills; then close the gate. Tracks may overlap, but are accepted as one hardening release.

- [x] Implement/pass backend, web tests/typecheck/lint/build, shared types and isolated migration/SQL/Storage/Auth CI jobs. Fix standalone web typechecking and unintended provider calls in route mocks. Pass generated-project iOS 110-unit/12-UI baseline separately; preserve security/PDF/billing/accessibility coverage.
- [x] Repair deployment validation: exact-SHA server CI, early schema/key preflight, parallel image builds/scans, scanned-digest rollout and last-successful-rollout change detection. iOS is independent. Latest server CI/deployment succeed at `c5acd9b`; the independent iOS run also passed. Current uncommitted iOS optimization work belongs to the separate task and is preserved.
- [x] Apply the exact eight reviewed staging migrations after backup verification; preserve whole-row fingerprints across 16 evidence/billing tables. Package/deploy hardening plus downgrade fix and record acceptance evidence.
- [x] Commit/deploy final engineering batch `cbc19b9`: [CI 35802935651](https://github.com/jllb89/darci/actions/runs/35802935651) and [staging deployment 35802935650](https://github.com/jllb89/darci/actions/runs/35802935650) pass. Verify running scanned image digests, explicit OTLP disablement, readiness and operational alarms. Preserve separate iOS-workflow changes outside this commit. Stop the 20 local recovery containers created in this batch; retain their private evidence.
- [x] Verify final follow-up **`d120826`**: exact CI/deployment pass, API107/worker93/web65 completed 1/1, scanned digests/readiness/three real heartbeats/eight alarms pass. Deployed retry preserves six evidence sets, MFA and concurrent refresh/logout pass, reconciliation clean. Separate iOS-workflow files remain excluded. Two disposable recovery stacks stopped and receipts retained.
- [ ] Complete the explicit physical-device, SMS and human/release acceptance before marking the entire Phase 1 accepted.
  - **Explicitly deferred by Jorge, 22 September:** leave `master` settings unchanged. Live checks found no branch protection or repository ruleset. CI gates deployment, but protected merging/independent release review is not claimed.
- [x] Run the integrated synthetic accepted-work exercise: actual PDF failure during session completion leaves evidence unreleased and usage unchanged; retry completes/holds, reactivation releases exact bytes. Correlation `ebbd74d8-79f3-4de7-8c7d-9a01dcd27399` reaches the established owner SNS route: ALARM/action **01:49 UTC**, natural OK/action **01:54 UTC**. No forced alarm state; source injection isolated, captured signal explicitly synthetic. Human acknowledgment of this particular email is not asserted.
- [x] Produce the [five-track engineering closure register](phase1-acceptance-closeout-2026-09-23.md), with owner, exact deployed revision/environment, tests/drills and explicit remaining acceptance. Historical final-pass notes link to it rather than reopening passed work.
- [ ] Obtain reviewer acceptance for the remaining human/policy/product gates. A required unapproved decision is not silently waived; this record is not production launch authorization.

**Phase 1 exit:** all five controls are implemented and demonstrated in a controlled production-shaped environment; required CI is green; no unresolved integrity/auth/payment blocker. This approves advancement to production provisioning—not public traffic, live charges, data migration or legal/App Store approval. Later phases repeat the critical proofs against actual production configuration rather than deferring their implementation.

### Phase 2 — Provision and rehearse isolated production

Current detailed evidence: [Phase 2 execution record](production-phase2-execution-2026-09-23.md). Completed foundations do not mark the broader gates below passed. **Latest routing update:** Namecheap access is available; both certificate CNAMEs resolve correctly and AWS ACM has issued the app/API certificate. Production app deployment and routing are now authorized; signup and live payments remain closed during acceptance.

- [x] Confirm initial production budget ($350/month planning envelope), existing-account isolation and `illuminotary.com` domain; preserve beta separately.
- [x] Provision separate two-zone VPC/private networking, empty production ECS cluster, immutable image repositories and authenticated private Valkey cache.
- [x] Create fresh production Supabase, apply the exact 103 clean-rehearsed migrations and verify no beta/customer/provider data was imported; keep signup/sale/provider activation closed.
- [x] Store separate production machine credentials and encryption material; create the production recovery vault and demonstrate real private-network backup task success plus exact-version empty-database/key recovery.
- [x] Enable the production backup schedule and backup-failure alerts after the successful task. Install eight application detectors with actions disabled pending actual app deployment; install the $315 tagged-AWS budget alerts ($35 reserved for Supabase). Scheduled cadence, full cost coverage and application alert acceptance remain open.
- [x] Create the GitHub production approval environment (Jorge, master only), without changing master branch protection. Offline release-manifest validation and infrastructure regression checks implemented.
- [x] Validate Namecheap DNS records and issue ACM certificate for `app.illuminotary.com` and `api.illuminotary.com` (issued 23 September 04:33 UTC).
- [x] Deploy production API (2), web (2), document worker (1), valid HTTPS, production-origin CORS and approved-operator-only access; preserve closed signup/provider/payment gates. Verify initial real dependency readiness and unauthorized-request denial.
- [x] Rehearse/apply migration `20260923050000` to fresh production: separate namespace selection from payment approval; reject test entitlements and unapproved live writes; retain owner-only activation. Full local SQL billing regression and fresh-schema checks pass.
- [x] Verify healthy worker/watchdog signals and enable all eight production operational alarms; all read back OK.
- [x] Create approved machine-only release roles and document deployments/environment configuration. Workflow published in `4f29c95`, hardened in `442baee`; approved actual GitHub OIDC run **35894433475** passed.
- [x] Complete corrected-image native PDF scratch/render smoke and healthy running task/digest readback; verify access denial from a non-operator IP. Verify the new 104-migration backup through exact-version checks and actual network-isolated database reconstruction.
- [x] Commit/publish the approved production workflow (`4f29c95`).
- [x] Implement/test stronger image-only release verification locally; validate current production's actual running digests read-only. Exact image, configuration, rollout and task-health regressions pass. [Evidence](production-release-verification-2026-09-23.md).
- [x] Publish the verification changes and apply the scoped production ECS read permissions before exercising the protected workflow (`442baee`).
- [x] Exercise actual GitHub OIDC promotion: approved production run **35894433475** passed and saved its verified exact-image/configuration receipt.
- [x] Complete the approved application-health-triggered failed-release rollback drill: API-only 503 candidate, actual target-health failure and circuit-breaker event, automatic stack rollback and exact image/configuration recovery verified **17:54 UTC, 23 September**. Twelve sampled requests were HTTP 200; both original API tasks stayed healthy. No manual recovery or data/provider changes. [Evidence](production-release-verification-2026-09-23.md).
- [x] Replace the approved operator-only `/32` after Jorge changed networks; remove old ingress, preserve private routing and remove temporary execution permissions after the stable CloudFormation update.
- [x] Recover approved unsigned synthetic production PDFs, database/Auth/Storage/API/key access and selected generation-worker behavior using exact deployed images. Three objects, six pages, ten functional checks and three queue checks pass; source remains unchanged. [23 September evidence](production-recovery-acceptance-2026-09-23.md).

- [ ] Complete AWS-01–09 and production Supabase, without moving customer traffic.
- [x] Create reproducible task/secret/config manifests, production domain/TLS routing and protected release workflow; actual protected release and rollback acceptance passed.
- [x] Rehearse clean migration/reference-data bootstrap and apply the additional production-only backend-table access fix with unchanged-row evidence. Verify private buckets, public-table RLS coverage and hosted anonymous/backend boundaries. See [23 September hardening evidence](production-provider-hardening-2026-09-23.md).
- [x] Complete the hosted owner/unrelated/assigned-notary/wrong-notary/admin API, direct Storage, private Realtime/queue, actual TOTP and revoked/logout-token acceptance. Fix the discovered Realtime RLS defect with production-only migration `20260923210000`; preserve row/PDF contents and revoke temporary fixture privileges. [23 September evidence](production-phase23-acceptance-2026-09-23.md).
- [ ] Complete remaining signer/held-release/device and already-open connection behavior; the bounded hosted matrix is not proof of every policy or product combination.
- [x] Install production-only WAF and retained private CloudTrail management archive; verify a real blocked request, unchanged readiness/callback validation, log delivery and first digest validation.
- [x] Install ten sustained production capacity/availability alarms with names accepted by the existing SNS policy; no initial OK-message spam. Real-source acceptance of each new detector remains open.
- [x] Restrict direct production database/pooler access to the two NAT egress addresses and current operator, then prove backup still runs and all three exact PDFs remain recoverable.
- [x] Install production backup/monitoring controls and complete the isolated unsigned-fixture database/object/application/worker recovery drill.
- [x] Verify the first automatic 02:00 Mexico City production backup and independently recover its three exact, readable PDFs plus database archive index (23 September). This is not yet consecutive-run or production-volume acceptance.
- [x] Confirm two consecutive scheduled production backups at 02:00/14:00 Mexico City on 23 September, complete manifests and successful Scheduler task provenance. The second manifest inventories six objects; the 18:50 on-demand run was not counted as scheduled cadence.
- [ ] Complete representative-volume recovery/RTO acceptance and a newly scoped/approved expanded restore. The second full restore command was safety-blocked because it also downloads database/key material; only its manifest metadata was fetched afterward. Prior three-PDF recovery evidence remains valid, not repeated or expanded by this check.

**Exit:** private production candidate healthy through dependency checks; release/rollback and restore evidence attached; no beta resource references. Phase 2 preparation can overlap Phase 1, but public traffic waits for both.

### Phase 3 — Activate production providers and verify live billing

**Current checkpoint and exact next actions:** [Phase 3 closeout record](production-phase3-closeout-2026-09-23.md).

- [x] Verify Resend sending-domain DNS and `notify.illuminotary.com` (Jorge's dashboard confirmation, 23 September; not an app-delivery test).
- [x] Deploy dedicated production Resend credentials/sender/Reply-To and exact signed public callback; verify actual operator delivery, persisted sent/delivered callbacks, invalid/expired signature rejection, logical replay idempotency and private app/API boundaries. Jorge confirmed receipt. See [email acceptance](production-email-acceptance-2026-09-23.md); private runner rollout is tracked separately below.
- [x] Configure production Supabase SMTP and secure reauthentication/redirect settings. Existing-user email/phone login was subsequently enabled and receipt verified; public signup stays closed. Production-build login/recovery acceptance is in Phase 4.
- [x] Prepare ignored production credential fields, preserve supplied values, reuse the approved distinct staging Maps keys, and keep secrets out of logs/Git. APNs credentials and engineering-generated SMS/Stripe webhook secrets were subsequently deployed.
- [x] Verify server Maps Geocoding/place-ID/reverse fallback through both production NATs and deploy the approved shared server key/flag without changing images, routes or purchase gates. API7/worker6/web4 healthy, API/web 200. Browser Maps/legacy Places/restriction-owner acceptance remains open.
- [x] Verify live Stripe account payments/payouts; create/map the six approved prices and restricted Portal while keeping all application catalog sales/live activation disabled. Disable only the approved misrouted LIVE webhook, preserving the correct test-mode endpoint and existing merchant business.
- [x] Obtain Jorge's confirmation that the live owner Dashboard has no outstanding requirements; deploy pinned Stripe runtime credentials and the exact callback. Callback/billing processing were subsequently enabled and live acceptance passed below. New purchases are closed again; accepted-payment processing remains enabled.
- [x] Deploy production SMS hook/sender permissions and existing-user email/phone login with signup closed; enable and prove actual TOTP step-up. Jorge confirmed receipt of production email/SMS. Invalid/expired/modified callback requests are rejected. [Evidence](production-phase23-acceptance-2026-09-23.md).
- [x] Securely import and deploy production APNs credentials; verify Apple accepts one explicitly approved operator push with HTTP 200. General sending remains disabled. [APNs evidence](production-apns-acceptance-2026-09-23.md).
- [x] Confirm operator device receipt of the approved test push; Jorge confirmed it arrived.
- [x] Exercise authenticated production device registration, targeted AWS outbox email/APNs dispatch, no redispatch on a repeated targeted run, actual Resend delivered callback, anonymous-open rejection, idempotent authenticated open API and device deactivation. Jorge confirmed receipt of both worker messages. Only his approved temporary token and synthetic jobs were used; general runners stayed off. Evidence: `.recovery-private/production-operator-outbox-20260923.json`.
- [x] Deploy durable production SMS replay receipts and disable implicit SDK retries; verify completed/in-flight/uncertain signed replays at the hosted callback without sending additional SMS. Deploy stable Resend outbox idempotency keys. Staging SMS receipts remain unchanged.
- [x] Create isolated production carrier receipt infrastructure (`darci-production-sms-delivery`) and its sanitized logs/routing alarms.
- [x] Attach the production carrier receipt configuration and exact configuration-set permission; verify a real operator OTP request produced `SUCCESSFUL` then `DELIVERED` events, matched to one durable accepted receipt. An earlier request was denied before carrier handoff; no automatic duplicate send was made. CloudFormation recovery completed and temporary IAM permissions were removed. This is delivery evidence, not a completed user login.
- [x] Confirm actual operator receipt of the separately authorized 15:44 SMS retry. The earlier intermittent missing message remains an operational incident, not a restart of SMS integration. Production-build login acceptance is tracked in Phase 4.
- [x] Complete enabled private-production notification rollout: inventory showed three completed jobs and zero pending; worker13 scheduled processing is deployed and healthy. One actual operator upload-finalize email has a signed delivered callback; repeating the action created no duplicate jobs. An independent in-app-only scheduled probe completed under `worker-scheduled`. All fixture jobs are completed/suppressed; no client messages were sent. [Evidence and exact scope](production-notification-rollout-2026-09-23.md). Jorge confirmed the latest email arrived. Push activation/device acceptance belongs to Phase 4. Server Maps/manual fallback remains approved; browser Maps ownership/restrictions, Sentry and unverified OTLP/Grafana remain deferred.
- [x] Complete scoped live billing acceptance: Jorge personally paid the exact $9.99 Starter Checkout; paid invoice, real webhook-derived active 3-document allowance, same-key reuse, two duplicate paid-event replays with unchanged entitlements, authorized Portal session creation and deployed reconciliation with zero issues all passed. Period-end cancellation is set in Stripe and DARCi. The temporary purchase window is closed; hosted new Checkout/Portal requests are denied while paid access and event processing remain active. The negative fixture was revoked. This does not claim a manual Portal UI/Apple Pay test or general-sales approval.
- [x] Commercial/legal approval for member terms, taxes, held-package messaging, support/refund/dispute procedures and customer notices confirmed by Jorge on 23 September. [Approval provenance](production-phase23-signoff-2026-09-23.md). This records the user's confirmation; it neither invents policy/tax/retention values nor activates general sales.

23 September continuation: final complete backend regression passed **110 files / 819 tests**;
production infrastructure/workflow/SMS checks passed **116**. `c454d61` is deployed
and hosted provider checks passed. `e33c05c` corrects live reconciliation and passed
CI; its protected production deployment **35920215734 succeeded**. Production SMS
table migration is applied with RLS/least-privilege/uniqueness checks. Other members
still cannot purchase; Jorge paid the one live Checkout, acceptance passed, future
renewal was canceled, and the temporary operator purchase window is closed.

**Exit:** every enabled external dependency has a configuration owner, delivery/verification evidence, failure/retry path and monitoring. No required workflow relies on an `internal` no-delivery provider.

### Phase 4 — Build the production web/iOS release candidate

- [x] Inspect the deployed production web candidate's API/Supabase public inputs, links and response caching/security headers. Login/callback chunks reference production, not staging. Existing web6 is unchanged; remaining association-file content release is listed below.
- [x] Generate explicit production iOS config and build signed **0.1.0 (21)** archive; validate embedded endpoints, signing/profile, app/Sentry symbols, associated domains and APNs entitlement. Production/staging Keychain and link handling are isolated. No TestFlight upload claimed.
- [x] Deploy only the approved public GET routes for the two Apple association files; Apple CDN fetch succeeds. All other app/API routes remain IP-restricted.
- [ ] Release the local well-known AASA billing-return parity fix and recheck both live files/CDN. Local regression passes; current deployed well-known file lacks those two mappings.
- [ ] Validate/upload the production archive to internal TestFlight after confirming build-number availability. [Candidate, evidence and exact device checklist](production-phase4-execution-2026-09-23.md).
- [ ] Complete physical production-build login/recovery and notification registration, tap/navigation and invalid-token acceptance. Current TestFlight uses staging; the successful production worker/receipt tests are not device UI acceptance.
- [ ] Complete applicable hosted Checkout/Portal and physical-device Apple Pay UI acceptance. The approved live card payment and backend/Portal-session acceptance already passed and are not reopened.
- [ ] Complete App Store privacy/review materials and accurately document the purchase flow; test supported physical devices and accessibility settings. [Prepared review checklist](production-app-store-review-2026-09-23.md); publishing approved policy text is not reopening commercial/legal approval.

**Exit:** traceable release candidate per platform; no staging/localhost URLs or secrets; approval/review requirements met before public iOS availability. Web rollout need not wait on unrelated iOS improvements, but must pass its own complete production gate.

### Phase 5 — Production-shaped acceptance and go/no-go

Use dedicated test identities/documents. Never use real customer legal acts just to exercise failure injection.

- [ ] CA and OH × Trust, standalone POA, upload with signature, upload without signature; web→web, mobile→mobile and cross-platform owner/signer/notary combinations.
- [ ] Invite intended/wrong email, expiry/revocation/claim concurrency; notary approval/rejection/wrong role/jurisdiction and legacy-code boundaries.
- [ ] Cross-device profile changes, token expiry/refresh, logout/revocation, app background/foreground and network interruption.
- [ ] Location permission denial/inaccuracy/staleness, approved fallback, manual venue completion, identity handling and required audit evidence.
- [ ] Normal/protected/password-required/malformed/large PDFs; signature and acknowledgment placement; final bytes readable in browser and Apple PDFKit; all expected package artifacts; exact published hash/public verification.
- [ ] Quota last-unit concurrency, upgrade/downgrade/renewal/cancellation/failure/action-required, accepted-work continuity, held-package access denial and original-byte release after reactivation.
- [ ] Duplicate/out-of-order webhooks, worker crash/queue outage, external provider failures, alert delivery and support replay/resync without double fulfillment.
- [ ] Production backup/restore, secret rotation, rollback, dependency health and performance/cost envelope.
- [ ] Limited authorized live payment plus receipt/reconciliation and agreed cancellation/refund check; never substitute a browser redirect for entitlement evidence.

**Exit:** signed result matrix identifying environment, image/archive version, test case, evidence, reviewer and date. Failures have fixes or explicit safe feature disablement; no blanket “staging worked” acceptance.

### Phase 6 — Controlled production launch, then widen

- [ ] Release owner approves all enabled-surface P0 gates and legal/distribution requirements.
- [ ] Promote reviewed manifests, verify migrations/config/images, enable providers/purchase controls only in the approved sequence, then admit the capped cohort.
- [ ] Name the on-call engineer and support escalation route; inspect first real workflows and reconcile first invoices/releases daily during the initial period.
- [ ] Monitor errors, queues, auth/delivery, PDF validation, billing drift and costs against agreed thresholds. Pause new enrollment/checkout if necessary while preserving accepted-work continuity.
- [ ] Widen only after an agreed observation period with no recurring unexplained integrity/auth/payment failures. Maintain dependency scans and restore drills.

**Rollback rule:** reverting an app image is not permission to revert a database blindly, delete a finalized artifact, replay a charge or revoke legitimate completed work. Use the compatible release manifest and audited recovery procedures.

## 8. Go/no-go record

Do not mark production approved until each line has an owner and linked evidence:

- [ ] Phase 1's five-track hardening gate is complete, with restore, payment-recovery and actual alert-delivery evidence—not implementation claims alone.
- [ ] Scope, domains, data-migration treatment and account ownership approved.
- [ ] CA/OH templates/notarial workflow and public-PDF/identity/retention/member terms approved by appropriate reviewers; no unsupported marketing claims.
- [ ] Security/invite/audit/identity/dependency blockers closed; authorization/RLS and abuse controls demonstrated.
- [ ] Real ledger or truthful hash-only completion implemented and accepted.
- [ ] Isolated production infra, secrets, Supabase and provider integrations verified.
- [ ] Stripe live isolation/configuration and lifecycle recovery accepted if charging; notaries remain free.
- [ ] Production web and iOS builds/configuration verified; required Apple review/distribution path satisfied.
- [ ] Full acceptance matrix, backup/object restore and rollback evidence attached.
- [ ] Monitoring/symbolication/alerts/support/reconciliation ownership active.
- [ ] Launch approver, date, release manifest, cohort cap and pause/rollback criteria recorded.

## 9. Deferred work—not prerequisites to rewrite the working product

Keep Dynamic POA, annual plans, Pro/delegated payment, credit bundles, notary subscriptions, additional jurisdictions, RON and in-app scheduling out of this launch. Large-file refactoring/API client generation and obsolete-client cleanup can follow unless a specific defect makes them necessary for a gate. A second-region active-active platform is not automatically required; the client must approve availability/RPO/RTO and the corresponding cost.

## 10. Related implementation references

- [Historical private-beta roadmap](private-beta-readiness-roadmap-2026-08-25.md)
- [Stripe implementation roadmap](stripe-implementation-roadmap.md) — phases 0–7 foundations implemented; phase 8 live gate remains.
- [Stripe operator/team testing](stripe-phase7-operations-and-team-testing.md)
- [PDF/session regression fix and old-artifact recovery](mobile-pdf-session-regression-fix-2026-09-16.md)
- [AWS historical deployment roadmap](aws-staging-deployment-roadmap.md) — older domains/runtime examples are not current production instructions.
- [Domain-cutover audit](domain-cutover-darciregistry-dev-audit.md)
- [Jurisdiction launch runbook](jurisdiction-launch-runbook.md)
- [Error-reporting runbook](first-class-error-reporting-runbook.md)
- [Resend incident runbook](resend-email-incident-runbook.md)
- [Push notification runbook](push-notification-runbook.md)

Maintenance: mark a task complete only with implementation/configuration **and its stated acceptance evidence**. Keep build success, deployed configuration, legal approval and customer-visible acceptance as separate facts. Update this document after each production-readiness pass.
