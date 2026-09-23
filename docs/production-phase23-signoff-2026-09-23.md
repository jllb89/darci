# Phase 2–3 production sign-off register

This is an approval checklist, not legal advice or a claim that production is open.
Jorge is coordinating review at `lopezb.jl@gmail.com`. Client/counsel acceptance has
not yet been supplied. Engineering must not substitute its own approval.

## Decisions received in this pass

- Private production provider configuration/deployment and isolated acceptance are approved within the existing $350/month planning envelope.
- Test members/notaries/admins, temporary test MFA/roles and unsigned TEST PDFs are approved; revoke temporary privileges after the drill. Do not touch client records.
- Operator-only email/SMS is approved. Client messaging and public signup remain closed.
- Jorge reports no outstanding LIVE Stripe account requirements and will personally complete one $9.99 checkout when the acceptance gate is ready. This is not permission to charge a saved card or enable general sales.
- Server-side address search/geocoding plus manual entry is accepted for this candidate. Browser Maps remains disabled; Google-owner restriction/ownership review remains deferred, not completed.
- APNs key `QW4JZ2X6DU` is imported/deployed; Apple accepted the one approved operator TestFlight push and Jorge confirmed receipt. Production-app/worker acceptance remains open. No existing Apple key was revoked. [Evidence](production-apns-acceptance-2026-09-23.md).

## Client / counsel / finance review

The review-ready consolidation is [Member billing disclosures — draft v0.1](member-billing-review-draft-2026-09-23.md).
It contains proposed membership and held-package notices plus explicit outstanding
tax/refund/dispute decisions, **not final legal policies**. Earlier references to
the old $49/$99/$199 pricing in the September 22 package have been corrected.
On September 23 Jorge approved an expiring operator-only $9.99 live checkout and
period-end cancellation, plus up to two targeted operator emails/two pushes with
temporary production token registration and cleanup. These approvals do not open
general sales or approve the customer policies below.

For each row record the approving person, date, exact document/version and any conditions.

| Required decision | Material to review | Status |
| --- | --- | --- |
| Membership contract | Member-only plans; 3/$9.99, 25/$19.99, Unlimited/$59.99 monthly; $99/$199/$599 annual; USD before applicable taxes | Pending |
| Allowance rules | Annual plans reset allowances monthly; Trust package counts as one workflow; regeneration/retry accounting and no rollover/overage | Pending |
| Continuity and final release | Accepted notary work can finish after membership lapses; unreleased final sealed/acknowledged package remains held until valid entitlement; already released evidence preserved | Pending |
| Notary fees | Notaries do not pay DARCi subscriptions; in-person notary fees are separate | Pending |
| Tax treatment | Selling legal entity, taxable jurisdictions, registrations, collection mechanism, customer location and invoice disclosures | Pending; do not infer from tax-exclusive Stripe Prices |
| Cancellation and refunds | Period-end cancellation, upgrade/proration/downgrade rules, refund eligibility, disputes and customer support notices | Pending |
| Evidence and legal wording | CA/OH specimens and acknowledgments, genuine hash-only verification, public status/hash without public PDF downloads | Pending |
| Privacy and retention | Identity collection/storage, legal holds, approved retention periods; automatic identity deletion remains disabled | Pending |

## Operator acceptance, kept separate from legal approval

- [x] Real production OTP email and SMS receipt: Jorge confirmed both from the 19:55 UTC test on 23 September; no OTP copied into chat/logs.
- [ ] Completed production login verification/recovery and negative-code acceptance; receipt alone does not close these.
- [x] Production APNs key configured/deployed; Apple accepted one approved operator push.
- [x] Actual authorized operator device receipt confirmed by Jorge.
- [x] Targeted AWS outbox email/push and authenticated production registration/open API/deactivation accepted; Jorge confirmed both messages. Duplicate job run sends nothing. Synthetic open API is not physical production-app tap acceptance.
- [ ] Physical production-build push tap/navigation and invalid-token lifecycle accepted; current TestFlight still targets staging.
- [ ] Approved operator Checkout and Portal exercised; paid entitlement, allowance, callback/reconciliation and cancellation checked. A cardholder must personally authorize any real payment; refund requires separate direction.
- [ ] Production address entry tested through the supported server/manual path.
- [ ] Consecutive scheduled backup evidence and representative-volume restore timing recorded; on-demand tests cannot manufacture elapsed scheduled cadence.
- [x] Hosted owner/unrelated/assigned-notary/wrong-notary/admin API, private Storage, Realtime topic/queue and real TOTP boundaries recorded; temporary privileges revoked. [Evidence and scope](production-phase23-acceptance-2026-09-23.md).
- [ ] Remaining signer/held-release/full-device acceptance; already-open Realtime socket eviction is not proven by reconnect rejection.
- [ ] New infrastructure detector delivery and cost/rotation ownership recorded.
- [ ] Client cohort/IP allowlist and device/product acceptance completed before public launch.

Do not mark Phase 2 or 3 complete from green CI, configured credentials, or this checklist alone.
