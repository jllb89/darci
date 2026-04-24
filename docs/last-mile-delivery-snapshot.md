# Last Mile Delivery Snapshot

Last updated: 2026-04-23

Purpose:

This is the concise record of what has already shipped for the last-mile program.

If the question is “what is done right now,” use this document first.

## Current Headline

1. Stage A database-first foundation is materially complete through Phase 6, with the current hardening pass also landed for the non-provider pieces already implemented.
2. The backend-first follow-up after DB readiness has Track 1 through Track 6 complete, with the shared, notary, notification, invite, and hardening runtime surfaces now locked as backend contracts.
3. The main remaining gap is frontend cutover to the real workspace APIs plus provider-dependent integrations.

## Completed Foundation

### Phase 0: Blueprint And Staging Audit

Completed:

1. Live staging schema introspection.
2. Current-state schema inventory.
3. Scope-to-schema gap matrix.
4. State-machine pack.
5. Auth, role, and RLS audit.
6. Audit-event drift review.
7. Target ERD draft.
8. Additive migration sequence draft.
9. Compatibility and rollout notes.

### Phase 1: Multi-Role Identity And Verification Foundation

Completed:

1. Multi-role schema pack applied to staging.
2. `member`, `pro`, `notary`, and `admin` locked as canonical runtime roles.
3. Compatibility sync between `public.users.role` and `public.user_roles`.
4. Runtime multi-role authorization upgrade.
5. User active-role switching APIs.
6. Admin role assignment and active-role APIs.
7. OpenAPI sync for the shipped role surface.

### Phase 2: Billing And Entitlement Schema Foundation

Completed:

1. Billing identity, catalog, orders, subscriptions, entitlements, and delegated-payment schema pack applied to staging.
2. Pro credit wallet, lot, reservation, and transaction schema foundation applied.
3. Stripe webhook idempotency and billing safety tables added.
4. Billing catalog seeded from the payment spec.
5. Backfill for default billing accounts and active Pro wallets.

### Phase 3: Invite And Notification Schema Foundation

Completed:

1. Invite, token, claim, outbox, delivery, preference, and outbound-event schema pack applied to staging.
2. Notification template catalog seeded, including the second-wave and client-pay expansions.
3. Mounted review, signing, and notarization flows now enqueue notification outbox rows against the seeded template keys.
4. Invite and notification RLS visibility rules landed.

### Phase 4: Workflow, Code, And Review Runtime

Completed:

1. Bundle-oriented illuminotarization workflow tables and compatibility bridge columns landed.
2. `POST /documents/{id}/submit-notarization` now dual-writes legacy request or code rows plus the workflow model.
3. Notary code resolve, resend, and regenerate paths now persist assignment, status history, code delivery, and access-attempt state.
4. Notary review-decision runtime is mounted for `approved`, `rejected`, and `changes_requested`.
5. Uploaded-document signing preparation inconsistency was fixed so uploaded PDFs can reach signing and notarization flows without intake-draft assumptions.

### Phase 5: Meeting, Evidence, And Identity Verification Runtime

Completed:

1. Meeting evidence schema pack applied to staging.
2. Meeting propose, check-in, confirm, reschedule, cancel, and no-show routes are mounted.
3. Identity-verification, proximity-evaluation, and artifact routes are mounted.
4. Focused integration coverage and staging smoke coverage landed.

### Phase 6: Finalization, Hashing, Ledger Attempt, And Public Verification Runtime

Completed:

1. Finalization schema pack applied to staging.
2. `POST /documents/{id}/append-acknowledgment`, `POST /documents/{id}/watermark`, and `GET /verify/{idn}` are mounted.
3. Acknowledgment append and watermark finalization now mutate real PDF bytes.
4. Hashing now runs against transformed final output bytes.
5. Public verification semantics now require completed-hash plus anchored-ledger proof.
6. Closeout defaults now come from persisted jurisdiction configuration.
7. `GET /documents/{id}/timeline` now returns persisted workflow and finalization history instead of placeholder state.
8. OpenAPI, focused tests, and staging smoke coverage were updated with the shipped closeout flow.

### Phase 7: Current Hardening Slice

Completed:

1. Verification semantics tightened to require anchored proof.
2. Ledger behavior moved behind a provider boundary and fails closed outside allowed environments.
3. Placeholder success surfaces were downgraded or removed where the runtime is not mounted end to end.
4. Placeholder-only OpenAPI responses were removed.
5. Persisted document timeline behavior was restored.
6. Focused regression coverage was added for verification semantics, ledger-provider gating, and placeholder-endpoint behavior.

Still open inside this hardening area:

1. The generic document workspace UI is not considered done until the frontend uses the real shared workspace contracts.
2. A real external ledger provider is still pending owner and provider input.

## Backend-First Work Shipped After DB Readiness

### Track 1: Dashboard Aggregation And Role-Aware Dashboard APIs

Completed:

1. `GET /dashboard` now returns a role-aware dashboard payload for member, Pro, notary, and admin.
2. `GET /dashboard/member` remains mounted as a compatibility route while the shared dashboard UI is still being cut over.
3. Focused tests and OpenAPI updates landed with the new dashboard surface.

