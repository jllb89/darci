# Signer Invitation Workflow Roadmap

Status: implementation through Phase 4 complete
Date: 2026-04-29

## Objective

Now that email delivery and Resend webhook tracking are available, DARCi needs to automatically invite every remaining signer on a document after the principal/document creator completes their own signature.

The workflow must:

- Resolve signer emails from server-side document/signing data.
- Use notification templates from the database, never hardcoded email bodies.
- Generate signer-specific access links, store token metadata safely, and send those links by email.
- Track Resend lifecycle events such as delivery, opens, clicks, bounces, complaints, and failures.
- Support unregistered invitees by routing them through signup/login and then back to signing.
- Enforce that the signed-in user's email matches the invited signer email before allowing signing.
- Scope each signer to the relevant digital original/signing output only.
- Mark the signing flow complete when all required signer obligations are fulfilled.

## Audit Summary

The codebase already has most of the primitives needed for this workflow. The main work is moving invitation dispatch into the backend, then making document signing invite-aware, email-matched, and signer-scoped.

### Database And Schema

Relevant migrations:

- `supabase/migrations/20260415010000_add_generation_phase2_signers_and_system_values.sql`
- `supabase/migrations/20260407103000_add_document_party_contacts.sql`
- `supabase/migrations/20260417113000_add_signature_execution_phase_b.sql`
- `supabase/migrations/20260419233000_add_phase3_invites_and_notifications.sql`
- `supabase/migrations/20260419235500_seed_phase3_template_wave_2.sql`
- `supabase/migrations/20260415133000_add_pending_review_document_status.sql`

Existing useful tables and fields:

- `document_output_signers` stores per-output signer obligations, including output key, document key, party role, required/group semantics, and document party linkage.
- `document_parties` stores contact information, including signer email addresses supplied by the document creator.
- `signatures` stores captured signature records linked to `document_output_signers`.
- `document_system_values` stores values such as `review_approval` and `signature_execution`.
- `document_access_invites`, `invite_recipients`, `invite_tokens`, and `invite_claims` already model invite lifecycle, recipients, hashed tokens, and claims.
- `notification_jobs`, `notification_deliveries`, and `outbound_message_events` already support the email outbox and provider lifecycle tracking.

Important gap:

- `document_output_signers` and document signing access are effectively owner-oriented today. Invited signer access should be mediated by backend authorization, not by broad direct table visibility.

### Notification Templates

Seeded templates already include signer-specific emails:

- `signer_invitation_email`
- `signer_signup_required_email`
- `signer_reminder_email`
- `signer_completion_confirmation_email`
- `signer_signed_update_email`
- `all_signatures_complete_email`

`backend/src/services/documentInviteService.ts` already resolves templates from `notification_templates` and renders through the shared notification rendering path. This is the correct path to preserve. New implementation should not hardcode invite body copy in backend code.

### Backend Signing Flow

Relevant files:

- `backend/src/controllers/documentsController.ts`
- `backend/src/routes/documents.ts`
- `backend/src/services/documentService.ts`
- `backend/src/services/documentInviteService.ts`
- `backend/src/services/inviteClaimService.ts`
- `backend/src/services/notificationService.ts`

Current behavior:

- Signing workspace state is built server-side from official generated outputs, signer obligations, and captured signatures.
- Signature capture and upload finalization create/update `signatures` records and apply signatures to official PDFs.
- `/documents/:id/sign` confirms the completed signing set and writes `signature_execution`, but it is not the right trigger for inviting remaining signers because it only makes sense after all required signatures are complete.
- Current document authorization is owner-centric. A signed-in external signer may have the `member` role after signup, but the document controller still rejects non-owner access.
- Signature capture currently assumes the document owner as signer actor in important paths. External signer captures must instead use the authenticated/claimed signer actor.

Best backend trigger point:

- After a successful principal signature capture/finalize, around the shared `completeSignatureCapture` path in `documentsController.ts`.
- This point confirms that the signature record exists and the official output has been stamped before invites are queued.

### Invite And Claim Flow

Relevant files:

