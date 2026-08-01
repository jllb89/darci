# In-Person Session Realtime Roadmap

Last updated: 2026-08-01

## Current Audit

The in-person session flow is functionally working, but it is still too manual for the level of polish the product needs. The backend now has the durable primitives: meetings, participants, check-ins, geolocation samples, same-place proximity evaluations, identity verification events, meeting artifacts, acknowledgment append history, final PDF versions, hash records, and ledger anchor attempts.

The strongest current properties are:

- `POST /notary/requests/:id/meeting/start` is the notary-triggered session start, captures notary geolocation when supplied, records the notary `meeting_start` check-in, marks the meeting `in_progress`, and sends the member session-start email.
- `POST /notary/requests/:id/meeting/check-in` supports member check-in from the member page and stores the member geolocation sample.
- Backend actor provenance now matters: member geolocation must be captured by the member account, and illuminotary geolocation must be captured by the assigned notary account.
- Same-place evidence has a hard threshold and freshness window before it can pass.
- Identity verification, venue data, acknowledgment sealing, final watermarking, hash recording, and ledger anchoring all exist and are exposed through the notary/member read models.
- The notary request context and member request detail are already good canonical aggregates. They should remain the source of truth for the UI.

The remaining follow-up is to observe broadcast reliability in staging before retiring table-change subscriptions.

## Architecture Decision

Use Supabase Realtime as an invalidation layer, not as the UI data source.

When a relevant row changes, the browser should refetch the existing backend aggregate:

- Member detail: `GET /requests/:id` and `GET /requests/:id/timeline`.
- Notary detail: `GET /notary/requests/:id/context`.
- Notary queue: `GET /notary/requests?limit=80`.

This keeps authorization, signed PDF URLs, derived capabilities, status summaries, finalization history, and preview document selection in the existing read models. Realtime only answers: something changed, go ask the backend for the canonical state.

Explicit backend broadcasts now provide compact request-change events on private `request:{id}` and `notary-queue` channels. The shared hook still supports table-change subscriptions for rollback and non-broadcast callers, but the live session pages prefer explicit broadcasts to avoid duplicate aggregate refetches. Polling starts only after realtime degrades or cannot subscribe. Manual refresh remains as a recovery affordance, not the primary path.

## Target Event Bundles

### 1. Session Started

- Trigger: notary starts the session.
- Capture notary geolocation from the notary browser.
- Record notary `meeting_start` check-in.
- Set meeting to `in_progress` and same-place status to `pending` when a location sample exists.
- Queue and process the member session-start email.
- Member and notary pages update live.

### 2. Member Checked In

- Trigger: member opens the live request page and checks in.
- Capture member geolocation from the member browser.
- Record member `arrival` check-in.
- Complete same-place evidence automatically once both samples are fresh.
- Member and notary pages update live.

### 3. Identity Verified And Venue Captured

- Trigger: notary submits the identity and venue panel.
- Record structured identity verification.
- Persist venue as meeting-level evidence before acknowledgment sealing.
- Update both pages live.

### 4. Acknowledgment Sealed

- Trigger: notary seals the acknowledgment.
- Backend requires passed same-place evidence, verified identity, persisted venue, current commission data, signature, and seal.
- Append acknowledgment page.
- Update the main notary preview and member final package status live.

### 5. Confirmation

- Trigger: notary completes the session and submits the final package.
- Backend watermarks, hashes, anchors, and marks document/request/workflow completed when anchoring succeeds.
- Member and notary pages update to verification-ready live.

## Phase 1: Realtime Invalidation

Status: complete and pushed.

Goals:

- Add the in-person session and finalization tables to the Supabase realtime publication.
- Add a shared web hook that syncs the Supabase browser session from stored auth tokens before subscribing.
- Subscribe to request-scoped changes on member and notary detail pages.
- Subscribe to queue-relevant changes on the notary queue page.
- Debounce realtime bursts and refetch canonical backend aggregates.
- Keep polling fallback enabled so the pages still update if realtime is unavailable.

Tables in scope:

- `notarization_requests`
- `illuminotarization_workflows`
- `workflow_status_history`
- `meetings`
- `meeting_participants`
- `meeting_checkins`
- `geolocation_samples`
- `proximity_evaluations`
- `identity_verification_events`
- `meeting_artifacts`
- `document_versions`
- `finalization_status_history`
- `document_hash_records`
- `ledger_anchor_attempts`

Validation:

- Focused web unit coverage for realtime target filtering/signatures.
- Web lint after wiring the hook into pages.
- Web build after wiring the hook into pages.
- `supabase db push` applied `20260615120000_enable_in_person_session_realtime.sql`.
- `git diff --check` for the full slice.

## Phase 2: Automatic Same-Place Completion

Status: complete.

Move the happy path proximity evaluation out of a manual button.

