-- Phase 5: in-person meeting evidence, geolocation, identity verification, and
-- illuminotary execution asset foundation.

alter table public.meetings
  add column if not exists workflow_id uuid references public.illuminotarization_workflows(id) on delete set null,
  add column if not exists same_place_required boolean not null default true,
  add column if not exists same_place_status text,
  add column if not exists evidence_retention_until timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.meetings
  drop constraint if exists meetings_same_place_status_check;

alter table public.meetings
  add constraint meetings_same_place_status_check
  check (
    same_place_status is null
    or same_place_status in ('not_started', 'pending', 'passed', 'failed', 'manual_override')
  );

create table if not exists public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  document_party_id uuid references public.document_parties(id) on delete set null,
  participant_role text not null,
  status text not null default 'expected',
  presence_required boolean not null default true,
  participant_label text,
  arrived_at timestamptz,
  departed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_participants_participant_role_check
    check (
      participant_role in ('member', 'notary', 'signer', 'trusted_person', 'witness', 'observer')
    ),
  constraint meeting_participants_status_check
    check (
      status in ('expected', 'invited', 'confirmed', 'checked_in', 'completed', 'no_show', 'canceled')
    ),
  constraint meeting_participants_participant_label_check
    check (participant_label is null or btrim(participant_label) <> ''),
  constraint meeting_participants_identity_anchor_check
    check (user_id is not null or document_party_id is not null)
);

create table if not exists public.meeting_checkins (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  meeting_participant_id uuid not null references public.meeting_participants(id) on delete cascade,
  recorded_by_user_id uuid references public.users(id) on delete set null,
  checkin_kind text not null,
  status text not null default 'recorded',
  recorded_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_checkins_checkin_kind_check
    check (checkin_kind in ('arrival', 'proximity', 'identity', 'meeting_start', 'meeting_end', 'manual')),
  constraint meeting_checkins_status_check
    check (status in ('recorded', 'verified', 'superseded', 'void')),
  constraint meeting_checkins_notes_check
    check (notes is null or btrim(notes) <> '')
);

create table if not exists public.geolocation_samples (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  meeting_participant_id uuid references public.meeting_participants(id) on delete set null,
  meeting_checkin_id uuid references public.meeting_checkins(id) on delete set null,
  captured_by_user_id uuid references public.users(id) on delete set null,
  sample_kind text not null default 'device_gps',
  capture_stage text not null default 'checkin',
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  accuracy_meters numeric(8, 2),
  altitude_meters numeric(8, 2),
  captured_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint geolocation_samples_sample_kind_check
    check (sample_kind in ('device_gps', 'network', 'manual_pin', 'derived')),
  constraint geolocation_samples_capture_stage_check
    check (
      capture_stage in (
        'checkin',
        'checkin_confirmation',
        'proximity_validation',
        'meeting_start',
        'meeting_end'
      )
    ),
  constraint geolocation_samples_latitude_check
    check (latitude between -90 and 90),
  constraint geolocation_samples_longitude_check
    check (longitude between -180 and 180),
  constraint geolocation_samples_accuracy_check
    check (accuracy_meters is null or accuracy_meters >= 0)
);

create table if not exists public.proximity_evaluations (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  evaluated_by_user_id uuid references public.users(id) on delete set null,
  member_sample_id uuid references public.geolocation_samples(id) on delete set null,
  notary_sample_id uuid references public.geolocation_samples(id) on delete set null,
  evaluation_kind text not null default 'same_place',
  status text not null default 'pending',
  threshold_meters numeric(8, 2) not null default 100,
  observed_distance_meters numeric(8, 2),
  evaluated_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proximity_evaluations_evaluation_kind_check
    check (evaluation_kind in ('same_place', 'arrival_window', 'meeting_start', 'meeting_end')),
  constraint proximity_evaluations_status_check
    check (status in ('pending', 'passed', 'failed', 'manual_override')),
  constraint proximity_evaluations_threshold_check
    check (threshold_meters > 0),
  constraint proximity_evaluations_observed_distance_check
    check (observed_distance_meters is null or observed_distance_meters >= 0),
  constraint proximity_evaluations_notes_check
    check (notes is null or btrim(notes) <> '')
);

