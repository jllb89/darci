-- Store jurisdiction-specific trustee power options for trust intake rendering.

create table if not exists public.trust_trustee_powers (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  canonical_key text not null,
  canonical_label text not null,
  state_specific_label text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  source_citation text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trust_trustee_powers_unique
    unique (jurisdiction, canonical_key),

  constraint trust_trustee_powers_key_check
    check (canonical_key ~ '^[a-z0-9_]+$'),

  constraint trust_trustee_powers_sort_order_check
    check (sort_order >= 0)
);

create index if not exists idx_trust_trustee_powers_jurisdiction
  on public.trust_trustee_powers(jurisdiction);

create index if not exists idx_trust_trustee_powers_jurisdiction_sort
  on public.trust_trustee_powers(jurisdiction, sort_order, canonical_key);

alter table public.trust_trustee_powers enable row level security;

drop policy if exists "trust_trustee_powers_read" on public.trust_trustee_powers;
create policy "trust_trustee_powers_read"
  on public.trust_trustee_powers
  for select using (true);

drop policy if exists "trust_trustee_powers_write" on public.trust_trustee_powers;
create policy "trust_trustee_powers_write"
  on public.trust_trustee_powers
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.trust_trustee_powers to authenticated;

comment on table public.trust_trustee_powers is
'Jurisdiction-scoped trustee power options used to render trust intake authority checklists.';

comment on column public.trust_trustee_powers.state_specific_label is
'Optional jurisdiction-specific presentation label when it differs from canonical_label.';

drop trigger if exists trg_trust_trustee_powers_set_updated_at on public.trust_trustee_powers;

create trigger trg_trust_trustee_powers_set_updated_at
before update on public.trust_trustee_powers
for each row
execute function public.set_updated_at();
