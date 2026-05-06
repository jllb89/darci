# Workspace API Usage

Last updated: 2026-04-23

Purpose:

This is the frontend source of truth for the shared authenticated workspace under `/app`.

Use this document when wiring pages in `apps/web/src/app/app` to backend contracts.

When a completed backend track introduces non-`/app` surfaces that future frontend or operator work will need, record them here as supporting guidance instead of leaving them undocumented.

Do not re-derive workflow, verification, or role state in the client when the backend already returns it.

## Ground Rules

1. Use the shared `/app` route tree by default. Do not create role-specific duplicate pages for documents, requests, verification, or billing while the shared contracts below remain valid.
2. Use `GET /users/me` to read the current active role and available roles. Use `PATCH /users/me/active-role` to switch the active in-app role.
3. Use `GET /dashboard` for new dashboard work. `GET /dashboard/member` is a compatibility route for older member-only UI and should not be the default for new shared `/app` work.
4. Use backend summary and capability fields as the source of truth. Do not infer CTA state, workflow progress, or verification readiness from `document.status` alone.
5. Internal verification pages must use authenticated `GET /verification` and `GET /verification/{idn}`. Public `GET /verify/{idn}` is only for external public verification flows.
6. Treat `401` as an auth or session boundary, `403` as a role or access mismatch, and `404` as a missing or inaccessible record. Do not fall back to mock data on any of those responses.
7. When a detail page has a separate timeline endpoint, fetch the timeline lazily when the timeline panel or tab is opened instead of loading it on every list render.

## Shared Route Map

### `/app`

Primary API:

1. `GET /dashboard`

Primary response fields:

1. `role`
2. `metrics[]`
3. `documents[]`
4. `requests[]`
5. `meetings[]`
6. `activity[]`
7. `alerts[]`
8. `nextAction`

Usage notes:

1. Render the page from the role-aware payload returned for the current active role.
2. Do not branch to separate dashboard endpoints per role.
3. Only use `GET /dashboard/member` while migrating older member-specific UI that has not moved to the shared role-aware shape yet.

### `/app/documents`

Primary API:

1. `GET /documents`

Primary response fields:

1. `documents[]`
2. `document.summary.workflow`
3. `document.summary.finalization`
4. `document.summary.verification`

Usage notes:

1. Use the returned `documents[]` directly as the list source.
2. Build lifecycle chips, verification badges, and request linkage from `document.summary.*` instead of deriving those states locally.
3. Use `document.summary.verification.verifyPath` only as a link into the public verifier, not as a data source for the internal workspace.

### `/app/documents/[id]`

Primary API:

1. `GET /documents/{id}`

Primary response fields:

1. `document`
2. `document.summary.workflow`
3. `document.summary.finalization`
4. `document.summary.verification`

Usage notes:

1. Treat `document.summary` as the canonical workspace snapshot for request linkage, latest workflow status, finalization progress, and verification readiness.
2. Do not invent a second document-lifecycle model in the page.

### `/app/review`

Primary API:

1. `GET /documents/{id}/review`

Usage notes:

1. Keep the review page on the review-specific contract.
2. Do not replace review-output rendering with request or verification read models.

### `/app/sign`

Primary APIs:

1. `GET /documents/{id}/signing`
2. `POST /documents/{id}/signatures/request`
3. `POST /documents/{id}/signatures/finalize`
4. `POST /documents/{id}/signatures`
5. `POST /documents/{id}/sign`

Usage notes:

1. Keep signing on the dedicated signing contract.
2. Do not rebuild signing state from request read models.
3. Use the signing response to render readiness, captured signatures, groups, and confirmability.
4. Use `signing.viewerAccess.kind` to distinguish owner/admin/service-role access from `invited_signer`; invited signer responses are already scoped to the assigned `documentOutputSignerId`.
5. Treat `remainingSignerInvites` and `signingCompletion` on signature capture/finalize responses as optional backend summaries. Do not trigger signer invitations client-side.

### Track 5 Invite Runtime

These are supporting APIs for signer entry and issuer-side invite lifecycle management. They are not a separate `/app` route tree, but future `/app/sign` and document-owner flows should use them directly instead of inventing client-side invite state.

Signer-entry APIs:

1. `GET /invites/public/{token}`
2. `POST /invites/public/{token}/claim`

