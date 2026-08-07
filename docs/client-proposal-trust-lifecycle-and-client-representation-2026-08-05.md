# DARCi Trust Lifecycle & Client Representation Enhancement

**Proposal date:** August 5, 2026  
**Prepared for:** Illuminote, Inc.  
**Estimated delivery:** 6-8 weeks  
**Fixed project fee:** **$15,000**

## Objective

Extend DARCi so members can maintain an existing trust registration through its full lifecycle and verified professionals can prepare documents for multiple clients without taking ownership of, impersonating, or signing for those clients.

The work will reuse DARCi's existing jurisdiction rules, document-generation, signing, notarization, invitation, audit, and billing foundations.

## Scope of Work

### 1. Add an Amendment to an Existing Trust Registration

A member will be able to select an active registered trust and add a trust amendment or other qualifying instrument to its existing registration record.

Deliverables:

- “Add amendment” action from the registered trust workspace.
- Amendment details, effective date, document upload, and required member confirmations.
- Validation that the trust is active and that the requesting member has authority to update it.
- Permanent association of the amendment with the original trust registration and DARCi number.
- Updated trust document inventory and immutable version/history records.
- Generation of a **new Trust Certification** reflecting the current registered documents.
- No Trust Registration Amendment will be generated for this workflow, as requested.
- Member notifications, activity timeline entries, and administrator support visibility.

### 2. Deregister an Existing Trust

A member will be able to request deregistration of an active trust through a controlled, auditable workflow.

Deliverables:

- “Deregister trust” action with reason, effective date, review, and explicit confirmation.
- Eligibility and authority checks, including protection against duplicate or invalid requests.
- Trust lifecycle states such as active, deregistration pending, and deregistered.
- Generation of the approved **Deregistration Amendment** document.
- Existing signing and notarization workflow integration where required by policy or jurisdiction.
- Preservation of the original registration, documents, certificates, and audit history after deregistration.
- Updated member dashboard and public verification status so a deregistered trust is clearly identified without erasing its historical record.
- Subscription/entitlement closure trigger, subject to the final business rule approved by Illuminote.
- Confirmation notifications and administrator support visibility.

### 3. Prepare Documents on Behalf of Another Person

Add a professional client workspace for attorneys and other approved Pro users who prepare DARCi documents for multiple clients.

Deliverables:

- Client directory with search, status, active matters/documents, and invitations.
- Create a client record or select an existing client before beginning a document.
- Prepare and save document drafts on behalf of the selected client.
- Clear separation among the professional who prepared the document, the client who owns/benefits from it, and the party who pays.
- Secure client invitation and account-claim flow for new or existing DARCi users.
- Client review, acceptance, and ownership handoff before execution or registration.
- Permission controls that allow preparation and collaboration but do not permit the professional to impersonate or sign for the client.
- Ability for the client or authorized administrator to revoke professional access.
- Pro payment choice using an eligible credit balance or sending a payment request to the client, using the existing delegated-payment foundation.
- Pro and client dashboards showing only records each user is authorized to access.
- Complete audit trail recording the actor, client, action, permission source, payment source, and timestamps.

### 4. Platform, Security & Quality Work

- New trust lifecycle, trust-document association, and professional-client access data models.
- Database migrations, row-level access rules, API authorization, and role/entitlement enforcement.
- Responsive web and native iOS member/Pro workflow updates.
- Generation-template bindings for the revised certification and deregistration amendment.
- Notification and audit-event updates.
- Automated unit, integration, authorization, generation, and regression coverage.
- Staging rollout support, acceptance fixes, and production release preparation.

## Investment

| Workstream | Fee |
| --- | ---: |
| Existing trust amendment attachment and refreshed certification | $3,250 |
| Trust deregistration and Deregistration Amendment workflow | $3,750 |
| Professional client workspace and on-behalf-of preparation | $6,500 |
| Cross-platform security, audit, QA, and release readiness | $1,500 |
| **Total fixed fee** | **$15,000** |

Suggested payment schedule: 40% at kickoff, 30% after staging delivery of trust lifecycle workflows, and 30% after staging delivery of the professional client workflow.

## Delivery & Acceptance

Estimated delivery is 6-8 weeks from approval, receipt of final legal templates, and confirmation of the open business rules. Work may be released in two stages: (1) trust maintenance and deregistration, then (2) professional client representation.

Acceptance will include successful member and Pro workflows in staging, correct document outputs, authorization isolation between unrelated users, complete audit history, and regression coverage for existing registration, signing, notarization, and billing flows.

## Assumptions & Exclusions

- Illuminote will provide or approve the final legal language and jurisdiction rules for the revised Trust Certification and Deregistration Amendment. Software implementation does not include independent legal advice.
- The initial release will use DARCi's currently supported trust jurisdictions and existing generation architecture. New jurisdictional legal research or unrelated document families are outside this quote.
- The client remains the document owner and required signer. “On behalf of” means authorized preparation and workflow administration, not legal impersonation or delegated execution.
- Final deregistration billing behavior, refund policy, notice period, and any required internal approval will be confirmed before development.
- Existing Stripe, Pro credit, invitation, and notification foundations will be reused. Stripe fees, Apple fees, external legal review, and third-party service charges are excluded.
- Historical records will be preserved. Bulk cleanup or reconstruction of incomplete legacy trust data is not included, except for the minimum migration needed to connect valid existing registrations to the new lifecycle.
- Quote is valid for 30 days. Material changes to legal templates, workflow approval requirements, or supported platforms may require a written change order.