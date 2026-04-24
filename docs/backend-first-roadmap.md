# Backend-First Roadmap

Last updated: 2026-04-23

Purpose:

This is the execution roadmap for backend work that can move forward before frontend cutover.

Checking an item below means the backend contract, service logic, tests, and OpenAPI updates for that slice are complete even if the UI has not been cut over yet.

Frontend cutover work is tracked separately in `apps/web/docs/workspace-api-usage.md` and is not counted as remaining work inside this document.

## Current Status

1. Track 1 is complete.
2. Track 2 is complete.
3. Track 3 is complete.
4. Track 4 is complete.
5. Track 5 is complete.
6. Track 6 is complete.
7. Stripe-backed billing runtime and real ledger-provider integration remain deferred until external input is available.

## Track 1: Dashboard Aggregation And Role-Aware Dashboard APIs

Status:

- [x] Completed 2026-04-22

Delivered:

1. `GET /dashboard` returns the role-aware dashboard payload for member, Pro, notary, and admin roles.
2. `GET /dashboard/member` remains mounted as the compatibility route for older member-only UI.
3. Focused integration coverage and OpenAPI updates shipped with the new contract.

Primary backend surfaces:

1. `backend/src/routes/dashboard.ts`
2. `backend/src/controllers/dashboardController.ts`
3. `backend/src/services/dashboardAggregationService.ts`

Exit signal:

1. the shared `/app` dashboard can replace mock arrays without inventing a new backend shape.

## Track 2: Shared Document, Request, And Verification Read Models

Status:

- [x] Completed 2026-04-22

Delivered:

1. `GET /documents` and `GET /documents/{id}` return a persisted `summary` block for workflow, finalization, and verification readiness.
2. `GET /requests`, `GET /requests/{id}`, and `GET /requests/{id}/timeline` are mounted as shared role-aware request read models.
3. Request detail includes server-shaped document metadata, workflow, latest code delivery, owner summary, notary summary, meeting state, capabilities, warnings, and next-action hints.
4. `GET /verification` and `GET /verification/{idn}` are mounted as shared verification workspace read models.
5. Verification detail now includes persisted request, workflow, latest code-delivery, latest verification-check, and latest anchor-attempt context in addition to the verification result, identity summaries, document summary, and audit trail.
6. Focused request and verification tests plus OpenAPI coverage are in place for the shared read-model surface.

Primary backend surfaces:

1. `backend/src/routes/documents.ts`
2. `backend/src/controllers/documentsController.ts`
3. `backend/src/services/documentWorkspaceReadModelService.ts`
4. `backend/src/routes/requests.ts`
5. `backend/src/controllers/requestsController.ts`
6. `backend/src/services/requestReadModelService.ts`
7. `backend/src/routes/verification.ts`
8. `backend/src/controllers/verificationController.ts`
9. `backend/src/services/verificationReadModelService.ts`
10. `backend/src/services/workspaceIdentitySummaryService.ts`
11. `backend/src/routes/verify.ts`
12. `backend/src/controllers/verifyController.ts`

Exit signal:

1. the shared document, request, and verification routes are stable persisted backend contracts with focused tests and OpenAPI coverage, and no further backend shape work is required for the shared workspace cutover.

## Track 3: Notary Queue And Request-Context APIs

Status:

- [x] Completed 2026-04-23

Delivered:

1. `GET /notary/requests` now returns the authenticated notary queue backed by persisted request, workflow, meeting, and finalization state.
2. `GET /notary/requests/{id}/context` now returns the real request context with document versions, meeting evidence, finalization state, capabilities, warnings, and next-action hints.
3. Focused unit and integration coverage plus OpenAPI updates landed with the new read-model surface.

Primary backend surfaces:

1. `backend/src/routes/notary.ts`
2. `backend/src/controllers/notaryWorkspaceController.ts`
3. `backend/src/services/notaryWorkspaceReadModelService.ts`
4. `backend/src/services/meetingService.ts`
5. `backend/src/services/documentFinalizationService.ts`

Exit signal:

1. the notary route tree no longer depends on placeholder request-context responses and the notary frontend has a stable backend contract for queue and request context reads.

## Track 4: Notification Outbox Execution And Delivery Observability

Status:

- [x] Completed 2026-04-23

Delivered:

