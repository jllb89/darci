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
  metadata
)
values (
  'in_person_session_started_email',
  '2026.06.09.v1',
  'en-US',
  'email',
  'status_update',
  'registrant',
  'notary.meeting_started',
  null,
  'Your in-person notarization session has started',
  $$<p>Hi {{firstName}},</p>
<p>{{illuminotaryName}} started the in-person session for <strong>{{documentName}}</strong>.</p>
<p>Open your request to check in from your device.</p>
<a href="{{sessionUrl}}" style="display:block;padding:14px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0 24px;">Open request</a>
<p style="margin:0;color:#7f7f7f;font-size:12px;">-- Your DARCi Team</p>$$,
  'html',
  '{"required":["firstName","illuminotaryName","documentName","sessionUrl"],"optional":["dashboardUrl","requestId","documentId"],"scope":[11]}'::jsonb,
  true,
  'docs/in-person-session-completion-roadmap.md',
  '{"seed_source":"20260609_in_person_session_started"}'::jsonb
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