- `backend/src/services/documentInviteService.ts`
- `backend/src/services/inviteClaimService.ts`
- `backend/src/controllers/inviteController.ts`
- `backend/src/routes/invites.ts`
- `api/openapi.yaml`

Current behavior:

- Invite creation persists invite records, recipients, hashed access tokens, notification jobs, notification deliveries, and initial events.
- Invite creation already supports idempotency keys.
- Public endpoints exist for invite token validation and claim:
  - `GET /invites/public/:token`
  - `POST /invites/public/:token/claim`
- Invite URLs now point to `/app/invite?token=...`.

Important gaps:

- Claim/signing access must enforce that the authenticated session email matches the invite recipient email.
- Public invite links should probably land on a dedicated frontend invite route before entering the signing workspace.
- Invite claim currently does not fully become the authorization context for `/app/sign?documentId=...`.

### Frontend Signing UX

Relevant files:

- `apps/web/src/app/app/sign/page.tsx`
- `apps/web/src/app/app/start/page.tsx`

Current behavior:

- The signing page is principal-centric.
- It already contains a client-side prototype that dispatches remaining signer invites after the principal signs.
- The exact copy requested for change currently appears in the signing page:
  - "Next after your signature"
  - "Complete your own signature first. The remaining signer workflow stays out of view on this page for now."

Important gaps:

- Invite dispatch should move from frontend to backend for reliability, idempotency, security, and auditability.
- The signing page needs a signer mode where it renders only the invited signer's relevant output/signature task.
- The signup/login page does not yet preserve an invite return target and route the user back to signing after authentication.

## Roadmap

### Phase 0: Lock Product Semantics

Decisions to make before implementation:

- Define the canonical backend meaning of "principal" for every product type.
- Decide whether trust documents use `principal`, `grantor`, or a product-specific owner/signing-role resolver.
- Define whether principal completion means one signature, all owner/principal obligations, or all obligations in a primary signing group.
- Define what "document complete" means when notarization may still be required.

Recommended rule:

- Principal signing is complete when all required signer obligations belonging to the document creator/principal signing group are captured.
- Remaining signer invites are queued immediately after that condition becomes true.
- Signing completion is separate from notarization completion.

Phase 0 decisions locked on 2026-04-29:

- Principal definition: use the document creator's own signer obligations.
- Trigger moment: send remaining signer invitations after all creator obligations are signed.
- Invite link route: generate public signer links as `/app/invite?token={token}`.
- Acceptance semantics: claiming the invite plus proceeding to sign implies acceptance; no separate accept/decline screen for the first pass.
- After all required signatures: auto-transition to `pending_notary` when notarization is required.

### Phase 1: Build A Server-Side Remaining Signer Resolver

Create a backend service that receives the document id, actor user id, and recently captured signer obligation.

Responsibilities:

- Load current document signing state.
- Determine whether principal signing just transitioned from incomplete to complete.
- Resolve remaining signer obligations from `document_output_signers`.
- Resolve signer emails and display names from `document_parties` and existing signer metadata.
- Skip signers whose signature is already captured.
- Skip signers who already have an active invite for that obligation.
- Return structured warnings for missing signer emails.
- Generate stable idempotency keys.

Recommended idempotency key:

```text
signing-remaining:{documentId}:{documentOutputSignerId}
```

Output should include:

- Invites queued.
- Invites already existing.
- Signers skipped because already signed.
- Signers skipped because email is missing.
- Signers skipped because not in scope for the just-completed principal signature.

Phase 1 implementation status on 2026-04-29:

- Added `backend/src/services/signerInvitationResolverService.ts`.
- The resolver detects whether the document creator's signer obligations just transitioned from incomplete to complete.
- The resolver returns remaining signer invite candidates with recipient email/name, signer scope, `required_signup` claim mode, and stable `signing-remaining:{documentId}:{documentOutputSignerId}` idempotency keys.
- The resolver returns skipped signer obligations for creator obligations, already signed signers, active existing invites, missing emails, and already satisfied optional signing groups.
- Unit coverage lives in `backend/tests/unit/signerInvitationResolverService.test.ts`.

