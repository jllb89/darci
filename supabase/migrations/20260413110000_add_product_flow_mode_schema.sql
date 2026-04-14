-- Add product flow mode configuration tables and document metadata for multi-product intake.

create table if not exists public.product_flow_modes (
  id uuid primary key default gen_random_uuid(),
  mode_key text not null unique,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_flow_modes_mode_key_check
    check (mode_key ~ '^[a-z0-9_]+$'),

  constraint product_flow_modes_sort_order_check
    check (sort_order >= 0)
);

create unique index if not exists idx_product_flow_modes_single_default
  on public.product_flow_modes ((is_default))
  where is_default = true;

create table if not exists public.product_flow_mode_families (
  id uuid primary key default gen_random_uuid(),
  mode_id uuid not null references public.product_flow_modes(id) on delete cascade,
  family text not null,
  default_document_type text not null,
  is_required boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_flow_mode_families_unique
    unique (mode_id, family),

  constraint product_flow_mode_families_family_check
    check (family in ('poa', 'trust', 'idn')),

  constraint product_flow_mode_families_default_document_type_check
    check (
      (family = 'poa' and default_document_type in ('general', 'durable', 'medical', 'limited', 'vehicle', 'tax', 'springing', 'other'))
      or (family = 'trust' and default_document_type in ('rrr', 'certification', 'other'))
      or (family = 'idn' and default_document_type in ('acknowledgment', 'authentic_act', 'public_instrument'))
    ),

  constraint product_flow_mode_families_sort_order_check
    check (sort_order >= 0)
);

create index if not exists idx_product_flow_mode_families_mode_sort
  on public.product_flow_mode_families(mode_id, sort_order, family);

create table if not exists public.product_flow_mode_outputs (
  id uuid primary key default gen_random_uuid(),
  mode_id uuid not null references public.product_flow_modes(id) on delete cascade,
  output_key text not null,
  output_label text not null,
  is_required boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_flow_mode_outputs_unique
    unique (mode_id, output_key),

  constraint product_flow_mode_outputs_output_key_check
    check (output_key ~ '^[a-z0-9_]+$'),

  constraint product_flow_mode_outputs_sort_order_check
    check (sort_order >= 0)
);

create index if not exists idx_product_flow_mode_outputs_mode_sort
  on public.product_flow_mode_outputs(mode_id, sort_order, output_key);

create table if not exists public.product_flow_mode_ui (
  id uuid primary key default gen_random_uuid(),
  mode_id uuid not null references public.product_flow_modes(id) on delete cascade,
  group_key text not null,
  layout_mode text not null default 'single-column',
  show_upload_column boolean not null default false,
  upload_required boolean not null default false,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_flow_mode_ui_unique
    unique (mode_id, group_key),

  constraint product_flow_mode_ui_group_key_check
    check (group_key ~ '^[a-z0-9_]+$'),

  constraint product_flow_mode_ui_layout_mode_check
    check (layout_mode in ('single-column', 'two-column', 'wizard-step')),

  constraint product_flow_mode_ui_sort_order_check
    check (sort_order >= 0)
);

create index if not exists idx_product_flow_mode_ui_mode_sort
  on public.product_flow_mode_ui(mode_id, sort_order, group_key);

create table if not exists public.jurisdiction_product_availability (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  family text not null,
  document_type text not null,
  is_available boolean not null default true,
  reason_if_unavailable text,
  seeded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint jurisdiction_product_availability_unique
    unique (jurisdiction, family, document_type),

  constraint jurisdiction_product_availability_family_check
    check (family in ('poa', 'trust', 'idn')),

  constraint jurisdiction_product_availability_document_type_check
    check (
      (family = 'poa' and document_type in ('general', 'durable', 'medical', 'limited', 'vehicle', 'tax', 'springing', 'other'))
      or (family = 'trust' and document_type in ('rrr', 'certification', 'other'))
      or (family = 'idn' and document_type in ('acknowledgment', 'authentic_act', 'public_instrument'))
    )
);

create index if not exists idx_jurisdiction_product_availability_lookup
  on public.jurisdiction_product_availability(jurisdiction, family, document_type);

alter table public.documents
  add column if not exists product_flow_mode text,
  add column if not exists selected_families text[],
  add column if not exists output_bundle jsonb not null default '[]'::jsonb;

create index if not exists idx_documents_product_flow_mode
  on public.documents(product_flow_mode);

