# In-Person Session Completion Audit And Roadmap

Last updated: 2026-06-10

## Purpose

This roadmap closes the last notarization step: the live in-person session after an Illuminotary approves a member's notarization request. The goal is not just to make each HTTP request return `200` or `201`; the goal is to make the workflow prove the right actor did the right action from the right device, produce a legally useful acknowledgment package, and leave the member with a verifiable final record.

This is an engineering audit and execution plan. Jurisdiction-specific notarial language and identity-document rules should still receive legal review before production reliance.

## Executive Summary

The platform already has most of the backend primitives for Phase 5 meeting evidence:

1. Meeting records, participants, check-ins, geolocation samples, proximity evaluations, identity verification events, meeting artifacts, and finalization history exist in the database.
2. `POST /notary/requests/:id/meeting/start` creates or reuses a meeting, marks it `in_progress`, and records the notary's `meeting_start` check-in.
3. `POST /notary/requests/:id/meeting/check-in` supports both member and notary roles, and can attach geolocation samples.
4. `POST /notary/requests/:id/meeting/proximity-evaluation` compares member and notary geolocation samples against a threshold, defaulting to `100` meters.
5. `POST /notary/requests/:id/meeting/identity-verification` records identity verification evidence.
6. `POST /notary/requests/:id/sign` appends an acknowledgment page and writes a `seal_preview` artifact.
7. `POST /notary/requests/:id/submit` applies final watermarking, hashes the final PDF, anchors the hash to the ledger provider, and marks the document/request/workflow completed when anchoring succeeds.

The current product behavior is still not the desired in-person session. The notary workspace currently acts as a single-actor control panel and can record the member check-in from the notary browser. The member request page is read-only and does not participate in the live session. The session-start action does not queue a dedicated member notification. The acknowledgment PDF is generic text and does not render the notary venue, seal, or signature into the PDF. The visible stepper includes a redundant `Notary profile ready` step even though profile readiness should be a precondition for starting or completing the session, not a live-session action.

## Confirmed Current State

### 1. Notary Start Session

Current code:

- `backend/src/routes/notary.ts`
- `backend/src/controllers/notaryController.ts`
- `apps/web/src/app/app/notary/requests/[id]/page.tsx`

Current behavior:

1. Notary presses `Start in-person session` in `/app/notary/requests/{id}`.
2. Web calls `POST /notary/requests/{id}/meeting/start` with an empty body.
3. Backend requires the request to be assigned and approved through either request status or workflow status.
4. Backend creates a meeting when none exists, syncs member and notary participants, checks in the notary participant with `checkinKind: "meeting_start"`, and marks the meeting `in_progress`.
5. Backend records `notary.meeting_started` audit evidence.

What is missing:

1. No dedicated `in_person_session_started` notification/template is queued for the member.
2. No CTA currently takes the member directly into a live check-in state.
3. No notary-side geolocation sample is captured at `meeting/start`; the start check-in has no geolocation.
4. `meeting/start` is mounted, but the OpenAPI document does not currently describe this route.

Product decision:

`Start in-person session` should be the Illuminotary check-in. The UI should not ask the notary to check in again after this action. If geolocation is required for same-place evidence, the start action should either capture notary geolocation before calling the backend or immediately require the notary-side proximity sample as part of the first step.

### 2. Member Session Entry

Current code:

- `backend/src/controllers/requestsController.ts`
- `backend/src/services/requestReadModelService.ts`
- `apps/web/src/app/app/requests/[id]/page.tsx`

Current behavior:

1. Approval contact exchange sends the member to `/app/requests/{requestId}` through the `notary_approval_received_email` template.
2. `/app/requests/{requestId}` fetches `GET /requests/{id}` and `GET /requests/{id}/timeline`.
3. The member page shows request summary, timeline, code delivery, next action, and links.
4. The member page does not show live session evidence, a check-in CTA, proximity state, or final package status beyond summary text.

What is missing:

1. Member cannot check in from their own browser.
2. Member cannot grant geolocation for same-place evidence.
3. Member cannot see the notary's live-session state in a clear stepper.
4. Member `nextAction` is text-only and not tied to an actionable check-in button.

