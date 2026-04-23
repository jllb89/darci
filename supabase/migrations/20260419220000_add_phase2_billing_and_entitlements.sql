-- Phase 2: billing, pricing, entitlements, delegated payment, and Pro credit foundation.

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  account_key text not null default 'default',
  account_kind text not null default 'personal',
  status text not null default 'active',
  is_default boolean not null default false,
  display_name text,
  billing_email text,
  business_name text,
  tax_reference text,
  country_code text,
  default_currency text not null default 'USD',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_accounts_owner_account_key_unique
    unique (owner_user_id, account_key),
  constraint billing_accounts_account_key_check
    check (account_key ~ '^[a-z0-9_]+$'),
  constraint billing_accounts_account_kind_check
    check (account_kind in ('personal', 'business')),
  constraint billing_accounts_status_check
    check (status in ('active', 'suspended', 'closed')),
  constraint billing_accounts_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint billing_accounts_default_currency_check
    check (default_currency ~ '^[A-Z]{3}$')
);

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text not null,
  provider_account_reference text,
  status text not null default 'active',
  is_default boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_provider_customer_unique
    unique (provider, provider_customer_id),
  constraint billing_customers_provider_check
    check (provider in ('stripe')),
  constraint billing_customers_status_check
    check (status in ('active', 'inactive'))
);

create table if not exists public.billing_catalog_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  display_name text not null,
  description text,
  product_family text not null,
  billing_model text not null,
  role_scope text not null,
  product_flow_mode text references public.product_flow_modes(mode_key) on delete set null,
  document_type text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_catalog_products_product_code_check
    check (product_code ~ '^[a-z0-9_]+$'),
  constraint billing_catalog_products_product_family_check
    check (
      product_family in (
        'trust_registration',
        'trust_activation',
        'dynamic_poa',
        'pro_credit_bundle',
        'notary_membership'
      )
    ),
  constraint billing_catalog_products_billing_model_check
    check (billing_model in ('one_time', 'recurring', 'credit_bundle')),
  constraint billing_catalog_products_role_scope_check
    check (role_scope in ('consumer', 'pro', 'notary', 'shared')),
  constraint billing_catalog_products_sort_order_check
    check (sort_order >= 0)
);

create table if not exists public.billing_catalog_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.billing_catalog_products(id) on delete cascade,
  price_code text not null unique,
  display_name text not null,
  provider text not null default 'stripe',
  provider_price_id text,
  billing_interval text not null default 'one_time',
  interval_count integer not null default 1,
  currency_code text not null default 'USD',
  unit_amount_cents integer not null,
  included_entitlement_type text,
  included_entitlement_quantity integer,
  included_entitlement_period text,
  included_signer_quantity integer not null default 0,
  granted_credit_quantity integer not null default 0,
  usage_limit_quantity integer,
  is_unlimited boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_catalog_prices_price_code_check
    check (price_code ~ '^[a-z0-9_]+$'),
  constraint billing_catalog_prices_provider_check
    check (provider in ('stripe')),
  constraint billing_catalog_prices_billing_interval_check
    check (billing_interval in ('one_time', 'month', 'year')),
  constraint billing_catalog_prices_interval_count_check
    check (interval_count >= 1),
  constraint billing_catalog_prices_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint billing_catalog_prices_unit_amount_check
    check (unit_amount_cents >= 0),
  constraint billing_catalog_prices_included_entitlement_type_check
    check (
      included_entitlement_type is null
      or included_entitlement_type in (
        'trust_registration',
        'document_activation',
        'notary_signing_capacity'
      )
    ),
  constraint billing_catalog_prices_included_entitlement_quantity_check
    check (included_entitlement_quantity is null or included_entitlement_quantity >= 0),
  constraint billing_catalog_prices_included_entitlement_period_check
    check (
      included_entitlement_period is null
      or included_entitlement_period in ('one_time', 'month', 'year', 'lifetime')
    ),
  constraint billing_catalog_prices_included_signer_quantity_check
    check (included_signer_quantity >= 0),
  constraint billing_catalog_prices_granted_credit_quantity_check
    check (granted_credit_quantity >= 0),
  constraint billing_catalog_prices_usage_limit_quantity_check
    check (usage_limit_quantity is null or usage_limit_quantity >= 0),
  constraint billing_catalog_prices_sort_order_check
    check (sort_order >= 0)
);

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  billing_customer_id uuid references public.billing_customers(id) on delete set null,
  requested_by_user_id uuid references public.users(id) on delete set null,
  payer_user_id uuid references public.users(id) on delete set null,
  beneficiary_user_id uuid references public.users(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  role_context text not null default 'shared',
  order_kind text not null default 'direct_purchase',
  status text not null default 'draft',
  currency_code text not null default 'USD',
  subtotal_amount_cents integer not null default 0,
  discount_amount_cents integer not null default 0,
  tax_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0,
  provider_checkout_session_id text,
  provider_payment_intent_id text,
  placed_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_orders_role_context_check
    check (role_context in ('consumer', 'pro', 'notary', 'shared')),
  constraint billing_orders_order_kind_check
    check (
      order_kind in (
        'direct_purchase',
        'delegated_purchase',
        'subscription_checkout',
        'credit_bundle',
        'membership'
      )
    ),
  constraint billing_orders_status_check
    check (
      status in (
        'draft',
        'pending_payment',
        'paid',
        'partially_refunded',
        'refunded',
        'canceled',
        'expired',
        'failed'
      )
    ),
  constraint billing_orders_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$'),
  constraint billing_orders_subtotal_amount_check
    check (subtotal_amount_cents >= 0),
  constraint billing_orders_discount_amount_check
    check (discount_amount_cents >= 0),
  constraint billing_orders_tax_amount_check
    check (tax_amount_cents >= 0),
  constraint billing_orders_total_amount_check
    check (total_amount_cents >= 0)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  billing_customer_id uuid references public.billing_customers(id) on delete set null,
  subscriber_user_id uuid references public.users(id) on delete set null,
  beneficiary_user_id uuid references public.users(id) on delete set null,
  role_context text not null default 'shared',
  status text not null default 'pending',
  provider text not null default 'stripe',
  provider_subscription_id text,
  started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_role_context_check
    check (role_context in ('consumer', 'pro', 'notary', 'shared')),
  constraint billing_subscriptions_status_check
    check (
      status in (
        'pending',
        'trialing',
        'active',
        'past_due',
        'paused',
        'canceled',
        'expired',
        'incomplete',
        'incomplete_expired',
        'unpaid'
      )
    ),
  constraint billing_subscriptions_provider_check
    check (provider in ('stripe'))
);

