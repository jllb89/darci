-- Approved member pricing v2. Additive catalog; old financial contracts stay intact.
-- New prices remain inactive until Stripe test mappings and compatible clients are verified.
alter table public.billing_catalog_prices add column if not exists available_for_purchase boolean not null default true;
insert into public.billing_catalog_prices(product_id,price_code,display_name,billing_interval,interval_count,
  currency_code,unit_amount_cents,included_entitlement_type,included_entitlement_quantity,
  included_entitlement_period,usage_limit_quantity,is_unlimited,is_active,sort_order,metadata)
select p.id,v.code,v.name,v.cadence,1,'USD',v.amount,'document_workflow_capacity',v.allowance,
  'month',v.allowance,v.unlimited,false,v.position,
  jsonb_build_object('catalog_version',2,'tax_behavior','exclusive','notary_fees_included',false,'allowance_reset','monthly_anniversary')
from public.billing_catalog_products p cross join (values
 ('member_starter_monthly_v2','Starter','month',999,3,false,10),
 ('member_plus_monthly_v2','Plus','month',1999,25,false,20),
 ('member_unlimited_monthly_v2','Unlimited','month',5999,null::integer,true,30),
 ('member_starter_annual_v2','Starter','year',9900,3,false,40),
 ('member_plus_annual_v2','Plus','year',19900,25,false,50),
 ('member_unlimited_annual_v2','Unlimited','year',59900,null::integer,true,60)
) v(code,name,cadence,amount,allowance,unlimited,position)
where p.product_code='member_membership'
on conflict(price_code) do nothing;

-- Calendar arithmetic is always UTC and always relative to the ORIGINAL anchor:
-- Jan 31 -> Feb 28/29 -> Mar 31, never a permanently drifting Feb 28 anchor.
create or replace function public.member_monthly_allowance_window(p_start timestamptz,p_end timestamptz,p_at timestamptz)
returns table(window_start timestamptz,window_end timestamptz)
language plpgsql immutable set search_path='' as $$
declare n integer := 0; a timestamp := p_start at time zone 'UTC'; t timestamptz;
begin
 if p_start is null or p_end is null or p_at is null or p_end<=p_start then raise exception 'BILLING_PERIOD_INVALID'; end if;
 -- Bound this helper to supported annual-or-shorter billing contracts.
 if p_end > ((a + interval '13 months') at time zone 'UTC') then raise exception 'BILLING_PERIOD_TOO_LONG'; end if;
 loop
  t := (a + make_interval(months=>n+1)) at time zone 'UTC';
  exit when t>p_at or t>=p_end;
  n:=n+1;
 end loop;
 return query select (a+make_interval(months=>n)) at time zone 'UTC',least(t,p_end);
