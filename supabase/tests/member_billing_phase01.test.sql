begin;

select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
set role service_role;
set row_security = on;

do $$
declare
  v_member_product_count integer;
  v_member_price_count integer;
  v_active_deferred_price_count integer;
begin
  select count(*)
  into v_member_product_count
  from public.billing_catalog_products
  where product_code = 'member_membership'
    and product_family = 'member_membership'
    and role_scope = 'member'
    and is_active = true;

  if v_member_product_count <> 1 then
    raise exception 'Expected one active member membership product';
  end if;

  select count(*)
  into v_member_price_count
  from public.billing_catalog_prices prices
  join public.billing_catalog_products products on products.id = prices.product_id
  where products.product_code = 'member_membership'
    and prices.price_code in (
      'member_starter_monthly',
      'member_plus_monthly',
      'member_volume_monthly'
    )
    and prices.billing_interval = 'month'
    and prices.included_entitlement_type = 'document_workflow_capacity'
    and prices.included_entitlement_quantity = prices.usage_limit_quantity
    and prices.usage_limit_quantity in (3, 10, 25)
    and prices.unit_amount_cents in (4900, 9900, 19900)
    and prices.is_active = true;

  if v_member_price_count <> 3 then
    raise exception 'Expected three active approved 3/10/25 member prices';
  end if;

  select count(*)
  into v_active_deferred_price_count
  from public.billing_catalog_prices prices
  join public.billing_catalog_products products on products.id = prices.product_id
  where products.product_code <> 'member_membership'
    and prices.is_active = true;

  if v_active_deferred_price_count <> 0 then
    raise exception 'Deferred catalog prices must be inactive';
  end if;
end
$$;

insert into public.users (id, supabase_user_id, email, role, status)
values
  ('f1000000-0000-0000-0000-000000000001', 'f1100000-0000-0000-0000-000000000001', 'phase01-member@example.com', 'member', 'active'),
  ('f1000000-0000-0000-0000-000000000002', 'f1100000-0000-0000-0000-000000000002', 'phase01-other@example.com', 'member', 'active'),
  ('f1000000-0000-0000-0000-000000000003', 'f1100000-0000-0000-0000-000000000003', 'phase01-notary@example.com', 'notary', 'active');

insert into public.billing_accounts (
  id,
  owner_user_id,
  account_key,
  account_kind,
  status,
  is_default,
  billing_email
)
values (
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'phase01',
  'personal',
  'active',
  false,
  'phase01-member@example.com'
);

insert into public.billing_subscriptions (
  id,
  billing_account_id,
  subscriber_user_id,
  beneficiary_user_id,
  role_context,
  status,
  provider,
  provider_subscription_id,
  started_at,
  current_period_start,
  current_period_end
)
values (
  'f3000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'member',
  'active',
  'stripe',
  'sub_phase01_test',
  now() - interval '1 day',
  now() - interval '1 day',
  now() + interval '29 days'
);

insert into public.billing_subscription_items (
  id,
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
  is_unlimited
)
select
  'f4000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001',
  products.id,
  prices.id,
  'f1000000-0000-0000-0000-000000000001',
  'member',
  products.product_code,
  prices.price_code,
  prices.display_name,
  1,
  'active',
  now() - interval '1 day',
  now() + interval '29 days',
  3,
  3,
  false
from public.billing_catalog_products products
join public.billing_catalog_prices prices on prices.product_id = products.id
where products.product_code = 'member_membership'
  and prices.price_code = 'member_starter_monthly';

insert into public.billing_entitlements (
  id,
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
  activated_at
)
select
  'f5000000-0000-0000-0000-000000000001',
  'f2000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001',
  'f4000000-0000-0000-0000-000000000001',
  products.id,
  prices.id,
  'document_workflow_capacity',
  'active',
  3,
  0,
  false,
  'month',
  now() - interval '1 day',
  now() + interval '29 days',
  now() - interval '1 day'
from public.billing_catalog_products products
join public.billing_catalog_prices prices on prices.product_id = products.id
where products.product_code = 'member_membership'
  and prices.price_code = 'member_starter_monthly';

