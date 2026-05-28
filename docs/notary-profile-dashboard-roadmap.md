# Notary Profile Dashboard Roadmap

Last updated: 2026-05-28

## Current Delivery Snapshot

Implemented now:

1. Notary enrollment and admin approval flow inside settings.
2. Notary queue with review, in-review, ready, and completed tabs.
3. Request review workspace with approve-first flow and signed PDF previews.
4. Contact handoff via approval notifications for member and notary.
5. In-person meeting start, check-in, same-place evidence, and identity capture flow.
6. Finalization gating tied to meeting state, same-place pass, and identity verified.
7. Notary history route with completed and closed request tracking.

Polish status:

1. History and breadcrumb navigation are now wired for notary role.
2. Notary settings are live at /app/settings for approved notaries.
3. Remaining work is iterative UX and compliance-depth polish, not core flow completeness.

## Why This Exists

The notary profile is not a member document workspace. Its primary job is to receive documents that all required parties have already signed, let the notary review the document by IDN, confirm the package is ready for an in-person meeting, coordinate that meeting, verify both parties are physically together, and then complete the notarial portion of the document.

The current app already has the beginning of this surface:

1. Frontend routes:
   - `/app/notary`
   - `/app/notary/requests/[id]`
2. Sidebar role separation for active notaries.
3. Backend notary routes under `/notary`, including request queue, request context, code resolution, review decisions, meeting lifecycle, geolocation check-ins, evidence artifacts, signing, and submit actions.

This roadmap turns those pieces into a complete notary dashboard, including notary enrollment, admin approval, and the in-person completion flow.

## Product Intent

Notaries should not browse member-owned draft documents. They should only work on notarization-ready packages that have already passed member-side signing. Their experience should feel like an operational queue and a profile-driven workflow:

1. Receive or enter an IDN/access code for a fully signed document.
2. Review the final signed package.
3. Approve readiness for an in-person meeting or request corrections.
4. Share member and notary contact details so they can arrange the meeting directly.
5. Start the meeting session when both parties are physically together.
6. Prompt the member to log in.
7. Capture geolocation from both member and notary.
8. Confirm same-place evidence meets threshold.
9. Enter and review notary profile information.
10. Add missing notarial fields and seal/signature artifacts after the in-person meeting starts and same-place evidence passes.
11. Submit the completed notarial package for finalization and verification.

## Non-Goals For The First Notary Dashboard Pass

1. Letting notaries create member documents.
2. Letting notaries edit member intake answers before the in-person meeting.
3. Building DARCi-managed scheduling, proposed-slot coordination, or calendar booking in the first pass.
4. Adding video notarization or remote online notarization flows.
5. Exposing member-only document lists, payment surfaces, or signature request inboxes to active notary profiles.

## Core Dashboard Sections

### 0. Notary Enrollment And Profile

Route options:

1. Member profile section for notary signup request.
2. Admin review surface for pending notary applications.
3. Notary dashboard profile settings after approval.

Purpose: Let an existing member request to become a notary, let admins approve or reject that request, and then let approved notaries manage their own operational profile.

Member-facing signup form fields:

1. Name.
2. State or jurisdiction.
3. County or service area.
4. Email.
5. Phone.
6. Signature.
7. Seal.

Notes:

1. Name, email, and phone are already required in the member profile flow.
2. County or service area needs a standardized structure that can work across all 51 states.
3. Use the same signature component already used for document signing.

Admin approval flow:

1. Show a table of pending notary signup requests.
2. Display the full request payload in the admin profile.
3. Admin approves or rejects the request.
4. On approval, assign the notary role to that member.
5. Trigger an email so the member can log in and use the notary profile.

Notary profile settings:

1. Allow the approved notary to review and update their jurisdiction, service area, seal, signature, and contact details.
2. Keep the profile editable inside the notary dashboard.
3. Treat this as the source of truth for later completion steps.

