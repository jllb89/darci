-- Phase 3 wave 2: extend notification template coverage to the full 17-point product scope.

insert into public.notification_templates (
  template_key,
  template_version,
  locale,
  channel,
  template_kind,
  audience_scope,
  trigger_event,
  invite_kind,
  subject_template,
  body_template,
  body_format,
  variables_schema,
  is_active,
  source_reference,
  metadata,
  created_at,
  updated_at
)
values
  (
    'document_ready_for_review_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.document_ready_for_review',
    null,
    'Your documents are ready for review',
    $$Hi {{firstName}},

Your documents are ready for review.

Please take a few minutes to look them over carefully before you approve them for signing:
{{reviewUrl}}

If something does not look right, do not approve yet. You can return to your dashboard, update your information, and regenerate the document set.

Questions? We are happy to help.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'reviewUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(2)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(2)),
    now(),
    now()
  ),
  (
    'member_signing_ready_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.document_signing_prepared',
    null,
    'Your documents are ready for signature',
    $$Hi {{firstName}},

Your reviewed documents are now ready for signature.

When you are ready, sign here:
{{signUrl}}

Once your signature is complete, we will keep the next steps moving and let you know what comes next.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'signUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(2)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(2)),
    now(),
    now()
  ),
  (
    'member_signatures_recorded_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'member.document_signatures_confirmed',
    null,
    'Your signature has been recorded',
    $$Hi {{firstName}},

Your signature has been successfully recorded for {{documentName}}.

You can review the current status anytime from your dashboard:
{{dashboardUrl}}

If other signers are still pending, we will keep you updated as each one completes their step.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'dashboardUrl'),
      'optional', jsonb_build_array(),
      'scope', jsonb_build_array(3)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(3)),
    now(),
    now()
  ),
  (
    'signer_invitation_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'invite',
    'signer',
    'invite.document_signing_created',
    'document_signing',
    '{{requesterName}} has requested your signature',
    $$Hi {{firstName}},

{{requesterName}} has invited you to review and sign a document through DARCi.

You can get started here:
{{inviteUrl}}

If you do not already have a DARCi account, we will guide you through a short setup before you view the document.

This invitation is available until {{expiresAt}}.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'requesterName', 'inviteUrl', 'expiresAt'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(4)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(4)),
    now(),
    now()
  ),
  (
    'signer_signup_required_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'invite',
    'signer',
    'invite.document_signing_signup_required',
    'document_signing',
    'Finish setting up your DARCi account to view the document',
    $$Hi {{firstName}},

Before you can open the document that was shared with you, please finish setting up your DARCi account.

Complete setup here:
{{signupUrl}}

Once you are done, we will bring you straight back to the document review and signature flow.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'signupUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(5)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(5)),
    now(),
    now()
  ),
  (
    'signer_reminder_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'reminder',
    'signer',
    'invite.document_signing_reminder',
    'document_signing',
    'Reminder: your signature is still needed',
    $$Hi {{firstName}},

This is a quick reminder that your signature is still needed for {{documentName}}.

You can review and sign here:
{{inviteUrl}}

If you already completed this step, you can ignore this message.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'inviteUrl'),
      'optional', jsonb_build_array('expiresAt'),
      'scope', jsonb_build_array(6)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(6)),
    now(),
    now()
  ),
  (
    'signer_completion_confirmation_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'signer',
    'invite.document_signing_completed',
    null,
    'Thank you, your signature has been received',
    $$Hi {{firstName}},

Thank you. Your signature for {{documentName}} has been received.

You do not need to take any further action right now.

If the document owner needs anything else from you, we will let you know.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName'),
      'optional', jsonb_build_array(),
      'scope', jsonb_build_array(6)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(6)),
    now(),
    now()
  ),
  (
    'signer_signed_update_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'invite.signer_completed',
    null,
    '{{signerName}} has signed',
    $$Hi {{firstName}},

{{signerName}} has completed their signature for {{documentName}}.

You can follow the remaining status here:
{{dashboardUrl}}

We will keep notifying you as the document moves forward.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'signerName', 'documentName', 'dashboardUrl'),
      'optional', jsonb_build_array('remainingSignerCount'),
      'scope', jsonb_build_array(7)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(7)),
    now(),
    now()
  ),
  (
    'all_signatures_complete_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.all_required_signatures_complete',
    null,
    'All required signatures are complete',
    $$Hi {{firstName}},

All required signatures are now complete for {{documentName}}.

You can move to the next step from your dashboard here:
{{nextStepUrl}}

If your document requires illuminotarization, this is where you will begin that final approval flow.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'nextStepUrl'),
      'optional', jsonb_build_array(),
      'scope', jsonb_build_array(7)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(7)),
    now(),
    now()
  ),
  (
    'notarization_submission_confirmation_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'member.notarization_submitted',
    null,
    'Your document has been submitted for illuminotarization',
    $$Hi {{firstName}},

Your document has been submitted for illuminotarization.

You can track progress from your dashboard here:
{{dashboardUrl}}

If a code is required for the next step, we will send it to you and keep it available in your dashboard.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(8)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(8)),
    now(),
    now()
  ),
  (
    'notary_code_expiring_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'reminder',
    'registrant',
    'system.code_expiring',
    null,
    'Your illuminotary code is about to expire',
    $$Hi {{firstName}},

Your illuminotary code for {{documentName}} is about to expire on {{expiresAt}}.

Please schedule your appointment or return to your dashboard if you need to request a fresh code:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'expiresAt', 'dashboardUrl'),
      'optional', jsonb_build_array(),
      'scope', jsonb_build_array(10)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(10)),
    now(),
    now()
  ),
  (
    'notary_request_claimed_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'notary.code_resolved',
    null,
    'Your illuminotary has started reviewing your document',
    $$Hi {{firstName}},

{{illuminotaryName}} has accessed your document and started the illuminotarization review process.

You can follow the current status here:
{{dashboardUrl}}

If the illuminotary needs anything else from you before the in-person meeting, we will let you know.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'illuminotaryName', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(11)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(11)),
    now(),
    now()
  ),
  (
    'notary_changes_requested_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'notary.request_changes_requested',
    null,
    'Action needed: your illuminotary requested changes',
    $$Hi {{firstName}},

Your illuminotary requested changes before the document can move forward.

Summary of the request:
{{changeSummary}}

Please return to your dashboard to review the request and take the next step:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'changeSummary', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(11)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(11)),
    now(),
    now()
  ),
  (
    'notary_approval_received_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'notary.request_approved',
    null,
    'Your document has been approved for the in-person appointment',
    $$Hi {{firstName}},

Your illuminotary has approved the document for the in-person appointment step.

You can continue from your dashboard here:
{{nextStepUrl}}

We will keep you updated with the meeting details and final completion steps.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'nextStepUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(11)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(11)),
    now(),
    now()
  ),
  (
    'meeting_scheduled_confirmation_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'shared',
    'notary.meeting_scheduled',
    null,
    'Your illuminotary meeting is scheduled',
    $$Hi {{firstName}},

Your illuminotary meeting for {{documentName}} has been scheduled.

Date and time: {{scheduledAt}}
Location: {{meetingLocation}}

You can review the details here:
{{meetingUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'scheduledAt', 'meetingLocation', 'meetingUrl'),
      'optional', jsonb_build_array('counterpartyName'),
      'scope', jsonb_build_array(14)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(14)),
    now(),
    now()
  ),
  (
    'meeting_reminder_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'reminder',
    'shared',
    'system.meeting_reminder',
    null,
    'Reminder: your illuminotary meeting is coming up',
    $$Hi {{firstName}},

This is a reminder that your illuminotary meeting for {{documentName}} is scheduled for {{scheduledAt}}.

Location: {{meetingLocation}}

Please bring any required identification and arrive on time.

You can review the meeting details here:
{{meetingUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'scheduledAt', 'meetingLocation', 'meetingUrl'),
      'optional', jsonb_build_array(),
      'scope', jsonb_build_array(14)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(14)),
    now(),
    now()
  ),
  (
    'meeting_completed_seal_applied_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'notary.meeting_completed_and_sealed',
    null,
    'Your in-person signing is complete',
    $$Hi {{firstName}},

Your in-person meeting is complete and the illuminotary has applied the required seal and signature.

DARCi is now finishing the final post-meeting processing steps.

You can track status here:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(14)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(14)),
    now(),
    now()
  ),
  (
    'digital_original_ready_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.digital_original_ready',
    null,
    'Your digital original is ready',
    $$Hi {{firstName}},

Your document has completed the acknowledgment and digital-original preparation steps.

You can view the latest finalization status here:
{{dashboardUrl}}

We will notify you again as soon as the hash, ledger, and verification steps are complete.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(12, 13)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(12, 13)),
    now(),
    now()
  ),
  (
    'document_hash_completed_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.document_hash_completed',
    null,
    'Your document hash has been recorded',
    $$Hi {{firstName}},

DARCi has generated the document hash for {{documentName}}.

Hash reference:
{{hashValue}}

You can review the current record here:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'hashValue', 'dashboardUrl'),
      'optional', jsonb_build_array(),
      'scope', jsonb_build_array(15)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(15)),
    now(),
    now()
  ),
  (
    'ledger_anchor_completed_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.ledger_anchor_completed',
    null,
    'Your registration has been anchored to the ledger',
    $$Hi {{firstName}},

Your document's IDN and hash have now been written to the distributed ledger.

Ledger reference:
{{ledgerReference}}

You can review the current record here:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'ledgerReference', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(16)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(16)),
    now(),
    now()
  ),
  (
    'verification_ready_email',
    '2026.04.19.v2',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.verification_ready',
    null,
    'Your verification link is ready',
    $$Hi {{firstName}},

Your document is now ready for authenticity verification.

Verification link:
{{verificationUrl}}

You can also view it anytime from your dashboard:
{{dashboardUrl}}

Thank you for completing the process with DARCi.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'verificationUrl', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(17)
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave2', 'wave', 2, 'product_scope_steps', jsonb_build_array(17)),
    now(),
    now()
  )
on conflict (template_key, template_version, locale, channel) do update
  set template_kind = excluded.template_kind,
      audience_scope = excluded.audience_scope,
      trigger_event = excluded.trigger_event,
      invite_kind = excluded.invite_kind,
      subject_template = excluded.subject_template,
      body_template = excluded.body_template,
      body_format = excluded.body_format,
      variables_schema = excluded.variables_schema,
      is_active = excluded.is_active,
      source_reference = excluded.source_reference,
      metadata = excluded.metadata,
      updated_at = now();