### Phase 2: Queue Invites From The Backend Signature Flow

Hook the resolver after successful signature capture/finalize.

Use the existing invite service path so that the system continues to rely on:

- DB-backed `notification_templates`.
- Hashed invite tokens.
- Notification jobs and deliveries.
- Provider rollout policy.
- Resend delivery tracking.

Implementation direction:

- Call `createDocumentInvite` or extract a shared lower-level internal function if controller-level permissions are too owner-oriented.
- Pass `documentId`, `documentOutputSignerId`, recipient email/name, claim mode, and idempotency key.
- Store trigger metadata in invite context, such as `triggeredBySignatureId`, `triggeredByOutputSignerId`, `triggeredByUserId`, and `triggeredAt`.
- Record audit events for invite dispatch results.

Failure handling:

- Signature capture must not be rolled back solely because an email invite fails to queue.
- Invite queue failures should be recorded and returned in the signing response where appropriate.
- Provider dispatch remains asynchronous through the notification outbox.

Phase 2 implementation status on 2026-04-29:

- Added `backend/src/services/signerInvitationDispatchService.ts`.
- The dispatcher calls the Phase 1 resolver and queues each returned candidate through `createDocumentInvite` using `service_role` plus the creator actor id for ownership/audit context.
- Invite queueing uses existing DB-backed templates, hashed invite token creation, notification jobs, notification deliveries, and `signing-remaining:{documentId}:{documentOutputSignerId}` idempotency keys.
- Signature capture/finalize now calls the dispatcher after the signature has been applied to the official PDF.
- Candidate-level invite failures do not roll back signature capture; they are returned in the optional `remainingSignerInvites.failures` response and recorded with an audit event.
- The signature capture/finalize response may include `remainingSignerInvites` when creator completion triggers remaining signer dispatch.
- API response schemas were updated in `api/openapi.yaml`.
- Coverage lives in `backend/tests/unit/signerInvitationDispatchService.test.ts` and `backend/tests/integration/signatures.test.ts`.

### Phase 3: Formalize Dynamic Invite Links

Current invite tokens already exist and are hashed in storage. Keep that pattern.

Recommended changes:

- Introduce a dedicated frontend invite landing route, such as `/invite/{token}` or `/app/invite?token=...`.
- Change generated access URLs to point to that route instead of directly to `/app/sign`.
- Keep `/invites/public/:token` as the backend validation and claim API.
- Do not store raw tokens after creation.
- Include enough invite context for the landing page to show the signer what they are accepting without exposing the document itself before authorization.

The landing page should:

- Validate the token anonymously.
- Detect whether the user is signed in.
- If not signed in, route to signup/login with a safe internal return target.
- If signed in, claim the invite and route to signing only after email match succeeds.

Implementation status:

- Generated invite access URLs now target `/app/invite?token={token}` from `documentInviteService`.
- Added `apps/web/src/app/app/invite/page.tsx` as the dedicated invite landing route.
- The invite page validates public tokens through `GET /invites/public/:token`, preserves raw tokens only in the browser URL, and never displays the raw token back to the user.
- The `/app` layout allows `/app/invite` to render for anonymous users without the authenticated app shell.

### Phase 4: Support Signup/Login Return Path

Update the start/auth flow so unregistered invitees can complete signup and return to signing.

Requirements:

- Preserve invite token context through signup/login.
- Validate return targets as internal app routes only.
- After signup/login, call the invite claim endpoint.
- Verify authenticated email equals invited recipient email.
- Route to `/app/sign?documentId={documentId}` after successful claim.
- Show a clear mismatch state if the signed-in email does not match the invited signer email.

This keeps invite links unregistered-user-proof without weakening document access.

Implementation status:

- `/start` accepts a sanitized internal `returnTo` target plus `mode=signup|login` and redirects authenticated users back to that target.
- Invite links send anonymous users to `/start?returnTo=/app/invite?...`, preserving invite context through signup/login.
- After auth, the invite page checks the signed-in email against the invite recipient, claims via `POST /invites/public/:token/claim`, then routes to `/app/sign?documentId={documentId}`.
- Mismatched sessions are blocked client-side and can switch to the invited email account.

