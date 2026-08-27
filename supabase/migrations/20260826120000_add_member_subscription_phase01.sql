-- Stripe roadmap Phase 0/1: lock the member-only payer model and add the
-- catalog, usage, provider-mapping, webhook, and final-package release
-- foundations required by the 3/10/25 document-workflow plans.
--
-- This migration intentionally does not create Stripe objects, activate a
-- purchasable price, or integrate billing into document controllers. Those
-- steps belong to later roadmap phases.

-- ---------------------------------------------------------------------------
-- Correct the catalog vocabulary without removing dormant future scaffolding.
-- ---------------------------------------------------------------------------

alter table public.billing_catalog_products
  drop constraint if exists billing_catalog_products_product_family_check;

alter table public.billing_catalog_products
  add constraint billing_catalog_products_product_family_check
  check (
    product_family in (
      'member_membership',
      'trust_registration',
      'trust_activation',
      'dynamic_poa',
      'pro_credit_bundle',
      'notary_membership'
    )
  );

alter table public.billing_catalog_products
  drop constraint if exists billing_catalog_products_role_scope_check;

alter table public.billing_catalog_products
  add constraint billing_catalog_products_role_scope_check
  check (role_scope in ('member', 'consumer', 'pro', 'notary', 'shared'));

alter table public.billing_catalog_prices
  drop constraint if exists billing_catalog_prices_included_entitlement_type_check;

alter table public.billing_catalog_prices
  add constraint billing_catalog_prices_included_entitlement_type_check
  check (
    included_entitlement_type is null
    or included_entitlement_type in (
      'document_workflow_capacity',
      'trust_registration',
      'document_activation',
      'notary_signing_capacity'
    )
  );

alter table public.billing_catalog_prices
  drop constraint if exists billing_catalog_prices_active_amount_check;

alter table public.billing_catalog_prices
  add constraint billing_catalog_prices_active_amount_check
  check (not is_active or unit_amount_cents > 0);

alter table public.billing_orders
  drop constraint if exists billing_orders_role_context_check;

alter table public.billing_orders
  add constraint billing_orders_role_context_check
  check (role_context in ('member', 'consumer', 'pro', 'notary', 'shared'));

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_role_context_check;

alter table public.billing_subscriptions
  add constraint billing_subscriptions_role_context_check
  check (role_context in ('member', 'consumer', 'pro', 'notary', 'shared'));

alter table public.billing_order_items
  drop constraint if exists billing_order_items_role_context_check;

alter table public.billing_order_items
  add constraint billing_order_items_role_context_check
  check (role_context in ('member', 'consumer', 'pro', 'notary', 'shared'));

alter table public.billing_subscription_items
  drop constraint if exists billing_subscription_items_role_context_check;

alter table public.billing_subscription_items
  add constraint billing_subscription_items_role_context_check
  check (role_context in ('member', 'consumer', 'pro', 'notary', 'shared'));

alter table public.billing_payment_requests
  drop constraint if exists billing_payment_requests_role_context_check;

alter table public.billing_payment_requests
  add constraint billing_payment_requests_role_context_check
  check (role_context in ('member', 'consumer', 'pro', 'notary', 'shared'));

alter table public.billing_entitlements
  drop constraint if exists billing_entitlements_entitlement_type_check;

alter table public.billing_entitlements
  add constraint billing_entitlements_entitlement_type_check
  check (
    entitlement_type in (
      'document_workflow_capacity',
      'trust_registration',
      'document_activation',
      'notary_signing_capacity'
    )
  );

-- The historical products remain available as schema extension points, but
-- none may be offered or fulfilled in the current member-only scope.
update public.billing_catalog_prices
set is_active = false,
    metadata = metadata || jsonb_build_object(
      'scope_status', 'deferred',
      'deferred_at', '2026-08-26',
      'deferred_reason', 'member_only_subscription_scope'
    ),
    updated_at = now()
where is_active = true;