Issuer and operator APIs:

1. `GET /invites?documentId={id}`
2. `POST /invites`
3. `POST /invites/{id}/resend`
4. `POST /invites/{id}/revoke`

Usage notes:

1. Invite links land on `/app/invite?token={token}`. Validate that token first through `GET /invites/public/{token}` before entering the document-signing session.
2. Use `invite.status`, `invite.claimMode`, `invite.token.canClaim`, and `invite.latestClaim` from the public validate response as the source of truth for entry gating, signup prompts, and already-claimed messaging.
3. When a logged-in session exists, pass the normal bearer token to the public invite endpoints so `existing_account_only` invites can be resolved without a second client-side identity check. Signing access still requires the authenticated account email to match the invite email recipient.
4. Call `POST /invites/public/{token}/claim` when the signer chooses to continue, completes signup, or attaches an existing session to the invite.
5. For document-owner tooling, use the protected `/invites` management routes for resend and revoke actions instead of inferring invite state from signer obligations or notification rows.
6. There is no dedicated `/app/invites` page contract yet. When that UI is added later, start from `GET /invites` and the mutation routes above rather than inventing a parallel invite read model.

### `/app/requests`

Primary API:

1. `GET /requests`

Supported shared filters:

1. `status`
2. `limit`
3. `offset`

Restricted filters:

1. `memberId` is admin or service-role only.
2. `notaryId` is admin or service-role only.

Usage notes:

1. Do not expose `memberId` or `notaryId` in member, Pro, or notary-facing filters.
2. Use the shared request list as the only list source for the shared requests workspace.

### Request detail surfaces

Primary APIs:

1. `GET /requests/{id}`
2. `GET /requests/{id}/timeline`

Primary response fields:

1. `request`
2. `document`
3. `workflow`
4. `latestCodeDelivery`
5. `owner`
6. `notary`
7. `meeting`
8. `capabilities`
9. `warnings[]`
10. `nextAction`

Usage notes:

1. Use `GET /requests/{id}` as the primary detail payload.
2. Load `GET /requests/{id}/timeline` only when the user opens a timeline surface.
3. Do not perform separate owner or notary identity lookups. Use `owner` and `notary` from the response.
4. Drive buttons and warnings from `capabilities`, `warnings`, and `nextAction` instead of local rule duplication.

### `/app/verification`

Primary API:

1. `GET /verification`

Supported filters:

1. `idn`
2. `status`
3. `limit`
4. `offset`

Primary response fields:

1. `verifications[]`
2. `verification.owner`
3. `verification.notary`
4. `verification.anchoredAt`
5. `verification.lastCheckedAt`
6. `verification.publicVerifyPath`

Usage notes:

1. Use `owner.displayName` as the primary label when present.
2. Use `status` for the status chip.
3. Use `lastCheckedAt` for recency with `anchoredAt` as fallback.
4. The current page at `apps/web/src/app/app/verification/page.tsx` is fully mock-backed and should be cut over directly to this route.

### `/app/verification/[idn]`

Primary API:

1. `GET /verification/{idn}`

Primary response fields:

1. `verification`
2. `request`
3. `workflow`
4. `latestCodeDelivery`
5. `latestCheck`
6. `anchorAttempt`
7. `owner`
8. `notary`
9. `documents[]`
10. `audit[]`

Usage notes:

1. Treat the route segment as an IDN, not a document id.
2. Rename the route folder from `[id]` to `[idn]` when this page is touched next so the file name matches the contract.
3. Use `request`, `workflow`, `latestCodeDelivery`, `latestCheck`, and `anchorAttempt` for the persisted verification execution context instead of deriving that state from scattered document or request calls.
4. Remove the current mock-only identity fields such as phone and region unless the backend explicitly adds them later.
5. Use `verification.publicVerifyPath` only as a link to the public verification page.

### `/app/notary`

Primary API:

1. `GET /notary/requests`

Supported filters:

1. `status`
2. `limit`
3. `offset`

Primary response fields:

1. `requests[]`
2. `meetings[]`
3. `counts.pending`
4. `counts.scheduled`
5. `counts.completed`
6. `counts.total`

Usage notes:

