# Production provider handoff — 23 September 2026

This is a setup guide, not approval to open signup, change production network access, activate charges or send client messages. Support and Reply-To inbox approved by Jorge: **lopezb.jl@gmail.com**. Sentry remains deferred; unverified OTLP remains disabled.

## What Jorge can do now

### Stripe: verify the existing merchant account

1. Sign in to the existing DARCi Stripe account. Select its live environment, not a sandbox/test environment. Do not create another Stripe account.
2. Check whether the Dashboard requests account activation, identity/business verification, bank details or other outstanding information. The account owner must supply accurate legal/business/bank information inside Stripe; do not send it through this chat.
3. Report whether live payments and payouts are enabled and any outstanding requirement names. A redacted status screenshot is fine. Do not reveal API keys, bank details or identity documents.
4. Review public business/support details; use the approved support email only where appropriate. Legal entity and tax decisions are not inferred from an engineer's approval.
5. Stop before creating live Prices, webhooks or pasting keys. We will configure the six approved live Prices and the restricted Portal together, avoiding duplicate mappings. Test Prices cannot be reused for live purchases.

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

## Engineering prerequisites before provider activation

- The current production ALB is operator-IP-only. Stripe, Resend and Supabase callbacks cannot be assumed reachable. Design/review narrowly scoped public webhook ingress with signature/replay validation while keeping application access private. Do not simply open all app/API access.
- Register production callbacks with separate signing secrets and tested API/event versions; do not copy staging webhook secrets or provider object IDs.
- Production Auth signup and messaging remain closed until configuration and acceptance are ready. An IP allowlist alone does not make the app usable for client testing.
- SMS needs its production Supabase hook/secret, approved existing origination route and delivery/error acceptance. APNs and Maps need production-specific scopes/restrictions and actual device checks. Hosted Checkout Apple Pay and App Store distribution remain distinct acceptance items.
- Selected client production access is postponed until Jorge supplies exact tester names/public IPv4 addresses. Reminder scheduled for **24 September 2026, 14:00 America/Mexico_City**. Dynamic/cellular/VPN addresses may change; no public access expansion is approved.

## Team testing

Use the [release acceptance checklist](release-team-test-checklist-2026-09-23.md) with explicit environment, web SHA, TestFlight version/build, device/iOS version and IDNs. Jorge reports mobile POA generation felt solid; record this as a positive manual generation check, not full signing/notarization/production acceptance. The complete client test results and legal/policy sign-off are still required.
