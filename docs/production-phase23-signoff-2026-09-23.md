# Phase 2–3 production sign-off register

This is an approval checklist, not legal advice or a claim that production is open.
Jorge is coordinating review at `lopezb.jl@gmail.com`. On **23 September 2026**,
Jorge explicitly reconfirmed that **commercial/legal is approved** and had already
been communicated. Record this as approval reported by Jorge, not an engineering
approval or a claim that a particular counsel signed a document supplied here.

## Decisions received in this pass

- Private production provider configuration/deployment and isolated acceptance are approved within the existing $350/month planning envelope.
- Test members/notaries/admins, temporary test MFA/roles and unsigned TEST PDFs are approved; revoke temporary privileges after the drill. Do not touch client records.
- Operator-only acceptance email/SMS is approved; no client acceptance messages or bulk send is authorized. The subsequently approved private scheduled notification worker is enabled after an empty-backlog audit; future authorized private-cohort product events can notify their intended recipients. Public signup remains closed.
- Jorge reports no outstanding LIVE Stripe account requirements and personally paid the approved $9.99 checkout. Payment, entitlement, callbacks/reconciliation and period-end cancellation passed; the temporary purchase window is closed. Do not create another charge or enable general sales.
- Server-side address search/geocoding plus manual entry is accepted for this candidate. Browser Maps remains disabled; Google-owner restriction/ownership review remains deferred, not completed.
- APNs key `QW4JZ2X6DU` is imported/deployed; direct and AWS outbox pushes were received. Physical production-app device acceptance remains in Phase 4; worker/provider acceptance is complete. No existing Apple key was revoked. [Evidence](production-apns-acceptance-2026-09-23.md).

## Client / counsel / finance review

The review-ready consolidation is [Member billing disclosures — draft v0.1](member-billing-review-draft-2026-09-23.md).
It contains proposed membership and held-package notices and the tax/refund/dispute
review scope. Commercial/legal approval is now confirmed by Jorge; this working
draft is not a substitute for the client's final legal instruments. Earlier references to
the old $49/$99/$199 pricing in the September 22 package have been corrected.
On September 23 Jorge approved an expiring operator-only $9.99 live checkout and
period-end cancellation, plus up to two targeted operator emails/two pushes with
temporary production token registration and cleanup. These approvals do not open
general sales. Jorge's subsequent commercial/legal confirmation closes the approval
gate below; it does not activate sales, tax collection or automatic identity deletion.

Approval provenance for the rows below: Jorge's explicit confirmation in this
conversation, 23 September 2026. No separate reviewer name, signed policy version,
tax-registration details or retention duration was supplied; do not invent those
values or change runtime settings based on this status correction.

| Required decision | Material to review | Status |
| --- | --- | --- |
| Membership contract | Member-only plans; 3/$9.99, 25/$19.99, Unlimited/$59.99 monthly; $99/$199/$599 annual; USD before applicable taxes | Approved, per Jorge's confirmation |
| Allowance rules | Annual plans reset allowances monthly; Trust package counts as one workflow; regeneration/retry accounting and no rollover/overage | Approved, per Jorge's confirmation |
| Continuity and final release | Accepted notary work can finish after membership lapses; unreleased final sealed/acknowledged package remains held until valid entitlement; already released evidence preserved | Approved, per Jorge's confirmation |
| Notary fees | Notaries do not pay DARCi subscriptions; in-person notary fees are separate | Approved, per Jorge's confirmation |
| Tax treatment | Selling legal entity, taxable jurisdictions, registrations, collection mechanism, customer location and invoice disclosures | Approval confirmed by Jorge; specific configuration is not inferred from this or tax-exclusive Prices |
| Cancellation and refunds | Period-end cancellation, upgrade/proration/downgrade rules, refund eligibility, disputes and customer support notices | Approved, per Jorge's confirmation |
| Evidence and legal wording | CA/OH specimens and acknowledgments, genuine hash-only verification, public status/hash without public PDF downloads | Approved, per Jorge's commercial/legal confirmation |
| Privacy and retention | Identity collection/storage, legal holds; automatic identity deletion remains disabled and no retention duration is inferred | Approval confirmed by Jorge; existing no-automatic-deletion decision remains unchanged |

## Operator acceptance, kept separate from legal approval

- [x] Real production OTP email and SMS receipt: Jorge confirmed both from the 19:55 UTC test on 23 September; no OTP copied into chat/logs.
- [ ] Phase 4: completed production-build login verification/recovery and negative-code acceptance; receipt alone does not close these.
- [x] Production APNs key configured/deployed; Apple accepted one approved operator push.
- [x] Actual authorized operator device receipt confirmed by Jorge.
- [x] Targeted AWS outbox email/push and authenticated production registration/open API/deactivation accepted; Jorge confirmed both messages. Duplicate job run sends nothing. Synthetic open API is not physical production-app tap acceptance.
- [x] Private scheduled notification worker enabled after empty-backlog review; real operator upload-ready email signed delivery callback and repeated-action no-new-jobs check passed. Independent in-app-only probe processed by `worker-scheduled`. No client email/SMS/push sent. [Evidence](production-notification-rollout-2026-09-23.md).
- [x] Jorge confirmed receipt of the actual upload-ready email sent at 16:29 Mexico City on 23 September; signed delivery callback also verified. No resend needed.
- [ ] Phase 4: physical production-build push tap/navigation and invalid-token lifecycle accepted; current TestFlight still targets staging.
- [x] Approved operator Checkout paid; paid entitlement/three-unit allowance, real signed callback, duplicate paid-event replay, zero-issue deployed reconciliation and period-end cancellation verified. Authorized Portal session creation passed. Temporary purchase window closed and paid access preserved. No refund or further charge.
- [ ] Phase 4: applicable production Checkout/Portal/Apple Pay UI acceptance; server-side session creation does not prove a completed UI flow.
- [ ] Production address entry tested through the supported server/manual path.
- [ ] Consecutive scheduled backup evidence and representative-volume restore timing recorded; on-demand tests cannot manufacture elapsed scheduled cadence.
- [x] Hosted owner/unrelated/assigned-notary/wrong-notary/admin API, private Storage, Realtime topic/queue and real TOTP boundaries recorded; temporary privileges revoked. [Evidence and scope](production-phase23-acceptance-2026-09-23.md).
- [ ] Remaining signer/held-release/full-device acceptance; already-open Realtime socket eviction is not proven by reconnect rejection.
- [ ] New infrastructure detector delivery and cost/rotation ownership recorded.
- [ ] Client cohort/IP allowlist and device/product acceptance completed before public launch.

Do not mark Phase 2 or 3 complete from green CI, configured credentials, or this checklist alone.
