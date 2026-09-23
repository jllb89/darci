# Production provider and access hardening — 23 September 2026

This record supplements the production readiness roadmap. Production remains private, signup and live checkout remain disabled, and no client message, subscription or charge was created. **Jorge approved the access migration for production only. Staging was not migrated.**

## Completed and verified

### Database access and Auth configuration

- Migration `20260923190000_close_backend_only_table_access.sql` now protects `template_artifacts`, `notary_profile_applications`, `notary_identity_document_types` and `notary_identity_document_fields`. All four previously lacked RLS and had direct anonymous/authenticated grants. Their consumers are backend services.
- A transaction/rollback rehearsal passed before application. Exact row counts and sorted-row fingerprints stayed unchanged: **9 + 0 + 8 + 24 = 41 rows**. No document/PDF/signature was changed.
- Actual hosted REST probes returned **401 for anonymous access and 200 for service-role access on all four tables**. API readiness remained 200. The database audit now finds **97/97 public tables with RLS**, no unprotected-table grants, and three private Storage buckets. This does not prove every actor/policy/Realtime combination.
- Production now has **105 migration versions**; the version inventory matches the checkout. Raw stored SQL text differs for historical CLI-split statements and is not interpreted as evidence of schema drift. Do not reapply old migrations based on raw text comparison.
- `apply-access-migration.mjs` refuses staging. The fresh-schema CI check includes the new backend-only-table regression. A future staging application needs separate approval; do not use an unqualified `supabase db push` against the repository's staging link.
- Direct PostgreSQL/pooler access is restricted to production NAT egress **18.213.200.166/32**, **34.231.72.82/32**, and current operator **187.247.134.158/32**; IPv6 allowlist empty. This is separate from the app/API gate and does not restrict Supabase HTTPS Auth/Storage/REST.
- Production Supabase SMTP now uses the existing Resend credential, `smtp.resend.com:465`, sender `notifications@notify.illuminotary.com`, display name DARCi. Sensitive password changes require reauthentication; root and `/auth/callback` production redirects are configured. Signup, email login and phone login remain disabled. SMTP configuration is not a completed production OTP/device acceptance test.
- Root MFA is enabled and there are no root access keys. Supabase reports two managed backups and PITR disabled; external recovery controls remain necessary.

Private evidence: `.recovery-private/production-access-fix-bi4OIp`, `production-rest-access-oztOea`, `production-database-audit-AvDJMq`, `production-auth-config-ovr7KD`.

### WAF, management audit and platform alarms

Stack **`darci-production-edge-audit`** is deployed from `infra/production/edge-audit.mjs` and `capacity-monitoring.mjs`.

- WAF is attached **only** to the production ALB. TRACE/TRACK/CONNECT are blocked, and a source-IP rule returns 429 above its 2,000-request/300-second rate threshold. This is a protective rate rule, not an exact per-request quota.
- AWS managed common rules are deliberately **count-only**, pending legitimate PDF/callback traffic review. They are not represented as blocking protection. Request sampling and payload logging are disabled.
- A harmless TRACK request returned 403 and produced a real WAF `BlockedRequests` metric. Readiness returned 200; unsigned Resend callback still reached signature validation and returned 400. Rate-limit saturation and complete callback/upload compatibility are not claimed.
- CloudTrail **`darci-management-audit`** captures account-wide read/write management events, including global services/multiple regions. KMS/RDS Data events are excluded; no document/object data-event collection was enabled. Same-account staging management activity is included, as expressly approved.
- Log bucket **`darci-management-audit-427057633951-us-east-1`** is private, TLS-only, AES256-encrypted, versioned and retained. No deletion/retention schedule was invented. CloudTrail is delivering without error; the first delivered digest passed AWS CLI validation (**1/1 digest valid**). This is not yet validation of a long-running audit chain or cross-account tamper protection.
- Ten additional sustained platform alarms cover CPU/memory for API/web/worker, API/web healthy targets, API 5xx counts and p95 latency. Thresholds: CPU ≥85%, memory ≥80%, healthy targets <2, ≥5 API 5xx/minute, p95 ≥3 seconds; three breaching periods out of five one-minute periods. Low-volume p95 evaluation is ignored.
- Alarm names use **`darci-recovery-production-capacity-*`**, matching the existing SNS source-ARN policy. They send ALARM transitions to the existing Jorge-only route, with **no initial OK or insufficient-data notifications**. No new subscription or broader SNS permission was created. Live source-failure delivery acceptance for these ten new alarms remains separate; an OK state alone is not a delivery drill.
- Incremental planning cost: about $8/month WAF base/rules plus request charges, about $1/month for ten standard alarms, and variable audit storage/requests. These are within the approved $350 planning envelope at the assumed low traffic, not a spending guarantee or hard cap. Cross-account protection and full untagged/shared cost coverage remain open.

