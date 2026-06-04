# Notarization Selected Notary Handoff Roadmap

Last updated: 2026-06-04

## Current Delivery Snapshot

Already available:

1. Document signing can complete automatically after the last required signature is captured.
2. Documents that need notarization move to `pending_notary` after signing completion.
3. `POST /documents/{id}/submit-notarization` already creates the legacy notarization request and Phase 4 illuminotarization workflow.
4. The submit endpoint already accepts `selectedNotaryUserId` and writes it to `illuminotarization_workflows.selected_notary_user_id`.
5. The submit endpoint already creates a `workflow_assignments` row with `assignment_kind = selected_notary` when a member-selected notary is present.
6. The notary queue already allows a selected notary to see requests selected for them.
7. `/app/notary` and `/app/notary/requests/[id]` already load the notary queue and review workspace.
8. The notary detail page already has an IDN-based open/claim path for unopened selected requests.

Completed in the Phase 1/2 backend pass:

1. Member-facing available-notaries API for a document jurisdiction.
2. Same-jurisdiction, active-role, non-owner, non-expired commission validation for `selectedNotaryUserId` on submission.
3. Server-side signature readiness hardening: unsigned submission is accepted only for `product_flow_mode = "notarize_document"` with `signatureSkipped = true`.
4. Explicit signing confirmation now resolves the same post-signing document status as automatic signature capture, so notarization-required documents can advance from `pending_signature` to `pending_notary`.
5. OpenAPI contract coverage for `GET /documents/{id}/available-notaries`, selected-notary submit validation, the `notarize_document` signature-skip rule, and explicit signing-confirmation status response.
6. Focused backend coverage for available-notary filtering, available-notaries endpoint response, authorization failures, missing jurisdiction, signature skip rules, selected-notary validation, selected workflow field, selected workflow assignment, and explicit signing-confirmation status advancement.

Completed in the Phase 3/4 implementation pass:

1. Selected-notary notification template, runtime fallback, queue function, controller call, inline outbox processing, audit marker, and focused backend tests.
2. Sign page notary picker using the existing custom select/dropdown pattern.
3. Signed-flow submission now sends `selectedNotaryUserId`.
4. `notarize_document` signature bypass now requires selected notary and sends `selectedNotaryUserId`, `signatureSkipped = true`, and `signatureSkipReason`.
5. Frontend submitted/empty/error states for available notaries.

Completed in the Phase 5 fit-check pass:

1. Confirmed queue visibility for selected-notary requests before assignment through read-model access checks and focused unit coverage.
2. Confirmed selected notary can access request context before assignment through focused unit coverage.
3. Confirmed wrong notary cannot access selected request context through focused unit and route integration coverage.
4. Confirmed queue payload includes selected/assigned workflow fields needed to identify selected requests.
5. Added a small `Selected` marker in `/app/notary` queue rows for requests selected but not yet assigned.
6. Focused automated validation passed: `tests/unit/notaryWorkspaceReadModelService.test.ts`, `tests/integration/notary-workspace-get.test.ts`, backend build, and web build.

Still missing or yet to be tested:

1. Manual local/staging smoke test with real member and notary accounts.
2. Staging Resend verification that `notary_request_received_email` is delivered to the selected notary.

## Hard Product Rule

`notarize_document` is the only product flow where member signature is optional.

Rules:

1. If `document.product_flow_mode = "notarize_document"`, the member may submit to notarization without applying a signature.
2. If the member skips signature for `notarize_document`, the backend records `signature_bypass` and moves the document into the notarization flow.
3. POA, trust, and any other product flow must not allow `signatureSkipped = true`.
4. For products other than `notarize_document`, every required signature obligation must be complete before the document can be treated as ready for notarization.
5. The status for documents ready for notarization is `pending_notary`.

This rule should stay enforced server-side. The frontend can hide the skip option elsewhere, but the backend remains the authority.

## Target Flow

### Standard Signed Flow

1. Member completes all required signatures.
2. Backend resolves next document status.
3. If the document needs notarization, status becomes `pending_notary`.
4. Sign page replaces passive completion copy with notary selection.
5. Member selects an active notary in the same jurisdiction as the document.
6. Member submits the notarization request.
7. Backend creates workflow, legacy request, code, selected-notary assignment, and status history.
8. Backend notifies the selected notary by email.
9. Selected notary opens `/app/notary`, sees the new request in Review requests, and can open the review page.

