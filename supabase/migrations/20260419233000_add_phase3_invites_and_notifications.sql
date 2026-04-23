-- Phase 3: invitations, external signer onboarding, and notification outbox foundation.

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  template_version text not null default '2026.04.19.v1',
  locale text not null default 'en-US',
  channel text not null default 'email',
  template_kind text not null default 'transactional',
  audience_scope text not null,
  trigger_event text,
  invite_kind text,
  subject_template text,
  body_template text not null,
  body_format text not null default 'markdown',
  variables_schema jsonb not null default '{"required": [], "optional": []}'::jsonb,
  is_active boolean not null default true,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_templates_key_version_locale_channel_unique
    unique (template_key, template_version, locale, channel),
  constraint notification_templates_template_key_check
    check (template_key ~ '^[a-z0-9_]+$'),
  constraint notification_templates_channel_check
    check (channel in ('email', 'sms', 'in_app')),
  constraint notification_templates_template_kind_check
    check (template_kind in ('transactional', 'invite', 'reminder', 'status_update', 'billing', 'system')),
  constraint notification_templates_audience_scope_check
    check (audience_scope in ('registrant', 'trusted_person', 'agent', 'signer', 'notary', 'client', 'shared')),
  constraint notification_templates_invite_kind_check
    check (
      invite_kind is null
      or invite_kind in ('document_signing', 'trusted_person', 'client_payment', 'general_access')
    ),
  constraint notification_templates_body_format_check
    check (body_format in ('text', 'markdown', 'html')),
  constraint notification_templates_subject_required_for_email_check
    check (
      (channel <> 'email')
      or (subject_template is not null and btrim(subject_template) <> '')
    )
);

create table if not exists public.document_access_invites (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  document_output_signer_id uuid references public.document_output_signers(id) on delete set null,
  document_party_id uuid references public.document_parties(id) on delete set null,
  parent_invite_id uuid references public.document_access_invites(id) on delete set null,
  created_by_user_id uuid references public.users(id) on delete set null,
  claimed_user_id uuid references public.users(id) on delete set null,
  template_id uuid references public.notification_templates(id) on delete set null,
  invite_kind text not null,
  access_scope text not null default 'view',
  claim_mode text not null default 'required_signup',
  status text not null default 'draft',
  invite_label text,
  recipient_name_snapshot text,
  party_role_snapshot text,
  obligation_type_snapshot text,
  output_key_snapshot text,
  document_key_snapshot text,
  idempotency_key text,
  requires_acceptance boolean not null default true,
  expires_at timestamptz,
  sent_at timestamptz,
  first_opened_at timestamptz,
  first_clicked_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  completed_at timestamptz,
  delivery_count integer not null default 0,
  resend_count integer not null default 0,
  context_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_access_invites_invite_kind_check
    check (invite_kind in ('document_signing', 'trusted_person', 'client_payment', 'general_access')),
  constraint document_access_invites_access_scope_check
    check (access_scope in ('view', 'sign', 'confirm_role', 'pay')),
  constraint document_access_invites_claim_mode_check
    check (claim_mode in ('none', 'optional_signup', 'required_signup', 'existing_account_only')),
  constraint document_access_invites_status_check
    check (
      status in (
        'draft',
        'queued',
        'sent',
        'opened',
        'claimed',
        'accepted',
        'declined',
        'revoked',
        'expired',
        'completed',
        'failed'
      )
    ),
  constraint document_access_invites_invite_label_check
    check (invite_label is null or btrim(invite_label) <> ''),
  constraint document_access_invites_recipient_name_snapshot_check
    check (recipient_name_snapshot is null or btrim(recipient_name_snapshot) <> ''),
  constraint document_access_invites_party_role_snapshot_check
    check (party_role_snapshot is null or btrim(party_role_snapshot) <> ''),
  constraint document_access_invites_obligation_type_snapshot_check
    check (
      obligation_type_snapshot is null
      or obligation_type_snapshot in ('signer', 'acknowledger', 'witness', 'notary')
    ),
  constraint document_access_invites_output_key_snapshot_check
    check (output_key_snapshot is null or output_key_snapshot ~ '^[a-z0-9_]+$'),
  constraint document_access_invites_document_key_snapshot_check
    check (document_key_snapshot is null or document_key_snapshot ~ '^[a-z0-9_]+$'),
  constraint document_access_invites_delivery_count_check
    check (delivery_count >= 0),
  constraint document_access_invites_resend_count_check
    check (resend_count >= 0)
);