create table if not exists public.billing_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.billing_orders(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  product_id uuid references public.billing_catalog_products(id) on delete set null,
  price_id uuid references public.billing_catalog_prices(id) on delete set null,
  beneficiary_user_id uuid references public.users(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  role_context text not null default 'shared',
  product_code_snapshot text not null,
  price_code_snapshot text not null,
  display_name_snapshot text not null,
  quantity integer not null default 1,
  unit_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0,
  fulfillment_state text not null default 'pending',
  fulfilled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_order_items_role_context_check
    check (role_context in ('consumer', 'pro', 'notary', 'shared')),
  constraint billing_order_items_product_code_snapshot_check
    check (product_code_snapshot ~ '^[a-z0-9_]+$'),
  constraint billing_order_items_price_code_snapshot_check
    check (price_code_snapshot ~ '^[a-z0-9_]+$'),
  constraint billing_order_items_quantity_check
    check (quantity > 0),
  constraint billing_order_items_unit_amount_check
    check (unit_amount_cents >= 0),
  constraint billing_order_items_total_amount_check
    check (total_amount_cents >= 0),
  constraint billing_order_items_total_matches_quantity_check
    check (total_amount_cents = unit_amount_cents * quantity),
  constraint billing_order_items_fulfillment_state_check
    check (fulfillment_state in ('pending', 'partially_fulfilled', 'fulfilled', 'voided'))
);

create table if not exists public.billing_subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.billing_subscriptions(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  product_id uuid references public.billing_catalog_products(id) on delete set null,
  price_id uuid references public.billing_catalog_prices(id) on delete set null,
  beneficiary_user_id uuid references public.users(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  role_context text not null default 'shared',
  product_code_snapshot text not null,
  price_code_snapshot text not null,
  display_name_snapshot text not null,
  quantity integer not null default 1,
  status text not null default 'pending',
  current_period_start timestamptz,
  current_period_end timestamptz,
  included_entitlement_quantity integer,
  usage_limit_quantity integer,
  is_unlimited boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscription_items_role_context_check
    check (role_context in ('consumer', 'pro', 'notary', 'shared')),
  constraint billing_subscription_items_product_code_snapshot_check
    check (product_code_snapshot ~ '^[a-z0-9_]+$'),
  constraint billing_subscription_items_price_code_snapshot_check
    check (price_code_snapshot ~ '^[a-z0-9_]+$'),
  constraint billing_subscription_items_quantity_check
    check (quantity > 0),
  constraint billing_subscription_items_status_check
    check (status in ('pending', 'active', 'paused', 'canceled', 'expired')),
  constraint billing_subscription_items_included_entitlement_quantity_check
    check (included_entitlement_quantity is null or included_entitlement_quantity >= 0),
  constraint billing_subscription_items_usage_limit_quantity_check
    check (usage_limit_quantity is null or usage_limit_quantity >= 0)
);

create table if not exists public.billing_entitlements (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  owner_user_id uuid references public.users(id) on delete set null,
  order_item_id uuid references public.billing_order_items(id) on delete set null,
  subscription_item_id uuid references public.billing_subscription_items(id) on delete set null,
  product_id uuid references public.billing_catalog_products(id) on delete set null,
  price_id uuid references public.billing_catalog_prices(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  entitlement_type text not null,
  status text not null default 'pending',
  quantity_total integer,
  quantity_used integer not null default 0,
  is_unlimited boolean not null default false,
  period_unit text not null default 'one_time',
  starts_at timestamptz,
  ends_at timestamptz,
  activated_at timestamptz,
  exhausted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_entitlements_entitlement_type_check
    check (entitlement_type in ('trust_registration', 'document_activation', 'notary_signing_capacity')),
  constraint billing_entitlements_status_check
    check (status in ('pending', 'active', 'suspended', 'expired', 'consumed', 'canceled')),
  constraint billing_entitlements_quantity_total_check
    check (quantity_total is null or quantity_total >= 0),
  constraint billing_entitlements_quantity_used_check
    check (quantity_used >= 0),
  constraint billing_entitlements_period_unit_check
    check (period_unit in ('one_time', 'month', 'year', 'lifetime'))
);

create table if not exists public.pro_credit_wallets (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null unique references public.billing_accounts(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active',
  available_credits integer not null default 0,
  reserved_credits integer not null default 0,
  consumed_credits integer not null default 0,
  expired_credits integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_credit_wallets_status_check
    check (status in ('active', 'suspended', 'closed')),
  constraint pro_credit_wallets_available_credits_check
    check (available_credits >= 0),
  constraint pro_credit_wallets_reserved_credits_check
    check (reserved_credits >= 0),
  constraint pro_credit_wallets_consumed_credits_check
    check (consumed_credits >= 0),
  constraint pro_credit_wallets_expired_credits_check
    check (expired_credits >= 0)
);

create table if not exists public.pro_credit_lots (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.pro_credit_wallets(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  source_order_item_id uuid references public.billing_order_items(id) on delete set null,
  price_id uuid references public.billing_catalog_prices(id) on delete set null,
  original_credits integer not null,
  available_credits integer not null default 0,
  reserved_credits integer not null default 0,
  consumed_credits integer not null default 0,
  expired_credits integer not null default 0,
  status text not null default 'active',
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_credit_lots_original_credits_check
    check (original_credits > 0),
  constraint pro_credit_lots_available_credits_check
    check (available_credits >= 0),
  constraint pro_credit_lots_reserved_credits_check
    check (reserved_credits >= 0),
  constraint pro_credit_lots_consumed_credits_check
    check (consumed_credits >= 0),
  constraint pro_credit_lots_expired_credits_check
    check (expired_credits >= 0),
  constraint pro_credit_lots_status_check
    check (status in ('active', 'depleted', 'expired', 'canceled')),
  constraint pro_credit_lots_balance_check
    check (available_credits + reserved_credits + consumed_credits + expired_credits = original_credits)
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  order_id uuid references public.billing_orders(id) on delete set null,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  provider text not null default 'stripe',
  transaction_kind text not null,
  external_id text not null,
  external_parent_id text,
  status text not null default 'pending',
  amount_cents integer not null default 0,
  currency_code text not null default 'USD',
  occurred_at timestamptz not null default now(),
  settled_at timestamptz,
  failure_code text,
  failure_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_transactions_provider_external_unique
    unique (provider, transaction_kind, external_id),
  constraint payment_transactions_provider_check
    check (provider in ('stripe')),
  constraint payment_transactions_transaction_kind_check
    check (
      transaction_kind in (
        'checkout_session',
        'payment_intent',
        'charge',
        'invoice',
        'refund',
        'credit_note',
        'setup_intent'
      )
    ),
  constraint payment_transactions_status_check
    check (
      status in (
        'pending',
        'processing',
        'succeeded',
        'failed',
        'canceled',
        'refunded',
        'partial_refund',
        'requires_action'
      )
    ),
  constraint payment_transactions_amount_check
    check (amount_cents >= 0),
  constraint payment_transactions_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$')
);

create table if not exists public.billing_payment_requests (
  id uuid primary key default gen_random_uuid(),
  requester_billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  requested_by_user_id uuid references public.users(id) on delete set null,
  beneficiary_user_id uuid references public.users(id) on delete set null,
  payer_user_id uuid references public.users(id) on delete set null,
  payer_email text,
  document_id uuid references public.documents(id) on delete set null,
  price_id uuid references public.billing_catalog_prices(id) on delete set null,
  quantity integer not null default 1,
  role_context text not null default 'shared',
  status text not null default 'draft',
  amount_cents integer not null default 0,
  currency_code text not null default 'USD',
  notes text,
  expires_at timestamptz,
  accepted_at timestamptz,
  fulfilled_at timestamptz,
  fulfilled_order_id uuid references public.billing_orders(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_payment_requests_quantity_check
    check (quantity > 0),
  constraint billing_payment_requests_role_context_check
    check (role_context in ('consumer', 'pro', 'notary', 'shared')),
  constraint billing_payment_requests_status_check
    check (status in ('draft', 'pending', 'sent', 'accepted', 'expired', 'canceled', 'fulfilled', 'declined')),
  constraint billing_payment_requests_amount_check
    check (amount_cents >= 0),
  constraint billing_payment_requests_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$')
);

create table if not exists public.pro_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.pro_credit_wallets(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  billing_payment_request_id uuid references public.billing_payment_requests(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  requested_by_user_id uuid references public.users(id) on delete set null,
  beneficiary_user_id uuid references public.users(id) on delete set null,
  credits integer not null,
  status text not null default 'reserved',
  expires_at timestamptz,
  committed_at timestamptz,
  released_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_credit_reservations_credits_check
    check (credits > 0),
  constraint pro_credit_reservations_status_check
    check (status in ('reserved', 'committed', 'released', 'expired', 'canceled'))
);

create table if not exists public.pro_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.pro_credit_wallets(id) on delete cascade,
  billing_account_id uuid not null references public.billing_accounts(id) on delete cascade,
  lot_id uuid references public.pro_credit_lots(id) on delete set null,
  reservation_id uuid references public.pro_credit_reservations(id) on delete set null,
  order_item_id uuid references public.billing_order_items(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  transaction_type text not null,
  delta_credits integer not null,
  balance_after_credits integer,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pro_credit_transactions_transaction_type_check
    check (transaction_type in ('grant', 'reserve', 'commit', 'release', 'expire', 'adjustment')),
  constraint pro_credit_transactions_delta_credits_check
    check (delta_credits <> 0),
  constraint pro_credit_transactions_balance_after_credits_check
    check (balance_after_credits is null or balance_after_credits >= 0)
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  event_id text not null,
  event_type text not null,
  livemode boolean not null default false,
  api_version text,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_events_provider_event_unique
    unique (provider, event_id),
  constraint stripe_webhook_events_provider_check
    check (provider in ('stripe')),
  constraint stripe_webhook_events_status_check
    check (status in ('received', 'processing', 'processed', 'failed', 'ignored'))
);

create unique index if not exists ux_billing_accounts_default_per_owner
  on public.billing_accounts(owner_user_id)
  where is_default = true;

create unique index if not exists ux_billing_customers_default_per_account_provider
  on public.billing_customers(billing_account_id, provider)
  where is_default = true;

create unique index if not exists ux_billing_catalog_prices_provider_price
  on public.billing_catalog_prices(provider, provider_price_id)
  where provider_price_id is not null;

create unique index if not exists ux_billing_orders_checkout_session
  on public.billing_orders(provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create unique index if not exists ux_billing_orders_payment_intent
  on public.billing_orders(provider_payment_intent_id)
  where provider_payment_intent_id is not null;

create unique index if not exists ux_billing_subscriptions_provider_subscription
  on public.billing_subscriptions(provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists idx_billing_accounts_owner_status
  on public.billing_accounts(owner_user_id, status, is_default);

create index if not exists idx_billing_customers_account_provider
  on public.billing_customers(billing_account_id, provider, status);

create index if not exists idx_billing_catalog_products_family_scope_active
  on public.billing_catalog_products(product_family, role_scope, is_active, sort_order);

create index if not exists idx_billing_catalog_prices_product_active
  on public.billing_catalog_prices(product_id, is_active, sort_order);

create index if not exists idx_billing_orders_account_status
  on public.billing_orders(billing_account_id, status, created_at desc);

create index if not exists idx_billing_orders_document
  on public.billing_orders(document_id, created_at desc);

create index if not exists idx_billing_orders_payer
  on public.billing_orders(payer_user_id, created_at desc);

create index if not exists idx_billing_orders_beneficiary
  on public.billing_orders(beneficiary_user_id, created_at desc);

create index if not exists idx_billing_order_items_order
  on public.billing_order_items(order_id, created_at);

create index if not exists idx_billing_order_items_document
  on public.billing_order_items(document_id, fulfillment_state);

create index if not exists idx_billing_subscription_account_status
  on public.billing_subscriptions(billing_account_id, status, created_at desc);

create index if not exists idx_billing_subscription_items_subscription
  on public.billing_subscription_items(subscription_id, status, created_at);

create index if not exists idx_billing_subscription_items_document
  on public.billing_subscription_items(document_id, status);

create index if not exists idx_billing_entitlements_account_status
  on public.billing_entitlements(billing_account_id, status, entitlement_type, created_at desc);

create index if not exists idx_billing_entitlements_owner
  on public.billing_entitlements(owner_user_id, status, created_at desc);

create index if not exists idx_billing_entitlements_document
  on public.billing_entitlements(document_id, entitlement_type, status);

create index if not exists idx_pro_credit_wallets_owner_status
  on public.pro_credit_wallets(owner_user_id, status);

create index if not exists idx_pro_credit_lots_wallet_expiry
  on public.pro_credit_lots(wallet_id, status, expires_at);

create index if not exists idx_pro_credit_lots_account_expiry
  on public.pro_credit_lots(billing_account_id, status, expires_at);

create index if not exists idx_payment_transactions_account_status
  on public.payment_transactions(billing_account_id, status, occurred_at desc);

create index if not exists idx_payment_transactions_order
  on public.payment_transactions(order_id, occurred_at desc);

create index if not exists idx_payment_transactions_subscription
  on public.payment_transactions(subscription_id, occurred_at desc);

create index if not exists idx_billing_payment_requests_account_status
  on public.billing_payment_requests(requester_billing_account_id, status, created_at desc);

create index if not exists idx_billing_payment_requests_document
  on public.billing_payment_requests(document_id, status, created_at desc);

create index if not exists idx_pro_credit_reservations_wallet_status
  on public.pro_credit_reservations(wallet_id, status, expires_at);

create index if not exists idx_pro_credit_reservations_document
  on public.pro_credit_reservations(document_id, status);

create index if not exists idx_pro_credit_transactions_wallet_occurred
  on public.pro_credit_transactions(wallet_id, occurred_at desc);

create index if not exists idx_pro_credit_transactions_reservation
  on public.pro_credit_transactions(reservation_id, occurred_at desc);

create index if not exists idx_stripe_webhook_events_status_received
  on public.stripe_webhook_events(status, received_at desc);

comment on table public.billing_accounts is
'Billing identity anchor for orders, subscriptions, entitlements, delegated payment, and credit wallets.';

comment on table public.billing_catalog_products is
'Catalog of billable DARCI product families keyed to product flows and role scopes.';

comment on table public.billing_catalog_prices is
'Concrete purchasable prices, seeded from the product payment spec and ready for Stripe price linkage.';

comment on table public.billing_entitlements is
'Concrete access and usage grants derived from order items and subscription items.';

comment on table public.pro_credit_wallets is
'Pro prepaid credit balance anchor used in place of direct Stripe payment for eligible trust registration flows.';

comment on table public.billing_payment_requests is
'Delegated payment requests that let one actor initiate a purchase flow while another actor pays.';

comment on table public.stripe_webhook_events is
'Webhook idempotency and processing ledger for Stripe events.';

create or replace function public.auth_user_matches(target_user_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users
    where public.users.id = target_user_id
      and public.users.supabase_user_id = auth.uid()
  );
$$;

create or replace function public.billing_account_owned_by_auth(target_billing_account_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.billing_accounts
    join public.users on public.users.id = public.billing_accounts.owner_user_id
    where public.billing_accounts.id = target_billing_account_id
      and public.users.supabase_user_id = auth.uid()
  );
$$;

insert into public.billing_accounts (
  owner_user_id,
  account_key,
  account_kind,
  status,
  is_default,
  display_name,
  billing_email,
  default_currency,
  metadata,
  created_at,
  updated_at
)
select
  public.users.id,
  'default',
  'personal',
  'active',
  true,
  coalesce(
    nullif(btrim(concat_ws(' ', public.users.first_name, public.users.last_name)), ''),
    public.users.email,
    'DARCI User'
  ),
  public.users.email,
  'USD',
  jsonb_build_object('source', 'phase2_migration', 'backfill', true),
  public.users.created_at,
  now()
from public.users
on conflict (owner_user_id, account_key) do update
  set is_default = excluded.is_default,
      display_name = coalesce(public.billing_accounts.display_name, excluded.display_name),
      billing_email = coalesce(public.billing_accounts.billing_email, excluded.billing_email),
      metadata = public.billing_accounts.metadata || excluded.metadata,
      updated_at = now();

insert into public.pro_credit_wallets (
  billing_account_id,
  owner_user_id,
  status,
  metadata,
  created_at,
  updated_at
)
select
  public.billing_accounts.id,
  public.billing_accounts.owner_user_id,
  'active',
  jsonb_build_object('source', 'phase2_migration', 'backfill', 'active_pro_role'),
  now(),
  now()
from public.billing_accounts
where exists (
  select 1
  from public.user_roles
  where public.user_roles.user_id = public.billing_accounts.owner_user_id
    and public.user_roles.role = 'pro'
    and public.user_roles.status = 'active'
)
on conflict (billing_account_id) do update
  set updated_at = now();

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
values
  (
    'trust_registration',
    'Trust Registration',
    'One-time trust registration fee charged to end consumers.',
    'trust_registration',
    'one_time',
    'consumer',
    'trust_bundle',
    'trust_rrr',
    true,
    10,
    jsonb_build_object('source', 'phase2_seed'),
    now(),
    now()
  ),
  (
    'trust_activation',
    'Trust Activation Plan',
    'Recurring trust activation plan that keeps the trust registration active and includes one or two Dynamic POA activations depending on signer tier.',
    'trust_activation',
    'recurring',
    'consumer',
    'trust_bundle',
    'trust_rrr',
    true,
    20,
    jsonb_build_object('source', 'phase2_seed'),
    now(),
    now()
  ),
  (
    'dynamic_poa_activation',
    'Dynamic POA Activation',
    'Recurring plan that keeps a standalone Dynamic POA active and editable.',
    'dynamic_poa',
    'recurring',
    'consumer',
    'poa_only',
    'poa_general',
    true,
    30,
    jsonb_build_object('source', 'phase2_seed'),
    now(),
    now()
  ),
  (
    'pro_credit_bundle',
    'Pro Credit Bundle',
    'Prepaid Pro trust-registration credits purchased in bulk via Stripe.',
    'pro_credit_bundle',
    'credit_bundle',
    'pro',
    null,
    null,
    true,
    40,
    jsonb_build_object('source', 'phase2_seed'),
    now(),
    now()
  ),
  (
    'notary_membership',
    'illuminotary Membership',
    'Tiered recurring membership plans for verified illuminotaries.',
    'notary_membership',
    'recurring',
    'notary',
    null,
    null,
    true,
    50,
    jsonb_build_object('source', 'phase2_seed'),
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
      metadata = excluded.metadata,
      updated_at = now();

insert into public.billing_catalog_prices (
  product_id,
  price_code,
  display_name,
  provider,
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
    (select id from public.billing_catalog_products where product_code = 'trust_registration'),
    'trust_registration_base',
    'Trust Registration Base Fee',
    'stripe',
    'one_time',
    1,
    'USD',
    24900,
    'trust_registration',
    1,
    'lifetime',
    0,
    0,
    null,
    false,
    true,
    10,
    jsonb_build_object('source', 'phase2_seed'),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'trust_activation'),
    'trust_activation_1_signer_monthly',
    'Trust Activation 1 Signer Monthly',
    'stripe',
    'month',
    1,
    'USD',
    1000,
    'document_activation',
    1,
    'month',
    1,
    0,
    null,
    false,
    true,
    20,
    jsonb_build_object('source', 'phase2_seed', 'signer_tier', 1),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'trust_activation'),
    'trust_activation_1_signer_annual',
    'Trust Activation 1 Signer Annual',
    'stripe',
    'year',
    1,
    'USD',
    9900,
    'document_activation',
    1,
    'year',
    1,
    0,
    null,
    false,
    true,
    30,
    jsonb_build_object('source', 'phase2_seed', 'signer_tier', 1),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'trust_activation'),
    'trust_activation_2_signer_monthly',
    'Trust Activation 2 Signer Monthly',
    'stripe',
    'month',
    1,
    'USD',
    1500,
    'document_activation',
    2,
    'month',
    2,
    0,
    null,
    false,
    true,
    40,
    jsonb_build_object('source', 'phase2_seed', 'signer_tier', 2),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'trust_activation'),
    'trust_activation_2_signer_annual',
    'Trust Activation 2 Signer Annual',
    'stripe',
    'year',
    1,
    'USD',
    15900,
    'document_activation',
    2,
    'year',
    2,
    0,
    null,
    false,
    true,
    50,
    jsonb_build_object('source', 'phase2_seed', 'signer_tier', 2),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'dynamic_poa_activation'),
    'dynamic_poa_monthly',
    'Dynamic POA Monthly',
    'stripe',
    'month',
    1,
    'USD',
    500,
    'document_activation',
    1,
    'month',
    0,
    0,
    null,
    false,
    true,
    60,
    jsonb_build_object('source', 'phase2_seed'),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'dynamic_poa_activation'),
    'dynamic_poa_annual',
    'Dynamic POA Annual',
    'stripe',
    'year',
    1,
    'USD',
    5000,
    'document_activation',
    1,
    'year',
    0,
    0,
    null,
    false,
    true,
    70,
    jsonb_build_object('source', 'phase2_seed'),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'pro_credit_bundle'),
    'pro_credit_bundle_starter',
    'Starter Pro Pack',
    'stripe',
    'one_time',
    1,
    'USD',
    114500,
    null,
    null,
    null,
    0,
    5,
    null,
    false,
    true,
    80,
    jsonb_build_object('source', 'phase2_seed', 'bundle_tier', 'starter', 'credit_expiry_days', 365),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'pro_credit_bundle'),
    'pro_credit_bundle_growth',
    'Growth Pack',
    'stripe',
    'one_time',
    1,
    'USD',
    220000,
    null,
    null,
    null,
    0,
    10,
    null,
    false,
    true,
    90,
    jsonb_build_object('source', 'phase2_seed', 'bundle_tier', 'growth', 'credit_expiry_days', 365),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'pro_credit_bundle'),
    'pro_credit_bundle_practice',
    'Practice Pack',
    'stripe',
    'one_time',
    1,
    'USD',
    512500,
    null,
    null,
    null,
    0,
    25,
    null,
    false,
    true,
    100,
    jsonb_build_object('source', 'phase2_seed', 'bundle_tier', 'practice', 'credit_expiry_days', 365),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'pro_credit_bundle'),
    'pro_credit_bundle_firm',
    'Firm Pack',
    'stripe',
    'one_time',
    1,
    'USD',
    945000,
    null,
    null,
    null,
    0,
    50,
    null,
    false,
    true,
    110,
    jsonb_build_object('source', 'phase2_seed', 'bundle_tier', 'firm', 'credit_expiry_days', 365),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'notary_membership'),
    'notary_membership_basic_monthly',
    'illuminotary Basic Monthly',
    'stripe',
    'month',
    1,
    'USD',
    999,
    'notary_signing_capacity',
    10,
    'month',
    0,
    0,
    10,
    false,
    true,
    120,
    jsonb_build_object('source', 'phase2_seed', 'membership_tier', 'basic'),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'notary_membership'),
    'notary_membership_plus_monthly',
    'illuminotary Plus Monthly',
    'stripe',
    'month',
    1,
    'USD',
    1999,
    'notary_signing_capacity',
    25,
    'month',
    0,
    0,
    25,
    false,
    true,
    130,
    jsonb_build_object('source', 'phase2_seed', 'membership_tier', 'plus'),
    now(),
    now()
  ),
  (
    (select id from public.billing_catalog_products where product_code = 'notary_membership'),
    'notary_membership_elite_monthly',
    'illuminotary Elite Monthly',
    'stripe',
    'month',
    1,
    'USD',
    5999,
    'notary_signing_capacity',
    null,
    'month',
    0,
    0,
    null,
    true,
    true,
    140,
    jsonb_build_object('source', 'phase2_seed', 'membership_tier', 'elite'),
    now(),
    now()
  )
