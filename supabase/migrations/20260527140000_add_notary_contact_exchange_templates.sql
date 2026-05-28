-- Make notary approval notifications carry the contact exchange for both parties.

update public.notification_templates
set subject_template = 'Your document is ready for the in-person notary session',
  body_template = $$Hi {{firstName}},

Your illuminotary approved your document for the in-person appointment step.

Session contact:

**Illuminotary:** {{notaryName}}
**Email:** {{notaryEmail}}
**Phone:** {{notaryPhone}}

{{approvalSummary}}

Continue from your dashboard when you are ready:

[Open dashboard]({{nextStepUrl}})

- Your DARCi Team$$,
  body_format = 'markdown',
  variables_schema = jsonb_build_object(
    'required', jsonb_build_array('firstName', 'nextStepUrl', 'notaryName', 'notaryEmail'),
    'optional', jsonb_build_array('documentName', 'approvalSummary', 'notaryPhone'),
    'scope', jsonb_build_array(11)
  ),
  metadata = metadata || jsonb_build_object(
    'copy_revision', 'notary_contact_exchange_20260527',
    'includes_contact_exchange', true
  ),
  updated_at = now()
where template_key = 'notary_approval_received_email'
  and locale = 'en-US'
  and channel = 'email'
  and is_active = true;

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
values (
  'notary_member_contact_received_email',
  '2026.05.27.v1',
  'en-US',
  'email',
  'status_update',
  'notary',
  'notary.request_approved',
  null,
  'Member contact for the in-person notary session',
  $$Hi {{firstName}},

You approved the member document for the in-person appointment step.

Session contact:

**Member:** {{memberName}}
**Email:** {{memberEmail}}
**Phone:** {{memberPhone}}

{{approvalSummary}}

Open the request when you are ready to capture the in-person session:

[Open notary workspace]({{nextStepUrl}})

- Your DARCi Team$$,
  'markdown',
  jsonb_build_object(
    'required', jsonb_build_array('firstName', 'nextStepUrl', 'memberName', 'memberEmail'),
    'optional', jsonb_build_array('documentName', 'approvalSummary', 'memberPhone'),
    'scope', jsonb_build_array(11)
  ),
  true,
  'docs/notary-profile-dashboard-roadmap.md',
  jsonb_build_object(
    'seed_source', 'notary_contact_exchange_20260527',
    'includes_contact_exchange', true
  ),
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
  metadata = public.notification_templates.metadata || excluded.metadata,
  updated_at = now();