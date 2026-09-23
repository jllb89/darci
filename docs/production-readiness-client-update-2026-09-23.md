# DARCi — Production Readiness Update
**23 September 2026**

DARCi has progressed from private-beta development to a deployed, access-restricted production environment. The work now extends beyond product functionality: it includes the security, payment controls, recovery capability and operational safeguards needed to support real customers and notarized documents. The planned delivery date is moving because final production acceptance remains incomplete—not because development has been idle.

## What has been delivered

- **Production infrastructure and deployment:** Deployed the web application, API and background processing on AWS, with a dedicated production database, private document storage, HTTPS and routing for `app.illuminotary.com` and `api.illuminotary.com`. Added restricted release permissions, firewall protection and an AWS activity archive. A deliberately failed release successfully triggered automatic rollback.
- **Security and document integrity:** Strengthened member/notary/admin access boundaries, session revocation and privileged-action MFA. All 97 public-schema production tables have row-level security enabled. Protected sensitive identity metadata, implemented genuine SHA-256 document verification and separated public verification information from authorized document downloads. Existing PDFs and signatures were preserved.
- **Backups that have been restored:** Implemented encrypted, versioned backups and recovery procedures. A beta-data recovery exercise verified 2,533 stored objects byte-for-byte and restored application functionality within the four-hour target. Separately, production test PDFs were restored successfully, and two scheduled production backups completed approximately 12 hours apart. Production-scale recovery validation remains outstanding.
- **Membership and billing:** Implemented member subscriptions, document allowances, web/iOS membership screens and subscription management. Tested Stripe subscription changes, payment-failure handling, duplicate/delayed events and reconciliation in staging. Configured the six approved live monthly/annual prices and production integration; general purchases remain disabled pending controlled live acceptance.
- **Mobile reliability and communications:** Addressed reported PDF-preview, keyboard, layout, accessibility and notary-selection issues. Added authorization resilience and SMS delivery tracking/correlation; extended staging OTP validity to three minutes. Production email delivery and SMS receipt have been confirmed. Recent validation includes 795 backend tests and 132 iOS unit/UI tests passing in their respective runs.
- **Operational readiness:** Added actionable AWS alerts, deployment and recovery runbooks, environment documentation and an evidence-backed launch checklist. Hosted production access tests also identified and corrected an assigned-notary realtime authorization defect.

## What remains before public launch

1. **Final device and workflow acceptance:** Complete client testing across Trust packages, POA and document notarization, including login/recovery, signing, notary handoff and final-document access.
2. **Remaining provider checks:** Configure and verify Apple push notifications on a real device; validate the supported server-side/manual address-entry flow. Google account/key-restriction review remains deferred, with browser Maps disabled.
3. **Live billing and approval:** Complete one explicitly authorized live checkout and subscription-management test, and obtain approval of legal wording, privacy/retention rules, billing terms and tax treatment.
4. **Operational acceptance and rollout:** Finish representative-volume production recovery and remaining operational checks, then admit the selected client testing cohort before opening public access.

**Delivery status:** The private production foundation is deployed and substantial engineering validation is complete. Public signup and general live purchases remain closed intentionally. The next milestone is completion of the remaining acceptance checks and approvals, followed by a controlled launch; the revised launch date should be confirmed against those results.