end; $$;
revoke all on function public.member_monthly_allowance_window(timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.member_monthly_allowance_window(timestamptz,timestamptz,timestamptz) to service_role;

-- Catch up a monthly window on demand, independent of the annual invoice.
-- Locks the same account as subscription projection; never touches legacy plans,
-- financial periods, historical usage, PDFs or external provider state.
create or replace function public.refresh_member_billing_window(p_billing_account_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; w record; e uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='BILLING_SERVICE_ROLE_REQUIRED'; end if;
 perform 1 from public.billing_accounts where id=p_billing_account_id and status='active' for update;
 if not found then return; end if;
 for r in
  select i.*,s.status as subscription_status,s.provider_environment,a.owner_user_id
  from public.billing_subscription_items i join public.billing_subscriptions s on s.id=i.subscription_id
  join public.billing_catalog_prices p on p.id=i.price_id
  join public.billing_accounts a on a.id=i.billing_account_id
  where i.billing_account_id=p_billing_account_id and i.role_context='member' and i.status='active'
   and s.status in ('active','trialing') and p.billing_interval='year' and p.metadata->>'catalog_version'='2'
   and now()>=i.current_period_start and now()<i.current_period_end
 loop
  perform public.assert_stripe_runtime_environment(r.provider_environment);
  select * into w from public.member_monthly_allowance_window(r.current_period_start,r.current_period_end,now());
  select id into e from public.billing_entitlements where subscription_item_id=r.id
   and entitlement_type='document_workflow_capacity' and starts_at=w.window_start and ends_at=w.window_end;
  if e is not null then continue; end if;
  if (r.is_unlimited and (r.usage_limit_quantity is not null or r.included_entitlement_quantity is not null))
    or (not r.is_unlimited and (r.usage_limit_quantity is null or r.included_entitlement_quantity is null)) then
    raise exception 'BILLING_ENTITLEMENT_CONFIGURATION_INVALID';
  end if;
  update public.billing_entitlements set status='expired' where subscription_item_id=r.id
   and entitlement_type='document_workflow_capacity' and ends_at<=w.window_start and status in ('active','suspended');
  insert into public.billing_entitlements(billing_account_id,owner_user_id,subscription_item_id,product_id,price_id,
   entitlement_type,status,quantity_total,quantity_used,is_unlimited,period_unit,starts_at,ends_at,activated_at,metadata)
  values(p_billing_account_id,r.owner_user_id,r.id,r.product_id,r.price_id,'document_workflow_capacity','active',
   r.included_entitlement_quantity,0,r.is_unlimited,'month',w.window_start,w.window_end,now(),
   jsonb_build_object('source','annual_monthly_window','price_code',r.price_code_snapshot)) returning id into e;
  insert into public.audit_events(entity_type,entity_id,action,metadata) values('billing_entitlement',e,
   'billing.monthly_allowance_renewed',jsonb_build_object('billing_account_id',p_billing_account_id,
   'subscription_item_id',r.id,'starts_at',w.window_start,'ends_at',w.window_end));
 end loop;
end; $$;
revoke all on function public.refresh_member_billing_window(uuid) from public,anon,authenticated;
grant execute on function public.refresh_member_billing_window(uuid) to service_role;

create or replace function public.refresh_due_member_billing_windows(p_limit integer default 100)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; n integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='BILLING_SERVICE_ROLE_REQUIRED'; end if;
 for r in select distinct i.billing_account_id from public.billing_subscription_items i
  join public.billing_subscriptions s on s.id=i.subscription_id join public.billing_catalog_prices p on p.id=i.price_id
  where s.status in ('active','trialing') and i.status='active' and p.billing_interval='year'
   and p.metadata->>'catalog_version'='2' and now()>=i.current_period_start and now()<i.current_period_end
   and not exists(select 1 from public.billing_entitlements e where e.subscription_item_id=i.id
    and e.entitlement_type='document_workflow_capacity' and e.starts_at<=now() and e.ends_at>now())
  order by i.billing_account_id limit least(greatest(p_limit,1),500)
 loop perform public.refresh_member_billing_window(r.billing_account_id); n:=n+1; end loop;
 return n;
end; $$;
revoke all on function public.refresh_due_member_billing_windows(integer) from public,anon,authenticated;
grant execute on function public.refresh_due_member_billing_windows(integer) to service_role;

-- Explicit post-deployment activation: retain legacy mappings for ongoing invoices,
-- but atomically offer only the six verified new contracts for new sales.
create or replace function public.activate_member_pricing_v2()
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='BILLING_SERVICE_ROLE_REQUIRED'; end if;
 select count(distinct p.id) into n from public.billing_catalog_prices p
 join public.billing_provider_price_mappings m on m.catalog_price_id=p.id
 join public.billing_runtime_configuration c on c.singleton and c.stripe_environment=m.provider_environment
 where p.price_code in ('member_starter_monthly_v2','member_plus_monthly_v2','member_unlimited_monthly_v2',
 'member_starter_annual_v2','member_plus_annual_v2','member_unlimited_annual_v2') and m.status='verified';
 if n<>6 then raise exception 'MEMBER_PRICING_V2_MAPPINGS_INCOMPLETE'; end if;
 update public.billing_catalog_prices set is_active=true,available_for_purchase=true where price_code in
 ('member_starter_monthly_v2','member_plus_monthly_v2','member_unlimited_monthly_v2','member_starter_annual_v2','member_plus_annual_v2','member_unlimited_annual_v2');
 update public.billing_catalog_prices set available_for_purchase=false where price_code in
 ('member_starter_monthly','member_plus_monthly','member_volume_monthly');
 insert into public.audit_events(entity_type,action,metadata) values('billing_catalog','billing.member_pricing_v2_activated',
 '{"currency":"USD","tax_behavior":"exclusive","notary_fees_included":false}'::jsonb);
end; $$;
revoke all on function public.activate_member_pricing_v2() from public,anon,authenticated;
grant execute on function public.activate_member_pricing_v2() to service_role;

-- Preserve transactional financial projection, extending only cadence/quota/window handling.
create or replace function public.apply_stripe_member_subscription_snapshot(
  p_billing_account_id uuid,
  p_owner_user_id uuid,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_price_id text,
  p_subscription_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_order_id uuid default null,
  p_invoice_id text default null,
  p_invoice_status text default null,
  p_invoice_amount_cents integer default 0,
  p_invoice_currency text default 'USD',
  p_event_id text default null,
  p_provider_environment text default 'test'
)
returns table (
  subscription_id uuid,
  subscription_item_id uuid,
  entitlement_id uuid,
  internal_status text,
  entitlement_status text,
  quantity_limit integer,
  quantity_used integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_account public.billing_accounts%rowtype;
  v_mapping record;
  v_customer_id uuid;
  v_subscription_id uuid;
  v_item_id uuid;
  v_entitlement_id uuid;
  v_status text;
  v_item_status text;
  v_entitlement_status text;
  v_quantity_used integer := 0;
  v_invoice_internal_status text;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  perform public.assert_stripe_runtime_environment(p_provider_environment);
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'BILLING_SERVICE_ROLE_REQUIRED';
  end if;

  if p_period_start is null or p_period_end is null or p_period_end <= p_period_start then
    raise exception using errcode = '22023', message = 'STRIPE_SUBSCRIPTION_PERIOD_INVALID';
  end if;

  if p_subscription_status not in (
    'pending', 'trialing', 'active', 'past_due', 'paused', 'canceled',
    'expired', 'incomplete', 'incomplete_expired', 'unpaid'
  ) then
    raise exception using errcode = '22023', message = 'STRIPE_SUBSCRIPTION_STATUS_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe:' || p_provider_environment || ':' || p_provider_subscription_id, 0));

  select accounts.*
  into v_account
  from public.billing_accounts accounts
  where accounts.id = p_billing_account_id
    and accounts.owner_user_id = p_owner_user_id
    and accounts.status = 'active'
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'BILLING_MEMBER_ACCOUNT_NOT_ELIGIBLE';
  end if;

  select mappings.id,
         prices.id as price_id,
         prices.product_id,
         prices.price_code,
         prices.display_name,
         prices.included_entitlement_quantity,
         prices.usage_limit_quantity, prices.is_unlimited, prices.billing_interval
  into v_mapping
  from public.billing_provider_price_mappings mappings
  join public.billing_catalog_prices prices on prices.id = mappings.catalog_price_id
  join public.billing_catalog_products products on products.id = prices.product_id
  where mappings.provider = 'stripe'
    and mappings.provider_environment = p_provider_environment
    and mappings.provider_price_id = p_provider_price_id
    and mappings.status = 'verified'
    and prices.is_active = true
    and products.is_active = true
    and products.product_code = 'member_membership'
    and products.product_family = 'member_membership'
    and prices.billing_interval in ('month','year');

  if not found then
    raise exception using errcode = 'P0002', message = 'STRIPE_MEMBER_PRICE_MAPPING_NOT_FOUND';
  end if;

  if (v_mapping.is_unlimited and (v_mapping.included_entitlement_quantity is not null or v_mapping.usage_limit_quantity is not null))
    or (not v_mapping.is_unlimited and (v_mapping.included_entitlement_quantity is null or v_mapping.usage_limit_quantity is null)) then
    raise exception 'BILLING_ENTITLEMENT_CONFIGURATION_INVALID';
  end if;
  v_window_start:=p_period_start; v_window_end:=p_period_end;
  if v_mapping.billing_interval='year' then
    select window_start,window_end into v_window_start,v_window_end
    from public.member_monthly_allowance_window(p_period_start,p_period_end,now());
  end if;
  insert into public.billing_customers (
    billing_account_id,
    provider,
    provider_environment,
    provider_customer_id,
    status,
    is_default,
    metadata
  )
  values (
    p_billing_account_id,
    'stripe',
    p_provider_environment,
    p_provider_customer_id,
    'active',
    true,
    jsonb_build_object('source', 'stripe_webhook')
  )
  on conflict (provider, provider_environment, provider_customer_id) do update
  set billing_account_id = excluded.billing_account_id,
      status = 'active',
      is_default = true,
      metadata = public.billing_customers.metadata || excluded.metadata,
      updated_at = now()
  returning id into v_customer_id;

  v_status := p_subscription_status;
  v_item_status := case
    when v_status in ('trialing', 'active') then 'active'
    when v_status = 'paused' then 'paused'
    when v_status in ('canceled', 'expired', 'incomplete_expired', 'unpaid') then 'canceled'
    else 'pending'
  end;
  v_entitlement_status := case
    when v_status in ('trialing', 'active') then 'active'
    when v_status in ('past_due', 'paused', 'incomplete') then 'suspended'
    when v_status = 'expired' or (v_status in ('canceled', 'incomplete_expired', 'unpaid') and p_period_end <= now()) then 'expired'
    else 'canceled'
  end;

  select subscriptions.id
  into v_subscription_id
  from public.billing_subscriptions subscriptions
  where subscriptions.provider = 'stripe'
    and subscriptions.provider_environment = p_provider_environment
    and subscriptions.provider_subscription_id = p_provider_subscription_id
  for update;

  if found then
    update public.billing_subscriptions
    set billing_account_id = p_billing_account_id,
        billing_customer_id = v_customer_id,
        subscriber_user_id = p_owner_user_id,
        beneficiary_user_id = p_owner_user_id,
        role_context = 'member',
        status = v_status,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
        canceled_at = p_canceled_at,
        ended_at = p_ended_at,
        metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
          'last_stripe_event_id', p_event_id,
          'provider_price_id', p_provider_price_id
        )),
        updated_at = now()
    where id = v_subscription_id;
  else
    insert into public.billing_subscriptions (
      billing_account_id,
      billing_customer_id,
      subscriber_user_id,
      beneficiary_user_id,
      role_context,
      status,
      provider,
      provider_environment,
      provider_subscription_id,
      started_at,
      current_period_start,
      current_period_end,
      cancel_at_period_end,
      canceled_at,
      ended_at,
      metadata
    )
    values (
      p_billing_account_id,
      v_customer_id,
      p_owner_user_id,
      p_owner_user_id,
      'member',
      v_status,
      'stripe',
      p_provider_environment,
      p_provider_subscription_id,
      p_period_start,
      p_period_start,
      p_period_end,
      coalesce(p_cancel_at_period_end, false),
      p_canceled_at,
      p_ended_at,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'stripe_webhook',
        'last_stripe_event_id', p_event_id,
        'provider_price_id', p_provider_price_id
      ))
    )
    returning id into v_subscription_id;
  end if;

  select items.id
  into v_item_id
  from public.billing_subscription_items items
  where items.subscription_id = v_subscription_id
    and items.role_context = 'member'
  for update;

  if found then
    update public.billing_subscription_items
    set billing_account_id = p_billing_account_id,
        product_id = v_mapping.product_id,
        price_id = v_mapping.price_id,
        beneficiary_user_id = p_owner_user_id,
        product_code_snapshot = 'member_membership',
        price_code_snapshot = v_mapping.price_code,
        display_name_snapshot = v_mapping.display_name,
        quantity = 1,
        status = v_item_status,
        current_period_start = p_period_start,
        current_period_end = p_period_end,
        included_entitlement_quantity = v_mapping.included_entitlement_quantity,
        usage_limit_quantity = v_mapping.usage_limit_quantity,
        is_unlimited = v_mapping.is_unlimited,
        metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
          'last_stripe_event_id', p_event_id,
          'provider_price_id', p_provider_price_id
        )),
        updated_at = now()
    where id = v_item_id;
  else
    insert into public.billing_subscription_items (
      subscription_id,
      billing_account_id,
      product_id,
      price_id,
      beneficiary_user_id,
      role_context,
      product_code_snapshot,
      price_code_snapshot,
      display_name_snapshot,
      quantity,
      status,
      current_period_start,
      current_period_end,
      included_entitlement_quantity,
      usage_limit_quantity,
      is_unlimited,
      metadata
    )
    values (
      v_subscription_id,
      p_billing_account_id,
      v_mapping.product_id,
      v_mapping.price_id,
      p_owner_user_id,
      'member',
      'member_membership',
      v_mapping.price_code,
      v_mapping.display_name,
      1,
      v_item_status,
      p_period_start,
      p_period_end,
      v_mapping.included_entitlement_quantity,
      v_mapping.usage_limit_quantity,
      v_mapping.is_unlimited,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'stripe_webhook',
        'last_stripe_event_id', p_event_id,
        'provider_price_id', p_provider_price_id
      ))
    )
    returning id into v_item_id;
  end if;

  update public.billing_entitlements
  set status = 'expired',
      ends_at = least(coalesce(ends_at, v_window_start), v_window_start),
      updated_at = now()
  where subscription_item_id = v_item_id
    and entitlement_type = 'document_workflow_capacity'
    and (starts_at, ends_at) is distinct from (v_window_start, v_window_end)
    and status in ('pending', 'active', 'suspended');

  select entitlements.id, entitlements.quantity_used
  into v_entitlement_id, v_quantity_used
  from public.billing_entitlements entitlements
  where entitlements.subscription_item_id = v_item_id
    and entitlements.entitlement_type = 'document_workflow_capacity'
    and entitlements.starts_at = v_window_start
    and entitlements.ends_at = v_window_end
  for update;

  if found then
    update public.billing_entitlements
    set billing_account_id = p_billing_account_id,
        owner_user_id = p_owner_user_id,
        product_id = v_mapping.product_id,
        price_id = v_mapping.price_id,
        status = v_entitlement_status,
        quantity_total = v_mapping.included_entitlement_quantity,
        is_unlimited = v_mapping.is_unlimited,
        period_unit = 'month',
        activated_at = case
          when v_entitlement_status = 'active' then coalesce(activated_at, now())
          else activated_at
        end,
        exhausted_at = case
          when v_quantity_used >= v_mapping.included_entitlement_quantity then coalesce(exhausted_at, now())
          else null
        end,
        metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
          'last_stripe_event_id', p_event_id,
          'price_code', v_mapping.price_code
        )),
        updated_at = now()
    where id = v_entitlement_id;
  else
    insert into public.billing_entitlements (
      billing_account_id,
      owner_user_id,
      subscription_item_id,
      product_id,
      price_id,
      entitlement_type,
      status,
      quantity_total,
      quantity_used,
      is_unlimited,
      period_unit,
      starts_at,
      ends_at,
      activated_at,
      metadata
    )
    values (
      p_billing_account_id,
      p_owner_user_id,
      v_item_id,
      v_mapping.product_id,
      v_mapping.price_id,
      'document_workflow_capacity',
      v_entitlement_status,
      v_mapping.included_entitlement_quantity,
      0,
      v_mapping.is_unlimited,
      'month',
      v_window_start,
      v_window_end,
      case when v_entitlement_status = 'active' then now() else null end,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'stripe_webhook',
        'last_stripe_event_id', p_event_id,
        'price_code', v_mapping.price_code
      ))
    )
    returning id, quantity_used into v_entitlement_id, v_quantity_used;
  end if;

  if p_order_id is not null then
    update public.billing_orders
    set billing_customer_id = v_customer_id,
        status = case
          when p_invoice_status = 'paid' and v_status in ('trialing', 'active') then 'paid'
          when v_status in ('canceled', 'expired', 'incomplete_expired') then 'failed'
          else 'pending_payment'
        end,
        paid_at = case when p_invoice_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
        metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
          'provider_subscription_id', p_provider_subscription_id,
          'provider_invoice_id', p_invoice_id,
          'last_stripe_event_id', p_event_id
        )),
        updated_at = now()
    where id = p_order_id
      and billing_account_id = p_billing_account_id
      and provider_environment = p_provider_environment;

    update public.billing_order_items
    set fulfillment_state = case
          when p_invoice_status = 'paid' and v_status in ('trialing', 'active') then 'fulfilled'
          else fulfillment_state
        end,
        fulfilled_at = case
          when p_invoice_status = 'paid' and v_status in ('trialing', 'active') then coalesce(fulfilled_at, now())
          else fulfilled_at
        end,
        metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
          'subscription_id', v_subscription_id,
          'last_stripe_event_id', p_event_id
        )),
        updated_at = now()
    where order_id = p_order_id;
  end if;

  if p_invoice_id is not null then
    v_invoice_internal_status := case p_invoice_status
      when 'paid' then 'succeeded'
      when 'open' then 'processing'
      when 'uncollectible' then 'failed'
      when 'void' then 'canceled'
      else 'pending'
    end;

    insert into public.payment_transactions (
      billing_account_id,
      order_id,
      subscription_id,
      provider,
      provider_environment,
      transaction_kind,
      external_id,
      external_parent_id,
      status,
      amount_cents,
      currency_code,
      settled_at,
      metadata
    )
    values (
      p_billing_account_id,
      p_order_id,
      v_subscription_id,
      'stripe',
      p_provider_environment,
      'invoice',
      p_invoice_id,
      p_provider_subscription_id,
      v_invoice_internal_status,
      greatest(coalesce(p_invoice_amount_cents, 0), 0),
      upper(coalesce(p_invoice_currency, 'USD')),
      case when p_invoice_status = 'paid' then now() else null end,
      jsonb_strip_nulls(jsonb_build_object('last_stripe_event_id', p_event_id))
    )
    on conflict (provider, provider_environment, transaction_kind, external_id) do update
    set order_id = coalesce(excluded.order_id, public.payment_transactions.order_id),
        subscription_id = excluded.subscription_id,
        status = excluded.status,
        amount_cents = excluded.amount_cents,
        currency_code = excluded.currency_code,
        settled_at = coalesce(public.payment_transactions.settled_at, excluded.settled_at),
        metadata = public.payment_transactions.metadata || excluded.metadata,
        updated_at = now();
  end if;

  insert into public.audit_events (
    actor_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values (
    null,
    'billing_subscription',
    v_subscription_id,
    'billing.stripe_subscription_synchronized',
    jsonb_strip_nulls(jsonb_build_object(
      'billing_account_id', p_billing_account_id,
      'subscription_status', v_status,
      'entitlement_status', v_entitlement_status,
      'price_code', v_mapping.price_code,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'stripe_event_id', p_event_id
    ))
  );

  return query select
    v_subscription_id,
    v_item_id,
    v_entitlement_id,
    v_status,
    v_entitlement_status,
    v_mapping.included_entitlement_quantity::integer,
    v_quantity_used;
end;
$$;
revoke all on function public.apply_stripe_member_subscription_snapshot(uuid,uuid,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,uuid,text,text,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.apply_stripe_member_subscription_snapshot(uuid,uuid,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,uuid,text,text,integer,text,text,text) to service_role;


-- Preserve atomic consumption, audit and reversal with explicit unlimited support.
create or replace function public.consume_member_document_workflow(
  p_billing_account_id uuid,
  p_entitlement_id uuid,
  p_document_id uuid,
  p_idempotency_key text,
  p_expected_document_status text,
  p_next_document_status text,
  p_actor_user_id uuid default null
)
returns table (
  usage_event_id uuid,
  quantity_used integer,
  quantity_limit integer,
  quantity_remaining integer,
  document_status text,
  was_already_consumed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.billing_usage_events%rowtype;
  v_entitlement public.billing_entitlements%rowtype;
  v_subscription_status text;
  v_subscription_item_status text;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_account_owner_id uuid;
  v_billing_account_status text;
  v_account_user_status text;
  v_subscriber_user_id uuid;
  v_beneficiary_user_id uuid;
  v_subscription_role_context text;
  v_subscription_item_role_context text;
  v_document_owner_id uuid;
  v_document_status text;
  v_product_flow_mode text;
  v_document_type text;
  v_ledger_used integer;
  v_usage_event_id uuid;
  v_new_used integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'BILLING_SERVICE_ROLE_REQUIRED';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception using errcode = '22023', message = 'BILLING_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if p_expected_document_status not in ('draft', 'pending_review')
     or p_next_document_status not in ('pending_signature', 'pending_notary') then
    raise exception using errcode = '22023', message = 'BILLING_DOCUMENT_TRANSITION_NOT_ALLOWED';
  end if;

  select events.*
  into v_existing
  from public.billing_usage_events events
  where events.billing_account_id = p_billing_account_id
    and events.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.document_id <> p_document_id
       or v_existing.event_kind <> 'consume' then
      raise exception using errcode = '23505', message = 'BILLING_IDEMPOTENCY_KEY_CONFLICT';
    end if;

    select entitlements.quantity_used, entitlements.quantity_total, documents.status
    into v_new_used, v_ledger_used, v_document_status
    from public.billing_entitlements entitlements
    join public.documents documents on documents.id = v_existing.document_id
    where entitlements.id = v_existing.entitlement_id;

    return query select
      v_existing.id,
      v_new_used,
      v_ledger_used,
      case when v_ledger_used is null then null::integer else greatest(v_ledger_used - v_new_used, 0) end,
      v_document_status,
      true;
    return;
  end if;

  select events.*
  into v_existing
  from public.billing_usage_events events
  where events.billing_account_id = p_billing_account_id
    and events.metric_code = 'document_workflow'
    and events.document_id = p_document_id
    and events.event_kind = 'consume';

  if found then
    select entitlements.quantity_used, entitlements.quantity_total, documents.status
    into v_new_used, v_ledger_used, v_document_status
    from public.billing_entitlements entitlements
    join public.documents documents on documents.id = v_existing.document_id
    where entitlements.id = v_existing.entitlement_id;

    return query select
      v_existing.id,
      v_new_used,
      v_ledger_used,
      case when v_ledger_used is null then null::integer else greatest(v_ledger_used - v_new_used, 0) end,
      v_document_status,
      true;
    return;
  end if;

  select entitlements.*
  into v_entitlement
  from public.billing_entitlements entitlements
  where entitlements.id = p_entitlement_id
    and entitlements.billing_account_id = p_billing_account_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'BILLING_ENTITLEMENT_NOT_FOUND';
  end if;

  select subscriptions.status,
         subscription_items.status,
         coalesce(subscription_items.current_period_start, subscriptions.current_period_start, v_entitlement.starts_at),
         coalesce(subscription_items.current_period_end, subscriptions.current_period_end, v_entitlement.ends_at),
         accounts.owner_user_id,
         accounts.status,
         account_users.status,
         subscriptions.subscriber_user_id,
         subscriptions.beneficiary_user_id,
         subscriptions.role_context,
         subscription_items.role_context
  into v_subscription_status,
       v_subscription_item_status,
       v_period_start,
       v_period_end,
       v_account_owner_id,
       v_billing_account_status,
       v_account_user_status,
       v_subscriber_user_id,
       v_beneficiary_user_id,
       v_subscription_role_context,
       v_subscription_item_role_context
  from public.billing_accounts accounts
  join public.users account_users
    on account_users.id = accounts.owner_user_id
  join public.billing_subscription_items subscription_items
    on subscription_items.id = v_entitlement.subscription_item_id
  join public.billing_subscriptions subscriptions
    on subscriptions.id = subscription_items.subscription_id
  where accounts.id = p_billing_account_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'BILLING_SUBSCRIPTION_CONTEXT_NOT_FOUND';
  end if;

  if v_entitlement.entitlement_type <> 'document_workflow_capacity'
     or v_entitlement.status <> 'active'
     or (not v_entitlement.is_unlimited and v_entitlement.quantity_total is null)
     or (v_entitlement.is_unlimited and v_entitlement.quantity_total is not null) then
    raise exception using errcode = 'P0001', message = 'BILLING_ENTITLEMENT_NOT_USABLE';
  end if;

  if v_billing_account_status <> 'active'
     or v_account_user_status <> 'active'
     or v_subscription_role_context <> 'member'
     or v_subscription_item_role_context <> 'member'
     or (v_entitlement.owner_user_id is not null and v_entitlement.owner_user_id <> v_account_owner_id)
     or (v_subscriber_user_id is not null and v_subscriber_user_id <> v_account_owner_id)
     or (v_beneficiary_user_id is not null and v_beneficiary_user_id <> v_account_owner_id) then
    raise exception using errcode = '42501', message = 'BILLING_MEMBER_ACCOUNT_NOT_ELIGIBLE';
  end if;

  if v_subscription_status not in ('trialing', 'active')
     or v_subscription_item_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'BILLING_SUBSCRIPTION_NOT_ENTITLED';
  end if;

  if v_period_start is null or v_period_end is null
     or now() < v_period_start or now() >= v_period_end
     or v_entitlement.starts_at is null or v_entitlement.ends_at is null
     or now() < v_entitlement.starts_at or now() >= v_entitlement.ends_at then
    raise exception using errcode = 'P0001', message = 'BILLING_PERIOD_NOT_ACTIVE';
  end if;

  v_period_start := v_entitlement.starts_at;
  v_period_end := v_entitlement.ends_at;

  select documents.owner_id,
         documents.status,
         documents.product_flow_mode,
         documents.document_type
  into v_document_owner_id,
       v_document_status,
       v_product_flow_mode,
       v_document_type
  from public.documents documents
  where documents.id = p_document_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'BILLING_DOCUMENT_NOT_FOUND';
  end if;

  if v_document_owner_id <> v_account_owner_id then
    raise exception using errcode = '42501', message = 'BILLING_DOCUMENT_OWNER_MISMATCH';
  end if;

  if v_document_status <> p_expected_document_status then
    raise exception using errcode = 'P0001', message = 'BILLING_DOCUMENT_STATUS_CONFLICT';
  end if;

  select coalesce(sum(events.quantity_delta), 0)::integer
  into v_ledger_used
  from public.billing_usage_events events
  where events.entitlement_id = p_entitlement_id
    and events.metric_code = 'document_workflow';

  if v_ledger_used <> v_entitlement.quantity_used then
    raise exception using errcode = 'P0001', message = 'BILLING_USAGE_DRIFT';
  end if;

  if not v_entitlement.is_unlimited and v_ledger_used >= v_entitlement.quantity_total then
    raise exception using errcode = 'P0001', message = 'BILLING_WORKFLOW_LIMIT_REACHED';
  end if;

  insert into public.billing_usage_events (
    billing_account_id,
    subscription_id,
    subscription_item_id,
    entitlement_id,
    document_id,
    metric_code,
    product_flow_mode_snapshot,
    document_type_snapshot,
    event_kind,
    quantity_delta,
    period_start,
    period_end,
    idempotency_key,
    source,
    reason,
    actor_user_id,
    metadata
  )
  values (
    p_billing_account_id,
    (select subscription_id from public.billing_subscription_items where id = v_entitlement.subscription_item_id),
    v_entitlement.subscription_item_id,
    p_entitlement_id,
    p_document_id,
    'document_workflow',
    v_product_flow_mode,
    v_document_type,
    'consume',
    1,
    v_period_start,
    v_period_end,
    p_idempotency_key,
    'workflow_submit',
    'first_successful_submission',
    p_actor_user_id,
    jsonb_build_object(
      'expected_document_status', p_expected_document_status,
      'next_document_status', p_next_document_status
    )
  )
  returning id into v_usage_event_id;

  update public.documents
  set status = p_next_document_status,
      updated_at = now()
  where id = p_document_id
    and owner_id = v_account_owner_id
    and status = p_expected_document_status
  returning status into v_document_status;

  if not found then
    raise exception using errcode = 'P0001', message = 'BILLING_DOCUMENT_STATUS_CONFLICT';
  end if;

  v_new_used := v_ledger_used + 1;

  update public.billing_entitlements
  set quantity_used = v_new_used,
      exhausted_at = case
        when v_new_used >= quantity_total then coalesce(exhausted_at, now())
        else null
      end,
      updated_at = now()
  where id = p_entitlement_id;

  insert into public.audit_events (
    actor_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values (
    p_actor_user_id,
    'document',
    p_document_id,
    'billing.document_workflow_consumed',
    jsonb_build_object(
      'billing_account_id', p_billing_account_id,
      'entitlement_id', p_entitlement_id,
      'usage_event_id', v_usage_event_id,
      'quantity_used', v_new_used,
      'quantity_limit', v_entitlement.quantity_total,
      'period_start', v_period_start,
      'period_end', v_period_end
    )
  );

  return query select
    v_usage_event_id,
    v_new_used,
    v_entitlement.quantity_total,
    case when v_entitlement.is_unlimited then null::integer else greatest(v_entitlement.quantity_total - v_new_used, 0) end,
    v_document_status,
    false;
end;
$$;

create or replace function public.reverse_billing_usage_event(
  p_usage_event_id uuid,
  p_idempotency_key text,
  p_reason text,
  p_actor_user_id uuid default null
)
returns table (
  reversal_event_id uuid,
  quantity_used integer,
  quantity_limit integer,
  quantity_remaining integer,
  was_already_reversed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_original public.billing_usage_events%rowtype;
  v_existing public.billing_usage_events%rowtype;
  v_entitlement public.billing_entitlements%rowtype;
  v_reversal_id uuid;
  v_new_used integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'BILLING_SERVICE_ROLE_REQUIRED';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception using errcode = '22023', message = 'BILLING_IDEMPOTENCY_KEY_REQUIRED';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception using errcode = '22023', message = 'BILLING_REVERSAL_REASON_REQUIRED';
  end if;

  select events.*
  into v_original
  from public.billing_usage_events events
  where events.id = p_usage_event_id
  for update;

  if not found or v_original.event_kind <> 'consume' then
    raise exception using errcode = 'P0002', message = 'BILLING_CONSUMPTION_EVENT_NOT_FOUND';
  end if;

  select events.*
  into v_existing
  from public.billing_usage_events events
  where events.reversed_usage_event_id = p_usage_event_id
    and events.event_kind = 'reverse';

  if found then
    select entitlements.*
    into v_entitlement
    from public.billing_entitlements entitlements
    where entitlements.id = v_original.entitlement_id;

    return query select
      v_existing.id,
      v_entitlement.quantity_used,
      v_entitlement.quantity_total,
      case when v_entitlement.is_unlimited then null::integer else greatest(v_entitlement.quantity_total - v_entitlement.quantity_used, 0) end,
      true;
    return;
  end if;

  select entitlements.*
  into v_entitlement
  from public.billing_entitlements entitlements
  where entitlements.id = v_original.entitlement_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'BILLING_ENTITLEMENT_NOT_FOUND';
  end if;

  if (not v_entitlement.is_unlimited and v_entitlement.quantity_total is null)
     or v_entitlement.quantity_used < v_original.quantity_delta then
    raise exception using errcode = 'P0001', message = 'BILLING_REVERSAL_BALANCE_INVALID';
  end if;

  insert into public.billing_usage_events (
    billing_account_id,
    subscription_id,
    subscription_item_id,
    entitlement_id,
    document_id,
    metric_code,
    product_flow_mode_snapshot,
    document_type_snapshot,
    event_kind,
    quantity_delta,
    period_start,
    period_end,
    idempotency_key,
    reversed_usage_event_id,
    source,
    reason,
    actor_user_id,
    metadata
  )
  values (
    v_original.billing_account_id,
    v_original.subscription_id,
    v_original.subscription_item_id,
    v_original.entitlement_id,
    v_original.document_id,
    v_original.metric_code,
    v_original.product_flow_mode_snapshot,
    v_original.document_type_snapshot,
    'reverse',
    -v_original.quantity_delta,
    v_original.period_start,
    v_original.period_end,
    p_idempotency_key,
    v_original.id,
    'support_reversal',
    p_reason,
    p_actor_user_id,
    jsonb_build_object('original_usage_event_id', v_original.id)
  )
  returning id into v_reversal_id;

  v_new_used := greatest(v_entitlement.quantity_used - v_original.quantity_delta, 0);

  update public.billing_entitlements
  set quantity_used = v_new_used,
      exhausted_at = case
        when v_new_used >= quantity_total then exhausted_at
        else null
      end,
      updated_at = now()
  where id = v_original.entitlement_id;

  insert into public.audit_events (
    actor_id,
    entity_type,
    entity_id,
    action,
    metadata
  )
  values (
    p_actor_user_id,
    'document',
    v_original.document_id,
    'billing.document_workflow_reversed',
    jsonb_build_object(
      'billing_account_id', v_original.billing_account_id,
      'entitlement_id', v_original.entitlement_id,
      'original_usage_event_id', v_original.id,
      'reversal_usage_event_id', v_reversal_id,
      'reason', p_reason,
      'quantity_used', v_new_used,
      'quantity_limit', v_entitlement.quantity_total
    )
  );

  return query select
    v_reversal_id,
    v_new_used,
    v_entitlement.quantity_total,
    case when v_entitlement.is_unlimited then null::integer else greatest(v_entitlement.quantity_total - v_new_used, 0) end,
    false;
end;
$$;