on conflict (price_code) do update
  set product_id = excluded.product_id,
      display_name = excluded.display_name,
      provider = excluded.provider,
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
      metadata = excluded.metadata,
      updated_at = now();

alter table public.billing_accounts enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_catalog_products enable row level security;
alter table public.billing_catalog_prices enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_order_items enable row level security;
alter table public.billing_subscription_items enable row level security;
alter table public.billing_entitlements enable row level security;
alter table public.pro_credit_wallets enable row level security;
alter table public.pro_credit_lots enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.billing_payment_requests enable row level security;
alter table public.pro_credit_reservations enable row level security;
alter table public.pro_credit_transactions enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists "billing_accounts_select_owner" on public.billing_accounts;
create policy "billing_accounts_select_owner" on public.billing_accounts
  for select using (public.auth_user_matches(owner_user_id));

drop policy if exists "billing_accounts_service_role_access" on public.billing_accounts;
create policy "billing_accounts_service_role_access" on public.billing_accounts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_customers_select_owner" on public.billing_customers;
create policy "billing_customers_select_owner" on public.billing_customers
  for select using (public.billing_account_owned_by_auth(billing_account_id));

drop policy if exists "billing_customers_service_role_access" on public.billing_customers;
create policy "billing_customers_service_role_access" on public.billing_customers
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_catalog_products_read" on public.billing_catalog_products;
create policy "billing_catalog_products_read" on public.billing_catalog_products
  for select using (true);