Product decision:

Extend `/app/requests/{requestId}` as the member live-session view. That route already matches the approval email CTA, is member-authorized, and keeps actor separation clean. It should become the member mirror of the notary session state, not a clone of every notary control.

### 3. Member Check-In And Actor Provenance

Current code:

- `backend/src/controllers/notaryController.ts`
- `backend/src/services/meetingService.ts`
- `apps/web/src/app/app/notary/requests/[id]/page.tsx`

Current behavior:

1. Backend authorization correctly allows a `member` actor only when `actorUserId === document.owner_id`.
2. Backend inference forces authenticated members to participant role `member` and blocks members from recording `identity`, `meeting_start`, and `meeting_end` check-in kinds.
3. Backend still lets a notary pass `participantRole: "member"` and record a member `arrival` check-in.
4. The current notary page has `Record member GPS check-in`, which captures the notary browser's geolocation and stores it as the member participant's sample if the notary clicks it.

What is missing:

1. The live product does not guarantee the member sample came from the member device.
2. The notary UI can create misleading member geolocation provenance.
3. The backend response hides `capturedByUserId` and does not expose enough provenance for the frontend to distinguish member-device versus notary-entered evidence.

Product decision:

The notary should not record a member GPS check-in from the notary workspace. The member check-in must be performed by the authenticated member from `/app/requests/{requestId}`. If manual override is later needed, it should be an explicit notary/admin action with a different artifact kind/status and visible warning.

### 4. Same-Place Evidence

Current code:

- `backend/src/controllers/notaryController.ts`
- `backend/src/services/meetingService.ts`
- `backend/src/services/notaryWorkspaceReadModelService.ts`

Current behavior:

1. Backend stores geolocation samples with participant, check-in, captured-by user, sample kind, capture stage, accuracy, timestamp, and metadata.
2. Proximity evaluation selects the latest member and notary geolocation samples unless sample IDs are supplied.
3. It calculates haversine distance and passes when `observedDistanceMeters <= thresholdMeters`.
4. Default threshold is `100` meters.
5. Read models expose sample coordinates, distance, threshold, and proximity status.

What is missing:

1. No member-side geolocation capture UI.
2. Notary start currently does not capture notary geolocation.
3. No product copy explains browser permission denial, low-accuracy samples, retry, or manual review path.
4. No explicit threshold policy exists for small GPS variation. The backend has a number, but product/legal need to define the rule.
5. No freshness window is enforced in the endpoint. A stale sample could be reused unless later code avoids it.

Product decision:

Use a product-defined same-place rule that accounts for GPS accuracy. The first pass can keep `100` meters as the hard threshold, but should also persist and display sample accuracy and age. A better policy is:

1. Require one member sample captured by the member actor after session start.
2. Require one notary sample captured by the assigned notary actor after session start.
3. Require both samples to be within a short freshness window, for example 5 minutes.
4. Pass when distance is within configured threshold, and display warning when either sample has weak accuracy.
5. Add manual review/override only as a separate audited path, not as a silent pass.

### 5. Identity Verification

Current code:

- `backend/src/controllers/notaryController.ts`
- `backend/src/services/meetingService.ts`
- `apps/web/src/app/app/notary/requests/[id]/page.tsx`

Current behavior:

1. Frontend identity form has freeform subject name, freeform document type, and `Last 4` with `maxLength={4}`.
2. Frontend default document type is `government_id`.
3. Backend accepts any non-empty `documentType` string up to 255 characters.
4. Backend accepts `documentLast4` up to 4 characters.
5. Backend stores issuing jurisdiction if provided, but the current frontend does not collect it.

What is missing:

1. No official US ID type select.
2. No type-specific validation for document number, issuing state, expiration date, or passport country.
3. No structured identity rule object for legal/audit reporting.
4. No evidence upload or capture flow is wired into the visible notary UI for identity document artifacts, although the backend artifact table supports `identity_document`.

Product decision:

Replace the freeform identity form with a structured select-driven form. At minimum, support:

1. State driver license.
2. State identification card.
3. US passport book.
4. US passport card.
5. Permanent resident card.
6. Military ID.
7. Tribal ID.
8. Other government-issued photo ID, gated behind notes/manual review.

Each type should define required fields, validation, and retention posture. For example, state driver license and state ID require issuing state and a state-specific or conservative alphanumeric document-number rule; passport requires country and passport-number format; all types should support expiration date and optional notes.

### 6. Notary Profile Ready

Current code:

- `backend/src/services/notaryProfileService.ts`
- `backend/src/controllers/notaryProfileController.ts`
- `apps/web/src/app/app/notary/requests/[id]/page.tsx`

Current behavior:

1. Notary profiles include jurisdiction, service area, commission number, commission expiration, signature data URL, seal storage path, and seal data URL.
2. The notary workspace fetches `/users/me/notary-profile` and checks profile jurisdiction, service area, signature, and seal before enabling acknowledgment append.
3. The UI exposes `Notary profile ready` as a live completion step.

What is missing:

1. Profile readiness is not enforced before session start.
2. Commission number and commission expiration are collected in profile data but not part of the frontend `hasNotaryProfileReadyForCompletion` gate.
3. Profile assets are not passed into PDF rendering; only booleans and labels are sent in `notarialFields` metadata.

Product decision:

Remove `Notary profile ready` from the live session stepper. Treat it as a preflight guard: a notary with missing jurisdiction, service area, commission number/expiration where required, signature, or seal should see a blocking preflight state before starting or completing a session.

### 7. Acknowledgment PDF, Venue, Seal, And Signature

Current code:

- `backend/src/controllers/notaryController.ts`
- `backend/src/services/documentFinalizationService.ts`
- `backend/src/services/notaryProfileService.ts`
- `backend/tests/unit/documentFinalizationService.test.ts`
- `backend/tests/integration/notary-meeting-phase5-completion.test.ts`

Current behavior:

1. `signRequest` calls `appendAcknowledgmentPageToDocument({ documentId, actorSupabaseId, actorRole })`.
2. `notarialFields`, `sealLabel`, `signatureLabel`, and notes are only stored in a `seal_preview` meeting artifact metadata object.
3. `buildAcknowledgmentContent` currently emits generic lines:
   - `DARCi Notarial Acknowledgment`
   - `Document ID: ...`
   - `IDN: ...`
   - `Jurisdiction: ...`
   - `Template: ...`
   - `Venue confirmation required.`
   - `Signer consent required.`
4. `appendAcknowledgmentPageToPdf` appends a real PDF page, but it renders text only.
5. Unit tests verify page count and watermark behavior, not legal text contents or seal rendering.

What is missing:

1. The user-requested cleanup is not implemented: remove `Template: us_ca_acknowledgment_v1` and `Signer consent required.`.
2. `Venue confirmation required.` should be replaced by the actual notarial venue/address where completed, entered by the notary.
3. Notary seal image is not embedded into the acknowledgment PDF.
4. Notary signature image is not embedded into the acknowledgment PDF.
5. Notary commission number, commission expiration, jurisdiction/service area, and signer appearance/acknowledgment text are not rendered into the PDF.
6. CA has stricter statutory acknowledgment requirements. The seeded jurisdiction data explicitly calls out mandatory California statutory wording and official seal requirements.
7. OH and CA should not share a generic one-page acknowledgment body without jurisdiction-specific rendering rules.

Product decision:

Move from generic acknowledgment text to a structured acknowledgment renderer. The signer/notary workflow should collect venue data before append, then pass structured fields and notary profile assets into finalization. PDF output should render the venue, signer, date, notary name, commission details where applicable, notary signature, notary seal, and jurisdiction-specific acknowledgment language.

### 8. Final Package Anchoring

Current code:

- `backend/src/services/documentFinalizationService.ts`
- `backend/src/services/ledgerService.ts`
- `backend/src/services/documentWorkspaceReadModelService.ts`
- `backend/src/services/notaryWorkspaceReadModelService.ts`