create table if not exists public.identity_verification_events (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  meeting_participant_id uuid not null references public.meeting_participants(id) on delete cascade,
  verified_by_user_id uuid references public.users(id) on delete set null,
  verification_method text not null default 'in_person_document',
  status text not null default 'pending',
  subject_name_snapshot text,
  document_type text,
  document_last4 text,
  issuing_jurisdiction text,
  verified_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint identity_verification_events_method_check
    check (
      verification_method in (
        'in_person_document',
        'credential_scan',
        'manual_attestation',
        'knowledge_based',
        'biometric',
        'other'
      )
    ),
  constraint identity_verification_events_status_check
    check (status in ('pending', 'verified', 'failed', 'manual_review')),
  constraint identity_verification_events_subject_name_check
    check (subject_name_snapshot is null or btrim(subject_name_snapshot) <> ''),
  constraint identity_verification_events_document_last4_check
    check (document_last4 is null or btrim(document_last4) <> '')
);

create table if not exists public.illuminotary_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  asset_kind text not null,
  status text not null default 'draft',
  jurisdiction text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  asset_label text,
  file_hash text,
  valid_from timestamptz,
  valid_until timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint illuminotary_assets_asset_kind_check
    check (asset_kind in ('seal', 'signature', 'initials', 'certificate', 'other')),
  constraint illuminotary_assets_status_check
    check (status in ('draft', 'active', 'inactive', 'revoked', 'expired')),
  constraint illuminotary_assets_storage_path_check
    check (storage_path is null or btrim(storage_path) <> ''),
  constraint illuminotary_assets_asset_label_check
    check (asset_label is null or btrim(asset_label) <> '')
);

create table if not exists public.meeting_artifacts (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  meeting_participant_id uuid references public.meeting_participants(id) on delete set null,
  meeting_checkin_id uuid references public.meeting_checkins(id) on delete set null,
  identity_verification_event_id uuid references public.identity_verification_events(id) on delete set null,
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  artifact_kind text not null,
  status text not null default 'active',
  storage_bucket text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  captured_at timestamptz,
  retention_until timestamptz,
  redacted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_artifacts_artifact_kind_check
    check (
      artifact_kind in (
        'identity_document',
        'identity_selfie',
        'consent_capture',
        'location_photo',
        'verification_summary',
        'seal_preview',
        'meeting_note',
        'other'
      )
    ),
  constraint meeting_artifacts_status_check
    check (status in ('active', 'redacted', 'expired', 'deleted')),
  constraint meeting_artifacts_storage_path_check
    check (storage_path is null or btrim(storage_path) <> ''),
  constraint meeting_artifacts_size_bytes_check
    check (size_bytes is null or size_bytes >= 0)
);

create index if not exists idx_meetings_workflow on public.meetings(workflow_id, scheduled_at desc);
create index if not exists idx_meetings_same_place_status on public.meetings(same_place_status, scheduled_at desc);
create unique index if not exists ux_meeting_participants_user_role
  on public.meeting_participants(meeting_id, user_id, participant_role)
  where user_id is not null;
create index if not exists idx_meeting_participants_meeting_status
  on public.meeting_participants(meeting_id, status, created_at desc);
create index if not exists idx_meeting_checkins_meeting_recorded
  on public.meeting_checkins(meeting_id, recorded_at desc);
create index if not exists idx_meeting_checkins_participant_recorded
  on public.meeting_checkins(meeting_participant_id, recorded_at desc);
create index if not exists idx_geolocation_samples_meeting_captured
  on public.geolocation_samples(meeting_id, captured_at desc);
create index if not exists idx_geolocation_samples_participant_captured
  on public.geolocation_samples(meeting_participant_id, captured_at desc);