drop policy if exists "billing_catalog_products_service_role_access" on public.billing_catalog_products;
create policy "billing_catalog_products_service_role_access" on public.billing_catalog_products
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_catalog_prices_read" on public.billing_catalog_prices;
create policy "billing_catalog_prices_read" on public.billing_catalog_prices
  for select using (true);

drop policy if exists "billing_catalog_prices_service_role_access" on public.billing_catalog_prices;
create policy "billing_catalog_prices_service_role_access" on public.billing_catalog_prices
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_orders_select_participants" on public.billing_orders;
create policy "billing_orders_select_participants" on public.billing_orders
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(requested_by_user_id)
    or public.auth_user_matches(payer_user_id)
    or public.auth_user_matches(beneficiary_user_id)
  );

drop policy if exists "billing_orders_service_role_access" on public.billing_orders;
create policy "billing_orders_service_role_access" on public.billing_orders
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_subscriptions_select_participants" on public.billing_subscriptions;
create policy "billing_subscriptions_select_participants" on public.billing_subscriptions
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(subscriber_user_id)
    or public.auth_user_matches(beneficiary_user_id)
  );

drop policy if exists "billing_subscriptions_service_role_access" on public.billing_subscriptions;
create policy "billing_subscriptions_service_role_access" on public.billing_subscriptions
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_order_items_select_participants" on public.billing_order_items;
create policy "billing_order_items_select_participants" on public.billing_order_items
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(beneficiary_user_id)
  );

