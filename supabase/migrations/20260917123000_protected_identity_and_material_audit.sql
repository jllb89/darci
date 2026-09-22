create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.identity_document_values (
  id uuid primary key,
  meeting_id uuid not null references public.meetings(id) on delete restrict,
  participant_id uuid not null references public.meeting_participants(id) on delete restrict,
  recorded_by uuid not null references public.users(id) on delete restrict,
  encrypted_value jsonb not null,
  key_id text not null,
  legal_hold boolean not null default false,
  retention_until timestamptz,
  retention_policy_version text,
  created_at timestamptz not null default now(),
  check (coalesce(jsonb_typeof(encrypted_value)='object' and encrypted_value->>'version'='1'
    and encrypted_value->>'keyId'=key_id and key_id ~ '^[A-Za-z0-9_-]{1,64}$'
    and octet_length(decode(encrypted_value->>'iv','base64'))=12
    and octet_length(decode(encrypted_value->>'tag','base64'))=16
    and octet_length(decode(encrypted_value->>'ciphertext','base64')) between 1 and 4096,false))
);
alter table private.identity_document_values enable row level security;
revoke all on private.identity_document_values from public, anon, authenticated, service_role;
-- No automatic deletion: retention periods and legal-hold release await approval.

create or replace function public.record_protected_identity_verification(
  p_meeting_id uuid,p_participant_id uuid,p_actor_id uuid,p_protected_id uuid,
  p_envelope jsonb,p_event jsonb,p_identity_metadata jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_request public.notarization_requests%rowtype;
  v_checkin public.meeting_checkins%rowtype;
  v_event public.identity_verification_events%rowtype;
  v_metadata jsonb;
begin
  select r.* into v_request from public.notarization_requests r join public.meetings m on m.request_id=r.id
    where m.id=p_meeting_id and m.status='in_progress' for update of r;
  if not found or p_actor_id is null or v_request.assigned_notary_id is distinct from p_actor_id
    or not exists(select 1 from public.users where id=p_actor_id and status='active')
    or not exists(select 1 from public.meeting_participants where id=p_participant_id and meeting_id=p_meeting_id) then
    raise exception 'IDENTITY_ACTOR_OR_SESSION_NOT_ELIGIBLE';
  end if;
  if p_identity_metadata is null or jsonb_typeof(p_identity_metadata) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_identity_metadata) k where k not in
      ('policyVersion','documentType','documentLabel','documentNumberTail','issuingJurisdiction','documentExpirationDate','evidenceArtifactIds'))
    or (p_identity_metadata->>'documentNumberTail' is not null and p_identity_metadata->>'documentNumberTail' !~ '^[A-Z0-9]{2,4}$') then
    raise exception 'IDENTITY_PLAINTEXT_METADATA_REJECTED';
  end if;
  if p_envelope is not null then
    insert into private.identity_document_values(id,meeting_id,participant_id,recorded_by,encrypted_value,key_id)
      values(p_protected_id,p_meeting_id,p_participant_id,p_actor_id,p_envelope,p_envelope->>'keyId');
  elsif p_protected_id is not null then raise exception 'IDENTITY_ENVELOPE_REQUIRED'; end if;
  v_metadata:=p_identity_metadata || jsonb_build_object('protectedIdentityId',p_protected_id,'identifierStorage',
    case when p_protected_id is not null then 'restricted_encrypted' else 'tail_only' end);
  insert into public.meeting_checkins(meeting_id,meeting_participant_id,recorded_by_user_id,checkin_kind,recorded_at,notes,metadata)
    values(p_meeting_id,p_participant_id,p_actor_id,'identity',coalesce((p_event->>'recordedAt')::timestamptz,now()),p_event->>'notes',
      jsonb_build_object('requestId',v_request.id,'verificationMethod',p_event->>'verificationMethod','identityDocument',v_metadata)) returning * into v_checkin;
  insert into public.identity_verification_events(meeting_id,meeting_participant_id,verified_by_user_id,verification_method,status,
    subject_name_snapshot,document_type,document_last4,issuing_jurisdiction,verified_at,notes,metadata)
    values(p_meeting_id,p_participant_id,p_actor_id,p_event->>'verificationMethod',p_event->>'status',p_event->>'subjectName',
      p_identity_metadata->>'documentType',p_identity_metadata->>'documentNumberTail',p_identity_metadata->>'issuingJurisdiction',
      case when p_event->>'status'='verified' then coalesce((p_event->>'recordedAt')::timestamptz,now()) end,p_event->>'notes',
      jsonb_build_object('requestId',v_request.id,'meetingCheckinId',v_checkin.id,'identityDocument',v_metadata)) returning * into v_event;
  insert into public.audit_events(actor_id,entity_type,entity_id,action,metadata)
    values(p_actor_id,'identity_verification',v_event.id,'identity.securely_recorded',
      jsonb_build_object('document_id',v_request.document_id,'request_id',v_request.id,'meeting_id',p_meeting_id,'protected_identity_id',p_protected_id));
  return jsonb_build_object('checkin',to_jsonb(v_checkin),'verificationEvent',to_jsonb(v_event));
end;
$$;
revoke all on function public.record_protected_identity_verification(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_protected_identity_verification(uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb) to service_role;

-- Required row-level evidence is committed with the state change, independent of
-- optional application activity logging. No notes, document contents or identity values.
create or replace function public.audit_material_document_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_new jsonb:=to_jsonb(new); v_old jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
begin
  if tg_op='UPDATE' and v_new=v_old then return new; end if;
  insert into public.audit_events(entity_type,entity_id,action,metadata)
    values(tg_table_name,(v_new->>'id')::uuid,'integrity.'||lower(tg_op),jsonb_strip_nulls(jsonb_build_object(
      'document_id',v_new->>'document_id','meeting_id',v_new->>'meeting_id',
      'previous_status',v_old->>'status','status',v_new->>'status',
      'release_status',v_new->>'release_status','version_id',v_new->>'document_version_id',
      'hash',case when tg_table_name='document_hash_records' then v_new->>'hash' end,
      'actor_id',coalesce(v_new->>'verified_by_user_id',v_new->>'initiated_by_user_id',v_new->>'created_by'))));
  return new;
end;
$$;
revoke all on function public.audit_material_document_change() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['signatures','notarization_requests','identity_verification_events','document_execution_runs','document_hash_records','document_release_controls',
    'acknowledgment_pages','meeting_checkins','meetings','document_versions'] loop
    execute format('create trigger required_material_audit after insert or update on public.%I for each row execute function public.audit_material_document_change()',t);
  end loop;
end $$;
revoke update,delete,truncate on public.audit_events from anon,authenticated,service_role;