Current behavior:

1. `submitRequest` requires meeting completion, passed same-place evidence, and verified identity.
2. `watermarkWithNotice` requires an existing acknowledgment append output version.
3. It creates a final derived PDF version, marks it final, hashes the bytes with SHA-256, calls `anchorToLedger`, creates ledger entry and anchor attempt rows, and records finalization history for `watermark_applied`, `hash_recorded`, and `ledger_anchored` or `failed`.
4. If anchored, it updates document status to `completed`, request status to `completed`, and workflow status to `completed`.
5. Read models expose `isAnchored`, `anchoredAt`, `hash`, `ledgerTxId`, public verification path, and finalization history.

What is missing:

1. The live UI only says `Final package anchored`; it should expose enough final status for the notary and member to trust what happened.
2. The final package depends on the acknowledgment correctness. If the acknowledgment page lacks venue/seal/signature, anchoring faithfully preserves an incomplete legal artifact.
3. The ledger provider is currently stub-capable in local/test/dev environments. Production/staging readiness needs provider configuration and clear failed-anchor recovery.

Product decision:

Keep anchoring as the final step. Treat it as technically implemented but blocked on legal artifact correctness and UX transparency.

## Target Workflow

### Notary View

1. Preflight: verify request approved, assigned notary is current user, profile assets and commission details are complete, final PDF package exists.
2. Start session: notary clicks `Start in-person session`, grants geolocation, backend starts meeting, records notary `meeting_start`, stores notary geolocation sample, and queues member live-session email.
3. Waiting for member: notary sees member check-in pending and can resend session email if needed.
4. Same-place evidence: once member checks in, notary evaluates proximity or backend evaluates automatically when both samples exist.
5. Identity verification: notary records structured ID evidence from a select-driven form.
6. Venue and acknowledgment: notary enters venue/address, confirms signer acknowledgment, and appends the acknowledgment with seal and signature.
7. Complete session: notary ends the meeting.
8. Submit final package: backend finalizes, hashes, anchors, and returns public verification status.

### Member View

1. Member receives `In-person session started` email with CTA to `/start?returnTo=/app/requests/{requestId}` and intended email when available.
2. Member lands on `/app/requests/{requestId}`.
3. If meeting is `in_progress` and member arrival is missing, the primary CTA is `Check in`.
4. `Check in` asks for geolocation permission, calls `POST /notary/requests/{id}/meeting/check-in` as member with `participantRole: "member"`, `checkinKind: "arrival"`, and geolocation payload.
5. Member sees waiting state while notary validates same-place evidence and identity.
6. After final submission, member sees final package anchored, hash/verification status, and public verification link.

## Implementation Roadmap

### Phase 1: Actor-Correct Live Session Shell

Status: completed on 2026-06-09.

Completed implementation:

1. Added `queueInPersonSessionStartedNotification` and seeded `in_person_session_started_email` with a CTA back to `/start?returnTo=/app/requests/{requestId}`.
2. Updated `POST /notary/requests/{id}/meeting/start` so the notary start action can store the notary geolocation sample, mark same-place status `pending`, queue the member session-start email, and inline-process the notification job when queued.
3. Added a backend guard so an authenticated notary cannot create a member geolocation check-in from the notary browser.
4. Extended the member `/app/requests/[id]` page with a live in-person session panel and member `Check in` CTA that captures browser geolocation and records member arrival from the member account.
5. Removed notary workspace actions that recorded member or duplicate notary GPS arrival; the notary stepper now keys the notary side to the `meeting_start` check-in.
6. Added OpenAPI coverage for `POST /notary/requests/{id}/meeting/start` and its geolocation-capable request body.
7. Added focused backend and web tests for start-session notification/geolocation, member-owned check-in, notary/member GPS provenance, and member check-in visibility logic.

Backend:

1. Add `queueInPersonSessionStartedNotification` to `backend/src/services/notificationService.ts`.
2. Add `in_person_session_started_email` migration/template with CTA to `/start?returnTo=/app/requests/{requestId}`.
3. Update `startInPersonSession` to queue and optionally inline-process the member notification after successful meeting start.
4. Add geolocation support to `startInPersonSessionSchema` so notary start can capture the notary sample.
5. Add OpenAPI docs for `POST /notary/requests/{id}/meeting/start`.