### Phase 5: Add Email-Matched Signer Authorization

This is the core security phase.

For signer access, require:

- A valid claimed invite.
- Authenticated session email equal to the invite recipient email after normalization.
- Invite status not revoked, expired, declined, or completed incorrectly.
- Requested document id matches the invite document id.
- Requested signer obligation matches the invite `document_output_signer_id`.

Do not rely on broad role names alone. A newly signed-up signer may be a `member`, but that does not mean they own the document.

Implementation options:

- Add invite-aware viewer context to existing document signing endpoints.
- Or add signer-specific endpoints that use invite claim context explicitly.

Recommended approach:

- Add a shared authorization helper that returns a document signing viewer context:
  - owner
  - invited signer
  - admin
  - service role
- Use that context in signing workspace reads and signature capture writes.

Implementation status:

- Added `backend/src/services/signerInviteAccessService.ts` to resolve claimed signer invites by document, claimed user, and normalized recipient email.
- Signing routes now use a signing-specific authorization context that preserves owner/admin/service-role access while allowing claimed invited signers through the invite boundary.
- General document authorization remains owner-oriented; invite access is only used where signing routes need it.
- The claimed signer access check requires the invite to be claimed or accepted, not expired, matched to the current user id, and matched to the invited email address.

### Phase 6: Scope The Signing Workspace Per Signer

Signer access should not see the owner's full document workflow.

Requirements:

- Only return signing tasks matching the claimed invite's signer obligation.
- Only return document outputs that signer is allowed to sign/view.
- For trusts, show the trust/digital original relevant to the signer; do not show principal-only POA output unless that signer obligation explicitly belongs to that output.
- Ensure saved/captured signatures write `signer_id` as the authenticated signer user id, not the document owner id.
- Ensure capture/finalize endpoints reject attempts to sign any output signer outside the invite scope.

Frontend requirements:

- Add a signer mode to `apps/web/src/app/app/sign/page.tsx`.
- Hide owner-only sections and remaining signer management from invited signers.
- Display only the invited signer's signature controls and the relevant document preview.

Implementation status:

- `/documents/:id/signing` now scopes invited signers to the invite's `document_output_signer_id` and returns `viewerAccess` so the frontend can render signer mode.
- Signature capture, saved-signature application, upload request, and upload finalization reject invited signer attempts outside the assigned signer obligation.
- Invited signer signature records use the claimed signer user id, not the document owner id.
- The signing page hides owner confirmation controls for invited signers and shows copy focused on the assigned signature task.

### Phase 7: Sync Resend Webhooks To Invite Lifecycle

Resend webhook handling already records provider lifecycle against notification delivery/event tables. Extend this to propagate invite lifecycle state.

Recommended propagation:

- `email.sent` / queued provider acceptance: update delivery metadata and invite sent state.
- `email.delivered`: mark recipient delivered metadata and ensure invite has `sent_at` if missing.
- `email.opened`: set `document_access_invites.first_opened_at` and recipient opened metadata if missing.
- `email.clicked`: set `document_access_invites.first_clicked_at` and recipient clicked metadata if missing.
- `email.bounced`, `email.complained`, `email.failed`, `email.delivery_delayed`: store latest failure/suppression metadata on invite recipient and delivery context.

Add stable linking metadata when queuing invite notifications:

- `inviteId`
- `inviteRecipientId`
- `documentId`
- `documentOutputSignerId`
- `notificationDeliveryId`

Implementation status:

- Notification delivery lifecycle events now propagate to linked invite records through `notification_deliveries.invite_recipient_id` and `notification_jobs.invite_id`.
- Resend delivered/opened/clicked events update invite sent/open/click timestamps and recipient lifecycle state.
- Resend bounced/complained/failed/suppressed/deferred events store the latest delivery issue metadata on invite and recipient records, and eligible pre-claim invites move to `failed` when delivery becomes terminally unsuccessful.

### Phase 8: Complete Signing When All Obligations Are Captured