create index if not exists idx_documents_selected_families
  on public.documents using gin (selected_families);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_selected_families_check'
  ) then
    alter table public.documents
      add constraint documents_selected_families_check
        check (
          selected_families is null
          or selected_families <@ array['poa', 'trust', 'idn']::text[]
        );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_output_bundle_array_check'
  ) then
    alter table public.documents
      add constraint documents_output_bundle_array_check
        check (jsonb_typeof(output_bundle) = 'array');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'documents_product_flow_mode_fkey'
  ) then
    alter table public.documents
      add constraint documents_product_flow_mode_fkey
        foreign key (product_flow_mode)
        references public.product_flow_modes(mode_key);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_updated_at'
  ) then
    create function public.set_updated_at()
    returns trigger
    language plpgsql
    as $func$
    begin
      new.updated_at = now();
      return new;
    end
    $func$;
  end if;
end
$$;

drop trigger if exists trg_product_flow_modes_set_updated_at
  on public.product_flow_modes;
create trigger trg_product_flow_modes_set_updated_at
before update on public.product_flow_modes
for each row
execute function public.set_updated_at();

drop trigger if exists trg_product_flow_mode_families_set_updated_at
  on public.product_flow_mode_families;
create trigger trg_product_flow_mode_families_set_updated_at
before update on public.product_flow_mode_families
for each row
execute function public.set_updated_at();

drop trigger if exists trg_product_flow_mode_outputs_set_updated_at
  on public.product_flow_mode_outputs;
create trigger trg_product_flow_mode_outputs_set_updated_at
before update on public.product_flow_mode_outputs
for each row
execute function public.set_updated_at();

drop trigger if exists trg_product_flow_mode_ui_set_updated_at
  on public.product_flow_mode_ui;
create trigger trg_product_flow_mode_ui_set_updated_at
before update on public.product_flow_mode_ui
for each row
execute function public.set_updated_at();

drop trigger if exists trg_jurisdiction_product_availability_set_updated_at
  on public.jurisdiction_product_availability;
create trigger trg_jurisdiction_product_availability_set_updated_at
before update on public.jurisdiction_product_availability
for each row
execute function public.set_updated_at();

alter table public.product_flow_modes enable row level security;
alter table public.product_flow_mode_families enable row level security;
alter table public.product_flow_mode_outputs enable row level security;
alter table public.product_flow_mode_ui enable row level security;
alter table public.jurisdiction_product_availability enable row level security;

drop policy if exists "product_flow_modes_read" on public.product_flow_modes;
create policy "product_flow_modes_read" on public.product_flow_modes
  for select using (true);

drop policy if exists "product_flow_modes_write" on public.product_flow_modes;
create policy "product_flow_modes_write" on public.product_flow_modes
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "product_flow_mode_families_read" on public.product_flow_mode_families;
create policy "product_flow_mode_families_read" on public.product_flow_mode_families
  for select using (true);

drop policy if exists "product_flow_mode_families_write" on public.product_flow_mode_families;
create policy "product_flow_mode_families_write" on public.product_flow_mode_families
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "product_flow_mode_outputs_read" on public.product_flow_mode_outputs;
create policy "product_flow_mode_outputs_read" on public.product_flow_mode_outputs
  for select using (true);

drop policy if exists "product_flow_mode_outputs_write" on public.product_flow_mode_outputs;
create policy "product_flow_mode_outputs_write" on public.product_flow_mode_outputs
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "product_flow_mode_ui_read" on public.product_flow_mode_ui;
create policy "product_flow_mode_ui_read" on public.product_flow_mode_ui
  for select using (true);

drop policy if exists "product_flow_mode_ui_write" on public.product_flow_mode_ui;
create policy "product_flow_mode_ui_write" on public.product_flow_mode_ui
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "jurisdiction_product_availability_read" on public.jurisdiction_product_availability;
create policy "jurisdiction_product_availability_read" on public.jurisdiction_product_availability
  for select using (true);

drop policy if exists "jurisdiction_product_availability_write" on public.jurisdiction_product_availability;
create policy "jurisdiction_product_availability_write" on public.jurisdiction_product_availability
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.product_flow_modes to authenticated;
grant select on table public.product_flow_mode_families to authenticated;
grant select on table public.product_flow_mode_outputs to authenticated;
grant select on table public.product_flow_mode_ui to authenticated;
grant select on table public.jurisdiction_product_availability to authenticated;

comment on table public.product_flow_modes is
'Catalog of product intake modes (for example poa_only, trust_bundle, notarize_document).';

comment on table public.product_flow_mode_families is
'Maps each product mode to participating requirement families and default document types.';

comment on table public.product_flow_mode_outputs is
'Lists output documents expected for each product mode.';

comment on table public.product_flow_mode_ui is
'UI grouping and layout configuration per product mode.';

comment on table public.jurisdiction_product_availability is
'Per-jurisdiction matrix of available families and document types for product-mode filtering.';
