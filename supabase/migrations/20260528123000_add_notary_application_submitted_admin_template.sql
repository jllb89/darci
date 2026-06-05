-- Notify admins when a member submits a notary application.

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
  'notary_application_submitted_admin_email',
  '2026.05.28.v1',
  'en-US',
  'email',
  'transactional',
  'shared',
  'notary.application_submitted',
  null,
  'New notary request from {{applicantName}}',
  $$Hi admin team,

{{applicantName}} submitted a request to become a DARCi notary.

Request details:

**Applicant:** {{applicantName}}
**Email:** {{applicantEmail}}
**Phone:** {{applicantPhone}}
**Jurisdiction:** {{jurisdiction}}
**Service area:** {{serviceAreaName}}

Review this request here:

[View this request]({{requestUrl}})

- Your DARCi Team$$,
  'markdown',
  jsonb_build_object(
    'required', jsonb_build_array('applicantName', 'jurisdiction', 'serviceAreaName', 'requestUrl'),
    'optional', jsonb_build_array('applicantEmail', 'applicantPhone', 'serviceAreaKind', 'submittedAt', 'dashboardUrl'),
    'scope', jsonb_build_array(11)
  ),
  true,
  'docs/notary-profile-dashboard-roadmap.md',
  jsonb_build_object(
    'seed_source', 'notary_application_submitted_admin_20260528',
    'prepared_route', '/admin/notary-requests?requestId=:id'
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