drop policy if exists "billing_order_items_service_role_access" on public.billing_order_items;
create policy "billing_order_items_service_role_access" on public.billing_order_items
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_subscription_items_select_participants" on public.billing_subscription_items;
create policy "billing_subscription_items_select_participants" on public.billing_subscription_items
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(beneficiary_user_id)
  );

drop policy if exists "billing_subscription_items_service_role_access" on public.billing_subscription_items;
create policy "billing_subscription_items_service_role_access" on public.billing_subscription_items
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_entitlements_select_participants" on public.billing_entitlements;
create policy "billing_entitlements_select_participants" on public.billing_entitlements
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(owner_user_id)
  );

drop policy if exists "billing_entitlements_service_role_access" on public.billing_entitlements;
create policy "billing_entitlements_service_role_access" on public.billing_entitlements
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "pro_credit_wallets_select_owner" on public.pro_credit_wallets;
create policy "pro_credit_wallets_select_owner" on public.pro_credit_wallets
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(owner_user_id)
  );

drop policy if exists "pro_credit_wallets_service_role_access" on public.pro_credit_wallets;
create policy "pro_credit_wallets_service_role_access" on public.pro_credit_wallets
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "pro_credit_lots_select_owner" on public.pro_credit_lots;
create policy "pro_credit_lots_select_owner" on public.pro_credit_lots
  for select using (public.billing_account_owned_by_auth(billing_account_id));

