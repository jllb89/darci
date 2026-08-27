begin;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
set role service_role;
set row_security = on;

do $$
declare
  v_verified_mapping_count integer;
  v_portal_count integer;
begin
  if not exists (
    select 1 from public.billing_catalog_prices
    where price_code = 'member_starter_monthly'
      and unit_amount_cents = 4900
      and usage_limit_quantity = 3
      and is_active = true
  ) or not exists (
    select 1 from public.billing_catalog_prices
    where price_code = 'member_plus_monthly'
      and unit_amount_cents = 9900
      and usage_limit_quantity = 10
      and is_active = true
  ) or not exists (
    select 1 from public.billing_catalog_prices
    where price_code = 'member_volume_monthly'
      and unit_amount_cents = 19900
      and usage_limit_quantity = 25
      and is_active = true
  ) then
    raise exception 'Approved member prices or allowances do not match Phase 2 policy';
  end if;

  select count(*) into v_verified_mapping_count
  from public.billing_provider_price_mappings mappings
  join public.billing_catalog_prices prices on prices.id = mappings.catalog_price_id
  where mappings.provider = 'stripe'
    and mappings.provider_environment = 'test'
    and mappings.status = 'verified'
    and prices.price_code in (
      'member_starter_monthly',
      'member_plus_monthly',
      'member_volume_monthly'
    );

  if v_verified_mapping_count <> 3 then
    raise exception 'Expected three verified Stripe test Price mappings';
  end if;

  select count(*) into v_portal_count
  from public.billing_provider_configurations
  where provider = 'stripe'
    and provider_environment = 'test'
    and configuration_kind = 'customer_portal'
    and status = 'verified';

  if v_portal_count <> 1 then
    raise exception 'Expected one verified Stripe test Customer Portal configuration';
  end if;
end
$$;

insert into public.users (
  id,
  supabase_user_id,
  email,
  role,
  status,
  email_confirmed_at
)
values (
  'f7000000-0000-0000-0000-000000000001',
  'f7100000-0000-0000-0000-000000000001',
  'phase23-member@example.com',
  'member',
  'active',
  now()
);

insert into public.billing_accounts (
  id,
  owner_user_id,
  account_key,
  status,
  is_default,
  billing_email
)
values (
  'f7200000-0000-0000-0000-000000000001',
  'f7000000-0000-0000-0000-000000000001',
  'phase23',
  'active',
  false,
  'phase23-member@example.com'
);

do $$
declare
  v_mapping record;
  v_result record;
  v_subscription_count integer;
  v_entitlement_count integer;
begin
  select mappings.provider_price_id
  into v_mapping
  from public.billing_provider_price_mappings mappings
  join public.billing_catalog_prices prices on prices.id = mappings.catalog_price_id
  where prices.price_code = 'member_starter_monthly'
    and mappings.provider_environment = 'test'
    and mappings.status = 'verified';

  select * into v_result
  from public.apply_stripe_member_subscription_snapshot(
    'f7200000-0000-0000-0000-000000000001',
    'f7000000-0000-0000-0000-000000000001',
    'cus_phase23_test',
    'sub_phase23_test',
    v_mapping.provider_price_id,
    'active',
    date_trunc('second', now()),
    date_trunc('second', now()) + interval '1 month',
    false,
    null,
    null,
    null,
    'in_phase23_test',
    'paid',
    4900,
    'USD',
    'evt_phase23_1'
  );

  if v_result.internal_status <> 'active'
     or v_result.entitlement_status <> 'active'
     or v_result.quantity_limit <> 3
     or v_result.quantity_used <> 0 then
    raise exception 'Trusted Stripe snapshot did not activate the Starter entitlement';
  end if;

  -- The same provider snapshot is idempotent and must update rather than add
  -- another effective subscription or period entitlement.
  perform *
  from public.apply_stripe_member_subscription_snapshot(
    'f7200000-0000-0000-0000-000000000001',
    'f7000000-0000-0000-0000-000000000001',
    'cus_phase23_test',
    'sub_phase23_test',
    v_mapping.provider_price_id,
    'active',
    date_trunc('second', now()),
    date_trunc('second', now()) + interval '1 month',
    false,
    null,
    null,
    null,
    'in_phase23_test',
    'paid',
    4900,
    'USD',
    'evt_phase23_2'
  );

  select count(*) into v_subscription_count
  from public.billing_subscriptions
  where provider_environment = 'test'
    and provider_subscription_id = 'sub_phase23_test';

  select count(*) into v_entitlement_count
  from public.billing_entitlements
  where billing_account_id = 'f7200000-0000-0000-0000-000000000001'
    and entitlement_type = 'document_workflow_capacity';

  if v_subscription_count <> 1 or v_entitlement_count <> 1 then
    raise exception 'Stripe fulfillment must remain idempotent';
  end if;
end
$$;

insert into public.stripe_webhook_events (
  id,
  provider,
  provider_environment,
  event_id,
  event_type,
  livemode,
  status,
  payload,
  next_attempt_at
)
values (
  'f7300000-0000-0000-0000-000000000001',
  'stripe',
  'test',
  'evt_phase23_lease',
  'invoice.paid',
  false,
  'received',
  '{"created": 1}'::jsonb,
  now()
);

do $$
declare
  v_claim public.stripe_webhook_events%rowtype;
  v_second_claim public.stripe_webhook_events%rowtype;
  v_resolved public.stripe_webhook_events%rowtype;
begin
  select * into v_claim
  from public.claim_stripe_webhook_event(
    'f7300000-0000-0000-0000-000000000001',
    'phase23-test-worker',
    60,
    8
  );

  if v_claim.status <> 'processing' or v_claim.attempt_count <> 1 then
    raise exception 'Webhook event was not leased exactly once';
  end if;

  select * into v_second_claim
  from public.claim_stripe_webhook_event(
    'f7300000-0000-0000-0000-000000000001',
    'phase23-other-worker',
    60,
    8
  );

  if v_second_claim.id is not null then
    raise exception 'Active webhook lease must block a second claim';
  end if;

  select * into v_resolved
  from public.resolve_stripe_webhook_event(
    'f7300000-0000-0000-0000-000000000001',
    'processed',
    null,
    null,
    null
  );

  if v_resolved.status <> 'processed' or v_resolved.processed_at is null then
    raise exception 'Webhook event resolution did not persist';
  end if;
end
$$;

rollback;