### 1. Work Queue

Route: `/app/notary`

Purpose: Give notaries a focused operational home.

Primary tabs:

1. `Review requests`
   - Unopened fully signed packages requesting this notary.
   - Shows only member and IDN.
2. `In-review`
   - Requests this notary opened but has not decided yet.
   - Shows only member and IDN.
3. `Ready for in-person session`
   - Approved requests where DARCi has shared contact details with both parties.
   - Shows only member and IDN.

Backend already available:

1. `GET /notary/requests`
2. `POST /notary/code/resolve`
3. `POST /notary/code/resend`
4. `POST /notary/code/regenerate`

Frontend work needed:

1. Replace placeholder queue UI with the three-tab request list.
2. Keep rows intentionally minimal: member and IDN.
3. Move unopened requests into `In-review` when the notary opens them.
4. Route selected requests into `/app/notary/requests/[id]`.

### 2. Request Review Workspace

Route: `/app/notary/requests/[id]`

Purpose: Let the notary inspect a fully signed package before agreeing to a meeting.

Layout:

1. Left side: document previews for every generated signed package output.
2. Right side: review decision form.
3. Header: back link, page title, and refresh action.

Review checklist:

1. All required parties signed.
2. Final signed version is available.
3. IDN is present and visible to the notary.
4. Document type and jurisdiction are eligible.
5. Required notary fields are known or flagged as meeting-time fields.
6. No unresolved warnings block approval.

Primary decisions:

1. `Approve for meeting`
2. Hidden for now: `Request changes`
3. Hidden for now: `Reject request`

Backend already available:

1. `GET /notary/requests/:id/context`
2. `POST /notary/requests/:id/review-decision`

Frontend work needed:

1. Bind request context to the workspace.
2. Display every generated PDF output in the review workspace.
3. Add approve-only decision form with an optional email note.
4. Leave package versions, warning panels, finalization snapshots, and next-action/admin diagnostics out of the notary view.

### 3. Approval Contact Emails

Purpose: After the notary approves the document for an in-person meeting, DARCi should email the notary and member with each other's contact details. The actual meeting arrangement happens directly between them outside the platform.

MVP behavior:

1. Notary approves the request.
2. DARCi sends the member the notary's contact details.
3. DARCi sends the notary the member's contact details.
4. Member and notary arrange date, time, and location directly.
5. Request status appears in the notary queue as `Ready for in-person session`.

Backend already available:

1. `POST /notary/requests/:id/review-decision`
2. Notification queues for notary/member next-step messaging.
3. Workspace identity summaries for owner/member and notary contact presentation.

Backend work likely needed:

1. Add a small approval-contact email reason if the existing review-decision notification is not explicit enough.
2. Ensure the notary request context returns only the contact fields that should be shared.

Frontend work needed:

1. No separate contact-sharing section.
2. Show approved requests under `Ready for in-person session`.
3. Keep the approval success state clear that contact emails are triggered.

### 4. Live Meeting Session

Route option: `/app/notary/requests/[id]/meeting`

Purpose: Give the notary a clean, step-by-step in-person flow.

Session stages:

1. `Start meeting`
   - Notary starts the in-person session.
   - Member is prompted to log in.
2. `Member presence`
   - Member confirms attendance.
   - Member browser captures geolocation with permission.
3. `Notary presence`
   - Notary browser captures geolocation.
4. `Same-place check`
   - DARCi compares both samples.
   - UI shows pass, warning, or fail with distance and accuracy context.
5. `Identity check`
   - Notary records ID method, status, subject name, document type, last four, and notes.
6. `Meeting evidence`
   - Artifacts and notes are captured for auditability.

Backend already available:

1. `POST /notary/requests/:id/meeting/check-in`
2. `POST /notary/requests/:id/meeting/proximity-evaluation`
3. `POST /notary/requests/:id/meeting/identity-verification`
4. `POST /notary/requests/:id/meeting/artifacts`
5. `POST /notary/requests/:id/meeting/no-show`