update public.billing_catalog_products
set is_active = false,
    metadata = metadata || jsonb_build_object(
      'scope_status', 'deferred',
      'deferred_at', '2026-08-26',
      'deferred_reason', 'member_only_subscription_scope'
    ),
    updated_at = now()
where product_code in (
  'trust_registration',
  'trust_activation',
  'dynamic_poa_activation',
  'pro_credit_bundle',
  'notary_membership'
);

insert into public.billing_catalog_products (
  product_code,
  display_name,
  description,
  product_family,
  billing_model,
  role_scope,
  product_flow_mode,
  document_type,
  is_active,
  sort_order,
  metadata,
  created_at,
  updated_at
)
values (
  'member_membership',
  'DARCi Member Membership',
  'One member membership with volume-only monthly tiers for document workflows.',
  'member_membership',
  'recurring',
  'member',
  null,
  null,
  true,
  10,
  jsonb_build_object(
    'source', 'stripe_phase01',
    'scope_status', 'current',
    'features_identical_across_tiers', true,
    'usage_metric', 'document_workflow'
  ),
  now(),
  now()
)
on conflict (product_code) do update
set display_name = excluded.display_name,
    description = excluded.description,
    product_family = excluded.product_family,
    billing_model = excluded.billing_model,
    role_scope = excluded.role_scope,
    product_flow_mode = excluded.product_flow_mode,
    document_type = excluded.document_type,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    metadata = public.billing_catalog_products.metadata || excluded.metadata,
    updated_at = now();

-- Prices are deliberately zero-valued and inactive placeholders because the
-- client has not approved amounts. The active-price constraint prevents them
-- from becoming purchasable until a later migration sets a positive amount.
insert into public.billing_catalog_prices (
  product_id,
  price_code,
  display_name,
  provider,
  provider_price_id,
  billing_interval,
  interval_count,
  currency_code,
  unit_amount_cents,
  included_entitlement_type,
  included_entitlement_quantity,
  included_entitlement_period,
  included_signer_quantity,
  granted_credit_quantity,
  usage_limit_quantity,
  is_unlimited,
  is_active,
  sort_order,
  metadata,
  created_at,
  updated_at
)
values
  (
    (select id from public.billing_catalog_products where product_code = 'member_membership'),
    'member_starter_monthly',
    'Member Starter Monthly',
    'stripe',
    null,
    'month',
    1,
    'USD',
    0,
    'document_workflow_capacity',
    3,
    'month',
    0,
    0,
    3,
    false,
    false,
    10,
    jsonb_build_object(
      'source', 'stripe_phase01',
      'membership_tier', 'starter',
      'pricing_status', 'amount_approval_required',
      'usage_metric', 'document_workflow'
    ),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'member_membership'),
    'member_plus_monthly',
    'Member Plus Monthly',
    'stripe',
    null,
    'month',
    1,
    'USD',
    0,
    'document_workflow_capacity',
    10,
    'month',
    0,
    0,
    10,
    false,
    false,
    20,
    jsonb_build_object(
      'source', 'stripe_phase01',
      'membership_tier', 'plus',
      'pricing_status', 'amount_approval_required',
      'usage_metric', 'document_workflow'
    ),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'member_membership'),
    'member_volume_monthly',
    'Member Volume Monthly',
    'stripe',
    null,
    'month',
    1,
    'USD',
    0,
    'document_workflow_capacity',
    25,
    'month',
    0,
    0,
    25,
    false,
    false,
    30,
    jsonb_build_object(
      'source', 'stripe_phase01',
      'membership_tier', 'volume',
      'pricing_status', 'amount_approval_required',
      'usage_metric', 'document_workflow'
    ),
    now(),
    now()
  )
on conflict (price_code) do update
set product_id = excluded.product_id,
    display_name = excluded.display_name,
    provider = excluded.provider,
    provider_price_id = null,
    billing_interval = excluded.billing_interval,
    interval_count = excluded.interval_count,
    currency_code = excluded.currency_code,
    unit_amount_cents = excluded.unit_amount_cents,
    included_entitlement_type = excluded.included_entitlement_type,
    included_entitlement_quantity = excluded.included_entitlement_quantity,
    included_entitlement_period = excluded.included_entitlement_period,
    included_signer_quantity = excluded.included_signer_quantity,
    granted_credit_quantity = excluded.granted_credit_quantity,
    usage_limit_quantity = excluded.usage_limit_quantity,
    is_unlimited = excluded.is_unlimited,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    metadata = public.billing_catalog_prices.metadata || excluded.metadata,
    updated_at = now();

