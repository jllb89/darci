create table if not exists public.template_artifacts (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  template_version text not null,
  template_hash text not null,
  artifact_storage_path text not null,
  artifact_mime_type text not null,
  render_engine text not null,
  artifact_metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint template_artifacts_unique
    unique (template_key, template_version, template_hash),

  constraint template_artifacts_template_key_check
    check (btrim(template_key) <> ''),

  constraint template_artifacts_template_version_check
    check (btrim(template_version) <> ''),

  constraint template_artifacts_template_hash_check
    check (btrim(template_hash) <> ''),

  constraint template_artifacts_storage_path_check
    check (btrim(artifact_storage_path) <> ''),

  constraint template_artifacts_mime_type_check
    check (btrim(artifact_mime_type) <> ''),

  constraint template_artifacts_render_engine_check
    check (render_engine in ('pdf_form', 'docx_template', 'html_pdf', 'other'))
);

create index if not exists idx_template_artifacts_lookup
  on public.template_artifacts(template_key, template_version, template_hash, is_active);

alter table public.document_generation_runs
  add column if not exists template_artifact_id uuid,
  add column if not exists render_context_json jsonb not null default '{}'::jsonb,
  add column if not exists blocking_requirements_json jsonb not null default '[]'::jsonb,
  add column if not exists resolved_sources_json jsonb not null default '{}'::jsonb,
  add column if not exists renderer_job_id text,
  add column if not exists document_version_id uuid,
  add column if not exists blocked_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists rendered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists failure_details_json jsonb not null default '{}'::jsonb,
  add column if not exists cancellation_reason text;

alter table public.document_generation_runs
  drop constraint if exists document_generation_runs_status_check;

alter table public.document_generation_runs
  add constraint document_generation_runs_status_check
    check (status in ('queued', 'blocked', 'rendering', 'rendered', 'failed', 'canceled'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_generation_runs_template_artifact_id_fkey'
  ) then
    alter table public.document_generation_runs
      add constraint document_generation_runs_template_artifact_id_fkey
      foreign key (template_artifact_id)
      references public.template_artifacts(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_generation_runs_document_version_id_fkey'
  ) then
    alter table public.document_generation_runs
      add constraint document_generation_runs_document_version_id_fkey
      foreign key (document_version_id)
      references public.document_versions(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_document_generation_runs_status_created
  on public.document_generation_runs(status, created_at);

create index if not exists idx_document_generation_runs_document_version
  on public.document_generation_runs(document_version_id)
  where document_version_id is not null;

comment on table public.template_artifacts is
'Concrete renderable artifacts keyed by template identity; used by generation workers to resolve the actual source file and renderer.';

comment on column public.document_generation_runs.render_context_json is
'Resolved render context snapshot consumed by the renderer, distinct from canonical intake answers.';

comment on column public.document_generation_runs.blocking_requirements_json is
'Structured list of render blockers that prevent a generation run from advancing beyond blocked state.';

comment on column public.document_generation_runs.resolved_sources_json is
'Summary of which sources supplied render values for the generation run.';

comment on column public.document_generation_runs.renderer_job_id is
'Opaque worker or renderer job identifier for runs currently being processed.';