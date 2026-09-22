-- Uploaded bytes have already passed native PDF validation and storage read-back.
-- Persist their entire evidence chain in one transaction; publication is separate.
create or replace function public.commit_hash_only_output(
  p_document_id uuid, p_source_version_id uuid, p_actor_id uuid,
  p_storage_path text, p_file_name text, p_size_bytes bigint, p_hash text,
  p_watermark_text text, p_metadata jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d public.documents%rowtype;
  source public.document_versions%rowtype;
  v public.document_versions%rowtype;
  e public.document_execution_runs%rowtype;
  h public.document_hash_records%rowtype;
  l public.ledger_entries%rowtype;
  a public.ledger_anchor_attempts%rowtype;
begin
  select * into d from public.documents where id=p_document_id for update;
  if not found or p_actor_id is null or not exists(
    select 1 from public.notarization_requests r join public.meetings m on m.request_id=r.id
    join public.users u on u.id=r.assigned_notary_id
    where r.document_id=d.id and r.assigned_notary_id=p_actor_id and u.status='active' and m.status='completed'
  ) then raise exception 'FINALIZATION_ACTOR_OR_SESSION_INVALID'; end if;
  select * into source from public.document_versions where id=p_source_version_id and document_id=d.id;
  if not found or not exists(select 1 from public.document_execution_runs
    where document_id=d.id and output_document_version_id=source.id
      and execution_kind='acknowledgment_append' and status='completed') then
    raise exception 'FINALIZATION_ACKNOWLEDGMENT_REQUIRED';
  end if;
  select * into e from public.document_execution_runs where document_id=d.id
    and source_document_version_id=source.id and execution_kind='watermark' and status='completed'
    order by created_at desc limit 1;
  if found then
    select * into v from public.document_versions where id=e.output_document_version_id;
    select * into h from public.document_hash_records where execution_run_id=e.id and document_version_id=v.id and status='completed' order by created_at desc limit 1;
    select * into a from public.ledger_anchor_attempts where document_hash_record_id=h.id order by created_at desc limit 1;
    select * into l from public.ledger_entries where id=a.ledger_entry_id;
    if h.id is null or a.status is distinct from 'not_required' or a.response_payload->>'provider' is distinct from 'hash_only'
      or l.hash is distinct from h.hash or l.ledger_tx_id is not null or l.anchored_at is not null then
      raise exception 'EXISTING_FINALIZATION_REQUIRES_REVIEW';
    end if;
  else
    if d.status='completed' or exists(select 1 from public.document_versions where document_id=d.id and is_final) then
      raise exception 'FINAL_PACKAGE_IMMUTABLE';
    end if;
    if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_size_bytes is null or p_size_bytes<=0
      or p_storage_path is null or p_storage_path not like d.owner_id::text||'/'||d.id::text||'/finalization/watermark/%'
      or p_file_name is null or p_watermark_text is null then raise exception 'FINALIZATION_OUTPUT_INVALID'; end if;
    insert into public.document_versions(document_id,version,storage_path,file_name,mime_type,size_bytes,is_final,generation_run_id,created_by)
      select d.id,coalesce(max(version),0)+1,p_storage_path,p_file_name,'application/pdf',p_size_bytes,false,source.generation_run_id,p_actor_id
      from public.document_versions where document_id=d.id returning * into v;
    insert into public.document_execution_runs(document_id,source_document_version_id,output_document_version_id,execution_kind,status,
      watermark_text,initiated_by_user_id,started_at,metadata)
      values(d.id,source.id,v.id,'watermark','pending',p_watermark_text,p_actor_id,now(),coalesce(p_metadata,'{}')) returning * into e;
    insert into public.document_hash_records(document_id,document_version_id,execution_run_id,algorithm,hash,status,completed_at)
      values(d.id,v.id,e.id,'sha256',p_hash,'completed',now()) returning * into h;
    insert into public.ledger_entries(document_id,idn,hash) values(d.id,d.idn,p_hash)
      on conflict(document_id,hash) do nothing;
    select * into l from public.ledger_entries where document_id=d.id and hash=p_hash;
    if l.ledger_tx_id is not null or l.anchored_at is not null then raise exception 'EXISTING_RECEIPT_REQUIRES_REVIEW'; end if;
    insert into public.ledger_anchor_attempts(document_id,document_hash_record_id,ledger_entry_id,status,completed_at,response_payload)
      values(d.id,h.id,l.id,'not_required',now(),jsonb_build_object('provider','hash_only','hash',p_hash,'idn',d.idn)) returning * into a;
    insert into public.finalization_status_history(document_id,execution_run_id,document_hash_record_id,ledger_anchor_attempt_id,
      changed_by_user_id,status,change_source,change_reason,metadata)
      select d.id,e.id,h.id,a.id,p_actor_id,s,'documents.watermark','Validated PDF and SHA-256 evidence committed',
        jsonb_build_object('documentVersionId',v.id,'hash',p_hash,'externalAnchor',false)
      from unnest(array['watermark_applied','hash_recorded','hash_verified']) s;
    update public.document_execution_runs set status='completed',completed_at=now(),metadata=metadata||jsonb_build_object(
      'documentHashRecordId',h.id,'ledgerEntryId',l.id,'ledgerAnchorAttemptId',a.id,'outputVersionId',v.id,'sourceVersionId',source.id)
      where id=e.id returning * into e;
  end if;
  return jsonb_build_object('execution',to_jsonb(e),'version',to_jsonb(v),'hashRecord',to_jsonb(h),
    'ledgerEntry',to_jsonb(l),'ledgerAnchorAttempt',to_jsonb(a));
end;
$$;
revoke all on function public.commit_hash_only_output(uuid,uuid,uuid,text,text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_hash_only_output(uuid,uuid,uuid,text,text,bigint,text,text,jsonb) to service_role;

create or replace function public.complete_hash_only_package(p_document_id uuid,p_actor_id uuid,p_version_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d public.documents%rowtype;
  r public.notarization_requests%rowtype;
  expected_count integer;
  declared_count integer;
  valid_count integer;
  primary_version uuid;
  primary_hash uuid;
begin
  select * into d from public.documents where id=p_document_id for update;
  select * into r from public.notarization_requests where document_id=d.id order by created_at desc limit 1 for update;
  if d.id is null or p_actor_id is null or r.assigned_notary_id is distinct from p_actor_id
    or not exists(select 1 from public.meetings where request_id=r.id and status='completed')
    or not exists(select 1 from public.users where id=p_actor_id and status='active') then
    raise exception 'FINALIZATION_ACTOR_OR_SESSION_INVALID';
  end if;
  select count(*),max((metadata->>'acknowledgmentBatchSize')::integer) into expected_count,declared_count
    from public.document_execution_runs where document_id=d.id and execution_kind='acknowledgment_append' and status='completed';
  if expected_count=0 or declared_count is distinct from expected_count or cardinality(p_version_ids) is distinct from expected_count then
    raise exception 'FINALIZATION_PACKAGE_INCOMPLETE';
  end if;
  select count(distinct e.source_document_version_id) into valid_count
    from public.document_versions v join public.document_execution_runs e on e.output_document_version_id=v.id and e.document_id=d.id
    join public.document_hash_records h on h.execution_run_id=e.id and h.document_version_id=v.id and h.document_id=d.id
    join public.ledger_anchor_attempts a on a.document_hash_record_id=h.id and a.document_id=d.id
    join public.ledger_entries l on l.id=a.ledger_entry_id and l.document_id=d.id and l.hash=h.hash
    where v.id=any(p_version_ids) and v.document_id=d.id and e.execution_kind='watermark' and e.status='completed'
      and h.status='completed' and h.algorithm='sha256' and h.hash ~ '^[a-f0-9]{64}$'
      and a.status='not_required' and a.response_payload->>'provider'='hash_only' and l.ledger_tx_id is null and l.anchored_at is null
      and exists(select 1 from public.document_execution_runs ack where ack.document_id=d.id and ack.output_document_version_id=e.source_document_version_id
        and ack.execution_kind='acknowledgment_append' and ack.status='completed');
  if valid_count<>expected_count then raise exception 'FINALIZATION_PACKAGE_EVIDENCE_INVALID'; end if;
  if exists(select 1 from public.document_versions where document_id=d.id and is_final and not(id=any(p_version_ids))) then
    raise exception 'FINAL_PACKAGE_IMMUTABLE';
  end if;
  if d.status='completed' and r.status='completed'
    and not exists(select 1 from public.document_versions where id=any(p_version_ids) and not is_final) then
    return jsonb_build_object('document',to_jsonb(d),'request',to_jsonb(r));
  end if;
  select v.id,h.id into primary_version,primary_hash from public.document_versions v
    join public.document_hash_records h on h.document_version_id=v.id and h.status='completed'
    where v.id=any(p_version_ids) order by v.version desc limit 1;
  -- Pending release denies member/public final-byte access even in observe mode.
  insert into public.document_release_controls(document_id,document_version_id,document_hash_record_id,release_status,changed_by_user_id,metadata)
    values(d.id,primary_version,primary_hash,'pending',p_actor_id,jsonb_build_object('source','atomic_package_completion'))
    on conflict(document_id) do update set
      document_version_id=excluded.document_version_id,
      document_hash_record_id=excluded.document_hash_record_id,
      release_status='pending',held_at=null,released_at=null,hold_reason=null,
      changed_by_user_id=excluded.changed_by_user_id,
      metadata=public.document_release_controls.metadata||excluded.metadata;
  update public.document_versions set is_final=true where id=any(p_version_ids) and not is_final;
  update public.documents set status='completed' where id=d.id returning * into d;
  update public.notarization_requests set status='completed' where id=r.id returning * into r;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,metadata)
    values(p_actor_id,'document',d.id,'finalization.package_completed',jsonb_build_object('version_ids',p_version_ids,'verification','sha256','external_anchor',false));
  return jsonb_build_object('document',to_jsonb(d),'request',to_jsonb(r));
end;
$$;
revoke all on function public.complete_hash_only_package(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.complete_hash_only_package(uuid,uuid,uuid[]) to service_role;