### Document Notarization Upload Without Signature

1. Member is on a `notarize_document` document.
2. Member chooses to continue without signature.
3. Frontend requires selected notary before submit.
4. Frontend sends `signatureSkipped = true`, `signatureSkipReason`, and `selectedNotaryUserId`.
5. Backend accepts signature skip only because this product flow is `notarize_document`.
6. Backend records `signature_bypass`, creates the notarization workflow/request, sets document status to `pending_notary`, and notifies the selected notary.

## Non-Goals For This Pass

1. Building a public searchable notary directory.
2. Exposing notary phone or email during member selection.
3. Replacing the existing legacy `notarization_requests` compatibility bridge.
4. Removing illuminotarization access codes.
5. Building scheduling or calendar booking.
6. Changing the notary review, approval, meeting, or finalization pages except for small copy/status polish if needed.
7. Making signature optional for POA, trust, or any product other than `notarize_document`.

## Status And Workflow Contract

Document statuses:

1. `pending_signature`
   - Document still needs member-side signature work, except `notarize_document` may explicitly bypass this with `signatureSkipped = true`.
2. `pending_notary`
   - Document is ready for notarization handoff or already has an active notarization request.
3. `completed`
   - Document does not require notarization or has completed the full downstream flow.

Notarization request/workflow statuses:

1. Legacy request starts as `pending`.
2. Workflow starts as `submitted`, then moves to `code_delivered` after owner-facing code delivery is queued.
3. Notary opening/claiming the request moves it to `in_review`.
4. Review approval moves it toward meeting/contact handoff.

Important email clarification:

1. `notary_next_step_email` is owner-facing code delivery despite the name.
2. It should remain available for compatibility and owner fallback.
3. It does not satisfy the selected-notary notification requirement.
4. A new selected-notary email is required.

## Phase 1: Backend Available Notaries API - Done

Status:

1. Done: `GET /documents/{id}/available-notaries` is implemented on the document route.
2. Done: the endpoint authorizes against the document owner, admin, or service role and returns 404 for unauthorized members.
3. Done: returned notaries are filtered to active notary role, same normalized jurisdiction, non-owner, and non-expired commission.
4. Done: focused backend tests cover the endpoint happy path, missing document, non-owner access, missing jurisdiction, and service-level filtering for wrong jurisdiction, inactive role, owner, and expired commission.
5. Done: OpenAPI documents the endpoint, response shape, authorization model, and privacy constraints.
6. Deferred to rollout/manual smoke: verify real local/staging notary profile data after the sign-page picker is wired.

Add a document-scoped endpoint:

```text
GET /documents/{id}/available-notaries
```

Why document-scoped:

1. The backend can authorize access to the member-owned document.
2. The backend can use the document jurisdiction as the source of truth.
3. The response avoids becoming a general notary directory.

Suggested response:

```json
{
  "document": {
    "id": "document-id",
    "status": "pending_notary",
    "jurisdiction": "US-OH",
    "normalizedJurisdiction": "US-OH"
  },
  "notarization": {
    "activeRequestId": null,
    "selectedNotaryUserId": null,
    "submittedAt": null
  },
  "notaries": [
    {
      "userId": "notary-user-id",
      "displayName": "Jane Notary",
      "jurisdiction": "US-OH",
      "serviceAreaKind": "county",
      "serviceAreaName": "Franklin County",
      "commissionExpiresAt": "2027-05-01T00:00:00.000Z"
    }
  ]
}
```

Authorization:

1. Member can list notaries only for their own document.
2. Admin and service role can list for any document.
3. Non-owners receive 404, matching existing document access behavior.

Filtering:

1. Normalize document jurisdiction using existing jurisdiction utilities.
2. Join or compose `notary_profiles` with active `user_roles.role = notary`.
3. Include only active notary roles.
4. Include only notary profiles whose normalized jurisdiction matches the document jurisdiction.
5. Exclude the document owner.
6. Exclude expired commissions if `commission_expires_at` exists and is in the past.
7. Do not return email or phone.

Recommended implementation surface:

1. Add a service function in `notaryProfileService` such as `listAvailableNotariesForDocument` or `listActiveNotaryProfilesByJurisdiction`.
2. Add controller handler in `documentsController`.
3. Add `GET /:id/available-notaries` route before generic `/:id` routes where needed.
4. Add OpenAPI contract.

Validation cases:

1. Missing document returns 404.
2. Non-owner member returns 404.
3. Missing document jurisdiction returns 400 with a clear validation message.
4. Same-jurisdiction active notaries are returned.
5. Wrong-jurisdiction notaries are omitted.
6. Suspended or revoked notary roles are omitted.
7. The document owner is omitted even if they have an active notary profile.

## Phase 2: Submit Notarization Hardening - Done

Status:

1. Done: `POST /documents/{id}/submit-notarization` validates selected notary active role, profile, jurisdiction, owner exclusion, and commission expiration.
2. Done: `signatureSkipped = true` is accepted only for `notarize_document`; other product flows return 400.
3. Done: non-skipped submissions must start from `pending_notary`; unsigned `pending_signature` submissions now return 400 unless the document-notarization bypass applies.
4. Done: selected notary still writes `illuminotarization_workflows.selected_notary_user_id` and `workflow_assignments.assignment_kind = selected_notary`.
5. Done: explicit `/documents/{id}/sign` confirmation now resolves the same next document status as automatic signing completion.
6. Done: focused integration tests cover valid selected notary, wrong-jurisdiction rejection, inactive selected notary, self-selection rejection, expired commission rejection, document-notarization signature skip, non-document-notarization skip rejection, existing active-request compatibility, and explicit signing-confirmation status advancement.
7. Done: OpenAPI documents selected-notary validation and the `notarize_document`-only signature bypass contract.
8. Deferred to rollout/manual smoke: request creation from the web sign flow with a real selected notary account after Phase 4 adds the picker UI.

Update `POST /documents/{id}/submit-notarization` while preserving compatibility.

Keep:

1. `selectedNotaryUserId` remains optional at the API level for existing code-delivery/manual-code flows.
2. `signatureSkipped` remains accepted only for `notarize_document`.
3. Existing workflow/request/code creation remains intact.

Add:

1. If `selectedNotaryUserId` is present, validate active notary role.
2. If `selectedNotaryUserId` is present, load notary profile and normalize profile jurisdiction.
3. Reject selected notary if normalized profile jurisdiction does not match normalized document jurisdiction.
4. Reject selected notary if they are the document owner.
5. Reject selected notary if commission is expired when `commission_expires_at` exists.
6. Record selected notary validation metadata in audit event where useful.
7. Add explicit role middleware to the route for member/admin/service role consistency.

Signature readiness rule:

1. If `signatureSkipped = true`, require `document.product_flow_mode = "notarize_document"`.
2. If `signatureSkipped = true`, allow submission from `pending_signature` and update document to `pending_notary` after request creation.
3. If `signatureSkipped` is not true, normal signed handoff should start from `pending_notary`.
4. Do not allow `signatureSkipped = true` for POA, trust, or any other product flow.

Edge hardening:

1. Review `POST /documents/{id}/sign`; it records explicit confirmation but does not currently run the same status resolver as automatic signature capture.
2. Either route explicit confirmation through the same completion behavior or ensure the sign page can recover if a confirmed signed document still reports `pending_signature`.
3. The preferred fix is shared completion logic so status remains authoritative server-side.

Validation cases:

1. `notarize_document` with `signatureSkipped = true` succeeds when selected notary is valid.
2. POA/trust with `signatureSkipped = true` returns 400.
3. Wrong-jurisdiction selected notary returns 400.
4. Inactive selected notary returns 400.
5. Owner selecting self returns 400.
6. Existing active request still returns 409.
7. Successful request writes `selected_notary_user_id` and `workflow_assignments.selected_notary`.

## Phase 3: Selected Notary Notification - Done, Manual Email Verification Pending

Status:

1. Done: `notary_request_received_email` runtime fallback is available in `notificationService`.
2. Done: migration seed added for the selected-notary notification template.
3. Done: `queueSelectedNotaryRequestNotification` queues to the selected notary, not the document owner.
4. Done: submit-notarization calls the queue function when `selectedNotaryUserId` is present.
5. Done: dedupe key is `selected_notary_request:{requestId}:{selectedNotaryUserId}`.
6. Done: created selected-notary jobs are best-effort processed inline with `runDueNotificationJobs`.
7. Done: `system.selected_notary_notified` audit metadata records job id and inline processing counts.
8. Done: focused backend tests verify template fallback, notary recipient, `/app/notary` CTA payload, controller queue call, inline processing call, and audit marker.
9. Yet to be tested: real Resend delivery in staging with provider config.

Add a new selected-notary email template.

Suggested key:

```text
notary_request_received_email
```

Template contract:

1. `channel = email`
2. `template_kind = status_update`
3. `audience_scope = notary`
4. `trigger_event = member.notary_selected`
5. CTA text: `Review request`
6. CTA target: `/app/notary`

The first CTA should point to `/app/notary` because that is the requested destination and the queue already exists. A later improvement can deep-link to `/app/notary/requests/{requestId}` after product review.

Required payload:

```json
{
  "firstName": "Jane",
  "memberName": "Member Name",
  "documentName": "document notarization",
  "jurisdiction": "US-OH",
  "reviewRequestUrl": "http://localhost:3000/app/notary",
  "dashboardUrl": "http://localhost:3000/app/notary",
  "requestId": "request-id",
  "documentId": "document-id"
}
```

Backend work:

1. Add fallback template in `notificationService` if this project continues using runtime fallbacks for critical templates.
2. Add migration seed for the notification template.
3. Add `queueSelectedNotaryRequestNotification` or similarly named function.
4. Call it after request/workflow creation when `selectedNotaryUserId` is present.
5. Dedupe by `selected_notary_request:{requestId}:{selectedNotaryUserId}`.
6. Process the created job inline with `runDueNotificationJobs` for local/staging reliability, or wire the deployed notification worker/scheduler before relying on queue-only behavior.
7. Log warning if the selected-notary notification queues but does not process.

Audit events:

1. Existing `member.notary_selected` should stay.
2. Add or enrich `system.selected_notary_notified` only if useful for support/debugging.
3. Include notification job id in metadata when available.

Validation cases:

1. Template seed is accepted by the `audience_scope` constraint.
2. Notification job uses the new template key.
3. Notification delivery recipient is selected notary, not document owner.
4. Email payload includes `/app/notary` CTA.
5. Inline outbox processing sends in local/staging when provider config is present.

## Phase 4: Sign Page Notary Selection UI - Done, Manual Flow Verification Pending

Status:

1. Done: `/app/sign?documentId=...` loads `GET /documents/{id}/available-notaries` when the member owner is ready for notary handoff or can use the `notarize_document` signature bypass.
2. Done: passive `Signing confirmed` handoff is replaced by a `Choose a notary` card when notary handoff is available.
3. Done: the page uses a custom popover select matching the dashboard filter pattern, not a native select.
4. Done: picker shows display name, jurisdiction, and service area while hiding email and phone.
5. Done: submit stays disabled until a notary is selected and no active request exists.
6. Done: signed flow sends only `selectedNotaryUserId`.
7. Done: `notarize_document` bypass sends `selectedNotaryUserId`, `signatureSkipped = true`, and `signatureSkipReason`.
8. Done: empty, load error, retry, and existing-request states are handled.
9. Done: web production build passes.
10. Yet to be tested: browser smoke with the known document URL and real local/staging accounts.

Update `/app/sign?documentId=...`.

When to show picker:

1. Viewer is the member owner, not invited signer.
2. Document requires notarization or `productFlowMode = "notarize_document"`.
3. Document status is `pending_notary`, or `productFlowMode = "notarize_document"` with optional signature skip still available.
4. There is no active notarization request yet.

UI behavior:

1. Replace the passive `Signing confirmed` completion card with an actionable `Choose a notary` card.
2. Fetch `GET /documents/{id}/available-notaries` with the member token.
3. Use the existing custom select/dropdown pattern already used in dashboard filters and contract forms.
4. Show notary display name, jurisdiction, and service area.
5. Hide notary email/phone.
6. Disable submit until a notary is selected.
7. Show an empty state if no same-jurisdiction active notaries are available.
8. Show submitted state if the available-notaries response indicates an active request already exists.

