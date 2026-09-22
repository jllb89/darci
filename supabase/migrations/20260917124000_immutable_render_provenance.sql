create table private.document_render_provenance (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null references public.document_generation_runs(id) on delete restrict,
  document_version_id uuid not null unique references public.document_versions(id) on delete restrict,
  template_artifact_id uuid not null references public.template_artifacts(id) on delete restrict,
  template_source text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  rule_snapshot jsonb not null,
  renderer_revision text not null,
  created_at timestamptz not null default now(),
  check (source_sha256=encode(sha256(convert_to(template_source,'UTF8')),'hex'))
);
alter table private.document_render_provenance enable row level security;
revoke all on private.document_render_provenance from public,anon,authenticated,service_role;
create or replace function public.record_document_render_provenance(
  p_run_id uuid,p_version_id uuid,p_artifact_id uuid,p_source text,p_source_hash text,
  p_rule_snapshot jsonb,p_renderer_revision text
) returns void language plpgsql security definer set search_path='' as $$
declare v_run public.document_generation_runs%rowtype;
begin
  select * into v_run from public.document_generation_runs where id=p_run_id for update;
  if not found or v_run.template_artifact_id is distinct from p_artifact_id
    or not exists(select 1 from public.document_versions where id=p_version_id and document_id=v_run.document_id and generation_run_id=p_run_id) then
    raise exception 'RENDER_PROVENANCE_RELATIONSHIP_INVALID';
  end if;
  insert into private.document_render_provenance(generation_run_id,document_version_id,template_artifact_id,
    template_source,source_sha256,rule_snapshot,renderer_revision)
    values(p_run_id,p_version_id,p_artifact_id,p_source,p_source_hash,p_rule_snapshot,p_renderer_revision);
  update public.document_generation_runs set template_hash='sha256:'||p_source_hash,
    render_context_json=render_context_json||jsonb_build_object('sourceSha256',p_source_hash,'rendererRevision',p_renderer_revision)
    where id=p_run_id;
  insert into public.audit_events(entity_type,entity_id,action,metadata)
    values('document_generation_run',p_run_id,'template.provenance_recorded',
      jsonb_build_object('document_id',v_run.document_id,'version_id',p_version_id,'source_sha256',p_source_hash,'renderer_revision',p_renderer_revision));
end;
$$;
revoke all on function public.record_document_render_provenance(uuid,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.record_document_render_provenance(uuid,uuid,uuid,text,text,jsonb,text) to service_role;
create or replace function private.reject_immutable_evidence_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_EVIDENCE_CANNOT_BE_OVERWRITTEN'; end;
$$;
create trigger immutable_render_provenance before update or delete on private.document_render_provenance
  for each row execute function private.reject_immutable_evidence_mutation();
create trigger immutable_completed_hash before update or delete on public.document_hash_records
  for each row when (old.status='completed') execute function private.reject_immutable_evidence_mutation();