create table if not exists public.invite_recipients (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.document_access_invites(id) on delete cascade,
  document_party_id uuid references public.document_parties(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  recipient_kind text not null default 'to',
  channel text not null default 'email',
  delivery_address text,
  display_name text,
  status text not null default 'pending',
  is_primary boolean not null default true,
  last_notified_at timestamptz,
  last_event_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invite_recipients_recipient_kind_check
    check (recipient_kind in ('to', 'cc', 'bcc')),
  constraint invite_recipients_channel_check
    check (channel in ('email', 'sms', 'in_app')),
  constraint invite_recipients_delivery_address_required_check
    check (
      (channel = 'in_app' and delivery_address is null)
      or (channel in ('email', 'sms') and delivery_address is not null and btrim(delivery_address) <> '')
    ),
  constraint invite_recipients_display_name_check
    check (display_name is null or btrim(display_name) <> ''),
  constraint invite_recipients_status_check
    check (
      status in (
        'pending',
        'queued',
        'sent',
        'delivered',
        'failed',
        'bounced',
        'opened',
        'clicked',
        'claimed',
        'suppressed',
        'unsubscribed'
      )
    )
);

create table if not exists public.invite_tokens (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.document_access_invites(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text,
  purpose text not null default 'invite_access',
  status text not null default 'active',
  max_uses integer not null default 1,
  use_count integer not null default 0,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  consumed_at timestamptz,
  consumed_by_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invite_tokens_token_prefix_check
    check (token_prefix is null or btrim(token_prefix) <> ''),
  constraint invite_tokens_purpose_check
    check (purpose in ('invite_access', 'signup_claim', 'review_confirm', 'payment_request')),
  constraint invite_tokens_status_check
    check (status in ('active', 'consumed', 'expired', 'revoked')),
  constraint invite_tokens_max_uses_check
    check (max_uses > 0),
  constraint invite_tokens_use_count_check
    check (use_count >= 0)
);

create table if not exists public.invite_claims (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.document_access_invites(id) on delete cascade,
  invite_token_id uuid references public.invite_tokens(id) on delete set null,
  claimed_user_id uuid references public.users(id) on delete set null,
  created_user_id uuid references public.users(id) on delete set null,
  claim_status text not null default 'claimed',
  claim_method text not null default 'signup',
  claim_channel text not null default 'email',
  claim_address text,
  claimed_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invite_claims_claim_status_check
    check (claim_status in ('claimed', 'accepted', 'declined', 'canceled', 'failed')),
  constraint invite_claims_claim_method_check
    check (claim_method in ('signup', 'login_link', 'existing_session', 'admin_attach', 'manual')),
  constraint invite_claims_claim_channel_check
    check (claim_channel in ('email', 'sms', 'in_app', 'unknown')),
  constraint invite_claims_claim_address_check
    check (claim_address is null or btrim(claim_address) <> '')
);

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.notification_templates(id) on delete set null,
  invite_id uuid references public.document_access_invites(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  billing_payment_request_id uuid references public.billing_payment_requests(id) on delete set null,
  notarization_request_id uuid references public.notarization_requests(id) on delete set null,
  requested_by_user_id uuid references public.users(id) on delete set null,
  job_kind text not null default 'transactional',
  channel text not null default 'email',
  status text not null default 'queued',
  priority text not null default 'normal',
  dedupe_key text,
  scheduled_for timestamptz not null default now(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz,
  last_attempt_at timestamptz,
  attempt_count integer not null default 0,
  payload_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_jobs_job_kind_check
    check (
      job_kind in (
        'invite',
        'invite_reminder',
        'status_update',
        'payment_request',
        'notary_code',
        'completion',
        'transactional',
        'custom'
      )
    ),
  constraint notification_jobs_channel_check
    check (channel in ('email', 'sms', 'in_app')),
  constraint notification_jobs_status_check
    check (
      status in (
        'queued',
        'scheduled',
        'processing',
        'sent',
        'partially_sent',
        'completed',
        'failed',
        'canceled',
        'suppressed'
      )
    ),
  constraint notification_jobs_priority_check
    check (priority in ('low', 'normal', 'high')),
  constraint notification_jobs_dedupe_key_check
    check (dedupe_key is null or btrim(dedupe_key) <> ''),
  constraint notification_jobs_attempt_count_check
    check (attempt_count >= 0)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_job_id uuid not null references public.notification_jobs(id) on delete cascade,
  invite_recipient_id uuid references public.invite_recipients(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  channel text not null default 'email',
  recipient_address text,
  recipient_display_name text,
  provider text not null default 'internal',
  provider_message_id text,
  status text not null default 'pending',
  attempt_number integer not null default 1,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  bounced_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  accepted_at timestamptz,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_channel_check
    check (channel in ('email', 'sms', 'in_app')),
  constraint notification_deliveries_recipient_address_required_check
    check (
      (channel = 'in_app' and recipient_address is null)
      or (channel in ('email', 'sms') and recipient_address is not null and btrim(recipient_address) <> '')
    ),
  constraint notification_deliveries_recipient_display_name_check
    check (recipient_display_name is null or btrim(recipient_display_name) <> ''),
  constraint notification_deliveries_provider_check
    check (provider in ('internal', 'resend', 'sendgrid', 'ses', 'twilio', 'webhook')),
  constraint notification_deliveries_status_check
    check (
      status in (
        'pending',
        'queued',
        'sent',
        'delivered',
        'failed',
        'bounced',
        'complained',
        'opened',
        'clicked',
        'accepted',
        'suppressed'
      )
    ),
  constraint notification_deliveries_attempt_number_check
    check (attempt_number > 0)
);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel text not null default 'email',
  preference_scope text not null default 'transactional',
  is_enabled boolean not null default true,
  source text not null default 'system_default',
  snoozed_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_user_channel_scope_unique
    unique (user_id, channel, preference_scope),
  constraint notification_preferences_channel_check
    check (channel in ('email', 'sms', 'in_app')),
  constraint notification_preferences_scope_check
    check (
      preference_scope in (
        'transactional',
        'invite',
        'signing',
        'trusted_person',
        'agent',
        'registration',
        'notary',
        'billing',
        'marketing'
      )
    ),
  constraint notification_preferences_source_check
    check (source in ('system_default', 'user_settings', 'admin_override'))
);

create table if not exists public.outbound_message_events (
  id uuid primary key default gen_random_uuid(),
  notification_delivery_id uuid not null references public.notification_deliveries(id) on delete cascade,
  event_type text not null,
  provider text not null default 'internal',
  provider_event_id text,
  event_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint outbound_message_events_event_type_check
    check (
      event_type in (
        'queued',
        'sent',
        'delivered',
        'deferred',
        'failed',
        'bounced',
        'complained',
        'opened',
        'clicked',
        'accepted',
        'rejected',
        'unsubscribed',
        'rendered'
      )
    ),
  constraint outbound_message_events_provider_check
    check (provider in ('internal', 'resend', 'sendgrid', 'ses', 'twilio', 'webhook')),
  constraint outbound_message_events_provider_event_id_check
    check (provider_event_id is null or btrim(provider_event_id) <> '')
);

create unique index if not exists ux_notification_templates_active_key_locale_channel
  on public.notification_templates(template_key, locale, channel)
  where is_active = true;

create unique index if not exists ux_document_access_invites_idempotency_key
  on public.document_access_invites(idempotency_key)
  where idempotency_key is not null;

create unique index if not exists ux_invite_recipients_delivery_address
  on public.invite_recipients(invite_id, channel, lower(delivery_address))
  where delivery_address is not null;

create unique index if not exists ux_invite_recipients_target_user
  on public.invite_recipients(invite_id, channel, target_user_id)
  where target_user_id is not null;

create unique index if not exists ux_notification_jobs_dedupe_key
  on public.notification_jobs(dedupe_key)
  where dedupe_key is not null;

create unique index if not exists ux_notification_deliveries_provider_message
  on public.notification_deliveries(provider, provider_message_id)
  where provider_message_id is not null;

create unique index if not exists ux_outbound_message_events_provider_event
  on public.outbound_message_events(provider, provider_event_id)
  where provider_event_id is not null;

create index if not exists idx_document_access_invites_document_status
  on public.document_access_invites(document_id, status, created_at desc);

create index if not exists idx_document_access_invites_signer_status
  on public.document_access_invites(document_output_signer_id, status, created_at desc);

create index if not exists idx_document_access_invites_party_status
  on public.document_access_invites(document_party_id, status, created_at desc);

create index if not exists idx_document_access_invites_claimed_user
  on public.document_access_invites(claimed_user_id, status, created_at desc);

create index if not exists idx_document_access_invites_parent
  on public.document_access_invites(parent_invite_id, created_at desc);

create index if not exists idx_invite_recipients_invite_status
  on public.invite_recipients(invite_id, status, created_at);

create index if not exists idx_invite_recipients_target_user
  on public.invite_recipients(target_user_id, status, created_at desc);

create index if not exists idx_invite_tokens_invite_status
  on public.invite_tokens(invite_id, status, expires_at);

create index if not exists idx_invite_tokens_expires_at
  on public.invite_tokens(expires_at, status);

create index if not exists idx_invite_claims_invite_status
  on public.invite_claims(invite_id, claim_status, claimed_at desc);

create index if not exists idx_invite_claims_claimed_user
  on public.invite_claims(claimed_user_id, claim_status, claimed_at desc);

create index if not exists idx_notification_templates_trigger_event
  on public.notification_templates(trigger_event, channel, is_active);

create index if not exists idx_notification_jobs_status_schedule
  on public.notification_jobs(status, scheduled_for, created_at);

create index if not exists idx_notification_jobs_invite
  on public.notification_jobs(invite_id, status, created_at desc);

create index if not exists idx_notification_jobs_document
  on public.notification_jobs(document_id, status, created_at desc);

create index if not exists idx_notification_jobs_billing_request
  on public.notification_jobs(billing_payment_request_id, status, created_at desc);

create index if not exists idx_notification_jobs_notarization_request
  on public.notification_jobs(notarization_request_id, status, created_at desc);

create index if not exists idx_notification_deliveries_job_status
  on public.notification_deliveries(notification_job_id, status, created_at);

create index if not exists idx_notification_deliveries_target_user
  on public.notification_deliveries(target_user_id, status, created_at desc);

create index if not exists idx_notification_deliveries_address_status
  on public.notification_deliveries(channel, recipient_address, status);

create index if not exists idx_notification_preferences_user
  on public.notification_preferences(user_id, channel, preference_scope);

create index if not exists idx_outbound_message_events_delivery_event
  on public.outbound_message_events(notification_delivery_id, event_type, event_at desc);

comment on table public.document_access_invites is
'Access and action invites linked to document signer or party snapshots so unregistered participants can be onboarded without relying on free-floating email strings.';

comment on table public.invite_tokens is
'Hashed invite tokens used for access links, signup claims, and delegated action flows.';

comment on table public.notification_templates is
'Versioned notification template catalog seeded from client-provided MVP email copy and future runtime template variants.';

comment on table public.notification_jobs is
'Notification outbox queue storing deduplicated, schedulable jobs before delivery fan-out.';

comment on table public.notification_deliveries is
'Per-recipient delivery ledger with provider references and delivery state transitions.';

comment on table public.notification_preferences is
'User-scoped notification settings by channel and preference scope.';

comment on table public.outbound_message_events is
'Provider and system event stream for delivery lifecycle states such as sent, bounced, opened, clicked, and accepted.';

create or replace function public.document_owned_by_auth(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.documents
    join public.users on public.users.id = public.documents.owner_id
    where public.documents.id = target_document_id
      and public.users.supabase_user_id = auth.uid()
  );
$$;

create or replace function public.document_party_linked_to_auth(target_document_party_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_parties
    join public.users on lower(public.users.email) = lower(public.document_parties.email)
    where public.document_parties.id = target_document_party_id
      and public.document_parties.email is not null
      and public.users.supabase_user_id = auth.uid()
  );
$$;

create or replace function public.document_access_invite_core_visible_to_auth(target_invite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.document_access_invites
    where public.document_access_invites.id = target_invite_id
      and (
        public.document_owned_by_auth(public.document_access_invites.document_id)
        or public.auth_user_matches(public.document_access_invites.created_by_user_id)
        or public.auth_user_matches(public.document_access_invites.claimed_user_id)
        or public.document_party_linked_to_auth(public.document_access_invites.document_party_id)
      )
  );
$$;

create or replace function public.notification_delivery_visible_to_auth(target_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.notification_deliveries
    join public.notification_jobs on public.notification_jobs.id = public.notification_deliveries.notification_job_id
    where public.notification_deliveries.id = target_delivery_id
      and (
        public.auth_user_matches(public.notification_deliveries.target_user_id)
        or public.document_owned_by_auth(public.notification_jobs.document_id)
        or public.auth_user_matches(public.notification_jobs.requested_by_user_id)
        or public.document_access_invite_core_visible_to_auth(public.notification_jobs.invite_id)
      )
  );
$$;

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
    'registration_started_welcome_email',
    '2026.04.19.v1',
    'en-US',
    'email',
    'transactional',
    'registrant',
    'system.registration_started',
    null,
    'Welcome To The DARCi Registry',
    $$Hi {{firstName}},

Thanks for getting started with DARCi. You've just taken a smart step, you're in the right place and we're here to make it easy.

We'll walk you through the registration steps and once everything is signed and confirmed, your {{registrationLabel}} will be registered: safe, secure, and ready when needed.

Pick up right where you left off here:
{{resumeRegistrationUrl}}

If you have questions, we're always happy to help.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'registrationLabel', 'resumeRegistrationUrl'),
      'optional', jsonb_build_array()
    ),
    true,
    'docs/MVP email_notification templates.md',
    jsonb_build_object('seed_source', 'client_mvp_copy', 'original_title', 'Thank You For Signing Up'),
    now(),
    now()
  ),
  (
    'registration_incomplete_reminder_email',
    '2026.04.19.v1',
    'en-US',
    'email',
    'reminder',
    'registrant',
    'system.registration_incomplete_reminder',
    null,
    'Quick Reminder! Your {{registrationLabel}} Registration Is Still In Progress',
    $$Hi {{firstName}},

Just a nudge, {{registrationInProgressText}} but haven't finished yet.

Most people complete it within 15-30 minutes. Once done, your {{registrationLabel}} will be fully registered, with everything and everyone you need in place.

Pick up right where you left off here:
{{resumeRegistrationUrl}}

If you have questions, we're always happy to help.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'registrationLabel', 'registrationInProgressText', 'resumeRegistrationUrl'),
      'optional', jsonb_build_array()
    ),
    true,
    'docs/MVP email_notification templates.md',
    jsonb_build_object('seed_source', 'client_mvp_copy', 'original_title', 'Your Registration Is Not Yet Complete'),
    now(),
    now()
  ),
  (
    'trusted_person_invitation_email',
    '2026.04.19.v1',
    'en-US',
    'email',
    'invite',
    'trusted_person',
    'invite.trusted_person_created',
    'trusted_person',
    '{{registrantName}} Has Invited You To Join Their Network',
    $$Hi {{firstName}},

{{registrantName}} has taken an important step in protecting their legacy. They are inviting you to act as their Trusted Person. It's a role of trust and it takes just a few minutes to confirm.

Please review and respond when you can:
{{reviewAndConfirmUrl}}

Questions about what this means or what's expected? We're happy to help.

Interested in registering your own document? Learn more here:
{{learnMoreUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'registrantName', 'reviewAndConfirmUrl'),
      'optional', jsonb_build_array('learnMoreUrl')
    ),
    true,
    'docs/MVP email_notification templates.md',
    jsonb_build_object('seed_source', 'client_mvp_copy', 'original_title', 'Trusted Person(s) Invitation'),
    now(),
    now()
  ),
  (
    'poa_agent_selected_notice_email',
    '2026.04.19.v1',
    'en-US',
    'email',
    'status_update',
    'agent',
    'system.agent_selected',
    null,
    '{{principalName}} Has Chosen You as Their POA Agent',
    $$Hi {{agentFirstName}},

{{principalName}} has named you as their agent under a Power of Attorney. That means they trust you to step in and act on their behalf if they ever need help managing certain matters like banking or other decisions outlined in their POA.

Thank you for being someone {{principalName}} can count on.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('agentFirstName', 'principalName'),
      'optional', jsonb_build_array()
    ),
    true,
    'docs/MVP email_notification templates.md',
    jsonb_build_object('seed_source', 'client_mvp_copy', 'original_title', 'You Have Been Chosen As Agent - POA'),
    now(),
    now()
  ),
  (
    'registration_document_change_email',
    '2026.04.19.v1',
    'en-US',
    'email',
    'status_update',
    'shared',
    'system.registration_document_changed',
    null,
    'Change To {{registrantName}}''s DARCi Registration',
    $$Hi {{firstName}},

A new document has been uploaded to the registration associated with {{registrantName}}.

Here are the details:

- Uploaded by: {{uploaderName}}
- Document Type: {{documentType}}
- Date Uploaded: {{uploadedAt}}
- Where: {{registrationRecordUrl}}

If this upload seems unexpected or incorrect, please contact our support team so we can review it together:
{{supportUrl}}

Thank you for helping keep your DARCi records organized, current, and secure.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'registrantName', 'uploaderName', 'documentType', 'uploadedAt', 'registrationRecordUrl', 'supportUrl'),
      'optional', jsonb_build_array()
    ),
    true,
    'docs/MVP email_notification templates.md',
    jsonb_build_object('seed_source', 'client_mvp_copy', 'original_title', 'Change to Registration'),
    now(),
    now()
  ),
  (
    'notary_next_step_email',
    '2026.04.19.v1',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.code_delivered',
    null,
    'Action Needed: Schedule Your illuminotary Appointment',
    $$Hi {{firstName}},

Great job! You've completed the first steps for your {{registrationLabel}} registration. Now it's time for the final piece: meeting with an illuminotary.

An illuminotary is a commissioned notary public who has been trained and approved by illuminote. They'll verify your identity and make your {{registrationLabel}} officially registered.

Here's what to do next:

Your illuminotary Code: {{illuminotaryCode}}
(valid for 7 days)

1. Schedule an appointment with an illuminotary near you: {{findIlluminotaryUrl}}
2. Provide them with the code above.
3. Bring a valid government-issued photo ID.
4. The illuminotary will complete your notarization electronically in person.
5. Once that's done, we'll notify you right away that your registration is complete.

A few important notes:

- Your registration progress is saved.
- Your illuminotary code expires after 7 days, so be sure to schedule soon.
- You can check your registration status anytime from your dashboard: {{dashboardUrl}}
- You'll also get an email as soon as your registration is officially complete.

Schedule your illuminotary appointment here:
{{scheduleAppointmentUrl}}

Thanks for moving your registration forward. You're almost there!

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'registrationLabel', 'illuminotaryCode', 'findIlluminotaryUrl', 'dashboardUrl', 'scheduleAppointmentUrl'),
      'optional', jsonb_build_array('trustName')
    ),
    true,
    'docs/MVP email_notification templates.md',
    jsonb_build_object('seed_source', 'client_mvp_copy', 'original_title', 'Next Step: illuminotarization'),
    now(),
    now()
  ),
  (
    'registration_completed_email',
    '2026.04.19.v1',
    'en-US',
    'email',
    'status_update',
    'registrant',
    'system.registration_completed',
    null,
    'Your {{registrationLabel}} Has Been Registered!',
    $$Hi {{firstName}},

That's it! Your {{registrationLabel}} is now registered and ready when you need it.

You can view, share, or manage it anytime right here:
{{dashboardUrl}}

Need to update it later? You can do that, too. This registration stays dynamic and flexible as your life changes.

Thanks for putting your trust in us.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'registrationLabel', 'dashboardUrl'),
      'optional', jsonb_build_array('trustName')
    ),
    true,
    'docs/MVP email_notification templates.md',
    jsonb_build_object('seed_source', 'client_mvp_copy', 'original_title', 'Thank You For Registering'),
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