drop policy if exists "pro_credit_lots_service_role_access" on public.pro_credit_lots;
create policy "pro_credit_lots_service_role_access" on public.pro_credit_lots
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "payment_transactions_select_owner" on public.payment_transactions;
create policy "payment_transactions_select_owner" on public.payment_transactions
  for select using (public.billing_account_owned_by_auth(billing_account_id));

drop policy if exists "payment_transactions_service_role_access" on public.payment_transactions;
create policy "payment_transactions_service_role_access" on public.payment_transactions
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "billing_payment_requests_select_participants" on public.billing_payment_requests;
create policy "billing_payment_requests_select_participants" on public.billing_payment_requests
  for select using (
    public.billing_account_owned_by_auth(requester_billing_account_id)
    or public.auth_user_matches(requested_by_user_id)
    or public.auth_user_matches(beneficiary_user_id)
    or public.auth_user_matches(payer_user_id)
  );

drop policy if exists "billing_payment_requests_service_role_access" on public.billing_payment_requests;
create policy "billing_payment_requests_service_role_access" on public.billing_payment_requests
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "pro_credit_reservations_select_participants" on public.pro_credit_reservations;
create policy "pro_credit_reservations_select_participants" on public.pro_credit_reservations
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(requested_by_user_id)
    or public.auth_user_matches(beneficiary_user_id)
  );