Frontend work needed:

1. Browser geolocation capture utility with permission states.
2. Member login handoff from the contact-handoff notification.
3. Live session status UI for both participant check-ins.
4. Proximity evaluation results panel.
5. Identity verification form.
6. Audit-friendly meeting timeline.

### 5. Notarial Completion Workspace

Route option: inline final step inside `/app/notary/requests/[id]/meeting`, or a subview inside `/app/notary/requests/[id]`.

Purpose: Once the meeting has started, the same-place check passes, and identity is verified, the notary enters the missing notarial fields, generates a final preview, and applies seal/signature artifacts.

Required sections:

1. Missing notarial data form.
2. Seal/signature upload or selection.
3. Seal preview artifact generated only after the meeting starts and evidence is confirmed.
4. Final document preview.
5. Confirm and submit for finalization.

Backend already available:

1. `POST /notary/requests/:id/sign`
2. `POST /notary/requests/:id/submit`
3. Meeting artifacts support `seal_preview`.
4. Finalization and verification read models are exposed in the request context.

Frontend work needed:

1. Define exact notary field schema per document type.
2. Build seal/signature asset picker or upload flow.
3. Render the final preview only after meeting start, same-place evidence, and identity verification are complete.
4. Block submit until meeting evidence and required fields are complete.
5. Display finalization state after submit.

### 6. Completed Work And Audit History

Route option: `/app/notary/history` or a filter inside `/app/notary`.

Purpose: Let notaries find past work without exposing member drafts.

Sections:

1. Completed requests.
2. Rejected or changes-requested requests.
3. Meeting evidence summary.
4. Finalization and verification status.
5. Public verification link when available.

Backend already available:

1. Queue/context finalization fields.
2. Workflow history.
3. Meeting evidence read model.

Frontend work needed:

1. Completed queue filters.
2. Read-only request detail mode.
3. Finalization history panel.

### 7. Notary Settings

Route option: `/app/settings` initially, future `/app/notary/settings` if role-specific settings grow.

Purpose: Keep profile setup and notary assets separate from member profile state.

Sections:

1. Commission/profile details.
2. Seal and signature assets.
3. Notification email preferences.
4. Default meeting availability and service area.
5. Compliance documents and expiration reminders.

This section should mirror the approved notary signup data so the dashboard profile stays aligned with the admin-approved record.

Backend readiness: partial. Some role verification and artifact concepts exist, but the asset/profile management UI still needs a focused contract.

## Proposed Sidebar For Notary Role

First pass:

1. `Queue` -> `/app/notary`
2. `Verify a document` -> existing verification popover/path

After the request workspace lands:

1. `Queue` -> `/app/notary`
2. `In-person sessions` -> queue filter for approved/ready requests
3. `Completed` -> `/app/notary/history` or queue filter
4. `Verify a document` -> existing verification popover/path
5. `Settings` -> `/app/settings`

Keep `Documents`, `Requests`, and `Activity` hidden for active notary profiles unless they are redesigned as notary-specific surfaces.

## Implementation Phases

### Phase 1: Real Queue And IDN/Code Entry

Goal: Replace the placeholder notary home with an actual operational queue.

Tasks:

1. Connect `/app/notary` to `GET /notary/requests`.
2. Add queue cards using the existing notary read model.
3. Add counts for review requests, in-review, ready for in-person session, completed, and total.
4. Add IDN/access-code entry panel.
5. Use `POST /notary/code/resolve` for claimable access codes.
6. If IDN-only lookup is required, add or extend a backend endpoint to resolve IDN to an eligible notary request without exposing member drafts.
7. Route claimed/opened requests to `/app/notary/requests/[id]`.

Acceptance criteria:

