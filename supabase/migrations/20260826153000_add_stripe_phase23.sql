-- Stripe roadmap Phase 2/3: approve member prices, isolate provider
-- environments, and add durable Checkout/webhook fulfillment primitives.

-- ---------------------------------------------------------------------------
-- Approved member pricing. Rows stay inactive until the catalog sync command
-- creates and verifies the matching Stripe test objects.
-- ---------------------------------------------------------------------------

update public.billing_catalog_prices
set unit_amount_cents = case price_code
      when 'member_starter_monthly' then 4900
      when 'member_plus_monthly' then 9900
      when 'member_volume_monthly' then 19900
    end,
    metadata = metadata || jsonb_build_object(
      'pricing_status', 'approved',
      'price_approved_at', '2026-08-26',
      'price_currency', 'USD'
    ),
    updated_at = now()
where price_code in (
  'member_starter_monthly',
  'member_plus_monthly',
  'member_volume_monthly'
);

-- ---------------------------------------------------------------------------
-- Test/live isolation for provider-owned customer and lifecycle objects.
-- ---------------------------------------------------------------------------

alter table public.billing_customers
  add column if not exists provider_environment text not null default 'test';

alter table public.billing_customers
  drop constraint if exists billing_customers_provider_environment_check;
alter table public.billing_customers
  add constraint billing_customers_provider_environment_check
  check (provider_environment in ('test', 'live'));

alter table public.billing_customers
  drop constraint if exists billing_customers_provider_customer_unique;
alter table public.billing_customers
  add constraint billing_customers_provider_environment_customer_unique
  unique (provider, provider_environment, provider_customer_id);

drop index if exists public.ux_billing_customers_default_per_account_provider;
create unique index ux_billing_customers_default_per_account_provider_environment
  on public.billing_customers(billing_account_id, provider, provider_environment)
  where is_default = true;

alter table public.billing_orders
  add column if not exists provider_environment text not null default 'test',
  add column if not exists checkout_idempotency_key text;

alter table public.billing_orders
  drop constraint if exists billing_orders_provider_environment_check;
alter table public.billing_orders
  add constraint billing_orders_provider_environment_check
  check (provider_environment in ('test', 'live'));

alter table public.billing_orders
  drop constraint if exists billing_orders_checkout_idempotency_key_check;
alter table public.billing_orders
  add constraint billing_orders_checkout_idempotency_key_check
  check (
    checkout_idempotency_key is null
    or checkout_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
  );

create unique index if not exists ux_billing_orders_checkout_idempotency
  on public.billing_orders(billing_account_id, provider_environment, checkout_idempotency_key)
  where checkout_idempotency_key is not null;

create index if not exists idx_billing_orders_pending_checkout
  on public.billing_orders(billing_account_id, provider_environment, status, created_at desc)
  where order_kind = 'subscription_checkout'
    and status in ('draft', 'pending_payment');

alter table public.billing_subscriptions
  add column if not exists provider_environment text not null default 'test';

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_provider_environment_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_provider_environment_check
  check (provider_environment in ('test', 'live'));

drop index if exists public.ux_billing_subscriptions_provider_subscription;
create unique index ux_billing_subscriptions_provider_environment_subscription
  on public.billing_subscriptions(provider, provider_environment, provider_subscription_id)
  where provider_subscription_id is not null;

alter table public.payment_transactions
  add column if not exists provider_environment text not null default 'test';

alter table public.payment_transactions
  drop constraint if exists payment_transactions_provider_environment_check;
alter table public.payment_transactions
  add constraint payment_transactions_provider_environment_check
  check (provider_environment in ('test', 'live'));

alter table public.payment_transactions
  drop constraint if exists payment_transactions_provider_external_unique;
alter table public.payment_transactions
  add constraint payment_transactions_provider_environment_external_unique
  unique (provider, provider_environment, transaction_kind, external_id);

alter table public.stripe_webhook_events
  add column if not exists provider_environment text not null default 'test';

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_provider_environment_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_provider_environment_check
  check (provider_environment in ('test', 'live'));

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_provider_event_unique;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_provider_environment_event_unique
  unique (provider, provider_environment, event_id);

-- Provider-side configuration identities such as Customer Portal
-- configurations belong in data, not source or environment-ambiguous columns.
create table if not exists public.billing_provider_configurations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_environment text not null,
  configuration_kind text not null,
  provider_configuration_id text not null,
  status text not null default 'verified',
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_configurations_provider_check
    check (provider in ('stripe')),
  constraint billing_provider_configurations_environment_check
    check (provider_environment in ('test', 'live')),
  constraint billing_provider_configurations_kind_check
    check (configuration_kind in ('customer_portal')),
  constraint billing_provider_configurations_status_check
    check (status in ('pending', 'verified', 'disabled')),
  constraint billing_provider_configurations_id_check
    check (btrim(provider_configuration_id) <> ''),
  constraint billing_provider_configurations_scope_unique
    unique (provider, provider_environment, configuration_kind),
  constraint billing_provider_configurations_object_unique
    unique (provider, provider_environment, provider_configuration_id)
);

alter table public.billing_provider_configurations enable row level security;

drop policy if exists "billing_provider_configurations_service_role_access"
  on public.billing_provider_configurations;
create policy "billing_provider_configurations_service_role_access"
  on public.billing_provider_configurations
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.billing_provider_configurations from public, anon, authenticated;
grant all on table public.billing_provider_configurations to service_role;

drop trigger if exists trg_billing_provider_configurations_touch_updated_at
  on public.billing_provider_configurations;
