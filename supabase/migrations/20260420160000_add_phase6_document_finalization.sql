create table if not exists public.document_execution_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  source_document_version_id uuid not null references public.document_versions(id) on delete restrict,
  output_document_version_id uuid references public.document_versions(id) on delete set null,
  execution_kind text not null,
  status text not null default 'pending',
  template_id text,
  template_version text,
  watermark_text text,
  initiated_by_user_id uuid references public.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_execution_runs_kind_check
    check (execution_kind in ('acknowledgment_append', 'watermark')),

  constraint document_execution_runs_status_check
    check (status in ('pending', 'completed', 'failed'))
);

create table if not exists public.document_hash_records (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  execution_run_id uuid references public.document_execution_runs(id) on delete set null,
  algorithm text not null default 'sha256',
  hash text not null,
  status text not null default 'pending',
  attempt_number integer not null default 1,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_hash_records_status_check
    check (status in ('pending', 'completed', 'failed')),

  constraint document_hash_records_attempt_number_check
    check (attempt_number >= 1),

  constraint document_hash_records_algorithm_check
    check (algorithm ~ '^[a-z0-9_\-]+$')
);

create table if not exists public.ledger_anchor_attempts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  document_hash_record_id uuid not null references public.document_hash_records(id) on delete cascade,
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  status text not null default 'pending',
  attempt_number integer not null default 1,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  response_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ledger_anchor_attempts_status_check
    check (status in ('pending', 'anchored', 'failed')),

  constraint ledger_anchor_attempts_attempt_number_check
    check (attempt_number >= 1)
);

create table if not exists public.public_verification_checks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete set null,
  document_hash_record_id uuid references public.document_hash_records(id) on delete set null,
  ledger_entry_id uuid references public.ledger_entries(id) on delete set null,
  idn text not null,
  result_status text not null,
  request_ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint public_verification_checks_result_status_check
    check (result_status in ('verified', 'unverified', 'not_found'))
);

create table if not exists public.finalization_status_history (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  execution_run_id uuid references public.document_execution_runs(id) on delete set null,
  document_hash_record_id uuid references public.document_hash_records(id) on delete set null,
  ledger_anchor_attempt_id uuid references public.ledger_anchor_attempts(id) on delete set null,
  changed_by_user_id uuid references public.users(id) on delete set null,
  status text not null,
  change_source text not null,
  change_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint finalization_status_history_status_check
    check (status in (
      'acknowledgment_appended',
      'watermark_applied',
      'hash_recorded',
      'ledger_anchored',
      'verification_checked',
      'failed'
    ))
);

create index if not exists idx_document_execution_runs_document_kind
  on public.document_execution_runs(document_id, execution_kind, created_at desc);

create index if not exists idx_document_hash_records_document
  on public.document_hash_records(document_id, created_at desc);

create index if not exists idx_document_hash_records_version
  on public.document_hash_records(document_version_id, created_at desc);

create index if not exists idx_ledger_anchor_attempts_hash
  on public.ledger_anchor_attempts(document_hash_record_id, created_at desc);

create index if not exists idx_public_verification_checks_idn
  on public.public_verification_checks(idn, created_at desc);

create index if not exists idx_finalization_status_history_document
  on public.finalization_status_history(document_id, created_at desc);

alter table public.document_execution_runs enable row level security;
alter table public.document_hash_records enable row level security;
alter table public.ledger_anchor_attempts enable row level security;
alter table public.public_verification_checks enable row level security;
alter table public.finalization_status_history enable row level security;

drop policy if exists "document_execution_runs_owner_or_notary_access" on public.document_execution_runs;
drop policy if exists "document_execution_runs_service_write" on public.document_execution_runs;

create policy "document_execution_runs_owner_or_notary_access" on public.document_execution_runs
  for select using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.notarization_requests nr on nr.assigned_notary_id = u.id
      where nr.document_id = document_id
    )
  );

create policy "document_execution_runs_service_write" on public.document_execution_runs
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "document_hash_records_owner_or_notary_access" on public.document_hash_records;
drop policy if exists "document_hash_records_service_write" on public.document_hash_records;

create policy "document_hash_records_owner_or_notary_access" on public.document_hash_records
  for select using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.notarization_requests nr on nr.assigned_notary_id = u.id
      where nr.document_id = document_id
    )
  );

create policy "document_hash_records_service_write" on public.document_hash_records
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "ledger_anchor_attempts_owner_or_notary_access" on public.ledger_anchor_attempts;
drop policy if exists "ledger_anchor_attempts_service_write" on public.ledger_anchor_attempts;

create policy "ledger_anchor_attempts_owner_or_notary_access" on public.ledger_anchor_attempts
  for select using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.notarization_requests nr on nr.assigned_notary_id = u.id
      where nr.document_id = document_id
    )
  );

create policy "ledger_anchor_attempts_service_write" on public.ledger_anchor_attempts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "public_verification_checks_service_access" on public.public_verification_checks;

create policy "public_verification_checks_service_access" on public.public_verification_checks
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "finalization_status_history_owner_or_notary_access" on public.finalization_status_history;
drop policy if exists "finalization_status_history_service_write" on public.finalization_status_history;

create policy "finalization_status_history_owner_or_notary_access" on public.finalization_status_history
  for select using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.notarization_requests nr on nr.assigned_notary_id = u.id
      where nr.document_id = document_id
    )
  );

create policy "finalization_status_history_service_write" on public.finalization_status_history
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.document_execution_runs to authenticated;
grant select on table public.document_hash_records to authenticated;
grant select on table public.ledger_anchor_attempts to authenticated;
grant select on table public.finalization_status_history to authenticated;

drop trigger if exists trg_document_execution_runs_touch_updated_at on public.document_execution_runs;
create trigger trg_document_execution_runs_touch_updated_at
before update on public.document_execution_runs
for each row execute function public.touch_updated_at();

drop trigger if exists trg_document_hash_records_touch_updated_at on public.document_hash_records;
create trigger trg_document_hash_records_touch_updated_at
before update on public.document_hash_records
for each row execute function public.touch_updated_at();

drop trigger if exists trg_ledger_anchor_attempts_touch_updated_at on public.ledger_anchor_attempts;
create trigger trg_ledger_anchor_attempts_touch_updated_at
before update on public.ledger_anchor_attempts
for each row execute function public.touch_updated_at();

comment on table public.document_execution_runs is
'Phase 6 finalization execution chain rows for acknowledgment append and watermark steps.';

comment on table public.document_hash_records is
'Persisted hash results for final document versions so the public verification endpoint has a stable source of truth.';

comment on table public.ledger_anchor_attempts is
'Ledger anchoring attempts and proof payloads for finalized document hashes.';

comment on table public.public_verification_checks is
'Public verification endpoint access log rows keyed by IDN and resolved closeout result.';

comment on table public.finalization_status_history is
'Immutable closeout status timeline entries linking finalization, hashing, anchoring, and verification actions.';