Submit body for signed flow:

```json
{
  "selectedNotaryUserId": "selected-user-id"
}
```

Submit body for `notarize_document` signature bypass:

```json
{
  "selectedNotaryUserId": "selected-user-id",
  "signatureSkipped": true,
  "signatureSkipReason": "member_selected_no_signature"
}
```

After success:

1. Toast: document sent to selected notary for review.
2. Route to `/app/documents?status=pending_notary`.
3. Avoid telling the member that contact details have been shared yet; that happens after notary approval.

Error states:

1. `400 validation_error`: selected notary no longer available.
2. `409 conflict`: notarization request already exists.
3. Empty notary list: no available notaries in the document jurisdiction.
4. Missing jurisdiction: document needs jurisdiction before selecting a notary.

Validation cases:

1. Given URL `/app/sign?documentId=0857aab9-4b97-405f-b33f-13d934cd0e1d` shows notary selection when status is `pending_notary` and no request exists.
2. Selecting a notary posts `selectedNotaryUserId`.
3. Continue-without-signature for `notarize_document` also requires selected notary.
4. Signature bypass is not offered for other products.
5. Existing active request shows a submitted state instead of a new selection form.

## Phase 5: Notary Queue And Review Page Fit Check

Status:

1. Done: queue returns selected-notary requests for active notary role.
2. Done: selected notary can access request context before assignment.
3. Done: wrong notary cannot access selected request context.
4. Done: queue row payload includes selected/assigned workflow identity fields.
5. Done: queue row now shows a small `Selected` marker for selected-but-unassigned requests.
6. Deferred to manual smoke: full click-through from selected-notary email to `/app/notary` in local/staging with real accounts.

Expected current behavior:

1. Selected notary receives email and clicks `Review request`.
2. Browser opens `/app/notary`.
3. Request appears under `Review requests`.
4. Row links to `/app/notary/requests/{requestId}`.
5. Detail page loads context.
6. If status is unopened, detail page can open/claim through IDN resolution.

Fit-check work:

1. Confirm queue returns selected-notary requests for active notary role.
2. Confirm selected notary can access request context before assignment.
3. Confirm wrong notary cannot access selected request.
4. Confirm queue row has enough information to recognize the new request.
5. Optional: add a small selected/requested marker in the queue, but do not block first pass on it.

## Phase 6: OpenAPI And Documentation - Done

Status:

1. Done: `api/openapi.yaml` includes `GET /documents/{id}/available-notaries`.
2. Done: `AvailableNotariesResponse` and `AvailableNotary` schemas are present in OpenAPI components.
3. Done: `POST /documents/{id}/submit-notarization` OpenAPI description documents selected-notary validation, `notarize_document`-only signature bypass, and selected-notary notification queueing.
4. Done: `x-audit-events` for submit includes `system.selected_notary_notified`.
5. Done: Notary dashboard docs mention selected requests can arrive from member choice before assignment.
6. Done: Notification template reference includes `notary_request_received_email`.
7. Done: Document flow docs explicitly capture the `notarize_document` optional signature exception.

Update `api/openapi.yaml`:

1. Add `GET /documents/{id}/available-notaries`.
2. Add `AvailableNotariesResponse` schema.
3. Add `AvailableNotary` schema.
4. Update `POST /documents/{id}/submit-notarization` description:
   - `selectedNotaryUserId` must be active and same jurisdiction.
   - `signatureSkipped` is only valid for `notarize_document`.
   - selected notary notification is queued when selection is present.
5. Add selected-notary notification event to `x-audit-events` if a new audit action is added.

Update docs if needed:

1. Notary dashboard docs should mention selected requests arrive from member choice.
2. Notification template reference should include `notary_request_received_email`.
3. Document flow docs should explicitly state the `notarize_document` optional signature exception.

## Phase 7: Test Plan - Done

Status:

1. Done: backend focused suite for selected-notary notification, notary-profile filtering, signing completion, notarization submit hardening, signature flow, and notary workspace access.
2. Done: backend TypeScript build.
3. Done: web build/type validation.
4. Done: OpenAPI YAML parse validation.

Latest Phase 6-7 automated validation on 2026-06-04:

1. Backend focused tests: 7 files passed, 49 tests passed.
2. Backend build: passed.
3. Web build: passed.
4. OpenAPI YAML parse: passed.

Backend tests:

1. Available-notaries endpoint authorization.
2. Available-notaries endpoint filters by normalized jurisdiction.
3. Available-notaries endpoint omits inactive/suspended/revoked notaries.
4. Available-notaries endpoint omits owner.
5. Submit rejects `signatureSkipped = true` outside `notarize_document`.
6. Submit accepts `signatureSkipped = true` for `notarize_document` with valid selected notary.
7. Submit rejects wrong-jurisdiction selected notary.
8. Submit writes selected workflow field and workflow assignment.
9. Submit queues selected-notary notification to selected notary recipient.
10. Selected notary can see request in `/notary/requests`.
11. Non-selected notary cannot access selected request.

Frontend checks:

1. Sign page loads available notaries after signing completion.
2. Sign page hides native select and uses existing custom select style.
3. Submit button stays disabled until selection.
4. Signed flow sends only `selectedNotaryUserId`.
5. `notarize_document` bypass sends `signatureSkipped = true` and selected notary.
6. Non-`notarize_document` products do not show signature bypass.
7. Existing request state does not allow duplicate submit.

Commands:

```text
cd backend
npm test -- tests/unit/notificationService.test.ts tests/unit/notaryProfileService.test.ts tests/unit/signingCompletionService.test.ts tests/integration/notarization-submit.test.ts tests/integration/signatures.test.ts --reporter=dot --silent
npm run build

cd apps/web
npm run build
```

Use narrower test file names if the implementation creates or updates differently named tests.

Latest Phase 1-4 automated validation on 2026-06-03:

1. Backend focused tests: 5 files passed, 41 tests passed.
2. Backend build: passed.
3. OpenAPI YAML parse: passed.
4. Web build: passed.

## Rollout Order

1. Backend available-notaries service and endpoint.
2. Submit-notarization selected-notary validation.
3. Selected-notary notification template, queue function, and inline outbox processing.
4. Sign page notary picker and submit wiring.
5. OpenAPI update.
6. Backend tests.
7. Frontend build/type validation.
8. Local manual flow using the known document URL.
9. Staging notification verification in Resend.

## Acceptance Criteria

The feature is complete when:

1. A `notarize_document` member can choose to skip signature, select a same-jurisdiction notary, and submit to notarization.
2. POA/trust members cannot skip required signatures.
3. A fully signed notarization-required document shows the notary picker instead of the passive `Signing confirmed` dead end.
4. The backend rejects inactive, expired, self, or wrong-jurisdiction selected notaries.
5. Successful submission creates exactly one active notarization request/workflow for the document.
6. The workflow contains `selected_notary_user_id`.
7. A `workflow_assignments` row records the selected notary.
8. Selected notary receives an email with a `Review request` CTA to `/app/notary`.
9. Selected notary sees the request in `/app/notary` Review requests.
10. Selected notary can open the existing review page and continue the already-built notary workflow.
11. Duplicate submission returns a clear existing-request state rather than creating a second request.

## Manual Smoke Script

1. Start backend on `localhost:4000`.
2. Start web on `localhost:3000`.
3. Sign in as the document owner.
4. Open `/app/sign?documentId=0857aab9-4b97-405f-b33f-13d934cd0e1d`.
5. Confirm the page displays available same-jurisdiction notaries when ready for notarization.
6. Select one notary.
7. Submit request.
8. Confirm document remains `pending_notary`.
9. Confirm request/workflow exists with selected notary.
10. Confirm Resend has the selected-notary email.
11. Sign in as selected notary.
12. Open `/app/notary`.
13. Confirm request appears under Review requests.
14. Open the request and approve it to confirm the existing downstream flow still works.

## Implementation Notes

1. Prefer Supabase service-role reads over direct `pg` in request-time backend paths.
2. Keep notification queueing best-effort but observable; request creation should not be rolled back only because email delivery fails.
3. Keep selected-notary notification separate from owner-facing code delivery.
4. Keep the API response free of notary private contact details until the notary approves the request.
5. Treat jurisdiction normalization as mandatory on both document and notary profile values.
6. Do not expand optional signature logic beyond `notarize_document`.