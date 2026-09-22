-- One payment environment per database. Promotion is explicit and rejects beta billing data.
create table public.billing_runtime_configuration (
  singleton boolean primary key default true check (singleton),
  stripe_environment text not null check (stripe_environment in ('test','live')),
  live_activation_approved boolean not null default false,
  check (stripe_environment <> 'live' or live_activation_approved)
);
insert into public.billing_runtime_configuration(singleton,stripe_environment) values(true,'test');
alter table public.billing_runtime_configuration enable row level security;
revoke all on public.billing_runtime_configuration from public, anon, authenticated, service_role;
grant select on public.billing_runtime_configuration to service_role;

create or replace function public.assert_stripe_runtime_environment(p_environment text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_environment text;
begin
  select stripe_environment into v_environment from public.billing_runtime_configuration where singleton;
  if p_environment is null or p_environment not in ('test','live') or p_environment is distinct from v_environment then
    raise exception 'STRIPE_RUNTIME_ENVIRONMENT_MISMATCH';
  end if;
end;
$$;
revoke all on function public.assert_stripe_runtime_environment(text) from public, anon, authenticated;
grant execute on function public.assert_stripe_runtime_environment(text) to service_role;

create or replace function public.guard_stripe_runtime_row()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(to_jsonb(new)->>'provider', 'stripe') = 'stripe' then
    perform public.assert_stripe_runtime_environment(new.provider_environment);
    if tg_table_name = 'stripe_webhook_events' and
      (to_jsonb(new)->>'livemode')::boolean is distinct from (new.provider_environment = 'live') then
      raise exception 'STRIPE_WEBHOOK_MODE_MISMATCH';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_stripe_runtime_row() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['billing_customers','billing_orders','billing_subscriptions','payment_transactions','stripe_webhook_events'] loop
    execute format('create trigger stripe_runtime_boundary before insert or update on public.%I for each row execute function public.guard_stripe_runtime_row()',t);
  end loop;
end;
$$;

-- Drop the old test-only overload; otherwise callers could still invoke it.
drop function public.apply_stripe_member_subscription_snapshot(uuid,uuid,text,text,text,text,timestamptz,timestamptz,boolean,timestamptz,timestamptz,uuid,text,text,integer,text,text);

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
         prices.usage_limit_quantity
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
    and prices.billing_interval = 'month';

  if not found then
    raise exception using errcode = 'P0002', message = 'STRIPE_MEMBER_PRICE_MAPPING_NOT_FOUND';
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
        is_unlimited = false,
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
      false,
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
      ends_at = least(coalesce(ends_at, p_period_start), p_period_start),
      updated_at = now()
  where subscription_item_id = v_item_id
    and entitlement_type = 'document_workflow_capacity'
    and (starts_at, ends_at) is distinct from (p_period_start, p_period_end)
    and status in ('pending', 'active', 'suspended');

  select entitlements.id, entitlements.quantity_used
  into v_entitlement_id, v_quantity_used
  from public.billing_entitlements entitlements
  where entitlements.subscription_item_id = v_item_id
    and entitlements.entitlement_type = 'document_workflow_capacity'
    and entitlements.starts_at = p_period_start
    and entitlements.ends_at = p_period_end
  for update;

  if found then
    update public.billing_entitlements
    set billing_account_id = p_billing_account_id,
        owner_user_id = p_owner_user_id,
        product_id = v_mapping.product_id,
        price_id = v_mapping.price_id,
        status = v_entitlement_status,
        quantity_total = v_mapping.included_entitlement_quantity,
        is_unlimited = false,
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
      false,
      'month',
      p_period_start,
      p_period_end,
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

create or replace function public.guard_stripe_environment_promotion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stripe_environment is distinct from old.stripe_environment and (
    exists(select 1 from public.billing_subscriptions where provider='stripe' and provider_environment<>new.stripe_environment)
    or exists(select 1 from public.billing_customers where provider='stripe' and provider_environment<>new.stripe_environment)
    or exists(select 1 from public.billing_orders where provider_environment<>new.stripe_environment)
    or exists(select 1 from public.payment_transactions where provider='stripe' and provider_environment<>new.stripe_environment)
    or exists(select 1 from public.stripe_webhook_events where provider='stripe' and provider_environment<>new.stripe_environment)
  ) then raise exception 'STRIPE_ENVIRONMENT_PROMOTION_REQUIRES_CLEAN_DATABASE'; end if;
  return new;
end;
$$;
revoke all on function public.guard_stripe_environment_promotion() from public,anon,authenticated;
create trigger stripe_environment_promotion before update on public.billing_runtime_configuration
  for each row execute function public.guard_stripe_environment_promotion();