Preferred backend behavior:

- After a member check-in creates a fresh member sample, check whether a fresh notary sample already exists.
- If both samples exist, attempt proximity evaluation immediately.
- Keep the explicit notary button as retry/recovery when permissions, accuracy, or freshness fail.

Tests:

- Member check-in with fresh notary sample creates a proximity evaluation.
- Member check-in without a ready notary sample still succeeds and leaves manual retry/recovery available.
- Explicit proximity evaluation keeps the same stale-sample and wrong-actor protections.

## Phase 3: Persist Venue Before Sealing

Status: complete.

Identity and venue should become one notary evidence submission.

Implemented behavior:

- Added typed `meeting_artifacts` kind `venue_capture`.
- Notary identity verification can persist acknowledgment venue as durable meeting evidence.
- Notary workspace read model exposes artifact metadata so saved venue rehydrates after realtime refetch or page reload.
- Acknowledgment sealing resolves the latest active persisted venue capture; if a venue is supplied at sealing time, it is first persisted as `venue_capture` and then used.
- Existing granular artifact capture remains available for recovery.

Backend acknowledgment sealing should read persisted venue evidence, not depend only on form state in the sealing request.

## Phase 4: Session Advance Orchestrator

Status: complete.

Add `POST /notary/requests/:id/session/advance` as an orchestration endpoint.

Implemented behavior:

- Evaluates same-place when both actor-correct samples are fresh.
- Seals the acknowledgment when same-place, verified identity, persisted venue, profile preflight, and notary acknowledgment confirmation are complete.
- Completes the meeting after the acknowledgment is sealed.
- Automatically attempts final package submission in the same advance call after meeting completion when finalization is ready.
- Returns `advancedStep`, optional ordered `advancedSteps`, and `nextAction` for the browser.
- If meeting completion succeeds but ledger anchoring fails, returns `nextAction: "retry_final_package_submission"` so the notary can recover without repeating completed steps.
- The notary workspace exposes an `Advance next step` action while keeping granular recovery controls available.

Keep the existing granular endpoints for observability, tests, and recovery.

## Phase 5: Live Product Polish

Status: complete.

Implemented behavior:

- Member page is a live session mirror with notary-started, member location, same-place, and final-package readiness steps.
- Notary page has a primary `Advance next step` operator action backed by the Phase 4 orchestrator, while granular evidence and recovery controls remain available.
- Notary queue rows expose meeting, finalization, next-action, IDN, and activity state as realtime invalidation moves requests across tabs.
- Shared realtime invalidation hook now reports degraded connection state, and pages show fallback polling notices only when live subscriptions are unavailable.

## Phase 6: Broadcast Invalidation Hardening

Status: complete.

Implemented behavior:

- Added a backend realtime broadcast helper that sends compact private `request_changed` events over Supabase REST broadcast.
- Broadcasts are emitted after review decisions, session start, check-ins, same-place evaluation, identity/venue capture, artifacts, acknowledgment sealing, meeting completion, and final package status changes.
- Member, notary workspace, and notary queue pages subscribe to explicit broadcasts while retaining polling fallback. Table-change subscriptions remain supported by the shared hook but are disabled on these broadcast-backed pages to reduce duplicate request reloads.
- Added a Supabase migration with private channel receive policies for request owners, assigned notaries, admins, and active notary queue users.
- Added focused backend and web tests for broadcast payloads, private channel delivery, dual-mode hook helpers, chained final submission, and recoverable chained ledger failure.

## Open Decisions

- When staging telemetry shows explicit broadcasts are reliable across every mutation path, remove the table-change subscription fallback and keep polling as the only non-realtime recovery path.

## Native iOS Parity Audit

Status: complete locally on 2026-08-01.

The web notary workspace and native iOS workspace now use the same request-scoped invalidation contract:

- Subscribe with the signed-in user's Supabase access token to private channel `request:{requestId}`.
- Listen for `request_changed`; do not use its payload as application state.
- Debounce event bursts and refetch `GET /notary/requests/:id/context` as the canonical aggregate.
- Stop fallback polling while the channel is live. Start the existing four-second native poll only when configuration or subscription is degraded.
- Let Supabase Swift handle background and foreground reconnection, and remove the channel when the session workspace disappears.
- Keep progress writes on authenticated DARCi API endpoints. The backend emits the server-authoritative broadcast to both request participants and the notary queue after each durable mutation.

Native dependencies and configuration:

- Official `supabase-swift` `2.54.1`, pinned through XcodeGen.
- Build settings `DARCI_SUPABASE_URL` and `DARCI_SUPABASE_ANON_KEY`, sourced from the same staging values used by the web app.
- Private-channel authorization continues to use `20260615150000_add_realtime_broadcast_channel_policies.sql`; no mobile-specific policy or server mutation is required.