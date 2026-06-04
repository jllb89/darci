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
  'notary_request_received_email',
  '2026.06.03.v1',
  'en-US',
  'email',
  'status_update',
  'notary',
  'member.notary_selected',
  null,
  'New notarization request ready for review',
  $$Hi {{firstName}},

{{memberName}} selected you to review a {{documentName}} in {{jurisdiction}}.

Open your notary workspace to review the request:

[Review request]({{reviewRequestUrl}})

- Your DARCi Team$$,
  'markdown',
  jsonb_build_object(
    'required', jsonb_build_array('firstName', 'memberName', 'documentName', 'jurisdiction', 'reviewRequestUrl'),
    'optional', jsonb_build_array('dashboardUrl', 'requestId', 'documentId'),
    'scope', jsonb_build_array(11)
  ),
  true,
  'docs/notarization-selected-notary-handoff-roadmap.md',
  jsonb_build_object(
    'seed_source', 'selected_notary_request_20260603',
    'cta_text', 'Review request',
    'cta_path', '/app/notary'
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