drop policy if exists "pro_credit_reservations_service_role_access" on public.pro_credit_reservations;
create policy "pro_credit_reservations_service_role_access" on public.pro_credit_reservations
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "pro_credit_transactions_select_participants" on public.pro_credit_transactions;
create policy "pro_credit_transactions_select_participants" on public.pro_credit_transactions
  for select using (
    public.billing_account_owned_by_auth(billing_account_id)
    or public.auth_user_matches(actor_user_id)
  );

drop policy if exists "pro_credit_transactions_service_role_access" on public.pro_credit_transactions;
create policy "pro_credit_transactions_service_role_access" on public.pro_credit_transactions
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "stripe_webhook_events_service_role_access" on public.stripe_webhook_events;
create policy "stripe_webhook_events_service_role_access" on public.stripe_webhook_events
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.billing_accounts to authenticated;
grant select on table public.billing_customers to authenticated;
grant select on table public.billing_catalog_products to authenticated;
grant select on table public.billing_catalog_prices to authenticated;
grant select on table public.billing_orders to authenticated;
grant select on table public.billing_subscriptions to authenticated;
grant select on table public.billing_order_items to authenticated;
grant select on table public.billing_subscription_items to authenticated;
grant select on table public.billing_entitlements to authenticated;
grant select on table public.pro_credit_wallets to authenticated;
grant select on table public.pro_credit_lots to authenticated;
grant select on table public.payment_transactions to authenticated;
grant select on table public.billing_payment_requests to authenticated;
grant select on table public.pro_credit_reservations to authenticated;
grant select on table public.pro_credit_transactions to authenticated;