### Track 2: Shared Document, Request, And Verification Read Models

Completed:

1. `GET /documents` and `GET /documents/{id}` now include an additive `summary` block for workflow, finalization, and verification readiness.
2. `GET /requests`, `GET /requests/{id}`, and `GET /requests/{id}/timeline` are mounted as shared role-aware request read models.
3. Request detail now returns richer document metadata, workflow context, latest code-delivery context, owner summary, notary summary, capabilities, warnings, and next-action hints.
4. `GET /verification` and `GET /verification/{idn}` are mounted as authenticated verification workspace read models.
5. Verification detail now includes persisted request, workflow, latest code-delivery, latest verification-check, and latest anchor-attempt context.
6. OpenAPI and focused tests were updated for the shared request and verification surfaces.

Separate frontend follow-up, not counted as backend remaining work:

1. cut the shared document, request, and verification pages over to the routes documented in `apps/web/docs/workspace-api-usage.md`.

### Track 3: Notary Queue And Request-Context APIs

Completed:

1. `GET /notary/requests` is now mounted as the real authenticated notary queue read model.
2. `GET /notary/requests/{id}/context` now returns the real request-context payload instead of a compatibility placeholder.
3. Notary context now includes persisted document versions, meeting evidence, finalization state, capabilities, warnings, and next-action hints.
4. OpenAPI and focused unit and integration coverage were updated for the notary workspace read surface.

Separate frontend follow-up, not counted as backend remaining work:

1. cut the notary workspace pages over to the routes documented in `apps/web/docs/workspace-api-usage.md`.

### Track 4: Notification Outbox Execution And Delivery Observability

Completed:

1. `backend/src/services/notificationOutboxService.ts` now executes due notification jobs instead of leaving notification rows as enqueue-only ledger state.
2. `POST /internal/notification-jobs/run-due` and `POST /internal/notification-deliveries/{id}/events` are mounted for service-role worker execution and generic provider-event ingestion.
3. `GET /admin/notification-jobs`, `GET /admin/notification-jobs/metrics`, and `GET /admin/notification-jobs/{id}` are mounted for operator observability over jobs, deliveries, aggregates, and outbound events.
4. `GET /admin/notification-templates`, `GET /admin/notification-templates/{id}`, `PATCH /admin/notification-templates/{id}`, and `POST /admin/notification-templates/{id}/preview` are mounted for future admin-dashboard template management.
5. Retry scheduling and failure handling now run against the persisted job and delivery attempt model already present in Phase 3.
6. The notification runtime now renders subject and body content from `notification_templates` in the database and sends email through the Resend adapter in staging and production.
7. `POST /webhooks/resend` is mounted before auth and before JSON parsing so verified provider delivery events can reconcile back into delivery and job state.

Deferred provider follow-up, not counted as Track 4 remaining work:

1. add focused unit and integration coverage for webhook mapping and duplicate-event handling.

### Track 5: Invite Issuance, Resend, Revoke, And Claim Runtime

Completed:

1. `GET /invites` and `POST /invites` are mounted for authenticated invite lifecycle reads and signer-linked invite issuance tied to `document_output_signers`.
2. `POST /invites/{id}/resend` and `POST /invites/{id}/revoke` now rotate or revoke invite tokens while keeping invite lifecycle counters and notification linkage in sync.
3. `GET /invites/public/{token}` and `POST /invites/public/{token}/claim` are mounted for public signer-entry validation and claim flows, with optional bearer auth for existing-account claim mode.
4. Seeded signer-invitation, signup-required, and reminder templates are now exercised by the live invite runtime instead of remaining schema-only seeds.
5. OpenAPI and focused helper plus route tests were updated for the mounted invite surface.

### Track 6: Phase 7 Hardening That Does Not Need External Provider Decisions

Completed:

1. Meeting-evidence and illuminotary-asset storage policies were tightened to bind object access to persisted artifact ownership and meeting visibility rules.
2. Meeting artifact retention lifecycle constraints now enforce valid retention windows and required redaction timestamps for redacted, expired, and deleted states.
3. `POST /internal/meeting-artifacts/enforce-retention` is mounted as the service-role hardening endpoint for retention enforcement.
4. Focused Track 6 coverage was added and backend QA sweeps now include shared verification, notary meeting, invite, and notification slices.

## Latest Validation State

1. Phase 4, Phase 5, and Phase 6 staging smoke harnesses have been run and documented in the delivered phases above.
2. Focused unit and integration coverage was added for dashboard, request read models, verification read models, the notary workspace read models, the notification outbox runtime, and the invite runtime.
3. OpenAPI has been kept in sync with the mounted routes described here.
4. Backend typecheck currently passes from `backend/` when run with `NODE_OPTIONS` cleared in this workspace environment.

## Remaining Work At A Glance

1. Cut the shared frontend workspace pages over to the real APIs documented in `apps/web/docs/workspace-api-usage.md` as a separate frontend stream.
2. Add Stripe-backed billing runtime after product and provider decisions are finalized.
3. Replace the stub ledger path with a real external provider after provider input is finalized.