-- Authenticated catalog reads expose only current, activated products/prices.
drop policy if exists "billing_catalog_products_read" on public.billing_catalog_products;
create policy "billing_catalog_products_read" on public.billing_catalog_products
  for select using (is_active = true);

drop policy if exists "billing_catalog_prices_read" on public.billing_catalog_prices;
create policy "billing_catalog_prices_read" on public.billing_catalog_prices
  for select using (is_active = true);

-- ---------------------------------------------------------------------------
-- Keep Stripe test/live object identities separate from internal price policy.
-- ---------------------------------------------------------------------------

create table if not exists public.billing_provider_price_mappings (
  id uuid primary key default gen_random_uuid(),
  catalog_price_id uuid not null references public.billing_catalog_prices(id) on delete cascade,
  provider text not null default 'stripe',
  provider_environment text not null,
  provider_product_id text not null,
  provider_price_id text not null,
  status text not null default 'pending',
  verified_at timestamptz,
  disabled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_provider_price_mappings_provider_check
    check (provider in ('stripe')),
  constraint billing_provider_price_mappings_environment_check
    check (provider_environment in ('test', 'live')),
  constraint billing_provider_price_mappings_status_check
    check (status in ('pending', 'verified', 'disabled')),
  constraint billing_provider_price_mappings_product_id_check
    check (btrim(provider_product_id) <> ''),
  constraint billing_provider_price_mappings_price_id_check
    check (btrim(provider_price_id) <> '')
);

create unique index if not exists ux_billing_provider_price_mapping_catalog_environment
  on public.billing_provider_price_mappings(catalog_price_id, provider, provider_environment)
  where status <> 'disabled';

create unique index if not exists ux_billing_provider_price_mapping_provider_price
  on public.billing_provider_price_mappings(provider, provider_environment, provider_price_id);

create index if not exists idx_billing_provider_price_mapping_status
  on public.billing_provider_price_mappings(provider, provider_environment, status, catalog_price_id);

-- Only one effective member membership may exist for a billing account while
-- a checkout/subscription is nonterminal.
create unique index if not exists ux_billing_subscriptions_effective_member_membership
  on public.billing_subscriptions(billing_account_id)
  where role_context = 'member'
    and status in ('pending', 'trialing', 'active', 'past_due', 'paused', 'incomplete', 'unpaid');

-- ---------------------------------------------------------------------------
-- Immutable, generic usage evidence for current and future billing metrics.
-- ---------------------------------------------------------------------------

create table if not exists public.billing_usage_events (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  subscription_item_id uuid references public.billing_subscription_items(id) on delete set null,
  entitlement_id uuid not null references public.billing_entitlements(id) on delete restrict,
  document_id uuid not null references public.documents(id) on delete restrict,
  metric_code text not null,
  product_flow_mode_snapshot text,
  document_type_snapshot text,
  event_kind text not null,
  quantity_delta integer not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  idempotency_key text not null,
  reversed_usage_event_id uuid references public.billing_usage_events(id) on delete restrict,
  source text not null,
  reason text,
  actor_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint billing_usage_events_metric_code_check
    check (metric_code ~ '^[a-z0-9_]+$'),
  constraint billing_usage_events_event_kind_check
    check (event_kind in ('consume', 'reverse', 'adjustment')),
  constraint billing_usage_events_quantity_check
    check (
      (event_kind = 'consume' and quantity_delta > 0 and reversed_usage_event_id is null)
      or (event_kind = 'reverse' and quantity_delta < 0 and reversed_usage_event_id is not null)
      or (event_kind = 'adjustment' and quantity_delta <> 0)
    ),
  constraint billing_usage_events_period_check
    check (period_end > period_start),
  constraint billing_usage_events_idempotency_key_check
    check (btrim(idempotency_key) <> ''),
  constraint billing_usage_events_source_check
    check (source ~ '^[a-z0-9_]+$')
);

