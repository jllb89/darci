# Document Activity Events For Users

This document is the UX-facing audit event allowlist for document activity surfaces such as `/app` Recent Activity and document workspace timelines.

The goal is to show events users understand and care about. Implementation-only audit noise stays in the audit log, but should not appear as user-facing activity badges.

Source scan date: 2026-05-26.

## UX Principles

- Show milestones that change what the user can do next.
- Show failures that require attention or explain why work stopped.
- Show human workflow events: review, signing, reminders, notary assignment, meeting, identity, finalization.
- Hide repeated technical steps and low-level artifact assembly.
- Prefer one clear event over several implementation steps that happen in sequence.

## Recommended Events

### Document Intake, Upload, And Review

| Event | Activity copy |
| --- | --- |
| `member.document_upload_started` | The user began creating or uploading a document. |
| `system.document_created` | A document record now exists in the workspace. |
| `member.document_upload_completed` | The uploaded document is available to work on. |
| `system.document_ready_for_review` | The document moved to a reviewable state. |
| `member.document_review_approved` | The user approved the reviewed document. |
| `system.document_idn_assigned` | The document received its registry identifier. |
| `system.document_signing_prepared` | The document is ready for signature collection. |

### Signing And Reminders

| Event | Activity copy |
| --- | --- |
| `member.signature_capture_completed` | A required signer completed a signature. |
| `member.document_signatures_confirmed` | The document signature set was confirmed. |
| `system.signature_completion_workflow_applied` | Signing moved the document to its next workflow state. |
| `system.signature_completion_workflow_failed` | Something went wrong after signature capture. |
| `system.invites_issued_for_remaining_signers` | Additional signer invitations were issued. |
| `system.remaining_signer_invite_dispatch_failed` | A signer invitation could not be sent. |
| `member.signature_reminder_sent` | A pending signer was reminded. |
| `member.signature_reminder_failed` | A reminder could not be sent. |

### Notarization

| Event | Activity copy |
| --- | --- |
| `member.notarization_submit_started` | The user started the notarization handoff. |
| `member.notarization_submitted` | The document entered the notary workflow. |
| `member.notary_selected` | A notary was selected for the request. |
| `notary.code_resolved` | The notary accessed the request. |
| `system.request_assigned_to_notary` | The request was assigned to a notary. |
| `notary.request_approved` | The notary approved the request. |
| `notary.request_rejected` | The notary rejected the request. |
| `notary.request_changes_requested` | The notary requested changes. |

### Meeting And Identity

| Event | Activity copy |
| --- | --- |
| `notary.meeting_started` | The notary meeting began. |
| `notary.meeting_completed` | The notary meeting ended. |
| `system.meeting_no_show_recorded` | A meeting participant was marked as no-show. |
| `notary.identity_verified` | Identity verification was completed. |

### Finalization

| Event | Activity copy |
| --- | --- |
| `system.notarized_document_created` | The final notarized artifact exists. |
| `system.ledger_anchor_completed` | The finalized record was anchored/registered. |

## Recommended `/app` Timeline Allowlist

Use an allowlist for member-facing timelines. It is easier to keep useful than a blacklist, because new internal events will not accidentally appear.

```ts
const memberDashboardTimelineActions = new Set([
  "member.document_upload_started",
  "system.document_created",
  "member.document_upload_completed",
  "system.document_ready_for_review",
  "member.document_review_approved",
  "system.document_idn_assigned",
  "system.document_signing_prepared",
  "member.signature_capture_completed",
  "member.document_signatures_confirmed",
  "system.signature_completion_workflow_applied",
  "system.signature_completion_workflow_failed",
  "system.invites_issued_for_remaining_signers",
  "system.remaining_signer_invite_dispatch_failed",
  "member.signature_reminder_sent",
  "member.signature_reminder_failed",
  "member.notarization_submit_started",
  "member.notarization_submitted",
  "member.notary_selected",
  "notary.code_resolved",
  "system.request_assigned_to_notary",
  "notary.request_approved",
  "notary.request_rejected",
  "notary.request_changes_requested",
  "notary.meeting_started",
  "notary.meeting_completed",
  "system.meeting_no_show_recorded",
  "notary.identity_verified",
  "system.notarized_document_created",
  "system.ledger_anchor_completed",
]);
```

Everything outside this allowlist should stay out of member-facing Recent Activity unless it gets clear activity copy and a clear reason it helps the user understand what happened or what to do next.