### Recovery after access hardening

The existing private-network backup task `73e84da39c284e5998e51551e5facad4` exited **0** after the new database allowlist and access migration. Snapshot:

`2026-09-23T18-50-51.483Z-8908de00-1a27-46f0-9ccb-3ca55aa17c6c`

Manifest version: `TseRGQm3RGt9rFfmfGUU4FD6DSbJP_Ki`. Backup took **16.531 seconds**. An independent recovery-reader check restored **3/3 exact-checksum, readable PDFs**, with zero failures, and verified the database archive index in **6.671 seconds**. The earlier full isolated application restore remains the application-level evidence; this additional check is not another full database/Auth/runtime reconstruction.

This was **on demand**, not the second scheduled backup. The next scheduled run is 14:00 Mexico City / 20:00 UTC on 23 September. Consecutive scheduled cadence and representative-volume RTO remain open. No backup schedule was modified.

### Live Stripe catalog prepared, purchases still closed

The saved live keys authenticate to **`acct_1HxKd9ETAqmB3GAq`**; charges and payouts are enabled. The account response does **not expose requirements**, so absence of outstanding requirements is **not verified**. The owner must inspect the live Dashboard's requirements.

Created one separate member product **`prod_VJYIzDYWrZzD3k`** and Portal configuration **`bpc_1UIvCKETAqmB3GAqJtcAed87`**, leaving historical merchant products/configurations untouched:

| Price code | Amount, USD before tax | Monthly document allowance | Live Price |
| --- | --- | --- | --- |
| `member_starter_monthly_v2` | $9.99/month | 3 | `price_1UIvCJETAqmB3GAqxKUKCnSb` |
| `member_plus_monthly_v2` | $19.99/month | 25 | `price_1UIvCJETAqmB3GAqeszssF5K` |
| `member_unlimited_monthly_v2` | $59.99/month | Unlimited | `price_1UIvCJETAqmB3GAqAx9rFTqF` |
| `member_starter_annual_v2` | $99/year | 3, resets monthly | `price_1UIvCKETAqmB3GAqrcdyz6q2` |
| `member_plus_annual_v2` | $199/year | 25, resets monthly | `price_1UIvCKETAqmB3GAqGqIbxnIv` |
| `member_unlimited_annual_v2` | $599/year | Unlimited | `price_1UIvCKETAqmB3GAq0FFn1uCW` |

Production-only verified mappings are stored. All six application catalog entries remain inactive and `live_activation_approved=false`; deployed `STRIPE_LIVE_MODE_ENABLED=false`. The Portal supports invoices, payment method/address/email updates and cancellation at period end; plan changes remain controlled by DARCi, not the Portal. Preparing provider objects does not create customers/subscriptions/charges or enable a purchase flow.

With explicit approval, disabled **only** the incorrectly routed **LIVE** webhook `we_1U96BZETAqmB3GAqh6HVgCe1`, whose URL points at staging. Readback confirmed disabled at 18:49 UTC. The correct test-mode staging endpoint, existing products, client subscriptions and payments were not changed.

**Not yet done:** production Stripe webhook/secret/public callback deployment, runtime live-key injection, final requirements/tax/commercial approval, gated activation and explicitly approved real-payment acceptance. The current shared Stripe client refuses live use while activation is false; do not flip that flag merely to make a preactivation callback test pass. Plan and test callback configuration/activation together.

Private evidence: `.recovery-private/production-stripe-catalog-uEfWmw`, `production-stripe-routing-cBeiI2`.

## Credential and provider handoff