alter table public.notification_templates enable row level security;
alter table public.document_access_invites enable row level security;
alter table public.invite_recipients enable row level security;
alter table public.invite_tokens enable row level security;
alter table public.invite_claims enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.outbound_message_events enable row level security;

drop policy if exists "notification_templates_service_role_access" on public.notification_templates;
create policy "notification_templates_service_role_access" on public.notification_templates
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "document_access_invites_select_visible" on public.document_access_invites;
create policy "document_access_invites_select_visible" on public.document_access_invites
  for select using (public.document_access_invite_core_visible_to_auth(id));

drop policy if exists "document_access_invites_service_role_access" on public.document_access_invites;
create policy "document_access_invites_service_role_access" on public.document_access_invites
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "invite_recipients_select_visible" on public.invite_recipients;
create policy "invite_recipients_select_visible" on public.invite_recipients
  for select using (
    public.auth_user_matches(target_user_id)
    or public.document_party_linked_to_auth(document_party_id)
    or public.document_access_invite_core_visible_to_auth(invite_id)
  );

drop policy if exists "invite_recipients_service_role_access" on public.invite_recipients;
create policy "invite_recipients_service_role_access" on public.invite_recipients
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "invite_tokens_service_role_access" on public.invite_tokens;
create policy "invite_tokens_service_role_access" on public.invite_tokens
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "invite_claims_select_visible" on public.invite_claims;
create policy "invite_claims_select_visible" on public.invite_claims
  for select using (
    public.auth_user_matches(claimed_user_id)
    or public.auth_user_matches(created_user_id)
    or public.document_access_invite_core_visible_to_auth(invite_id)
  );