1. Active notary can open `/app/notary` and see only notary-eligible work.
2. Active notary can enter a valid code and land in the request workspace.
3. Already assigned, expired, unknown, and ineligible code states are clear.
4. Member documents never leak into the notary queue.

### Phase 2: Request Review Workspace

Goal: Let notaries decide whether a signed package is ready for an in-person meeting.

Tasks:

1. Connect `/app/notary/requests/[id]` to `GET /notary/requests/:id/context`.
2. Build generated-document selector and embedded PDF preview.
3. Add approve-only visible decision action.
4. Keep request changes/reject hidden for now.
5. Redirect the notary back to `/app/notary` after approval.

Acceptance criteria:

1. Notary can review every generated PDF in the signed package.
2. Notary can approve for meeting.
3. Decision updates queue status and request context.
4. Decision notification behavior includes the optional approval note.

### Phase 3: Approval Contact Emails

Goal: Share member and notary contact details by email when the notary approves the request.

Tasks:

1. Trigger member and notary contact emails after approval.
2. Send the notary's contact details to the member.
3. Send the member's contact details to the notary.
4. Move approved requests into `Ready for in-person session`.
5. Avoid adding a separate contact-sharing section or contact-management panel.

Acceptance criteria:

1. Notary approval triggers contact emails.
2. Member receives the notary's contact details and a login path.
3. Notary receives the member's allowed contact details.
4. DARCi does not collect proposed meeting slots, meeting time, or location in this phase.
5. Queue shows approved requests as ready for the in-person session.

### Phase 4: Live Meeting And Same-Place Evidence

Goal: Start the in-person session and prove both users are in the same location.

Tasks:

1. Build live meeting session view.
2. Add notary check-in and member check-in flows.
3. Capture browser geolocation with permission/error states.
4. Send both geolocation samples to backend check-in endpoint.
5. Run proximity evaluation and render same-place result.
6. Record no-show and cancellation paths.

Acceptance criteria:

1. Meeting cannot proceed until required participants check in.
2. Same-place result is visible and audit-backed.
3. Notary cannot complete notarization when location evidence fails unless a future override policy is explicitly added.

### Phase 5: Identity, Seal, And Submit

Goal: Complete the notarial work after the in-person requirements pass.

Tasks:

1. Add identity verification form.
2. Add missing notarial data fields.
3. Add seal/signature asset selection or upload.
4. Create seal preview artifact.
5. Submit final package for finalization.
6. Show finalization/verification status.

Acceptance criteria:

1. Notary can record identity verification.
2. Required notarial fields and seal/signature are captured.
3. Submit is blocked until review, meeting, geolocation, and identity requirements are satisfied.
4. Finalized package exposes verification state and public verify path when available.

### Phase 6: History, Compliance, And Settings

Goal: Make the notary profile complete enough for repeated operational use.

Tasks:

1. Add completed/history view or filters.
2. Add read-only completed request mode.
3. Add notary-specific settings for commission data, seal/signature assets, and notification preferences.
4. Add compliance expiry reminders for commission/profile artifacts.

Acceptance criteria:

1. Notary can find completed work.
2. Notary can inspect finalization and evidence summaries.
3. Notary can manage profile details without entering member-only areas.

## First Build Slice Recommendation

Start with Phase 1 and Phase 2 together:

1. Real `/app/notary` queue.
2. IDN/access-code entry panel.
3. Real `/app/notary/requests/[id]` context binding.
4. Document preview shell.
5. Review decision actions.

This creates the minimum useful notary dashboard and unlocks the meeting workflow as the next clear slice.

## Open Decisions

1. Should notaries enter only IDN, only access code, or a single field that accepts both?
2. Should IDN lookup claim the request, or should claim require a separate notary access code?
3. What is the required geolocation threshold in meters for same-place evidence?
4. Which notarial fields are document-type-specific and which are universal?
5. Where should notary seal/signature assets live: global profile settings or per-request upload?
6. What override policy, if any, exists when browser geolocation fails in person?