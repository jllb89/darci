-- Persist intake party contact details for each document.

create table if not exists public.document_parties (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  party_role text not null,
  full_name text not null,
  email text,
  phone_country_code text not null default '+1',
  phone text,
  is_signing_party boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.document_parties
  drop constraint if exists document_parties_party_role_check;

alter table public.document_parties
  add constraint document_parties_party_role_check
  check (party_role in (
    'principal',
    'agent',
    'successor_agent',
    'grantor',
    'trustee',
    'successor_trustee'
  ));

alter table public.document_parties
  drop constraint if exists document_parties_full_name_check;

alter table public.document_parties
  add constraint document_parties_full_name_check
  check (btrim(full_name) <> '');

alter table public.document_parties
  drop constraint if exists document_parties_email_check;

alter table public.document_parties
  add constraint document_parties_email_check
  check (email is null or email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

alter table public.document_parties
  drop constraint if exists document_parties_phone_country_code_check;

alter table public.document_parties
  add constraint document_parties_phone_country_code_check
  check (phone_country_code ~ '^\+[0-9]{1,4}$');

alter table public.document_parties
  drop constraint if exists document_parties_phone_check;

alter table public.document_parties
  add constraint document_parties_phone_check
  check (
    phone is null
    or length(regexp_replace(phone, '\D', '', 'g')) between 7 and 15
  );

alter table public.document_parties
  drop constraint if exists document_parties_sort_order_check;

alter table public.document_parties
  add constraint document_parties_sort_order_check
  check (sort_order >= 0);

create unique index if not exists ux_document_parties_document_role_order
  on public.document_parties(document_id, party_role, sort_order);

create index if not exists idx_document_parties_document
  on public.document_parties(document_id);

create index if not exists idx_document_parties_role
  on public.document_parties(party_role);

alter table public.document_parties enable row level security;

drop policy if exists "document_parties_owner_access" on public.document_parties;

create policy "document_parties_owner_access" on public.document_parties
  for all using (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.role() = 'service_role'
  )
  with check (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.role() = 'service_role'
  );

comment on table public.document_parties is
'Per-document party roster with contact details captured from member intake (principal, agent, successor agents, grantors, trustees, successor trustees).';

comment on column public.document_parties.phone_country_code is
'E.164 dialing prefix (for example, +1) selected during intake.';

comment on column public.document_parties.is_signing_party is
'True when this person is designated as a signer for generated document flows.';

comment on column public.document_parties.sort_order is
'Zero-based display order within each party role.';

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute $fn$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$;
    $fn$;
  end if;
end;
$$;

drop trigger if exists trg_document_parties_set_updated_at on public.document_parties;

create trigger trg_document_parties_set_updated_at
before update on public.document_parties
for each row
execute function public.set_updated_at();
