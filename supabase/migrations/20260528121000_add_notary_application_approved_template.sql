-- Notary application approval email.

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
  'notary_application_approved_email',
  '2026.05.28.v1',
  'en-US',
  'email',
  'status_update',
  'member',
  'notary.application_approved',
  null,
  'Your notary profile request was approved',
  $$Hi {{firstName}},

Your request to become a notary was approved.

Open your profile settings to review your notary information and finish setup:

[Open notary settings]({{nextStepUrl}})

{{approvalSummary}}

- Your DARCi Team$$,
  'markdown',
  jsonb_build_object(
    'required', jsonb_build_array('firstName', 'nextStepUrl'),
    'optional', jsonb_build_array('approvalSummary', 'dashboardUrl'),
    'scope', jsonb_build_array(11)
  ),
  true,
  'docs/notary-profile-dashboard-roadmap.md',
  jsonb_build_object('seed_source', 'notary_application_approval_20260528'),
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
