# Product Selection To Generation Client Talking Points

Last updated: 2026-04-23

## Purpose

This is the short client-facing version of the current DARCi workflow.

It focuses on what is implemented today, what has been completed across Phases 1 through 6 plus the Track 5 and Track 6 backend closeout work, what has been validated in staging, and what remains next.

## What DARCi Can Do Today

1. members can select a supported product flow and jurisdiction,
2. the platform builds the right guided intake experience dynamically,
3. drafts autosave and can be resumed,
4. submitted information is validated and turned into generation-ready document state,
5. preview PDFs are generated for review,
6. members can approve the reviewed document set and sign the official PDFs,
7. completed signing flows can now be submitted into the illuminotarization workflow,
8. the illuminotarization workflow now supports code-based access, review decisions, meeting scheduling, evidence capture, and downstream closeout,
9. the final document can now be hashed, anchored to the ledger, and verified publicly by its IDN,
10. issuer-side invite lifecycle APIs and recipient-side public claim flows are now mounted,
11. admin operators can now inspect notification job metrics, edit DB-backed notification templates, and preview interpolated output server-side before saving,
12. meeting-artifact retention enforcement and tighter storage-policy hardening are now in place.

## Current End-To-End Flow

1. select the product and jurisdiction,
2. complete the guided intake,
3. autosave and submit the document,
4. generate preview documents,
5. review and approve the visible output set,
6. prepare and capture official signatures,
7. submit for illuminotarization,
8. resolve the access code and complete illuminotary review,
9. schedule and complete the in-person meeting,
10. append the acknowledgment and apply the final watermark,
11. record the final document hash and ledger proof,
12. verify authenticity through the public verification endpoint,
13. issue, resend, revoke, validate, and claim invites through the mounted Phase 3 API layer.

## What Was Completed In Phases 1-6

### Phase 1: Multi-Role Identity

1. users can now hold more than one role on the same account,
2. the active role can be switched without creating separate accounts,
3. admin role assignment and active-role management are implemented,
4. this created the identity foundation for member, Pro, notary, and admin workflows.

### Phase 2: Billing And Entitlements Foundation

1. billing accounts, products, prices, subscriptions, orders, and entitlements are now modeled in the platform,
2. Pro credit wallets and delegated payment-request foundations are in place,
3. this phase established the platform layer needed for payments, subscriptions, and usage control,
4. live payment execution is still the next step on top of this foundation.

### Phase 3: Invitations And Notifications Foundation

1. invite, token, claim, delivery, preference, and outbound-message models are now in place,
2. the platform now has a seeded notification catalog covering the main workflow milestones,
3. review, signing, notarization, invite issuance, and code-delivery paths already write into the notification outbox,
4. the live email runtime now renders subjects and bodies from `notification_templates` in the database and delivers email through Resend in staging and production,
5. admin notification endpoints now expose job lists, metrics, template list/detail/update, and server-side preview for future dashboard tooling,
6. authenticated invite list, create, resend, and revoke APIs plus public validate and claim flows are now implemented.

### Phase 4: Illuminotarization Workflow

1. submit-notarization now opens a real workflow instead of relying only on the legacy request pattern,
2. code resolution, resend, regenerate, and review-decision flows are implemented,
3. workflow assignment, status history, code deliveries, and access attempts are tracked,
4. this phase is implemented and staging-validated.

### Phase 5: Meeting And Evidence

1. meeting proposal, confirmation, reschedule, cancellation, no-show, and check-in flows are implemented,
2. identity verification, geolocation capture, same-place evaluation, and meeting artifact tracking are implemented,
3. this gives the in-person meeting step a real evidence layer,
4. this phase is implemented and staging-validated.

### Phase 6: Finalization And Public Verification

1. acknowledgment append and watermark finalization are implemented,
2. the final document chain now records execution history, hash records, ledger anchor attempts, and verification checks,
3. public verification by IDN is implemented,
4. this phase is implemented and staging-validated.

### Track 6 Hardening Follow-Through

1. meeting-artifact retention lifecycle rules are now enforced in schema and runtime,
2. tighter storage-policy coverage is now in place for meeting evidence and illuminotary assets,
3. the service-role endpoint `POST /internal/meeting-artifacts/enforce-retention` is mounted for operational cleanup,
4. this hardening slice is implemented, integration-tested, and included in the backend QA sweep.

## What Has Been Validated

1. the downstream workflow has been exercised end to end against staging,
2. Phase 4 smoke validation covers upload, review approval, submit-notarization, and code resolution,
3. Phase 5 smoke validation covers meeting happy-path, cancellation, and no-show scenarios plus evidence persistence,
4. Phase 6 smoke validation covers acknowledgment append, watermark finalization, hash recording, ledger anchoring, and public verification,
5. Track 5 focused tests cover invite issuance, public validation, claim, resend, and revoke behavior,
6. Track 6 focused tests cover retention enforcement and related hardening flows,
7. the latest 2026-04-23 staging rerun passed Phase 4, Phase 5, and Phase 6 smoke validation after remote migration parity was restored.

## What This Means For Clients

1. DARCi is no longer only an intake and PDF-generation system,
2. the platform now supports the operational path from guided intake through signing, illuminotarization workflow, meeting evidence, finalization, public verification, and invite-based access handoff,
3. the first six phases plus the latest invite and hardening work established the foundation for identity, billing, notifications, workflow orchestration, meeting compliance, and document authenticity.

## What Comes Next

1. frontend cutover to the real workspace APIs, including the invite and downstream operational surfaces,
2. payment execution on top of the live billing and entitlement foundation,
3. broader UI rollout beyond the current operational start, review, and sign surfaces,
4. delivery-provider webhook ingestion and bounce/complaint synchronization back into outbound delivery events,
5. real provider integrations where the backend still uses stubbed contracts, especially ledger anchoring.

## 2026-04-23 Status Update

1. Track 5 invite runtime is complete and mounted in the API, with OpenAPI and focused test coverage in place,
2. Track 6 hardening is complete, including the latest migration and retention-enforcement endpoint,
3. staging migration state was reconciled so local and remote histories now match,
4. Resend is now wired as the live email provider with DB-backed template rendering instead of hardcoded copy in services,
5. admin notification template list, edit, and preview endpoints are now mounted for the future dashboard,
6. the smoke checklist for Phase 4, Phase 5, and Phase 6 was rerun successfully,
7. the backend-first roadmap is now complete through Track 6.