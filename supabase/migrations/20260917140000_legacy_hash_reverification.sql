-- Additive operator-only attestation. Never rewrite a PDF or historical receipt.
-- Deliberately independent of the other Phase 1 migrations for a staged rollout.
create table public.document_hash_reverifications (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete restrict,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  document_hash_record_id uuid not null unique references public.document_hash_records(id) on delete restrict,
  observed_sha256 text not null check (observed_sha256 ~ '^[a-f0-9]{64}$'),
  storage_object_id uuid not null,
  storage_object_version text not null,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  rendered_page_count integer not null check (rendered_page_count between 1 and 200),
  verifier_revision text not null check (verifier_revision='legacy-hash-recheck-v1'),
  operator_reference text not null check (length(operator_reference) between 1 and 200),
  correction_reason text not null check (correction_reason='approved_beta_hash_only_correction'),
  verified_at timestamptz not null default clock_timestamp()
);
alter table public.document_hash_reverifications enable row level security;
revoke all on public.document_hash_reverifications from public,anon,authenticated,service_role;
grant select on public.document_hash_reverifications to service_role;

create function public.reject_hash_reverification_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'HASH_REVERIFICATION_IMMUTABLE'; end;
$$;
revoke all on function public.reject_hash_reverification_mutation() from public,anon,authenticated,service_role;
create trigger immutable_hash_reverification before update or delete on public.document_hash_reverifications
  for each row execute function public.reject_hash_reverification_mutation();

-- Only the database operator may call this. The API service role can read
-- evidence but cannot manufacture an attestation through PostgREST.
create function public.record_legacy_hash_reverification(
  p_hash_record_id uuid,p_observed_sha256 text,p_object_id uuid,p_object_version text,
  p_size_bytes bigint,p_rendered_page_count integer,p_operator_reference text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  h public.document_hash_records%rowtype;
  v public.document_versions%rowtype;
  d public.documents%rowtype;
  o storage.objects%rowtype;
  existing public.document_hash_reverifications%rowtype;
  attestation_id uuid;
begin
  select * into h from public.document_hash_records where id=p_hash_record_id for share;
  if not found or h.status is distinct from 'completed' or h.algorithm is distinct from 'sha256'
    or h.hash is distinct from p_observed_sha256 then raise exception 'REVERIFICATION_HASH_MISMATCH'; end if;
  select * into d from public.documents where id=h.document_id for update;
  select * into v from public.document_versions where id=h.document_version_id for share;
  if d.status is distinct from 'completed' or v.is_final is distinct from true or v.document_id is distinct from d.id
    or not exists(select 1 from public.document_execution_runs e where e.id=h.execution_run_id
      and e.document_id=d.id and e.output_document_version_id=v.id and e.execution_kind='watermark' and e.status='completed')
    or not exists(select 1 from public.ledger_anchor_attempts a join public.ledger_entries l on l.id=a.ledger_entry_id
      where a.document_hash_record_id=h.id and a.document_id=d.id and a.status='anchored'
        and l.document_id=d.id and l.hash=h.hash)
  then raise exception 'REVERIFICATION_FINAL_EVIDENCE_INVALID'; end if;
  select * into o from storage.objects where id=p_object_id for share;
  if not found or o.bucket_id is distinct from 'documents' or o.name is distinct from v.storage_path
    or o.version is distinct from p_object_version or p_object_version is null
    or (o.metadata->>'size')::bigint is distinct from p_size_bytes
    or v.size_bytes is distinct from p_size_bytes then raise exception 'REVERIFICATION_OBJECT_CHANGED'; end if;
  select * into existing from public.document_hash_reverifications where document_hash_record_id=h.id;
  if found then
    if existing.observed_sha256 is distinct from p_observed_sha256 or existing.storage_object_id is distinct from o.id
      or existing.storage_object_version is distinct from o.version or existing.size_bytes is distinct from p_size_bytes
      or existing.rendered_page_count is distinct from p_rendered_page_count then
      raise exception 'REVERIFICATION_EXISTING_EVIDENCE_CONFLICT';
    end if;
    return existing.id;
  end if;
  insert into public.document_hash_reverifications(document_id,document_version_id,document_hash_record_id,
    observed_sha256,storage_object_id,storage_object_version,size_bytes,rendered_page_count,
    verifier_revision,operator_reference,correction_reason)
    values(d.id,v.id,h.id,p_observed_sha256,o.id,o.version,p_size_bytes,p_rendered_page_count,
      'legacy-hash-recheck-v1',p_operator_reference,'approved_beta_hash_only_correction') returning id into attestation_id;
  insert into public.audit_events(entity_type,entity_id,action,metadata)
    values('document',d.id,'verification.legacy_hash_rechecked',jsonb_build_object(
      'attestation_id',attestation_id,'document_version_id',v.id,'document_hash_record_id',h.id,
      'sha256',p_observed_sha256,'rendered_page_count',p_rendered_page_count,
      'operator_reference',p_operator_reference,'external_anchor',false,'pdf_modified',false,
      'historical_receipts_preserved',true));
  return attestation_id;
end;
$$;
revoke all on function public.record_legacy_hash_reverification(uuid,text,uuid,text,bigint,integer,text)
  from public,anon,authenticated,service_role;