Frontend:

1. Extend `/app/requests/[id]` with a live-session section when meeting status is `in_progress`.
2. Add member `Check in` CTA with browser geolocation capture and clear permission-denied state.
3. Remove `Record member GPS check-in` from the notary workspace.
4. Remove the duplicate `Record illuminotary GPS check-in` action if start captures notary geolocation.
5. Replace `Illuminotary check-in` step logic with the `meeting_start` check-in created by start.

Tests:

1. Backend integration: starting a session queues `in_person_session_started_email` and records notary start check-in.
2. Backend integration: member can record only their own arrival check-in.
3. Backend integration: notary cannot silently create member GPS sample unless a new explicit manual override route is added.
4. Web test: member request page shows `Check in` when meeting is in progress and member has not arrived.

Acceptance criteria:

1. Notary start sends member email.
2. Member CTA lands on the correct request.
3. Member geolocation sample is captured by the member actor.
4. Notary UI no longer creates member-device evidence from the notary browser.

### Phase 2: Same-Place Evidence Policy

Status: completed on 2026-06-09.

Completed implementation:

1. Proximity evaluation now requires fresh actor-correct samples before a pass or failure can be persisted.
2. Member samples must be captured by `document.owner_id`; illuminotary samples must be captured by `assigned_notary_id`.
3. Same-place policy metadata now stores threshold, freshness window, required actor IDs, sample ages, accuracy, and capture stages.
4. The notary workspace now shows member and illuminotary sample status separately, including age, accuracy, stale/low-accuracy warnings, and latest evaluation distance/threshold/status.
5. Member-side check-in remains available during a live session as `Refresh check-in`, preserving member-device provenance for retries.
6. The notary workspace has a notary-only `Refresh illuminotary location` action that records a proximity-stage notary sample.
7. OpenAPI now documents stricter proximity policy semantics plus returned sample actor/participant/expiry fields and evaluation metadata.
8. Focused integration coverage now rejects stale samples, rejects wrong-actor samples, passes small GPS variance within threshold, and fails outside-threshold samples without overstating same-place status.

Backend:

1. Enforce sample freshness for proximity evaluation.
2. Require member sample `captured_by_user_id === document.owner_id`.
3. Require notary sample `captured_by_user_id === assigned_notary_id`.
4. Store threshold policy metadata, including sample ages and accuracy values.
5. Consider automatic proximity evaluation once both samples exist.

Frontend:

1. Show member and notary sample status separately.
2. Show distance, threshold, sample age, and accuracy after evaluation.
3. Add retry geolocation affordance for member and notary.
4. Add explicit warning state for low-accuracy or stale samples.

Tests:

1. Proximity rejects stale sample IDs.
2. Proximity rejects samples captured by the wrong actor.
3. Proximity passes with small coordinate variance within threshold.
4. Proximity fails outside threshold and keeps meeting state honest.

Acceptance criteria:

1. Same-place pass is based on two actor-correct samples.
2. Small GPS variation is tolerated according to configured threshold.
3. Stale or wrong-actor samples cannot create a pass.

### Phase 3: Structured Identity Verification

Status: completed on 2026-06-09.

Completed implementation:

1. Added a canonical identity-document policy helper with official ID type values and validation for issuing jurisdiction, expiration date, document-number tail or masked identifier, and optional evidence artifact IDs.
2. Updated `POST /notary/requests/{id}/meeting/identity-verification` to reject vague `government_id` payloads before writing check-ins or identity events.
3. Persisted minimized structured identity metadata, including policy version, official document type, issuing jurisdiction, expiration date, retained tail or masked identifier, and linked artifact IDs.
4. Updated audit metadata to avoid full document numbers while preserving jurisdiction-friendly identity facts.
5. Replaced the notary workspace freeform document type input with an official ID type select, dynamic follow-up labels, expiration date, issuing jurisdiction, document tail or masked identifier fields, optional evidence artifact IDs, and inline validation before submit.
6. Updated OpenAPI identity request/response schemas with canonical document types and structured identity fields.
7. Added backend unit tests, backend integration tests, and web helper tests for official ID validation, accepted/rejected payloads, dynamic fields, and inline validation behavior.

