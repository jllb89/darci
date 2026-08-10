create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  installation_id uuid not null,
  platform text not null default 'ios',
  provider text not null default 'apns',
  environment text not null,
  app_bundle_id text not null,
  device_token text,
  permission_status text not null default 'unknown',
  app_version text,
  build_number text,
  device_model text,
  os_version text,
  is_active boolean not null default true,
  last_registered_at timestamptz,
  last_seen_at timestamptz,
  invalidated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_push_tokens_platform_check
    check (platform in ('ios')),
  constraint device_push_tokens_provider_check
    check (provider in ('apns')),
  constraint device_push_tokens_environment_check
    check (environment in ('sandbox', 'production')),
  constraint device_push_tokens_bundle_check
    check (btrim(app_bundle_id) <> ''),
  constraint device_push_tokens_token_check
    check (device_token is null or device_token ~ '^[0-9a-fA-F]{64,}$'),
  constraint device_push_tokens_permission_status_check
    check (permission_status in ('authorized', 'provisional', 'denied', 'unknown')),
  constraint device_push_tokens_app_version_check
    check (app_version is null or btrim(app_version) <> ''),
  constraint device_push_tokens_build_number_check
    check (build_number is null or btrim(build_number) <> '')
);

create unique index if not exists ux_device_push_tokens_provider_environment_bundle_token
  on public.device_push_tokens(provider, environment, app_bundle_id, device_token)
  where device_token is not null;

create unique index if not exists ux_device_push_tokens_user_installation_environment
  on public.device_push_tokens(user_id, installation_id, environment);

create index if not exists idx_device_push_tokens_active_user_environment
  on public.device_push_tokens(user_id, environment, provider, app_bundle_id)
  where is_active = true and device_token is not null;

create index if not exists idx_device_push_tokens_last_seen
  on public.device_push_tokens(last_seen_at desc)
  where is_active = true;

alter table public.notification_templates
  drop constraint if exists notification_templates_channel_check;

alter table public.notification_templates
  add constraint notification_templates_channel_check
  check (channel in ('email', 'sms', 'in_app', 'push'));

alter table public.notification_templates
  drop constraint if exists notification_templates_subject_required_for_email_check;

alter table public.notification_templates
  add constraint notification_templates_subject_required_for_email_check
  check (
    (channel not in ('email', 'push'))
    or (subject_template is not null and btrim(subject_template) <> '')
  );

alter table public.notification_jobs
  drop constraint if exists notification_jobs_channel_check;

alter table public.notification_jobs
  add constraint notification_jobs_channel_check
  check (channel in ('email', 'sms', 'in_app', 'push'));

alter table public.notification_preferences
  drop constraint if exists notification_preferences_channel_check;

alter table public.notification_preferences
  add constraint notification_preferences_channel_check
  check (channel in ('email', 'sms', 'in_app', 'push'));

alter table public.notification_deliveries
  add column if not exists device_push_token_id uuid references public.device_push_tokens(id) on delete set null;

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_channel_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_channel_check
  check (channel in ('email', 'sms', 'in_app', 'push'));

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_recipient_address_required_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_recipient_address_required_check
  check (
    (channel = 'in_app' and recipient_address is null and device_push_token_id is null)
    or (channel in ('email', 'sms') and recipient_address is not null and btrim(recipient_address) <> '' and device_push_token_id is null)
    or (channel = 'push' and recipient_address is null and device_push_token_id is not null)
  );

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_provider_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_provider_check
  check (provider in ('internal', 'resend', 'sendgrid', 'ses', 'sns', 'twilio', 'webhook', 'apns'));

alter table public.outbound_message_events
  drop constraint if exists outbound_message_events_provider_check;

alter table public.outbound_message_events
  add constraint outbound_message_events_provider_check
  check (provider in ('internal', 'resend', 'sendgrid', 'ses', 'sns', 'twilio', 'webhook', 'apns'));

create index if not exists idx_notification_deliveries_token_status
  on public.notification_deliveries(device_push_token_id, status, created_at desc)
  where device_push_token_id is not null;

create index if not exists idx_notification_deliveries_push_status
  on public.notification_deliveries(status, created_at desc)
  where channel = 'push';

alter table public.device_push_tokens enable row level security;

drop policy if exists "device_push_tokens_owner_access" on public.device_push_tokens;
create policy "device_push_tokens_owner_access" on public.device_push_tokens
  for all using (public.auth_user_matches(user_id))
  with check (public.auth_user_matches(user_id));

drop policy if exists "device_push_tokens_service_role_access" on public.device_push_tokens;
create policy "device_push_tokens_service_role_access" on public.device_push_tokens
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

comment on table public.device_push_tokens is
  'Registered iOS APNs device tokens by user installation. Tokens are sensitive operational identifiers and must not be exposed in notification recipient_address values.';

comment on column public.notification_deliveries.device_push_token_id is
  'Push delivery target token reference. Push deliveries use this foreign key instead of recipient_address to avoid exposing raw device tokens.';