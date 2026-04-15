create table if not exists public.template_registry (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  output_key text not null,
  document_key text not null,
  template_key text not null,
  template_version text not null,
  template_hash text not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint template_registry_unique
    unique (jurisdiction, output_key, template_version),

  constraint template_registry_output_key_check
    check (output_key ~ '^[a-z0-9_]+$'),

  constraint template_registry_document_key_check
    check (document_key ~ '^[a-z0-9_]+$'),

  constraint template_registry_template_key_check
    check (btrim(template_key) <> ''),

  constraint template_registry_template_version_check
    check (btrim(template_version) <> ''),

  constraint template_registry_template_hash_check
    check (btrim(template_hash) <> ''),

  constraint template_registry_effective_window_check
    check (effective_to is null or effective_to > effective_from)
);

create index if not exists idx_template_registry_lookup
  on public.template_registry(jurisdiction, output_key, is_active, effective_from desc);

create table if not exists public.document_generation_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  intake_revision integer not null,
  output_key text not null,
  document_key text not null,
  template_key text not null,
  template_version text not null,
  template_hash text not null,
  payload_json jsonb not null default '{}'::jsonb,
  coverage_json jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  error_message text,
  created_at timestamptz not null default now(),

  constraint document_generation_runs_intake_revision_check
    check (intake_revision >= 1),

  constraint document_generation_runs_status_check
    check (status in ('queued', 'rendered', 'failed')),

  constraint document_generation_runs_output_key_check
    check (output_key ~ '^[a-z0-9_]+$'),

  constraint document_generation_runs_document_key_check
    check (document_key ~ '^[a-z0-9_]+$'),

  constraint document_generation_runs_template_key_check
    check (btrim(template_key) <> ''),

  constraint document_generation_runs_template_version_check
    check (btrim(template_version) <> ''),

  constraint document_generation_runs_template_hash_check
    check (btrim(template_hash) <> '')
);

create index if not exists idx_document_generation_runs_document_created
  on public.document_generation_runs(document_id, created_at desc);

alter table public.document_versions
  add column if not exists generation_run_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_versions_generation_run_id_fkey'
  ) then
    alter table public.document_versions
      add constraint document_versions_generation_run_id_fkey
      foreign key (generation_run_id)
      references public.document_generation_runs(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_document_versions_generation_run
  on public.document_versions(generation_run_id)
  where generation_run_id is not null;

alter table public.template_registry enable row level security;
alter table public.document_generation_runs enable row level security;

drop policy if exists "template_registry_read" on public.template_registry;
create policy "template_registry_read" on public.template_registry
  for select using (true);

drop policy if exists "template_registry_write" on public.template_registry;
create policy "template_registry_write" on public.template_registry
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "document_generation_runs_owner_access" on public.document_generation_runs;
create policy "document_generation_runs_owner_access" on public.document_generation_runs
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

grant select on table public.template_registry to authenticated;
grant select on table public.document_generation_runs to authenticated;

comment on table public.template_registry is
'Template registry keyed by jurisdiction/output with pinned template version and hash windows.';

comment on table public.document_generation_runs is
'Generation run snapshot per output, including payload and coverage used for rendering.';

insert into public.template_registry (
  jurisdiction,
  output_key,
  document_key,
  template_key,
  template_version,
  template_hash,
  effective_from,
  is_active
)
values
  ('US-CA', 'poa_document', 'poa_general', 'ca_poa_general', '2026.04.14.v1', 'sha256:ca-poadoc-v1', now(), true),
  ('US-CA', 'trust_rrr', 'trust_rrr', 'ca_trust_rrr', '2026.04.14.v1', 'sha256:ca-trustrrr-v1', now(), true),
  ('US-CA', 'trust_certificate', 'trust_certificate', 'ca_trust_certificate', '2026.04.14.v1', 'sha256:ca-trustcert-v1', now(), true),
  ('US-CA', 'uploaded_document_with_seal', 'uploaded_document_with_seal', 'ca_uploaded_document_with_seal', '2026.04.14.v1', 'sha256:ca-uploadseal-v1', now(), true),
  ('US-OH', 'poa_document', 'poa_general', 'oh_poa_general', '2026.04.14.v1', 'sha256:oh-poadoc-v1', now(), true),
  ('US-OH', 'trust_rrr', 'trust_rrr', 'oh_trust_rrr', '2026.04.14.v1', 'sha256:oh-trustrrr-v1', now(), true),
  ('US-OH', 'trust_certificate', 'trust_certificate', 'oh_trust_certificate', '2026.04.14.v1', 'sha256:oh-trustcert-v1', now(), true),
  ('US-OH', 'uploaded_document_with_seal', 'uploaded_document_with_seal', 'oh_uploaded_document_with_seal', '2026.04.14.v1', 'sha256:oh-uploadseal-v1', now(), true)
on conflict (jurisdiction, output_key, template_version)
do update set
  document_key = excluded.document_key,
  template_key = excluded.template_key,
  template_hash = excluded.template_hash,
  effective_from = excluded.effective_from,
  effective_to = null,
  is_active = excluded.is_active;