create index if not exists idx_proximity_evaluations_meeting_evaluated
  on public.proximity_evaluations(meeting_id, evaluated_at desc);
create index if not exists idx_identity_verification_events_meeting_verified
  on public.identity_verification_events(meeting_id, verified_at desc nulls last, created_at desc);
create index if not exists idx_illuminotary_assets_user_status
  on public.illuminotary_assets(user_id, status, created_at desc);
create index if not exists idx_meeting_artifacts_meeting_created
  on public.meeting_artifacts(meeting_id, created_at desc);
create index if not exists idx_meeting_artifacts_identity_event
  on public.meeting_artifacts(identity_verification_event_id, created_at desc)
  where identity_verification_event_id is not null;

comment on table public.meeting_participants is
'Explicit participant roster for an in-person illuminotarization meeting, including the member, illuminotary, and any future supporting attendees.';

comment on table public.meeting_checkins is
'Append-only participant check-ins and operational checkpoints used to anchor arrival, identity, and meeting-start evidence.';

comment on table public.geolocation_samples is
'Captured geolocation samples tied to meetings and optional check-ins so same-place evaluation can be audited with timestamped coordinates and accuracy.';

comment on table public.proximity_evaluations is
'Computed same-place evaluations for a meeting, including threshold, observed distance, and manual override outcomes.';

comment on table public.identity_verification_events is
'Identity verification outcomes captured during the in-person meeting before seal and signature execution.';

comment on table public.illuminotary_assets is
'Illuminotary-owned execution assets such as seals and signature images that will be linked into later meeting and finalization execution steps.';

comment on table public.meeting_artifacts is
'Meeting-scoped evidence artifacts, including identity documents, location evidence, consent captures, and execution summaries.';

update public.meetings meetings
set workflow_id = requests.workflow_id
from public.notarization_requests requests
where requests.id = meetings.request_id
  and meetings.workflow_id is null
  and requests.workflow_id is not null;

create or replace function public.meeting_visible_to_auth(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meetings meetings
    left join public.notarization_requests requests on requests.id = meetings.request_id
    where meetings.id = target_meeting_id
      and (
        (meetings.workflow_id is not null and public.illuminotarization_workflow_visible_to_auth(meetings.workflow_id))
        or public.document_owned_by_auth(requests.document_id)
        or public.auth_user_matches(requests.assigned_notary_id)
      )
  );
$$;

alter table public.meetings enable row level security;
alter table public.meeting_participants enable row level security;
alter table public.meeting_checkins enable row level security;
alter table public.geolocation_samples enable row level security;
alter table public.proximity_evaluations enable row level security;
alter table public.identity_verification_events enable row level security;
alter table public.illuminotary_assets enable row level security;
alter table public.meeting_artifacts enable row level security;

drop policy if exists "meetings_owner_or_notary" on public.meetings;
drop policy if exists "meetings_select_visible" on public.meetings;
create policy "meetings_select_visible" on public.meetings
  for select using (public.meeting_visible_to_auth(id));

drop policy if exists "meetings_service_role_access" on public.meetings;
create policy "meetings_service_role_access" on public.meetings
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "meeting_participants_select_visible" on public.meeting_participants;
create policy "meeting_participants_select_visible" on public.meeting_participants
  for select using (
    public.auth_user_matches(user_id)
    or public.meeting_visible_to_auth(meeting_id)
  );

drop policy if exists "meeting_participants_service_role_access" on public.meeting_participants;
create policy "meeting_participants_service_role_access" on public.meeting_participants
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "meeting_checkins_select_visible" on public.meeting_checkins;
create policy "meeting_checkins_select_visible" on public.meeting_checkins
  for select using (
    public.auth_user_matches(recorded_by_user_id)
    or public.meeting_visible_to_auth(meeting_id)
  );

drop policy if exists "meeting_checkins_service_role_access" on public.meeting_checkins;
create policy "meeting_checkins_service_role_access" on public.meeting_checkins
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "geolocation_samples_select_visible" on public.geolocation_samples;
create policy "geolocation_samples_select_visible" on public.geolocation_samples
  for select using (
    public.auth_user_matches(captured_by_user_id)
    or public.meeting_visible_to_auth(meeting_id)
  );