Backend:

1. Add canonical ID type enum and validation helpers.
2. Expand identity payload to include issuing jurisdiction, expiration date, document-number tail or masked identifier, and optional evidence artifact IDs.
3. Persist structured identity metadata while keeping sensitive values minimized.
4. Add migration constraints only after app-level compatibility is ready.

Frontend:

1. Replace freeform document type input with an official ID type select.
2. Change the follow-up fields based on selected ID type.
3. Validate format inline before submit.
4. Add identity artifact capture/upload path when required by policy.

Tests:

1. Unit tests for ID type validation rules.
2. Integration tests for accepted/rejected identity payloads.
3. Web tests for field switching and inline validation.

Acceptance criteria:

1. Notary cannot submit vague `government_id` without structured details.
2. The identity record is audit-meaningful and jurisdiction-friendly.
3. Sensitive identity data is minimized and masked.

### Phase 4: Acknowledgment Renderer And Venue

Status: planned; acknowledgment-source audit completed on 2026-06-10.

Phase 4 audit findings:

1. CA and OH source templates already contain the required acknowledgment formats, or jurisdiction-specific placeholders for them.
2. Review/member document generation intentionally omits notarial acknowledgment blocks so members do not see or sign a notary-only certificate before the live session.
3. The current finalization path does not reuse those deferred formats. It appends a generic `DARCi Notarial Acknowledgment` page from `buildAcknowledgmentContent`.
4. `jurisdiction_rules.acknowledgment_template` stores renderer IDs such as `us_ca_acknowledgment_v1` and `us_oh_acknowledgment_v1`, not full certificate wording.
5. Phase 4 should keep the generation-layer omission in place and render the exact acknowledgment only inside finalization at the notary append step.
6. CA and OH both need first-class renderers; neither jurisdiction should fall through to the current generic page.

Renderer map for implementation:

1. `US-CA` + `trust_certificate`: California statutory acknowledgment wording, venue county/date, assigned notary name, and acknowledgers resolved as current trustees.
2. `US-CA` + `trust_rrr`: California statutory acknowledgment wording, venue county/date, assigned notary name, and acknowledgers resolved as trustmakers/grantors.
3. `US-CA` + `poa_general`: California acknowledgment block for the principal.
4. `US-OH` + `trust_certificate`: Ohio acknowledgment certificate, venue county/date, acknowledging trustee names, notary signature, seal, and commission expiration.
5. `US-OH` + `trust_rrr`: Ohio acknowledgment certificate, venue county/date, acknowledging trustmaker/grantor names, notary signature, seal, and commission expiration.
6. `US-OH` + `poa_general`: Ohio acknowledgment certificate for the principal.

Implementation rule:

Do not reinsert acknowledgment content into member review PDFs. The notary append endpoint must derive the document family and signer/acknowledger names server-side, render the CA/OH certificate from structured fields, persist the rendered text and structured render metadata, and embed the notary signature/seal into the appended PDF page before any final hash or ledger anchor is created.

Backend:

1. Extend `notarySignSchema` with a structured `venue` object and required acknowledgment fields.
2. Load assigned notary profile server-side in `signRequest`; do not rely only on frontend booleans.
3. Resolve the document family from the active generation/template metadata, falling back only to known `document_type`, `product_flow_mode`, or output keys when generation metadata is unavailable.
4. Resolve signer/acknowledger names server-side from document parties and signer obligations, not from browser-submitted display strings.
5. Update `appendAcknowledgmentPage` to accept structured input: venue, notary profile, signature image, seal image, identity method summary, meeting ID, jurisdiction renderer key, and resolved acknowledgers.
6. Replace `buildAcknowledgmentContent` with jurisdiction-specific renderers for `us_ca_acknowledgment_v1` and `us_oh_acknowledgment_v1`.
7. Fail closed for unsupported CA/OH document family mappings instead of silently appending a generic page.
8. Remove `Template: ...` and `Signer consent required.` from rendered acknowledgment content.
9. Replace `Venue confirmation required.` with the actual venue/address.
10. Embed notary seal and signature images with `pdf-lib`.
11. Store the rendered acknowledgment content plus structured fields in `acknowledgment_pages` and/or execution metadata.
12. Include renderer key, renderer version, document family, venue, acknowledger names, profile-derived notary facts, and embedded asset flags in execution metadata.

