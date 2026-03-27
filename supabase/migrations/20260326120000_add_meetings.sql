-- Add meetings and meeting metadata for notarization requests

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.notarization_requests(id),
  scheduled_at timestamptz,
  timezone text,
  location text,
  status text default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meetings
  add constraint meetings_status_check
  check (status in (
    'scheduled',
    'rescheduled',
    'cancelled',
    'in_progress',
    'completed',
    'no_show'
  ));

alter table public.notarization_requests
  add column if not exists meeting_id uuid references public.meetings(id),
  add column if not exists meeting_status text,
  add column if not exists meeting_scheduled_at timestamptz,
  add column if not exists meeting_timezone text,
  add column if not exists meeting_location text;

alter table public.notarization_requests
  add constraint notarization_requests_meeting_status_check
  check (meeting_status is null or meeting_status in (
    'scheduled',
    'rescheduled',
    'cancelled',
    'in_progress',
    'completed',
    'no_show'
  ));

create index if not exists idx_notarization_requests_meeting on public.notarization_requests(meeting_id);
create index if not exists idx_meetings_request on public.meetings(request_id);

alter table public.meetings enable row level security;

create policy "meetings_owner_or_notary" on public.meetings
  for all using (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      join public.notarization_requests on public.notarization_requests.document_id = public.documents.id
      where public.notarization_requests.id = request_id)
    or auth.uid() = (select supabase_user_id from public.users
      join public.notarization_requests on public.notarization_requests.assigned_notary_id = public.users.id
      where public.notarization_requests.id = request_id)
  )
  with check (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      join public.notarization_requests on public.notarization_requests.document_id = public.documents.id
      where public.notarization_requests.id = request_id)
    or auth.role() = 'service_role'
  );
