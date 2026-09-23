# Phase 2–3 private production acceptance — 23 September

Verified through 20:15 UTC. This records completed engineering and explicit remaining gates, not public-launch approval.

**Later APNs update, 20:33 UTC:** key material is now configured and deployed; runtime is API9/worker8/web4. Apple accepted one explicitly approved operator push and Jorge confirmed receipt; full production app/worker flow remains open. [APNs evidence](production-apns-acceptance-2026-09-23.md) supersedes the missing-key status below.

## Deployed and verified

- API revision **8**, worker **7**, web **4**: healthy **2/1/2** tasks, unchanged pinned release images. App/API remain IP-restricted. Public signup, general notification runners and live purchases remain disabled.
- Production Stripe credentials and a distinct webhook secret are pinned in Secrets Manager. Endpoint `we_1UIw8CETAqmB3GAqJE15Ottu` has the exact production URL, eight intended events and pinned API version; it remains **disabled** until activation acceptance. Jorge reports no outstanding merchant requirements. No charge was created.
- Exact host/path/POST exceptions allow the Stripe and Supabase SMS callbacks without opening other application routes. SMS send permission is scoped to the existing approved sender; temporary deployment permissions were removed.
- Production Supabase existing-user email/phone login and the signed SMS hook are configured; signup remains closed. The acceptance run exposed disabled TOTP enrollment/verification, which is now enabled and proven with an actual challenge.
- Jorge confirmed receipt of the production SMTP email and SMS requested at **19:55 UTC**. This proves receipt, not completed production login or account recovery.
- Production has **106 migrations**, **97/97 public tables with RLS**, and three private buckets. Hosted anonymous/core-table probes pass; live billing activation remains false.

## Permission defect fixed, not waived

An actual private Realtime subscription failed for an assigned notary. The old policy joined through owner-only document/user RLS, hiding the relationship required to authorize the notary.

Migration `20260923210000_realtime_actor_authorization.sql` evaluates a boolean-only current-caller relationship check with a fixed search path. It does not grant direct document access. It requires an active user, active role and live Auth session, and rejects malformed/unrelated topics, wrong notaries and revoked/logged-out actors.

- **48 local SQL assertions pass**, including unchanged owner-only document RLS, queue isolation, revoked roles, suspended/banned users and dead/mismatched sessions.
- Production rollback rehearsal and application preserved whole-row fingerprints for seven user/document/evidence tables. No PDF, signature or acknowledgment was modified.
- Hosted API tests deny anonymous/unrelated/wrong-notary access and permit the appropriate owner/assigned-notary/admin reads.
- Direct Storage download, listing and signed-URL minting are denied to client actors; service retrieval preserves the exact unsigned test PDF hash.
- Actual TOTP step-up denies an admin mutation at AAL1 and accepts the controlled fixture update at recent AAL2.
- Actual private subscriptions accept owner/assigned notary/admin, deny unrelated/wrong notary, and isolate notary queues. After role revocation or logout, the same JWT is rejected by both the API and a new private subscription. **Immediate eviction of an already-open socket is not claimed.**
- All temporary test roles were revoked and test accounts banned. The approved operator-only member fixture remains available for manual acceptance; unsigned test artifacts remain retained.

The migration was applied to **production only**. Staging was not changed in this pass. Its local migration and CI regression must accompany the next reviewed release; do not assume a redeploy automatically applies migrations.

## Provider and recovery evidence

Unsigned Stripe/SMS callbacks, expired SMS signatures and modified raw bodies are rejected. A validly signed payload with an empty OTP is rejected before sending. These tests send **zero SMS** and create **zero charges**. Valid-event SMS replay/deduplication and live Stripe fulfillment were not certified by these negative tests.

The automatic **02:00 and 14:00 Mexico City** backups completed on 23 September, approximately 12 hours apart. The second task has Scheduler provenance and exit code 0. Its exact manifest is complete and inventories six objects. The earlier three-object byte/readability/application restore remains valid evidence.

The attempted second full restore check was stopped by the safety review because that command also downloads a database archive and identity key. Only manifest metadata was fetched afterward; no indirect retry or workaround was used. A newly scoped/approved restore and representative-volume timing remain open. Two successful scheduled backups do not prove a four-hour restore at future production scale.

## SMS follow-up: staging is distinct from production

- **19:50:53 UTC:** a staging request near the reported iPhone attempt had one middle digit different from Jorge's confirmed number. Country and last four digits matched. AWS accepted that destination, then emitted final `UNREACHABLE`. This is a candidate correlation, not proof of what the user typed or an iOS formatting defect. No account/phone mapping was changed.
- **20:14:28 UTC:** the correct phone fingerprint reached staging; one AWS message ID was recorded and the provider reported `DELIVERED` at 20:14:33. Jorge confirmed receipt.
- **20:14:42–43 UTC:** successful SMS verification triggered the existing **email step-up** because the phone-authenticated identity's email differed from the linked DARCi account. One email was sent; the app's “second code” message refers to that email, not a second SMS. No full code, phone or email address is included in this evidence.
- This does not prove final email verification/full login. The message needs clearer UX; account reconciliation must not silently reassign a phone or merge identities.

## Tests and private receipts

**104 infrastructure/workflow tests, 48 SQL assertions, script syntax checks and workflow lint pass.** Final hosted access, schema and callback/runtime acceptance pass. This pass did not rerun the full web/iOS suites; the latest pre-existing CI/staging release at `988df47` passed separately.

Private evidence (ignored, not for public sharing):

- `.recovery-private/production-provider-deploy-wKVpq0`
- `.recovery-private/production-auth-acceptance-config-4GGahG`
- `.recovery-private/production-operator-auth-UABtaZ`
- `.recovery-private/production-realtime-migration-t9qhcA`
- `.recovery-private/production-access-acceptance-OC7qp7`
- `.recovery-private/production-database-audit-cwEQi4`
- `.recovery-private/production-provider-acceptance-z9mC8o`
- `.recovery-private/production-scheduled-manifest-VLrV2L`

## Still required

1. APNs production app/worker acceptance. Key/configuration are deployed, Apple accepted the single approved operator push, and Jorge confirmed device receipt; see the later update above. Never paste private material into chat or revoke existing keys merely for setup.
2. The controlled live Checkout/Portal/webhook/reconciliation acceptance, including Jorge personally authorizing $9.99. General sales remain closed; no saved card may be charged automatically.
3. Client/counsel/finance approval of exact terms, tax treatment, held-package notices, refunds/disputes and legal/privacy content. [Consolidated sign-off register](production-phase23-signoff-2026-09-23.md).
4. Full enabled-provider recovery/replay coverage, account/device acceptance, remaining infrastructure detector/rotation/cost acceptance, and representative-volume recovery timing. General client email runners require cohort/queued-job review before activation.
5. Server-side Maps/manual address acceptance on the actual client; browser Maps stays disabled and Google-owner key/restriction review is explicitly deferred.
6. Client IP allowlist and the broader production-shaped product/device matrix. Sentry remains deferred by Jorge; unverified OTLP remains disabled.

**Phase 2 and Phase 3 are not fully accepted yet.** Completed configuration and bounded test evidence are checked off separately in the roadmap.