After any signer captures a signature, check whether all required signer obligations are satisfied.

When all signatures are complete:

- Persist signing completion state, likely through `document_system_values.signature_execution` or a new signing-completion service.
- Mark relevant invites as completed.
- Queue signer/owner completion notifications using seeded DB templates.
- Determine the next document status based on notary requirements.

Recommended status semantics:

- If notarization is required, signatures complete means the document is ready for notarization submission or `pending_notary` transition, depending on current product workflow.
- If notarization is not required, signatures complete can transition the document to `completed`.
- Avoid using `notarized` unless the notary workflow has actually completed.

Completion templates to wire:

- `signer_completion_confirmation_email`
- `signer_signed_update_email`
- `all_signatures_complete_email`

### Phase 9: Update Frontend Copy And UX

Replace the current principal copy:

```text
Next after your signature
Complete your own signature first. The remaining signer workflow stays out of view on this page for now.
```

Recommended copy:

```text
After your signature
Once you add your signature, we will email the remaining signers at the addresses you provided so they can complete their own signatures.
```

Additional UX:

- Show queued invite results after principal signature.
- Show missing-email warnings if the backend reports skipped signer obligations.
- Remove or neutralize the existing client-side invite dispatch once backend dispatch is live.
- Add invite landing/signup/login states.
- Add mismatch state when the signed-in account email is not the invited signer email.

### Phase 10: Update API Spec And Tests

Update `api/openapi.yaml` for:

- Invite-token validation and claim behavior.
- Email-match failure responses.
- Signer-scoped signing workspace responses.
- Signer-scoped signature capture and upload finalization.
- Invite lifecycle tracking fields from Resend events.

Backend test coverage:

- Principal signature completion queues remaining signer invites exactly once.
- Repeated capture/finalize attempts do not duplicate invites.
- Missing signer email produces a structured skipped result.
- Existing signer account uses the correct DB template.
- Signup-required signer uses the correct DB template.
- Public invite token validation works anonymously.
- Invite claim requires authenticated email match before signing access.
- Email mismatch cannot access signing state or submit signatures.
- Invited signer can sign only their assigned `document_output_signer_id`.
- Resend delivered/opened/clicked events update invite lifecycle.
- All required signatures captured marks signing complete and queues completion emails.

Frontend test coverage:

- Principal copy reflects automatic signer notifications.
- Invite landing routes unauthenticated users to signup/login.
- Signup/login returns user to signing after successful claim.
- Mismatched email state blocks signing.
- Invited signer sees only their scoped document/signature task.

Phase 9 implementation note on 2026-04-29:

- Signer invitation emails now use the shared DARCi-styled email frame and DB templates that include document type plus signer role.
- The public `/app/invite?token={token}` landing page now mirrors the `/start` two-column visual shell with productized invitation copy and CTAs.

## Recommended Implementation Order

1. Backend remaining-signer resolver.
2. Backend signature-capture invite trigger.
3. Email-match invite claim enforcement.
4. Signer-aware document authorization.
5. Signer-scoped signing response and signature writes.
6. Frontend copy update and removal of client-side invite dispatch.
7. Invite landing plus signup/login return path.
8. Resend webhook propagation to invite lifecycle.
9. All-signatures-complete state and completion notifications.
10. API spec and full regression tests.

## Open Decisions

- What is the canonical principal resolver for trusts, POAs, and future product types?
- Invite URLs use `/app/invite?token=...`.
- Successful claim plus proceeding to signing implies acceptance for now.
- All-signatures-complete should automatically move eligible documents to `pending_notary` when notarization is required.
- Should signer invite lifecycle surface to the principal in the signing page, document detail page, or a dedicated invite management surface?

## Implementation Principles

- Keep email templates in `notification_templates`; do not hardcode email bodies.
- Keep invite tokens hashed at rest.
- Treat invite claim plus email match as the signer authorization boundary.
- Let backend own invite dispatch, idempotency, audit, and lifecycle state.
- Scope signer access by `document_output_signer_id`, not just document id.
- Separate signing completion from notarization completion.