create unique index if not exists ux_billing_usage_events_idempotency
  on public.billing_usage_events(billing_account_id, idempotency_key);

create unique index if not exists ux_billing_usage_events_document_consume
  on public.billing_usage_events(billing_account_id, metric_code, document_id)
  where event_kind = 'consume';

create unique index if not exists ux_billing_usage_events_single_reversal
  on public.billing_usage_events(reversed_usage_event_id)
  where event_kind = 'reverse';

create index if not exists idx_billing_usage_events_entitlement_period
  on public.billing_usage_events(entitlement_id, metric_code, period_start, period_end, occurred_at);

create index if not exists idx_billing_usage_events_document
  on public.billing_usage_events(document_id, metric_code, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Explicit member/public final-package release state.
-- ---------------------------------------------------------------------------

create table if not exists public.document_release_controls (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete restrict,
  document_hash_record_id uuid not null references public.document_hash_records(id) on delete restrict,
  release_status text not null default 'pending',
  hold_reason text,
  held_at timestamptz,
  released_at timestamptz,
  changed_by_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_release_controls_status_check
    check (release_status in ('pending', 'billing_held', 'released')),
  constraint document_release_controls_hold_reason_check
    check (
      (release_status = 'billing_held' and hold_reason is not null and btrim(hold_reason) <> '')
      or release_status <> 'billing_held'
    ),
  constraint document_release_controls_timestamps_check
    check (
      (release_status <> 'billing_held' or held_at is not null)
      and (release_status <> 'released' or released_at is not null)
    )
);

create unique index if not exists ux_document_release_controls_version
  on public.document_release_controls(document_version_id);

create unique index if not exists ux_document_release_controls_hash
  on public.document_release_controls(document_hash_record_id);

create index if not exists idx_document_release_controls_status
  on public.document_release_controls(release_status, updated_at);

-- ---------------------------------------------------------------------------
-- Durable Stripe webhook retry and retention fields.
-- ---------------------------------------------------------------------------

alter table public.stripe_webhook_events
  add column if not exists object_id text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists processing_lease_expires_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists dead_lettered_at timestamptz,
  add column if not exists payload_retention_until timestamptz;

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_status_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_status_check
  check (status in ('received', 'processing', 'processed', 'failed', 'ignored', 'dead_lettered'));

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_attempt_count_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_attempt_count_check
  check (attempt_count >= 0);

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_processing_lease_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_processing_lease_check
  check (
    processing_lease_expires_at is null
    or processing_started_at is null
    or processing_lease_expires_at > processing_started_at
  );

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_dead_letter_check;

alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_dead_letter_check
  check (
    (status = 'dead_lettered' and dead_lettered_at is not null)
    or status <> 'dead_lettered'
  );

create index if not exists idx_stripe_webhook_events_retry
  on public.stripe_webhook_events(status, next_attempt_at, received_at)
  where status in ('received', 'failed');

create index if not exists idx_stripe_webhook_events_object
  on public.stripe_webhook_events(object_id, event_type, received_at desc)
  where object_id is not null;

create index if not exists idx_stripe_webhook_events_retention
  on public.stripe_webhook_events(payload_retention_until)
  where payload_retention_until is not null;

-- ---------------------------------------------------------------------------
-- Server-only atomic usage and release operations.
-- ---------------------------------------------------------------------------

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
       or v_existing.entitlement_id <> p_entitlement_id
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
      greatest(v_ledger_used - v_new_used, 0),
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
      greatest(v_ledger_used - v_new_used, 0),
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
     or v_entitlement.is_unlimited
     or v_entitlement.quantity_total is null then
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
     or now() < v_period_start or now() >= v_period_end then
    raise exception using errcode = 'P0001', message = 'BILLING_PERIOD_NOT_ACTIVE';
  end if;

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

  if v_ledger_used >= v_entitlement.quantity_total then
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
    greatest(v_entitlement.quantity_total - v_new_used, 0),
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
      greatest(v_entitlement.quantity_total - v_entitlement.quantity_used, 0),
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

  if v_entitlement.quantity_total is null
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
    greatest(v_entitlement.quantity_total - v_new_used, 0),
    false;
end;
$$;

create or replace function public.set_document_release_status(
  p_document_id uuid,
  p_document_version_id uuid,
  p_document_hash_record_id uuid,
  p_release_status text,
  p_hold_reason text default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.document_release_controls
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.document_release_controls%rowtype;
  v_result public.document_release_controls%rowtype;
  v_version_is_final boolean;
  v_hash_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'BILLING_SERVICE_ROLE_REQUIRED';
  end if;

  if p_release_status not in ('billing_held', 'released') then
    raise exception using errcode = '22023', message = 'DOCUMENT_RELEASE_STATUS_NOT_ALLOWED';
  end if;

  if p_release_status = 'billing_held'
     and (p_hold_reason is null or btrim(p_hold_reason) = '') then
    raise exception using errcode = '22023', message = 'DOCUMENT_RELEASE_HOLD_REASON_REQUIRED';
  end if;

  select versions.is_final, hashes.status
  into v_version_is_final, v_hash_status
  from public.document_versions versions
  join public.document_hash_records hashes
    on hashes.id = p_document_hash_record_id
   and hashes.document_id = versions.document_id
   and hashes.document_version_id = versions.id
  where versions.id = p_document_version_id
    and versions.document_id = p_document_id;

  if not found or not v_version_is_final or v_hash_status <> 'completed' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_RELEASE_FINALIZATION_NOT_READY';
  end if;

  select controls.*
  into v_current
  from public.document_release_controls controls
  where controls.document_id = p_document_id
  for update;

  if found and v_current.release_status = 'released' and p_release_status = 'billing_held' then
    raise exception using errcode = 'P0001', message = 'DOCUMENT_RELEASE_CANNOT_REHOLD';
  end if;

  if found
     and v_current.release_status = p_release_status
     and v_current.document_version_id = p_document_version_id
     and v_current.document_hash_record_id = p_document_hash_record_id then
    return v_current;
  end if;

  insert into public.document_release_controls (
    document_id,
    document_version_id,
    document_hash_record_id,
    release_status,
    hold_reason,
    held_at,
    released_at,
    changed_by_user_id,
    metadata
  )
  values (
    p_document_id,
    p_document_version_id,
    p_document_hash_record_id,
    p_release_status,
    case when p_release_status = 'billing_held' then p_hold_reason else null end,
    case when p_release_status = 'billing_held' then now() else null end,
    case when p_release_status = 'released' then now() else null end,
    p_actor_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (document_id) do update
  set document_version_id = excluded.document_version_id,
      document_hash_record_id = excluded.document_hash_record_id,
      release_status = excluded.release_status,
      hold_reason = case
        when excluded.release_status = 'billing_held' then excluded.hold_reason
        else null
      end,
      held_at = case
        when excluded.release_status = 'billing_held'
          then coalesce(public.document_release_controls.held_at, excluded.held_at)
        else public.document_release_controls.held_at
      end,
      released_at = case
        when excluded.release_status = 'released'
          then coalesce(public.document_release_controls.released_at, excluded.released_at)
        else public.document_release_controls.released_at
      end,
      changed_by_user_id = excluded.changed_by_user_id,
      metadata = public.document_release_controls.metadata || excluded.metadata,
      updated_at = now()
  returning * into v_result;

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
    case
      when p_release_status = 'billing_held' then 'billing.document_release_held'
      else 'billing.document_released'
    end,
    jsonb_build_object(
      'release_control_id', v_result.id,
      'document_version_id', p_document_version_id,
      'document_hash_record_id', p_document_hash_record_id,
      'release_status', p_release_status,
      'hold_reason', p_hold_reason
    )
  );

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS, grants, triggers, and documentation.
-- ---------------------------------------------------------------------------

alter table public.billing_provider_price_mappings enable row level security;
alter table public.billing_usage_events enable row level security;
alter table public.document_release_controls enable row level security;

drop policy if exists "billing_provider_price_mappings_service_role_access"
  on public.billing_provider_price_mappings;
create policy "billing_provider_price_mappings_service_role_access"
  on public.billing_provider_price_mappings
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_usage_events_select_owner" on public.billing_usage_events;
create policy "billing_usage_events_select_owner" on public.billing_usage_events
  for select using (public.billing_account_owned_by_auth(billing_account_id));

drop policy if exists "billing_usage_events_service_role_access" on public.billing_usage_events;
create policy "billing_usage_events_service_role_access" on public.billing_usage_events
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "document_release_controls_select_visible" on public.document_release_controls;
create policy "document_release_controls_select_visible" on public.document_release_controls
  for select using (
    public.document_owned_by_auth(document_id)
    or exists (
      select 1
      from public.notarization_requests requests
      where requests.document_id = document_release_controls.document_id
        and public.auth_user_matches(requests.assigned_notary_id)
    )
  );

drop policy if exists "document_release_controls_service_role_access" on public.document_release_controls;
create policy "document_release_controls_service_role_access" on public.document_release_controls
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table public.billing_provider_price_mappings from anon, authenticated;
revoke all on table public.billing_usage_events from anon, authenticated;
revoke all on table public.document_release_controls from anon, authenticated;

grant all on table public.billing_provider_price_mappings to service_role;
grant all on table public.billing_usage_events to service_role;
grant all on table public.document_release_controls to service_role;

grant select on table public.billing_usage_events to authenticated;
grant select on table public.document_release_controls to authenticated;

revoke all on function public.consume_member_document_workflow(uuid, uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.reverse_billing_usage_event(uuid, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.set_document_release_status(uuid, uuid, uuid, text, text, uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.consume_member_document_workflow(uuid, uuid, uuid, text, text, text, uuid)
  to service_role;
grant execute on function public.reverse_billing_usage_event(uuid, text, text, uuid)
  to service_role;
grant execute on function public.set_document_release_status(uuid, uuid, uuid, text, text, uuid, jsonb)
  to service_role;

drop trigger if exists trg_billing_provider_price_mappings_touch_updated_at
  on public.billing_provider_price_mappings;
create trigger trg_billing_provider_price_mappings_touch_updated_at
before update on public.billing_provider_price_mappings
for each row execute function public.touch_updated_at();

drop trigger if exists trg_document_release_controls_touch_updated_at
  on public.document_release_controls;
create trigger trg_document_release_controls_touch_updated_at
before update on public.document_release_controls
for each row execute function public.touch_updated_at();

comment on table public.billing_provider_price_mappings is
'Environment-specific Stripe Product/Price mappings. Test and live identifiers must never share one mapping row.';

comment on table public.billing_usage_events is
'Immutable usage evidence for billable metrics. The launch metric document_workflow is consumed once on first successful workflow submission.';

comment on table public.document_release_controls is
'Member/public release state for exact finalized document bytes. billing_held packages remain unavailable to member and public verification until released.';

comment on function public.consume_member_document_workflow(uuid, uuid, uuid, text, text, text, uuid) is
'Service-only atomic allowance consumption and document submission transition for member document workflows.';

comment on function public.reverse_billing_usage_event(uuid, text, text, uuid) is
'Service-only immutable reversal for a confirmed technical or support correction; does not rewind document workflow state.';

comment on function public.set_document_release_status(uuid, uuid, uuid, text, text, uuid, jsonb) is
'Service-only idempotent billing hold/release operation for completed, hashed final document bytes.';

comment on column public.billing_catalog_prices.unit_amount_cents is
'Configured amount in the smallest currency unit. Current member placeholders remain zero and inactive until price approval.';

comment on table public.stripe_webhook_events is
'Minimized Stripe webhook inbox with idempotency, retry lease, dead-letter, provider-object correlation, and payload-retention controls.';