Ignored `.env.production` is mode 0600. Existing values were preserved; missing production fields and existing production credentials were filled without printing secrets. Shared staging Maps browser/server keys were copied under Jorge's explicit approval and are distinct keys. The public Stripe alias now matches the supplied publishable key.

- **Maps:** Jorge cannot access the original Google project; do not keep requesting `gcloud auth login`. Production-egress probes in **both us-east-1a and us-east-1b** passed Geocoding, place-ID lookup and reverse Geocoding; legacy Places autocomplete returned `REQUEST_DENIED`. The existing controller's Geocoding suggestion/details fallbacks are now supported by the deployed server key/flag. Full provider acceptance and browser restriction review remain open. The API key reference/flag overlay reached **UPDATE_COMPLETE at 19:05:11 UTC**, pinned to AWS secret version `cb42c704-cd85-49a0-8884-48d83502f7e3`. At **19:06:51 UTC**, actual API7/worker6/web4 tasks were healthy at **2/1/2**, all three image digests matched the existing release, API/web returned 200, and ten capacity alarms read OK. Payments and general messaging remained disabled; routes/images/other parameters unchanged. The one-off probes have no server key in command arguments/logs. Production browser Maps is still disabled in the web build. Overlay/deployment evidence: `.recovery-private/production-maps-deploy-36527x`.
- **Google owner action:** confirm the existing browser key allows `https://app.illuminotary.com/*`, preserve staging restrictions, confirm Geocoding/Places/Maps JavaScript API access and billing/quotas. If the server key uses IP restrictions, retain staging IPs and add both production NAT IPs above. Do not remove restrictions or expose the server key in a web/iOS bundle.
- **APNs:** populate `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` securely from the authorized Apple account. Bundle is `com.illuminote.darci`; TestFlight uses the production APNs transport. No new Apple user/password is required. Actual production-device push acceptance remains open.
- **SMS:** `SUPABASE_AUTH_SMS_HOOK_SECRET` is an engineering-generated secret still pending; production hook, exact callback ingress, scoped send permission, provider configuration and operator delivery/verification tests remain unfinished. No new SMS was sent in this pass.
- **Stripe webhook secret:** also generated during the forthcoming production endpoint setup, not a credential Jorge needs to invent. Do not copy its staging counterpart.
- **Email:** Resend delivery/callback acceptance is already complete and acknowledged. SMTP is now configured separately; production login/recovery/invitation acceptance and general runner activation remain closed pending controlled testing/cohort review.

## Remaining Phase 2/3 gates — not silently accepted

1. Consecutive automatic backup cadence and representative-volume recovery/load/cost acceptance.
2. Remaining hosted actor/Storage/Realtime/auth boundaries and real-source acceptance of new infrastructure alarms; account/shared-cost and credential-rotation/retention policies.
3. Production SMS, APNs credentials/device checks, and Maps configuration/restriction/provider acceptance.
4. Production Stripe callback/runtime setup and the controlled live-billing activation/acceptance sequence, plus merchant requirements and commercial/tax approval.
5. Client allowlist, full production client/device product matrix and required legal/App Store approvals. These are not replaced by successful infrastructure probes.

The initial Maps probe truthfully failed full legacy-Places acceptance (`production-maps-preflight-oKNnQP`, exit 1). A second, separately scoped supported-path probe (`production-maps-preflight-NQaeYQ`, task `5be82b55105d474e8e391c38f0560c1d`, exit 0) passed **forward Geocoding, place-ID resolution and reverse Geocoding**, while continuing to report `legacyPlacesPassed=false` and `browserRestrictionsVerified=false`. The second-zone task `5f920974e5a34c16b092ac1826313f75` also passed with exit 0. All three short-lived tasks stopped. New controller regressions prove that denied Places autocomplete/details fall back to Geocoding without leaking the key in responses; **10 focused tests and backend typecheck pass**. This does not pretend Geocoding is identical to full Places autocomplete.

Final local infrastructure/workflow regression gate: **92 checks passed**, plus the **10 focused backend tests**, backend typecheck and whitespace validation. No commit/push or new application-image release was performed in this pass; Maps was a configuration-only release preserving the accepted images. AWS infrastructure, Supabase production configuration/access migration, server Maps configuration and the Stripe catalog changes described above are already applied; local tooling, tests and docs still need review/commit.
