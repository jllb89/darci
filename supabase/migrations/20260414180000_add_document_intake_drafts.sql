alter table public.documents
  add column if not exists intake_status text not null default 'not_started',
  add column if not exists intake_schema_version text,
  add column if not exists intake_last_saved_at timestamptz,
  add column if not exists intake_submitted_at timestamptz;

alter table public.documents
  drop constraint if exists documents_intake_status_check;

alter table public.documents
  add constraint documents_intake_status_check
  check (intake_status in ('not_started', 'draft', 'submitted', 'locked'));

create table if not exists public.document_intake_drafts (
  document_id uuid primary key references public.documents(id) on delete cascade,
  owner_id uuid not null references public.users(id),
  product_flow_mode text not null,
  jurisdiction text not null,
  current_step text,
  rules_snapshot_version text not null,
  answers_json jsonb not null default '{}'::jsonb,
  canonical_answers_json jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_intake_drafts_revision_check
    check (revision >= 1),

  constraint document_intake_drafts_rules_snapshot_version_check
    check (btrim(rules_snapshot_version) <> '')
);

create index if not exists idx_document_intake_drafts_owner
  on public.document_intake_drafts(owner_id);

create index if not exists idx_document_intake_drafts_mode_jurisdiction
  on public.document_intake_drafts(product_flow_mode, jurisdiction);

create table if not exists public.document_intake_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  revision integer not null,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  validation_result jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),

  constraint document_intake_revisions_document_revision_unique
    unique (document_id, revision),

  constraint document_intake_revisions_revision_check
    check (revision >= 1),

  constraint document_intake_revisions_event_type_check
    check (event_type in ('autosave', 'submit', 'system_migration'))
);

create index if not exists idx_document_intake_revisions_document_created_at
  on public.document_intake_revisions(document_id, created_at desc);

alter table public.document_intake_drafts enable row level security;
alter table public.document_intake_revisions enable row level security;

drop policy if exists "document_intake_drafts_owner_access" on public.document_intake_drafts;
create policy "document_intake_drafts_owner_access" on public.document_intake_drafts
  for all using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      where u.id = owner_id
    )
  )
  with check (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      where u.id = owner_id
    )
  );

drop policy if exists "document_intake_revisions_owner_access" on public.document_intake_revisions;
create policy "document_intake_revisions_owner_access" on public.document_intake_revisions
  for all using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
  )
  with check (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
  );

grant select on table public.document_intake_drafts to authenticated;
grant select on table public.document_intake_revisions to authenticated;

comment on table public.document_intake_drafts is
'Current persisted intake draft snapshot per document.';

comment on table public.document_intake_revisions is
'Append-only intake revision log for autosave and submit events.';

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute $fn$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$;
    $fn$;
  end if;
end;
$$;

drop trigger if exists trg_document_intake_drafts_set_updated_at
  on public.document_intake_drafts;

create trigger trg_document_intake_drafts_set_updated_at
before update on public.document_intake_drafts
for each row
execute function public.set_updated_at();