1. `backend/src/services/notificationOutboxService.ts` now executes due notification jobs on top of `notification_jobs`, `notification_deliveries`, and `outbound_message_events`.
2. `POST /internal/notification-jobs/run-due` and `POST /internal/notification-deliveries/{id}/events` are mounted for service-role worker execution, retry-state advancement, and provider-event ingestion.
3. `GET /admin/notification-jobs`, `GET /admin/notification-jobs/metrics`, and `GET /admin/notification-jobs/{id}` are mounted for operator observability before any ops UI cutover.
4. `GET /admin/notification-templates`, `GET /admin/notification-templates/{id}`, `PATCH /admin/notification-templates/{id}`, and `POST /admin/notification-templates/{id}/preview` are mounted for notification-template operator tooling.
5. Email execution now uses the Resend adapter in staging and production while local fallback remains on the internal adapter.
6. `POST /webhooks/resend` is mounted for verified provider webhook ingestion back into the delivery ledger.
7. Focused OpenAPI updates shipped with the expanded notification runtime.

Primary backend surfaces:

1. `backend/src/services/notificationService.ts`
2. `backend/src/services/notificationOutboxService.ts`
3. `backend/src/services/notificationTemplateRenderService.ts`
4. `backend/src/controllers/notificationInternalController.ts`
5. `backend/src/controllers/notificationAdminController.ts`
6. `backend/src/controllers/notificationTemplateAdminController.ts`
7. `backend/src/controllers/notificationWebhookController.ts`
8. `backend/src/routes/internal.ts`
9. `backend/src/routes/admin.ts`
10. `backend/src/routes/webhooks.ts`

Exit signal:

1. notification rows are an executable delivery pipeline instead of only an enqueue ledger.

## Track 5: Invite Issuance, Resend, Revoke, And Claim Runtime

Status:

- [x] Completed 2026-04-23

Delivered:

1. `GET /invites` and `POST /invites` are mounted for authenticated invite lifecycle reads and signer-linked invite issuance tied to `document_output_signers`.
2. `POST /invites/{id}/resend` and `POST /invites/{id}/revoke` now rotate tokens, track resend or revoke lifecycle state, and keep invite-linked notification rows connected to the persisted outbox model.
3. `GET /invites/public/{token}` and `POST /invites/public/{token}/claim` are mounted for public token validation and claim flows, with optional bearer auth supporting existing-account-only claim mode.
4. Focused unit and integration coverage plus OpenAPI updates landed with the invite runtime.

Primary backend surfaces:

1. `backend/src/routes/invites.ts`
2. `backend/src/controllers/inviteController.ts`
3. `backend/src/services/documentInviteService.ts`
4. `backend/src/services/inviteClaimService.ts`

Exit signal:

1. the invite domain is mounted end to end at the API layer instead of existing only as schema plus seeded templates.

## Track 6: Phase 7 Hardening That Does Not Need External Provider Decisions

Status:

- [x] Completed 2026-04-23

Delivered:

1. `supabase/migrations/20260423103000_add_track6_phase7_hardening.sql` now tightens meeting-evidence and illuminotary-asset storage policies by binding object access to persisted `meeting_artifacts` and `illuminotary_assets` ownership or visibility rules.
2. Meeting-evidence retention lifecycle rules now enforce retention-window validity and redaction timestamps for `meeting_artifacts` records.
3. `POST /internal/meeting-artifacts/enforce-retention` is mounted as a service-role hardening endpoint that advances expired evidence artifacts into lifecycle-expired state.
4. Focused Track 6 integration coverage plus a backend QA sweep across verification, notary meeting, invite, and notification runtime slices now runs clean with OpenAPI updated.

Primary backend surfaces:

1. Supabase RLS and storage-policy surfaces
2. `backend/src/services/meetingService.ts`
3. `backend/src/services/auditService.ts`
4. release QA and smoke coverage

Exit signal:

1. backend policy and release-safety work is done except for the provider integrations that still need owner input.

## Deferred Tracks Requiring Additional Input

### Stripe-Backed Billing Runtime

Status:

- [ ] Waiting for product and provider input

Still needed:

1. Stripe account and environment plan,
2. final checkout and delegated-pay behavior choices,
3. webhook and provider configuration expectations,
4. product decisions for payment-responsibility edge cases.

### Real Ledger Provider Integration

Status:

- [ ] Waiting for provider input

Still needed:

1. the chosen external ledger provider,
2. provider credential and environment model,
3. anchoring, retry, and proof-return expectations,
4. compliance and audit constraints tied to the real provider.

## Suggested Execution Order From Here

1. begin the deferred provider-backed tracks only after owner input is finalized.