insert into public.documents (
  id,
  owner_id,
  idn,
  status,
  document_type,
  jurisdiction,
  product_flow_mode
)
values
  ('f6000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'PHASE01-1', 'draft', 'poa_general', 'US-CA', 'poa_only'),
  ('f6000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000001', 'PHASE01-2', 'draft', 'trust_rrr', 'US-CA', 'trust_bundle'),
  ('f6000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000001', 'PHASE01-3', 'draft', 'uploaded_document', 'US-CA', 'notarize_document'),
  ('f6000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000001', 'PHASE01-4', 'draft', 'poa_general', 'US-CA', 'poa_only');

select *
from public.consume_member_document_workflow(
  'f2000000-0000-0000-0000-000000000001',
  'f5000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000001',
  'phase01-submit-1',
  'draft',
  'pending_signature',
  'f1000000-0000-0000-0000-000000000001'
);

do $$
declare
  v_result record;
  v_usage_count integer;
  v_status text;
begin
  select * into v_result
  from public.consume_member_document_workflow(
    'f2000000-0000-0000-0000-000000000001',
    'f5000000-0000-0000-0000-000000000001',
    'f6000000-0000-0000-0000-000000000001',
    'phase01-submit-1',
    'draft',
    'pending_signature',
    'f1000000-0000-0000-0000-000000000001'
  );

  if not v_result.was_already_consumed
     or v_result.quantity_used <> 1
     or v_result.quantity_remaining <> 2 then
    raise exception 'Duplicate submit should return the original single consumption';
  end if;

  select count(*) into v_usage_count
  from public.billing_usage_events
  where document_id = 'f6000000-0000-0000-0000-000000000001'
    and event_kind = 'consume';

  select status into v_status
  from public.documents
  where id = 'f6000000-0000-0000-0000-000000000001';

  if v_usage_count <> 1 or v_status <> 'pending_signature' then
    raise exception 'Consumption and document transition must commit exactly once';
  end if;
end
$$;

select *
from public.consume_member_document_workflow(
  'f2000000-0000-0000-0000-000000000001',
  'f5000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000002',
  'phase01-submit-2',
  'draft',
  'pending_signature',
  'f1000000-0000-0000-0000-000000000001'
);

select *
from public.consume_member_document_workflow(
  'f2000000-0000-0000-0000-000000000001',
  'f5000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000003',
  'phase01-submit-3',
  'draft',
  'pending_notary',
  'f1000000-0000-0000-0000-000000000001'
);

do $$
begin
  perform *
  from public.consume_member_document_workflow(
    'f2000000-0000-0000-0000-000000000001',
    'f5000000-0000-0000-0000-000000000001',
    'f6000000-0000-0000-0000-000000000004',
    'phase01-submit-4',
    'draft',
    'pending_signature',
    'f1000000-0000-0000-0000-000000000001'
  );
  raise exception 'Fourth Starter workflow should have been denied';
exception
  when others then
    if sqlerrm <> 'BILLING_WORKFLOW_LIMIT_REACHED' then
      raise;
    end if;
end
$$;

do $$
declare
  v_usage_event_id uuid;
  v_result record;
begin
  select id into v_usage_event_id
  from public.billing_usage_events
  where document_id = 'f6000000-0000-0000-0000-000000000001'
    and event_kind = 'consume';

  select * into v_result
  from public.reverse_billing_usage_event(
    v_usage_event_id,
    'phase01-reverse-1',
    'confirmed_test_correction',
    'f1000000-0000-0000-0000-000000000001'
  );

  if v_result.quantity_used <> 2
     or v_result.quantity_remaining <> 1
     or v_result.was_already_reversed then
    raise exception 'Usage reversal should restore exactly one Starter unit';
  end if;

  select * into v_result
  from public.reverse_billing_usage_event(
    v_usage_event_id,
    'phase01-reverse-1-repeat',
    'confirmed_test_correction',
    'f1000000-0000-0000-0000-000000000001'
  );

  if not v_result.was_already_reversed or v_result.quantity_used <> 2 then
    raise exception 'Duplicate reversal should be idempotent';
  end if;
end
$$;

insert into public.document_versions (
  id,
  document_id,
  version,
  storage_path,
  file_name,
  mime_type,
  size_bytes,
  is_final,
  created_by
)
values (
  'f7000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000001',
  1,
  'phase01/final.pdf',
  'final.pdf',
  'application/pdf',
  128,
  true,
  'f1000000-0000-0000-0000-000000000001'
);

insert into public.document_hash_records (
  id,
  document_id,
  document_version_id,
  algorithm,
  hash,
  status,
  completed_at
)
values (
  'f8000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000001',
  'f7000000-0000-0000-0000-000000000001',
  'sha256',
  'phase01hash',
  'completed',
  now()
);

insert into public.notarization_requests (
  id,
  document_id,
  assigned_notary_id,
  status
)
values (
  'f9000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000003',
  'in_review'
);

select public.set_document_release_status(
  'f6000000-0000-0000-0000-000000000001',
  'f7000000-0000-0000-0000-000000000001',
  'f8000000-0000-0000-0000-000000000001',
  'billing_held',
  'subscription_not_entitled',
  'f1000000-0000-0000-0000-000000000001',
  '{}'::jsonb
);

select public.set_document_release_status(
  'f6000000-0000-0000-0000-000000000001',
  'f7000000-0000-0000-0000-000000000001',
  'f8000000-0000-0000-0000-000000000001',
  'released',
  null,
  'f1000000-0000-0000-0000-000000000001',
  '{}'::jsonb
);

do $$
begin
  perform public.set_document_release_status(
    'f6000000-0000-0000-0000-000000000001',
    'f7000000-0000-0000-0000-000000000001',
    'f8000000-0000-0000-0000-000000000001',
    'billing_held',
    'must_not_rehold',
    'f1000000-0000-0000-0000-000000000001',
    '{}'::jsonb
  );
  raise exception 'Released document should not return to billing_held';
exception
  when others then
    if sqlerrm <> 'DOCUMENT_RELEASE_CANNOT_REHOLD' then
      raise;
    end if;
end
$$;

select set_config('request.jwt.claim.sub', 'f1100000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;
set row_security = on;

do $$
declare
  v_usage_count integer;
  v_release_count integer;
begin
  select count(*) into v_usage_count
  from public.billing_usage_events
  where billing_account_id = 'f2000000-0000-0000-0000-000000000001';

  select count(*) into v_release_count
  from public.document_release_controls
  where document_id = 'f6000000-0000-0000-0000-000000000001';

  if v_usage_count <> 4 or v_release_count <> 1 then
    raise exception 'Member should read own usage and release state';
  end if;

  if has_table_privilege('authenticated', 'public.billing_provider_price_mappings', 'select') then
    raise exception 'Authenticated users must not read provider Price mappings';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', 'f1100000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;
set row_security = on;

do $$
declare
  v_usage_count integer;
  v_release_count integer;
begin
  select count(*) into v_usage_count from public.billing_usage_events;
  select count(*) into v_release_count from public.document_release_controls;

  if v_usage_count <> 0 or v_release_count <> 0 then
    raise exception 'Unrelated member must not read billing usage or release state';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', 'f1100000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;
set row_security = on;

do $$
declare
  v_release_count integer;
  v_usage_count integer;
begin
  select count(*) into v_release_count
  from public.document_release_controls
  where document_id = 'f6000000-0000-0000-0000-000000000001';

  select count(*) into v_usage_count from public.billing_usage_events;

  if v_release_count <> 1 or v_usage_count <> 0 then
    raise exception 'Assigned notary may read release state but not member usage';
  end if;
end
$$;

do $$
begin
  perform *
  from public.consume_member_document_workflow(
    'f2000000-0000-0000-0000-000000000001',
    'f5000000-0000-0000-0000-000000000001',
    'f6000000-0000-0000-0000-000000000004',
    'authenticated-must-not-execute',
    'draft',
    'pending_signature',
    'f1000000-0000-0000-0000-000000000003'
  );
  raise exception 'Authenticated role must not execute billing mutation RPC';
exception
  when insufficient_privilege then null;
end
$$;

rollback;