drop trigger if exists trg_billing_accounts_touch_updated_at on public.billing_accounts;
create trigger trg_billing_accounts_touch_updated_at
before update on public.billing_accounts
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_customers_touch_updated_at on public.billing_customers;
create trigger trg_billing_customers_touch_updated_at
before update on public.billing_customers
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_catalog_products_touch_updated_at on public.billing_catalog_products;
create trigger trg_billing_catalog_products_touch_updated_at
before update on public.billing_catalog_products
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_catalog_prices_touch_updated_at on public.billing_catalog_prices;
create trigger trg_billing_catalog_prices_touch_updated_at
before update on public.billing_catalog_prices
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_orders_touch_updated_at on public.billing_orders;
create trigger trg_billing_orders_touch_updated_at
before update on public.billing_orders
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_subscriptions_touch_updated_at on public.billing_subscriptions;
create trigger trg_billing_subscriptions_touch_updated_at
before update on public.billing_subscriptions
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_order_items_touch_updated_at on public.billing_order_items;
create trigger trg_billing_order_items_touch_updated_at
before update on public.billing_order_items
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_subscription_items_touch_updated_at on public.billing_subscription_items;
create trigger trg_billing_subscription_items_touch_updated_at
before update on public.billing_subscription_items
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_entitlements_touch_updated_at on public.billing_entitlements;
create trigger trg_billing_entitlements_touch_updated_at
before update on public.billing_entitlements
for each row execute function public.touch_updated_at();

drop trigger if exists trg_pro_credit_wallets_touch_updated_at on public.pro_credit_wallets;
create trigger trg_pro_credit_wallets_touch_updated_at
before update on public.pro_credit_wallets
for each row execute function public.touch_updated_at();

drop trigger if exists trg_pro_credit_lots_touch_updated_at on public.pro_credit_lots;
create trigger trg_pro_credit_lots_touch_updated_at
before update on public.pro_credit_lots
for each row execute function public.touch_updated_at();

drop trigger if exists trg_payment_transactions_touch_updated_at on public.payment_transactions;
create trigger trg_payment_transactions_touch_updated_at
before update on public.payment_transactions
for each row execute function public.touch_updated_at();

drop trigger if exists trg_billing_payment_requests_touch_updated_at on public.billing_payment_requests;
create trigger trg_billing_payment_requests_touch_updated_at
before update on public.billing_payment_requests
for each row execute function public.touch_updated_at();

drop trigger if exists trg_pro_credit_reservations_touch_updated_at on public.pro_credit_reservations;
create trigger trg_pro_credit_reservations_touch_updated_at
before update on public.pro_credit_reservations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_stripe_webhook_events_touch_updated_at on public.stripe_webhook_events;
create trigger trg_stripe_webhook_events_touch_updated_at
before update on public.stripe_webhook_events
for each row execute function public.touch_updated_at();