Frontend:

1. Add venue/address form before acknowledgment append, including state, county, city, and optional address/location label.
2. Show notary profile assets as preflight, not as a step.
3. Require venue fields before enabling acknowledgment append.
4. Rename button from `Append acknowledgment and seal` to a clearer final action once venue fields are complete.
5. Show which jurisdiction certificate will be appended, using a backend-provided summary when practical.
6. Show the generated acknowledgment preview before meeting completion when practical.

Tests:

1. Unit test acknowledgment content omits `Template:` and `Signer consent required.`.
2. Unit test venue line renders actual address.
3. Unit test PDF embeds seal/signature images or at least changes page resource count in a deterministic way.
4. Integration test `POST /sign` passes structured fields to finalization.
5. Unit test renderer selection for `US-CA` and `US-OH` across `trust_certificate`, `trust_rrr`, and `poa_general`.
6. Integration test CA append uses trustee/trustmaker/principal acknowledgers based on document family.
7. Integration test OH append uses trustee/trustmaker/principal acknowledgers based on document family.
8. Regression test generation preview still omits `CA_Notarial_Acknowledgment_Block` and `OH_Notarial_Acknowledgment_Block`.
9. Snapshot/text extraction checks for CA and OH acknowledgment output where tooling allows.

Acceptance criteria:

1. A generated CA acknowledgment does not show internal template IDs.
2. A generated OH acknowledgment does not show internal template IDs.
3. A generated CA acknowledgment uses California wording and the correct acknowledger group for trust certificate, trust registration amendment, and DDPOA.
4. A generated OH acknowledgment uses Ohio certificate wording and the correct acknowledger group for trust certificate, trust registration amendment, and DDPOA.
5. Venue/address where completed appears on the acknowledgment page.
6. Notary seal and signature are visible in the final PDF.
7. The generation preview/member signing path still omits deferred acknowledgment blocks.
8. The final artifact is jurisdiction-specific enough to survive legal review.

### Phase 5: Final Package Transparency And Recovery

Backend:

1. Keep `submitRequest` as the final anchoring endpoint.
2. Add clear failed-anchor response semantics if ledger provider fails.
3. Add retry endpoint or admin/notary retry path for failed ledger anchor attempts if needed.
4. Ensure finalization history appears in both member and notary request views.

Frontend:

1. Show finalization as `Watermarked`, `Hash recorded`, `Ledger anchored`, and `Verification ready` instead of a single opaque status.
2. Show hash, anchor time, and verification link after success.
3. Show actionable failure state when anchoring fails.

Tests:

1. Integration test successful final package returns final version, hash, ledger status, and completion statuses.
2. Integration test failed ledger provider returns visible failure and does not mark request completed.
3. Web test renders final anchored state for member and notary.

Acceptance criteria:

1. Final package anchoring is the last step.
2. Member and notary can see the final package status without reading backend logs.
3. Failed anchoring has a defined recovery path.

## Recommended Stepper Changes

Replace current notary stepper:

1. Member check-in.
2. Illuminotary check-in.
3. Same-place evidence.
4. Identity verified.
5. Notary profile ready.
6. Acknowledgment appended.
7. Final package anchored.

With target notary stepper:

1. Session started.
2. Member checked in.
3. Same-place confirmed.
4. Identity verified.
5. Venue captured.
6. Acknowledgment sealed.
7. Session completed.
8. Final package anchored.

Member stepper:

1. Session started.
2. Check in.
3. Same-place review.
4. Identity review.
5. Notary acknowledgment.
6. Final package.

## Data And API Contract Changes

Add or update:

1. `POST /notary/requests/{id}/meeting/start` in `api/openapi.yaml`.
2. `GET /requests/{id}` response to include session evidence summary needed by the member view, or add `GET /requests/{id}/session` for scoped member-safe live session data.
3. `MeetingCheckinResponse` to include enough provenance for UI and tests, at least `recordedByUserId` or a redacted actor role/source field.
4. `MeetingProximityEvaluationRequest` to define freshness/threshold semantics.
5. `MeetingIdentityVerificationRequest` to replace loose `documentType` with canonical enum plus typed metadata.
6. `NotarySignRequest` to include structured venue and acknowledgment fields.
7. `AcknowledgmentPage` response to include renderer key, document family, rendered field summary, and whether seal/signature were embedded.

## Observability And Audit Events

Existing frontend error codes cover notary context fetch, review decision, meeting start, and generic notary action failures. New member-side session actions should add cataloged error codes before CI is expected to pass.

Recommended new frontend error codes:

1. `WEB_MEMBER_SESSION_CONTEXT_FETCH_FAILED`
2. `WEB_MEMBER_SESSION_CHECKIN_FAILED`
3. `WEB_MEMBER_SESSION_GEOLOCATION_UNAVAILABLE`
4. `WEB_NOTARY_PROXIMITY_EVALUATION_FAILED`
5. `WEB_NOTARY_IDENTITY_VERIFICATION_FAILED`
6. `WEB_NOTARY_ACKNOWLEDGMENT_APPEND_FAILED`
7. `WEB_NOTARY_FINAL_PACKAGE_SUBMIT_FAILED`

Recommended audit events:

1. `member.meeting_checked_in`
2. `member.geolocation_sample_captured`
3. `notary.geolocation_sample_captured`
4. `notary.same_place_evaluated`
5. `notary.acknowledgment_venue_captured`
6. `notary.seal_embedded`
7. `notary.signature_embedded`

## Key Risks

1. Legal artifact risk: anchoring an incomplete or generic acknowledgment produces a durable but legally weak final package.
2. Evidence provenance risk: notary-originated member geolocation undermines same-place proof.
3. Member UX risk: email CTA currently lands on a passive request summary instead of the action the member must take.
4. Identity data risk: adding ID details must minimize sensitive storage and avoid collecting unnecessary full identifiers.
5. Contract drift risk: mounted routes and OpenAPI docs are not perfectly aligned for the session-start endpoint and placeholder descriptions.
6. Operational risk: production ledger provider behavior must be configured and observable; local/dev stub success is not production readiness.

## Definition Of Done

The in-person session is complete when all of the following are true:

1. Notary starts session and member receives a dedicated session-start email.
2. Member checks in from member account and member device.
3. Notary check-in is created by session start and includes notary-side geolocation or an immediately linked notary sample.
4. Same-place evaluation uses fresh member and notary samples, tolerates normal GPS variance, and records distance/threshold/accuracy.
5. Identity verification uses a structured official ID type and type-specific validation.
6. `Notary profile ready` is removed from live steps and enforced as preflight.
7. Acknowledgment PDF removes internal template and consent boilerplate lines.
8. Acknowledgment PDF renders actual venue/address where completed.
9. Acknowledgment PDF embeds notary seal and signature.
10. CA and OH acknowledgment outputs are jurisdiction-specific, document-family aware, and tested.
11. Final submission creates a final PDF version, hash record, ledger entry, anchor attempt, finalization history, and public verification link.
12. Member and notary UI both show final package anchored status without requiring backend log inspection.

## Suggested Build Order

1. Member live-session view and session-start notification.
2. Actor-correct check-in and geolocation provenance.
3. Same-place policy/freshness enforcement.
4. Structured identity verification.
5. Notary preflight cleanup and stepper rewrite.
6. Venue/seal/signature acknowledgment renderer.
7. Final package transparency and anchor failure recovery.
8. OpenAPI, observability catalog, and docs cleanup.