drop policy if exists "geolocation_samples_service_role_access" on public.geolocation_samples;
create policy "geolocation_samples_service_role_access" on public.geolocation_samples
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "proximity_evaluations_select_visible" on public.proximity_evaluations;
create policy "proximity_evaluations_select_visible" on public.proximity_evaluations
  for select using (
    public.auth_user_matches(evaluated_by_user_id)
    or public.meeting_visible_to_auth(meeting_id)
  );

drop policy if exists "proximity_evaluations_service_role_access" on public.proximity_evaluations;
create policy "proximity_evaluations_service_role_access" on public.proximity_evaluations
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "identity_verification_events_select_visible" on public.identity_verification_events;
create policy "identity_verification_events_select_visible" on public.identity_verification_events
  for select using (
    public.auth_user_matches(verified_by_user_id)
    or public.meeting_visible_to_auth(meeting_id)
  );

drop policy if exists "identity_verification_events_service_role_access" on public.identity_verification_events;
create policy "identity_verification_events_service_role_access" on public.identity_verification_events
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "illuminotary_assets_select_visible" on public.illuminotary_assets;
create policy "illuminotary_assets_select_visible" on public.illuminotary_assets
  for select using (public.auth_user_matches(user_id));

drop policy if exists "illuminotary_assets_service_role_access" on public.illuminotary_assets;
create policy "illuminotary_assets_service_role_access" on public.illuminotary_assets
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "meeting_artifacts_select_visible" on public.meeting_artifacts;
create policy "meeting_artifacts_select_visible" on public.meeting_artifacts
  for select using (
    public.auth_user_matches(uploaded_by_user_id)
    or public.meeting_visible_to_auth(meeting_id)
  );

drop policy if exists "meeting_artifacts_service_role_access" on public.meeting_artifacts;
create policy "meeting_artifacts_service_role_access" on public.meeting_artifacts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.meetings to authenticated;
grant select on table public.meeting_participants to authenticated;
grant select on table public.meeting_checkins to authenticated;
grant select on table public.geolocation_samples to authenticated;
grant select on table public.proximity_evaluations to authenticated;
grant select on table public.identity_verification_events to authenticated;
grant select on table public.illuminotary_assets to authenticated;
grant select on table public.meeting_artifacts to authenticated;

drop trigger if exists trg_meetings_touch_updated_at on public.meetings;
create trigger trg_meetings_touch_updated_at
before update on public.meetings
for each row execute function public.touch_updated_at();

drop trigger if exists trg_meeting_participants_touch_updated_at on public.meeting_participants;
create trigger trg_meeting_participants_touch_updated_at
before update on public.meeting_participants
for each row execute function public.touch_updated_at();

drop trigger if exists trg_meeting_checkins_touch_updated_at on public.meeting_checkins;
create trigger trg_meeting_checkins_touch_updated_at
before update on public.meeting_checkins
for each row execute function public.touch_updated_at();

drop trigger if exists trg_proximity_evaluations_touch_updated_at on public.proximity_evaluations;
create trigger trg_proximity_evaluations_touch_updated_at
before update on public.proximity_evaluations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_identity_verification_events_touch_updated_at on public.identity_verification_events;
create trigger trg_identity_verification_events_touch_updated_at
before update on public.identity_verification_events
for each row execute function public.touch_updated_at();

drop trigger if exists trg_illuminotary_assets_touch_updated_at on public.illuminotary_assets;
create trigger trg_illuminotary_assets_touch_updated_at
before update on public.illuminotary_assets
for each row execute function public.touch_updated_at();

drop trigger if exists trg_meeting_artifacts_touch_updated_at on public.meeting_artifacts;
create trigger trg_meeting_artifacts_touch_updated_at
before update on public.meeting_artifacts
for each row execute function public.touch_updated_at();