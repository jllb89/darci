# Production provider handoff — 23 September 2026

This is a setup guide, not approval to open signup, change production network access, activate charges or send client messages. Support and Reply-To inbox approved by Jorge: **lopezb.jl@gmail.com**. Sentry remains deferred; unverified OTLP remains disabled.

## What Jorge can do now

**Latest handoff after the hardening pass:** live keys are saved, six approved Stripe prices and the restricted Portal are created/mapped, and the misrouted live-to-staging webhook is disabled with Jorge's approval. Do not recreate the catalog. Checkout remains closed. Supabase SMTP is configured. Maps server Geocoding and place-ID/reverse fallback passed from production egress; legacy Places is denied. Jorge cannot access the original Google project, so another `gcloud auth login` will not solve ownership. See [current evidence and exact outstanding work](production-provider-hardening-2026-09-23.md).

Owner-side handoffs still needed:

1. **Stripe:** check the LIVE Dashboard for outstanding business/identity/bank requirements. Payments/payouts are confirmed enabled, but this account's API response does not expose requirements. Report requirement names/status only, not identity or bank data.
2. **Google project owner:** review the existing browser key's `https://app.illuminotary.com/*` referrer, API scopes/billing/quotas, and server key restrictions; preserve staging. Production server NAT IPs are `18.213.200.166` and `34.231.72.82`. Do not remove restrictions or send keys in chat. Server Geocoding works; browser Places acceptance is not complete.
3. **Apple:** save `APNS_KEY_ID`, `APNS_TEAM_ID`, and the existing authorized APNs private-key material as `APNS_PRIVATE_KEY` in ignored `.env.production` through the secure local flow. Do not paste the `.p8` or passwords into chat. If the existing `.p8` was not retained, say so before creating/revoking keys. Bundle is `com.illuminote.darci`; production transport is required for TestFlight.

Engineering generates the missing Stripe webhook and Supabase SMS hook signing secrets during setup; Jorge should not invent or copy staging secrets. Their runtime/callback deployment and controlled acceptance remain engineering tasks, not completed items.

**Latest status (23 September):** Stripe live payments and payouts are enabled per Jorge; outstanding requirements are not yet confirmed. Resend sending-domain DNS, dedicated production credentials, sender/Reply-To, signed callback and operator delivery are **complete**. Real callbacks persisted and Jorge confirmed receipt. Do not recreate the domain/key/webhook. General client messaging, signup and live payments remain closed. See [production email evidence](production-email-acceptance-2026-09-23.md).

### Stripe: verify the existing merchant account

1. Sign in to the existing DARCi Stripe account. Select its live environment, not a sandbox/test environment. Do not create another Stripe account.
2. Check whether the Dashboard requests account activation, identity/business verification, bank details or other outstanding information. The account owner must supply accurate legal/business/bank information inside Stripe; do not send it through this chat.
3. Report whether live payments and payouts are enabled and any outstanding requirement names. A redacted status screenshot is fine. Do not reveal API keys, bank details or identity documents.
4. Review public business/support details; use the approved support email only where appropriate. Legal entity and tax decisions are not inferred from an engineer's approval.
5. The six live Prices and restricted Portal are now prepared; do not create duplicates or reuse test Prices. The production webhook and runtime activation sequence remain pending. Keep keys in ignored `.env.production`, never chat/Git, and do not enable purchases yet.

Approved prices: Starter $9.99/month or $99/year (3 workflows/month); Plus $19.99/month or $199/year (25/month); Unlimited $59.99/month or $599/year. USD before taxes; notary fees separate. Annual finite allowances reset monthly. Existing billing continuity/hold rules remain.

After approval, credentials go directly into the production secret through a secure local/dashboard flow, never chat/Git. Updating the secret alone does not deploy a pinned secret version. Live activation remains a separate audited gate, including commercial/tax approval and explicit authorization for any real payment.

Official references: [Stripe account activation](https://support.stripe.com/topics/getting-started?locale=en-GB), [go-live checklist](https://docs.stripe.com/get-started/checklist/go-live).

### Resend / Namecheap: prepare the production sending domain

Sender approved by Jorge on 23 September: **DARCi <notifications@notify.illuminotary.com>**. Replies/support go to **lopezb.jl@gmail.com**. Gmail is the Reply-To inbox, not our authenticated sending domain. Approval does not mean DNS/provider configuration or production delivery has been completed.

1. Open Resend → Domains and check whether `notify.illuminotary.com` already exists. If so, inspect it rather than adding a duplicate.
2. Add the approved subdomain for **sending**, not inbound mail hosting. Resend supplies the exact DNS records.
3. Send the DNS record table (record type/name/value/priority) or a screenshot; these DNS records are public, not API secrets. We will check the exact Namecheap Host values before saving.
4. In Namecheap → Domain List → Manage `illuminotary.com` → Advanced DNS, add only the confirmed records. Preserve root mail/MX records, website records, app/API routing and underscore-prefixed certificate CNAMEs. Never replace unrelated records or nameservers.
5. Verify in Resend. Then configure a production-scoped sending key, signed callback endpoint and the approved sender/Reply-To in the app. Test delivery first to Jorge, not clients.

Official references: [Resend verified domains/subdomains](https://resend.com/docs/dashboard/domains/introduction), [email API and Reply-To](https://resend.com/docs/api-reference/emails/send-email).

#### Next handoff after domain verification

- [x] Sending-domain DNS and domain verification reported complete by Jorge.
- [x] Dedicated restricted production sending key saved securely, distinct from staging; correct sender accepted by Resend. The sending-only key cannot independently list its configured domain scope.
- [x] Key and separate webhook secret transferred from ignored `.env.production` into a new pinned production AWS secret version, preserving other values; configuration deployed.
- [x] Approved exact host/path/POST callback ingress deployed; all other application routes remain private and default-denied. Temporary deployment permissions removed.
- [x] Production webhook configured; operator email delivered, real sent/delivered callbacks persisted, replay and signature rejection verified, and Jorge confirmed inbox receipt.

Key permissions and domain restrictions: [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction).

## Engineering prerequisites before provider activation

- Only the Resend callback is publicly reachable through the exact reviewed rule. Stripe and Supabase callbacks are still private; each needs a separately reviewed narrow ingress rule and provider acceptance. Do not open all app/API access.
- Register production callbacks with separate signing secrets and tested API/event versions; do not copy staging webhook secrets or provider object IDs.
- Production Auth signup and messaging remain closed until configuration and acceptance are ready. An IP allowlist alone does not make the app usable for client testing.
- SMS needs its production Supabase hook/secret, approved existing origination route and delivery/error acceptance. APNs and Maps need production-specific scopes/restrictions and actual device checks. Hosted Checkout Apple Pay and App Store distribution remain distinct acceptance items.
- Selected client production access is postponed until Jorge supplies exact tester names/public IPv4 addresses. Reminder scheduled for **24 September 2026, 14:00 America/Mexico_City**. Dynamic/cellular/VPN addresses may change; no public access expansion is approved.

## Team testing

Use the [release acceptance checklist](release-team-test-checklist-2026-09-23.md) with explicit environment, web SHA, TestFlight version/build, device/iOS version and IDNs. Jorge reports mobile POA generation felt solid; record this as a positive manual generation check, not full signing/notarization/production acceptance. The complete client test results and legal/policy sign-off are still required.
