# Production policy review — decisions still required

Assigned reviewer: **Jorge, lopezb.jl@gmail.com**, per 22 September instruction. Assignment is recorded; no legal/commercial approval is inferred. Route legal wording to qualified client/counsel review as appropriate. Nothing in this package certifies enforceability, statutory compliance or App Store acceptance.

## Approved engineering boundaries

- Fresh production accounts/documents; preserve beta separately, including historical PDF exceptions.
- CA/OH in-person products only: Trust packages, ordinary POA and uploaded-document notarization. No Dynamic POA or notary subscription charges.
- Genuine SHA-256 verification; no external-ledger anchoring claim at launch.
- Public verification provides status/hash only, never a PDF or download URL. A billing-held package currently returns not-found publicly. Downloads stay inside authorized app access.
- Identity protection enabled; **no automatic identity deletion** without an approved schedule.
- Recovery goals: at most 24 hours of loss and four hours to restore service. These are goals, not a completed whole-application restore certification.

## Review and explicitly approve or request changes

| Area | Exact decision needed | Source / evidence | Status |
| --- | --- | --- | --- |
| CA/OH document wording | Approve exact generated Trust/POA/upload acknowledgment specimens and versioned template/rule text for each signing variant. | `docs/templates-catalog.json` is an index, not a substitute for reviewing final specimens and their exact hashes. | Pending; complete specimen review package still required. |
| Identity retention/holds | Define categories, retention triggers/periods, legal-hold authority, access/export rights and release of holds. Cover identity numbers, GPS, logs/caches, documents and backups separately. | Protected identity service and `docs/production-recovery-runbook.md`. | Pending; deletion stays disabled. |
| Membership terms | Approve prices, renewal/cancellation/refund/tax disclosures, allowance definition, effective timing of upgrades/downgrades, and separate notary fees. | `docs/member-membership-pricing-rationale.md`: proposed $49/$99/$199 for 3/10/25 workflows monthly; identical features. | Pending live commercial approval. |
| Continued work and final hold | Confirm how accepted work continues after lapse and whether withholding a newly completed package until resubscription is acceptable; approve member/notary disclosures and support exceptions. | Real staging hold → payment reactivation → identical-byte release passed. Already released packages are not regenerated or re-held by a completed retry. | Engineering policy implemented; legal/customer terms pending. |
| Public verification language | Approve SHA-256/tamper-evidence wording without implying external anchoring, legal validity or public PDF access. | Hash-only implementation; public metadata/held-access tests. | Pending wording approval. |
| Production distribution | Confirm production domains, initial cohort/concurrency and iOS storefront/payment/distribution scope. | Production roadmap, Phase 2/3 provider checklist. | Pending; no Apple approval inferred from the in-person step. |

For approval, record the reviewed artifact/version (and specimen hash where relevant), decision, reviewer and date. Email ownership alone, a green test suite or this checklist is not sign-off. Do not approve unseen document wording by approving the engineering plan.
