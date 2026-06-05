update public.notification_templates
set is_active = false,
    updated_at = now()
where template_key in (
  'notary_approval_received_email',
  'notary_member_contact_received_email'
)
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
  metadata
)
values
(
  'notary_approval_received_email',
  '2026.06.05.v1',
  'en-US',
  'email',
  'status_update',
  'registrant',
  'notary.request_approved',
  null,
  'Your notarization request was approved - contact details inside',
  $$<p>Hi {{firstName}},</p>
<p>{{illuminotaryName}} reviewed and approved your <strong>{{documentName}}</strong>.<br/>Their contact details are below so you can coordinate next steps.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e0e0e0;margin:24px 0;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 2px;font-size:11px;color:#7f7f7f;text-transform:uppercase;letter-spacing:0.5px;">Your illuminotary</p>
<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#191919;">{{notaryName}}</p>
<table cellpadding="0" cellspacing="0" style="width:100%;"><tr>
<td style="padding:0 8px 0 0;width:50%;"><a href="mailto:{{notaryEmail}}" style="display:block;padding:10px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:13px;font-weight:600;">Email</a></td>
<td style="width:50%;"><a href="{{notaryPhoneHref}}" style="display:block;padding:10px 0;background:#191919;color:#ffffff;text-align:center;text-decoration:none;font-size:13px;font-weight:600;">Call</a></td>
</tr></table>
<p style="margin:14px 0 0;font-size:12px;color:#7f7f7f;">{{notaryEmail}} &nbsp;&bull;&nbsp; {{notaryPhone}}</p>
</td></tr></table>
<a href="{{nextStepUrl}}" style="display:block;padding:14px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0 24px;">Open your request &rarr;</a>
<p style="margin:0;color:#7f7f7f;font-size:12px;">-- Your DARCi Team</p>$$,
  'html',
  '{"required":["firstName","illuminotaryName","documentName","notaryName","notaryEmail","notaryPhone","notaryPhoneHref","nextStepUrl"],"optional":["approvalSummary","continueUrl","dashboardUrl"],"scope":[11]}'::jsonb,
  true,
  'runtime:notary_approval_received_email',
  '{"seed_source":"20260605_contact_exchange_refresh"}'::jsonb
),
(
  'notary_member_contact_received_email',
  '2026.06.05.v1',
  'en-US',
  'email',
  'status_update',
  'notary',
  'notary.request_approved',
  null,
  'Member contact details - {{documentName}}',
  $$<p>Hi {{firstName}},</p>
<p>You approved <strong>{{documentName}}</strong>.<br/>The member's contact details are ready so you can coordinate the signing meeting.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border:1px solid #e0e0e0;margin:24px 0;"><tr><td style="padding:20px 24px;">
<p style="margin:0 0 2px;font-size:11px;color:#7f7f7f;text-transform:uppercase;letter-spacing:0.5px;">Member</p>
<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#191919;">{{memberName}}</p>
<table cellpadding="0" cellspacing="0" style="width:100%;"><tr>
<td style="padding:0 8px 0 0;width:50%;"><a href="mailto:{{memberEmail}}" style="display:block;padding:10px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:13px;font-weight:600;">Email</a></td>
<td style="width:50%;"><a href="{{memberPhoneHref}}" style="display:block;padding:10px 0;background:#191919;color:#ffffff;text-align:center;text-decoration:none;font-size:13px;font-weight:600;">Call</a></td>
</tr></table>
<p style="margin:14px 0 0;font-size:12px;color:#7f7f7f;">{{memberEmail}} &nbsp;&bull;&nbsp; {{memberPhone}}</p>
</td></tr></table>
<a href="{{nextStepUrl}}" style="display:block;padding:14px 0;background:#0aff4a;color:#191919;text-align:center;text-decoration:none;font-size:14px;font-weight:600;margin:8px 0 24px;">Open the request &rarr;</a>
<p style="margin:0;color:#7f7f7f;font-size:12px;">-- Your DARCi Team</p>$$,
  'html',
  '{"required":["firstName","documentName","memberName","memberEmail","memberPhone","memberPhoneHref","nextStepUrl"],"optional":["approvalSummary","continueUrl","dashboardUrl","illuminotaryName"],"scope":[11]}'::jsonb,
  true,
  'runtime:notary_member_contact_received_email',
  '{"seed_source":"20260605_contact_exchange_refresh"}'::jsonb
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