drop policy if exists "invite_claims_service_role_access" on public.invite_claims;
create policy "invite_claims_service_role_access" on public.invite_claims
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "notification_jobs_select_visible" on public.notification_jobs;
create policy "notification_jobs_select_visible" on public.notification_jobs
  for select using (
    public.document_owned_by_auth(document_id)
    or public.auth_user_matches(requested_by_user_id)
    or public.document_access_invite_core_visible_to_auth(invite_id)
  );

drop policy if exists "notification_jobs_service_role_access" on public.notification_jobs;
create policy "notification_jobs_service_role_access" on public.notification_jobs
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "notification_deliveries_select_visible" on public.notification_deliveries;
create policy "notification_deliveries_select_visible" on public.notification_deliveries
  for select using (
    public.auth_user_matches(target_user_id)
    or exists (
      select 1
      from public.notification_jobs
      where public.notification_jobs.id = notification_job_id
        and (
          public.document_owned_by_auth(public.notification_jobs.document_id)
          or public.auth_user_matches(public.notification_jobs.requested_by_user_id)
          or public.document_access_invite_core_visible_to_auth(public.notification_jobs.invite_id)
        )
    )
  );

drop policy if exists "notification_deliveries_service_role_access" on public.notification_deliveries;
create policy "notification_deliveries_service_role_access" on public.notification_deliveries
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "notification_preferences_owner_access" on public.notification_preferences;
create policy "notification_preferences_owner_access" on public.notification_preferences
  for all using (public.auth_user_matches(user_id))
  with check (public.auth_user_matches(user_id));