create trigger trg_billing_provider_configurations_touch_updated_at
before update on public.billing_provider_configurations
for each row execute function public.touch_updated_at();

-- One membership subscription has one current member item. The partial index
-- leaves future non-member/multi-item products available as an extension.
create unique index if not exists ux_billing_subscription_items_member_single
  on public.billing_subscription_items(subscription_id)
  where role_context = 'member';

create unique index if not exists ux_billing_entitlements_member_period
  on public.billing_entitlements(subscription_item_id, entitlement_type, starts_at, ends_at)
  where subscription_item_id is not null
    and entitlement_type = 'document_workflow_capacity';

-- ---------------------------------------------------------------------------
-- Durable webhook leasing. Only the service role can claim or resolve work.
-- ---------------------------------------------------------------------------

create or replace function public.claim_stripe_webhook_event(
  p_event_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 60,
  p_max_attempts integer default 8
)
returns public.stripe_webhook_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'BILLING_SERVICE_ROLE_REQUIRED';
  end if;

  if p_worker_id is null or btrim(p_worker_id) = '' then
    raise exception using errcode = '22023', message = 'STRIPE_WORKER_ID_REQUIRED';
  end if;

  select events.*
  into v_event
  from public.stripe_webhook_events events
  where events.id = p_event_id
  for update skip locked;

  if not found
     or v_event.status in ('processed', 'ignored', 'dead_lettered')
     or (v_event.next_attempt_at is not null and v_event.next_attempt_at > now())
     or (
       v_event.status = 'processing'
       and v_event.processing_lease_expires_at is not null
       and v_event.processing_lease_expires_at > now()
     ) then
    return null;
  end if;

  if v_event.attempt_count >= greatest(p_max_attempts, 1) then
    update public.stripe_webhook_events
    set status = 'dead_lettered',
        dead_lettered_at = coalesce(dead_lettered_at, now()),
        processing_started_at = null,
        processing_lease_expires_at = null,
        last_error_code = coalesce(last_error_code, 'max_attempts_exceeded'),
        metadata = metadata || jsonb_build_object('last_worker_id', p_worker_id),
        updated_at = now()
    where id = p_event_id
    returning * into v_event;
    return null;
  end if;

  update public.stripe_webhook_events
  set status = 'processing',
      attempt_count = attempt_count + 1,
      processing_started_at = now(),
      processing_lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 10)),
      metadata = metadata || jsonb_build_object('last_worker_id', p_worker_id),
      updated_at = now()
  where id = p_event_id
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.resolve_stripe_webhook_event(
  p_event_id uuid,
  p_status text,
  p_error_code text default null,
  p_error_message text default null,
  p_retry_after_seconds integer default null
)
returns public.stripe_webhook_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.stripe_webhook_events%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'BILLING_SERVICE_ROLE_REQUIRED';
  end if;

  if p_status not in ('processed', 'failed', 'ignored', 'dead_lettered') then
    raise exception using errcode = '22023', message = 'STRIPE_WEBHOOK_RESOLUTION_STATUS_INVALID';
  end if;

  update public.stripe_webhook_events
  set status = p_status,
      processed_at = case when p_status in ('processed', 'ignored') then now() else processed_at end,
      error_message = case when p_status = 'failed' then left(p_error_message, 2000) else null end,
      last_error_code = case when p_status = 'failed' then left(p_error_code, 120) else null end,
      next_attempt_at = case
        when p_status = 'failed' then now() + make_interval(secs => greatest(coalesce(p_retry_after_seconds, 30), 5))
        else null
      end,
      processing_started_at = null,
      processing_lease_expires_at = null,
      dead_lettered_at = case when p_status = 'dead_lettered' then coalesce(dead_lettered_at, now()) else dead_lettered_at end,
      updated_at = now()
  where id = p_event_id
  returning * into v_event;

  if not found then
    raise exception using errcode = 'P0002', message = 'STRIPE_WEBHOOK_EVENT_NOT_FOUND';
  end if;

  return v_event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply one Stripe subscription snapshot transactionally. Stripe object
-- retrieval and signature verification occur in the backend; this function
-- owns internal fulfillment consistency and is idempotent by provider IDs.
-- ---------------------------------------------------------------------------

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
  p_event_id text default null
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

  perform pg_advisory_xact_lock(hashtextextended('stripe:test:' || p_provider_subscription_id, 0));

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
    and mappings.provider_environment = 'test'
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
    'test',
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
    and subscriptions.provider_environment = 'test'
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
      'test',
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
      and provider_environment = 'test';

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
      'test',
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

revoke all on function public.claim_stripe_webhook_event(uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.resolve_stripe_webhook_event(uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.apply_stripe_member_subscription_snapshot(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, uuid, text, text, integer, text, text
) from public, anon, authenticated;

grant execute on function public.claim_stripe_webhook_event(uuid, text, integer, integer)
  to service_role;
grant execute on function public.resolve_stripe_webhook_event(uuid, text, text, text, integer)
  to service_role;
grant execute on function public.apply_stripe_member_subscription_snapshot(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, uuid, text, text, integer, text, text
) to service_role;

comment on table public.billing_provider_configurations is
'Environment-specific provider configuration IDs, including the restricted Stripe Customer Portal configuration.';

comment on function public.apply_stripe_member_subscription_snapshot(
  uuid, uuid, text, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, uuid, text, text, integer, text, text
) is
'Transactionally synchronizes the trusted Stripe test subscription snapshot, member plan item, period entitlement, order, invoice, and audit evidence.';
