-- Productized signer invitation copy with explicit document type and signer role context.

update public.notification_templates
set subject_template = case template_key
    when 'signer_invitation_email' then 'Your signature is requested for {{documentType}}'
    when 'signer_signup_required_email' then 'Your signature is requested for {{documentType}}'
    when 'signer_reminder_email' then 'Reminder: your {{roleLabel}} signature is still needed'
    else subject_template
  end,
  body_template = case template_key
    when 'signer_invitation_email' then $$Hi {{firstName}},

You've been invited to review and sign through DARCi.

**Document type:** {{documentType}}

**Your role:** {{roleLabel}}

Open the secure invitation when you are ready:

[Open secure invitation]({{inviteUrl}})

This invitation expires on {{expiresAt}}.

The DARCi Team$$
    when 'signer_signup_required_email' then $$Hi {{firstName}},

You've been invited to review and sign through DARCi.

**Document type:** {{documentType}}

**Your role:** {{roleLabel}}

Create your DARCi account to open the secure invitation:

[Create account to sign]({{signupUrl}})

After setup, we will bring you back to the document automatically.

The DARCi Team$$
    when 'signer_reminder_email' then $$Hi {{firstName}},

Your signature is still needed through DARCi.

**Document type:** {{documentType}}

**Your role:** {{roleLabel}}

Open the secure invitation when you are ready:

[Open secure invitation]({{inviteUrl}})

If you already completed this step, no further action is needed.

The DARCi Team$$
    else body_template
  end,
  body_format = 'markdown',
  variables_schema = case template_key
    when 'signer_invitation_email' then jsonb_build_object(
      'required', jsonb_build_array('firstName', 'requesterName', 'documentType', 'roleLabel', 'inviteUrl', 'expiresAt'),
      'optional', jsonb_build_array('documentName'),
      'scope', jsonb_build_array(4)
    )
    when 'signer_signup_required_email' then jsonb_build_object(
      'required', jsonb_build_array('firstName', 'requesterName', 'documentType', 'roleLabel', 'signupUrl'),
      'optional', jsonb_build_array('documentName', 'expiresAt'),
      'scope', jsonb_build_array(5)
    )
    when 'signer_reminder_email' then jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentType', 'roleLabel', 'inviteUrl'),
      'optional', jsonb_build_array('documentName', 'expiresAt', 'requesterName'),
      'scope', jsonb_build_array(6)
    )
    else variables_schema
  end,
  source_reference = 'docs/signer-invitation-workflow-roadmap.md',
  metadata = metadata || jsonb_build_object(
    'copy_revision', 'signer_invite_productized_20260430',
    'includes_document_type', true,
    'includes_role_label', true
  ),
  updated_at = now()
where template_key in (
    'signer_invitation_email',
    'signer_signup_required_email',
    'signer_reminder_email'
  )
  and locale = 'en-US'
  and channel = 'email'
  and is_active = true;