drop policy if exists "notification_preferences_service_role_access" on public.notification_preferences;
create policy "notification_preferences_service_role_access" on public.notification_preferences
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "outbound_message_events_select_visible" on public.outbound_message_events;
create policy "outbound_message_events_select_visible" on public.outbound_message_events
  for select using (public.notification_delivery_visible_to_auth(notification_delivery_id));

drop policy if exists "outbound_message_events_service_role_access" on public.outbound_message_events;
create policy "outbound_message_events_service_role_access" on public.outbound_message_events
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.document_access_invites to authenticated;
grant select on table public.invite_recipients to authenticated;
grant select on table public.invite_claims to authenticated;
grant select on table public.notification_jobs to authenticated;
grant select on table public.notification_deliveries to authenticated;
grant select on table public.outbound_message_events to authenticated;
grant select, insert, update, delete on table public.notification_preferences to authenticated;

drop trigger if exists trg_notification_templates_touch_updated_at on public.notification_templates;
create trigger trg_notification_templates_touch_updated_at
before update on public.notification_templates
for each row execute function public.touch_updated_at();

drop trigger if exists trg_document_access_invites_touch_updated_at on public.document_access_invites;
create trigger trg_document_access_invites_touch_updated_at
before update on public.document_access_invites
for each row execute function public.touch_updated_at();

drop trigger if exists trg_invite_recipients_touch_updated_at on public.invite_recipients;
create trigger trg_invite_recipients_touch_updated_at
before update on public.invite_recipients
for each row execute function public.touch_updated_at();

drop trigger if exists trg_invite_tokens_touch_updated_at on public.invite_tokens;
create trigger trg_invite_tokens_touch_updated_at
before update on public.invite_tokens
for each row execute function public.touch_updated_at();

drop trigger if exists trg_invite_claims_touch_updated_at on public.invite_claims;
create trigger trg_invite_claims_touch_updated_at
before update on public.invite_claims
for each row execute function public.touch_updated_at();

drop trigger if exists trg_notification_jobs_touch_updated_at on public.notification_jobs;
create trigger trg_notification_jobs_touch_updated_at
before update on public.notification_jobs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_notification_deliveries_touch_updated_at on public.notification_deliveries;
create trigger trg_notification_deliveries_touch_updated_at
before update on public.notification_deliveries
for each row execute function public.touch_updated_at();

drop trigger if exists trg_notification_preferences_touch_updated_at on public.notification_preferences;
create trigger trg_notification_preferences_touch_updated_at
before update on public.notification_preferences
for each row execute function public.touch_updated_at();