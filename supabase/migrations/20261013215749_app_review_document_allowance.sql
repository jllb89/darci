-- Separate, service-only synthetic review allowance. Paid billing is unchanged.
create or replace function public.consume_app_review_document_workflow(
  p_billing_account_id uuid, p_entitlement_id uuid, p_document_id uuid,
  p_idempotency_key text, p_expected_document_status text, p_next_document_status text,
  p_actor_user_id uuid default null
)
returns table (usage_event_id uuid, quantity_used integer, quantity_limit integer,
  quantity_remaining integer, document_status text, was_already_consumed boolean)
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  e public.billing_entitlements%rowtype;
  d public.documents%rowtype;
  a public.billing_accounts%rowtype;
  u public.users%rowtype;
  prior public.billing_usage_events%rowtype;
  ledger_used integer;
  event_id uuid;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'BILLING_SERVICE_ROLE_REQUIRED';
  end if;
  if p_expected_document_status is null or p_next_document_status is null
    or p_expected_document_status not in ('draft', 'pending_review')
    or p_next_document_status not in ('pending_signature', 'pending_notary')
    or p_idempotency_key is distinct from ('document:' || p_document_id::text || ':first_submission') then
    raise exception using errcode = '22023', message = 'BILLING_DOCUMENT_TRANSITION_NOT_ALLOWED';
  end if;
  select * into e from public.billing_entitlements
    where id = p_entitlement_id and billing_account_id = p_billing_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'BILLING_ENTITLEMENT_NOT_FOUND'; end if;
  select * into a from public.billing_accounts where id = p_billing_account_id;
  select * into u from public.users where id = a.owner_user_id;
  if u.email is distinct from 'apple-review@illuminotary.com' or u.status is distinct from 'active'
    or a.status is distinct from 'active' or e.owner_user_id is distinct from u.id
    or p_actor_user_id is distinct from u.id
    or a.metadata->>'source' is distinct from 'app_review'
    or a.metadata->>'auth_id' is distinct from u.supabase_user_id::text
    or e.metadata->>'source' is distinct from 'app_review'
    or e.subscription_item_id is not null or e.status <> 'active'
    or e.entitlement_type <> 'document_workflow_capacity' or e.is_unlimited
    or e.quantity_total is distinct from 25 then
    raise exception using errcode = '42501', message = 'BILLING_REVIEW_ACCOUNT_NOT_ELIGIBLE';
  end if;
  if e.starts_at is null or e.ends_at is null or now() < e.starts_at or now() >= e.ends_at
    or e.ends_at > e.starts_at + interval '30 days' then
    raise exception using errcode = 'P0001', message = 'BILLING_PERIOD_NOT_ACTIVE';
  end if;
  select * into d from public.documents where id = p_document_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'BILLING_DOCUMENT_NOT_FOUND'; end if;
  if d.owner_id is distinct from u.id then
    raise exception using errcode = '42501', message = 'BILLING_DOCUMENT_OWNER_MISMATCH';
  end if;
  select * into prior from public.billing_usage_events
    where billing_account_id = a.id and document_id = d.id and metric_code = 'document_workflow' and event_kind = 'consume';
  if found then
    if prior.entitlement_id is distinct from e.id then
      raise exception using errcode = '23505', message = 'BILLING_IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return query select prior.id, e.quantity_used, 25, greatest(25-e.quantity_used,0), d.status, true;
    return;
  end if;
  if d.status is distinct from p_expected_document_status then
    raise exception using errcode = 'P0001', message = 'BILLING_DOCUMENT_STATUS_CONFLICT';
  end if;
  select coalesce(sum(quantity_delta),0)::integer into ledger_used
    from public.billing_usage_events where entitlement_id = e.id and metric_code = 'document_workflow';
  if ledger_used <> e.quantity_used then raise exception using errcode = 'P0001', message = 'BILLING_USAGE_DRIFT'; end if;
  if ledger_used >= 25 then raise exception using errcode = 'P0001', message = 'BILLING_WORKFLOW_LIMIT_REACHED'; end if;
  insert into public.billing_usage_events (billing_account_id,entitlement_id,document_id,metric_code,
    product_flow_mode_snapshot,document_type_snapshot,event_kind,quantity_delta,period_start,period_end,
    idempotency_key,source,reason,actor_user_id,metadata)
  values (a.id,e.id,d.id,'document_workflow',d.product_flow_mode,d.document_type,'consume',1,e.starts_at,e.ends_at,
    p_idempotency_key,'app_review','approved_synthetic_review_allowance',u.id,jsonb_build_object('synthetic',true))
  returning id into event_id;
  update public.documents set status=p_next_document_status,updated_at=now() where id=d.id;
  update public.billing_entitlements set quantity_used=ledger_used+1,updated_at=now(),
    exhausted_at=case when ledger_used+1=25 then now() else null end where id=e.id;
  insert into public.audit_events (actor_id,entity_type,entity_id,action,metadata)
  values(u.id,'document',d.id,'billing.app_review_workflow_consumed',jsonb_build_object(
    'entitlement_id',e.id,'usage_event_id',event_id,'quantity_used',ledger_used+1,'quantity_limit',25));
  return query select event_id,ledger_used+1,25,24-ledger_used,p_next_document_status,false;
end;
$$;
revoke all on function public.consume_app_review_document_workflow(uuid,uuid,uuid,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.consume_app_review_document_workflow(uuid,uuid,uuid,text,text,text,uuid) to service_role;