1. Use `requests[]` as the canonical notary queue list. Each row already includes `request`, `document`, `owner`, `workflow`, `latestCodeDelivery`, `meeting`, `finalization`, and `nextAction`.
2. Use `meetings[]` only for the upcoming-meetings strip or secondary scheduling panels. Do not rebuild the main queue from that array.
3. Treat `request.queueStatus` as the notary-stage status for filtering and CTA grouping.
4. The current page at `apps/web/src/app/app/notary/page.tsx` is mock-backed and should cut over directly to this route.

### `/app/notary/requests/[id]`

Primary API:

1. `GET /notary/requests/{id}/context`

Primary response fields:

1. `context.request`
2. `context.document`
3. `context.owner`
4. `context.notary`
5. `context.workflow`
6. `context.latestCodeDelivery`
7. `context.meeting`
8. `context.evidence`
9. `context.finalization`
10. `context.capabilities`
11. `context.warnings[]`
12. `context.nextAction`

Usage notes:

1. Treat the route segment as a request id.
2. Use `GET /notary/requests/{id}/context` as the single page-shell read. Do not stitch the page together from dashboard, request, verification, or meeting reads.
3. Drive review, meeting, evidence, and finalization sections from `context.*` instead of local workflow derivation.
4. Keep notary actions on the same request id using the existing mutation routes under `/notary/requests/{id}/review-decision` and `/notary/requests/{id}/meeting/*`.
5. Use `context.capabilities`, `context.warnings`, and `context.nextAction` for CTA state and operator messaging.
6. The current page at `apps/web/src/app/app/notary/requests/[id]/page.tsx` is mock-backed and should cut over directly to this route.

### Track 4 Notification Runtime

These are not `/app` browser routes, but they are the canonical backend surfaces for notification execution and operator observability after Track 4.

Operator APIs:

1. `GET /admin/notification-jobs`
2. `GET /admin/notification-jobs/{id}`

Internal worker APIs:

1. `POST /internal/notification-jobs/run-due`
2. `POST /internal/notification-deliveries/{id}/events`

Usage notes:

1. Do not call `/internal/*` routes from browser code or shared `/app` data loaders. These are service-role worker endpoints only.
2. When an admin or ops UI is added later, use `GET /admin/notification-jobs` for the list view and `GET /admin/notification-jobs/{id}` for the detail view over jobs, deliveries, and outbound events.
3. Do not infer notification execution state from scattered `notification_job_id` references on workflow or code-delivery rows alone. Use the Track 4 admin notification reads instead.
4. Treat the internal notification adapter as a backend execution boundary, not as a frontend dependency. A future provider swap should not require a new admin read shape.
5. There is no `/app/notifications` page contract yet. Do not invent one until product scope exists.

### Track 6 Hardening Runtime

This is not a browser-facing API, but it is now part of backend release safety and retention operations.

Internal worker API:

1. `POST /internal/meeting-artifacts/enforce-retention`

Usage notes:

1. Do not call this route from browser code or shared `/app` data loaders. It is a service-role-only maintenance endpoint.
2. Use this endpoint in backend worker or scheduled-job infrastructure to enforce meeting-evidence retention windows over persisted `meeting_artifacts` rows.
3. UI state for meeting evidence should treat `expired` and `deleted` as terminal artifact lifecycle states and should not assume original files remain available indefinitely.

## Current Cutover Order

1. Cut over `apps/web/src/app/app/verification/page.tsx` first.
2. Cut over `apps/web/src/app/app/verification/[id]/page.tsx` next and rename the segment to `[idn]` during that change.
3. Cut over `apps/web/src/app/app/requests/page.tsx` after that.
4. Cut over `apps/web/src/app/app/documents/page.tsx` and `apps/web/src/app/app/documents/[id]/page.tsx` last inside the shared workspace group.
5. Cut over `apps/web/src/app/app/notary/page.tsx` after the shared workspace list/detail pages are live.
6. Cut over `apps/web/src/app/app/notary/requests/[id]/page.tsx` last for the notary-specific flow.

## Do Not Use

1. Do not use public `GET /verify/{idn}` as the data source for internal `/app/verification` pages.
2. Do not create duplicate role-specific pages when the shared route tree already has a role-aware contract.
3. Do not backfill missing backend fields with fake client-only data just to preserve a mock layout.
4. Do not derive workflow, verification, or actionability rules locally when those values already exist in backend summary or capability fields.