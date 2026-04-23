-- Phase 1: additive multi-role identity foundation.
-- Keep public.users.role as the legacy runtime compatibility field while
-- introducing a richer capability model alongside it.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  is_active_profile boolean not null default false,
  granted_by_user_id uuid references public.users(id) on delete set null,
  granted_reason text,
  metadata jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_role_check
    check (role in ('member', 'pro', 'notary', 'admin')),
  constraint user_roles_status_check
    check (status in ('active', 'suspended', 'revoked')),
  constraint user_roles_active_profile_status_check
    check (not is_active_profile or status = 'active')
);

create table if not exists public.user_role_verifications (
  id uuid primary key default gen_random_uuid(),
  user_role_id uuid not null references public.user_roles(id) on delete cascade,
  verification_type text not null,
  status text not null default 'pending',
  is_current boolean not null default true,
  requested_by_user_id uuid references public.users(id) on delete set null,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  external_reference text,
  review_notes text,
  metadata jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_role_verifications_type_check
    check (
      verification_type in (
        'identity',
        'manual_review',
        'license',
        'commission',
        'professional_registration'
      )
    ),
  constraint user_role_verifications_status_check
    check (status in ('pending', 'approved', 'rejected', 'expired', 'waived'))
);

create table if not exists public.pro_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  professional_type text,
  business_name text,
  contact_email text,
  contact_phone text,
  license_number text,
  license_jurisdiction text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_role_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  user_role_id uuid references public.user_roles(id) on delete set null,
  role text not null,
  previous_status text,
  next_status text not null,
  changed_by_user_id uuid references public.users(id) on delete set null,
  change_source text not null default 'system',
  change_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_role_history_role_check
    check (role in ('member', 'pro', 'notary', 'admin')),
  constraint user_role_history_previous_status_check
    check (
      previous_status is null
      or previous_status in ('active', 'suspended', 'revoked')
    ),
  constraint user_role_history_next_status_check
    check (next_status in ('active', 'suspended', 'revoked')),
  constraint user_role_history_source_check
    check (
      change_source in (
        'migration',
        'legacy_role_column',
        'admin_api',
        'manual_review',
        'system',
        'manual'
      )
    )
);

create table if not exists public.role_verification_artifacts (
  id uuid primary key default gen_random_uuid(),
  verification_id uuid not null references public.user_role_verifications(id) on delete cascade,
  artifact_kind text not null,
  storage_bucket text not null,
  storage_path text not null,
  uploaded_by_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint role_verification_artifacts_kind_check
    check (
      artifact_kind in (
        'license_document',
        'commission_certificate',
        'identity_document',
        'supporting_document',
        'manual_note',
        'other'
      )
    ),
  constraint role_verification_artifacts_storage_bucket_check
    check (btrim(storage_bucket) <> ''),
  constraint role_verification_artifacts_storage_path_check
    check (btrim(storage_path) <> '')
);

alter table public.notary_profiles
  add column if not exists review_notes text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('member', 'pro', 'notary', 'admin'));

create unique index if not exists ux_user_roles_user_role on public.user_roles(user_id, role);
create unique index if not exists ux_user_roles_active_profile_per_user
  on public.user_roles(user_id)
  where is_active_profile;
create index if not exists idx_user_roles_role_status on public.user_roles(role, status);
create index if not exists idx_user_roles_user_status on public.user_roles(user_id, status);

create unique index if not exists ux_user_role_verifications_current
  on public.user_role_verifications(user_role_id, verification_type)
  where is_current;
create index if not exists idx_user_role_verifications_role_status
  on public.user_role_verifications(user_role_id, status);
create index if not exists idx_user_role_verifications_expires_at
  on public.user_role_verifications(expires_at);

create unique index if not exists ux_pro_profiles_user on public.pro_profiles(user_id);

create index if not exists idx_user_role_history_user_created
  on public.user_role_history(user_id, created_at desc);
create index if not exists idx_user_role_history_role_created
  on public.user_role_history(role, created_at desc);

create index if not exists idx_role_verification_artifacts_verification
  on public.role_verification_artifacts(verification_id);

create index if not exists idx_notary_profiles_updated_at
  on public.notary_profiles(updated_at desc);

comment on column public.users.role is
  'Current active runtime role used by middleware and controllers. Once public.user_roles exists, this column is the selected active role, not the exhaustive capability list.';

comment on column public.user_roles.is_active_profile is
  'Marks the currently selected in-app profile role mirrored into public.users.role.';

alter table public.user_roles enable row level security;
alter table public.user_role_verifications enable row level security;
alter table public.pro_profiles enable row level security;
alter table public.user_role_history enable row level security;
alter table public.role_verification_artifacts enable row level security;

create policy "user_roles_select_self" on public.user_roles
  for select using (
    auth.uid() = (select supabase_user_id from public.users where id = user_id)
  );

create policy "user_roles_service_role_access" on public.user_roles
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "user_role_verifications_select_self" on public.user_role_verifications
  for select using (
    auth.uid() = (
      select users.supabase_user_id
      from public.users
      join public.user_roles on public.user_roles.user_id = public.users.id
      where public.user_roles.id = user_role_id
    )
  );

create policy "user_role_verifications_service_role_access" on public.user_role_verifications
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "pro_profiles_owner_access" on public.pro_profiles
  for all using (
    auth.uid() = (select supabase_user_id from public.users where id = user_id)
  )
  with check (
    auth.uid() = (select supabase_user_id from public.users where id = user_id)
  );

create policy "pro_profiles_service_role_access" on public.pro_profiles
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "user_role_history_select_self" on public.user_role_history
  for select using (
    auth.uid() = (select supabase_user_id from public.users where id = user_id)
  );

create policy "user_role_history_service_role_access" on public.user_role_history
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "role_verification_artifacts_select_self" on public.role_verification_artifacts
  for select using (
    auth.uid() = (
      select users.supabase_user_id
      from public.users
      join public.user_roles on public.user_roles.user_id = public.users.id
      join public.user_role_verifications
        on public.user_role_verifications.user_role_id = public.user_roles.id
      where public.user_role_verifications.id = verification_id
    )
  );

create policy "role_verification_artifacts_service_role_access" on public.role_verification_artifacts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.user_roles to authenticated;
grant select on table public.user_role_verifications to authenticated;
grant select on table public.pro_profiles to authenticated;
grant select on table public.user_role_history to authenticated;
grant select on table public.role_verification_artifacts to authenticated;

insert into public.user_roles (
  user_id,
  role,
  status,
  is_active_profile,
  granted_reason,
  metadata,
  activated_at,
  created_at,
  updated_at
)
select
  users.id,
  'member',
  'active',
  users.role not in ('pro', 'notary', 'admin'),
  'Backfilled during Phase 1 multi-role migration',
  jsonb_build_object('source', 'phase1_migration', 'backfill', 'member_capability'),
  users.created_at,
  users.created_at,
  now()
from public.users
on conflict (user_id, role) do update
  set status = 'active',
  is_active_profile = excluded.is_active_profile,
      granted_reason = excluded.granted_reason,
      metadata = excluded.metadata,
      activated_at = coalesce(public.user_roles.activated_at, excluded.activated_at),
      deactivated_at = null,
      updated_at = now();

insert into public.user_roles (
  user_id,
  role,
  status,
  is_active_profile,
  granted_reason,
  metadata,
  activated_at,
  created_at,
  updated_at
)
select
  users.id,
  'admin',
  'active',
  true,
  'Backfilled from public.users.role during Phase 1 migration',
  jsonb_build_object('source', 'phase1_migration', 'backfill', 'legacy_admin_role'),
  users.created_at,
  users.created_at,
  now()
from public.users
where users.role = 'admin'
on conflict (user_id, role) do update
  set status = 'active',
  is_active_profile = true,
      granted_reason = excluded.granted_reason,
      metadata = excluded.metadata,
      activated_at = coalesce(public.user_roles.activated_at, excluded.activated_at),
      deactivated_at = null,
      updated_at = now();

insert into public.user_roles (
  user_id,
  role,
  status,
  is_active_profile,
  granted_reason,
  metadata,
  activated_at,
  created_at,
  updated_at
)
select
  users.id,
  'notary',
  'active',
  users.role = 'notary',
  'Backfilled from legacy notary data during Phase 1 migration',
  jsonb_build_object('source', 'phase1_migration', 'backfill', 'legacy_notary_role'),
  coalesce(notary_profiles.created_at, users.created_at),
  coalesce(notary_profiles.created_at, users.created_at),
  now()
from public.users
left join public.notary_profiles on public.notary_profiles.user_id = users.id
where users.role = 'notary' or public.notary_profiles.id is not null
on conflict (user_id, role) do update
  set status = 'active',
  is_active_profile = excluded.is_active_profile,
      granted_reason = excluded.granted_reason,
      metadata = excluded.metadata,
      activated_at = coalesce(public.user_roles.activated_at, excluded.activated_at),
      deactivated_at = null,
      updated_at = now();

insert into public.user_role_history (
  user_id,
  user_role_id,
  role,
  previous_status,
  next_status,
  change_source,
  change_reason,
  metadata,
  created_at
)
select
  user_roles.user_id,
  user_roles.id,
  user_roles.role,
  null,
  user_roles.status,
  'migration',
  'Initial backfill during Phase 1 multi-role schema rollout',
  jsonb_build_object('source', 'phase1_migration'),
  user_roles.created_at
from public.user_roles
where not exists (
  select 1
  from public.user_role_history
  where public.user_role_history.user_role_id = public.user_roles.id
    and public.user_role_history.change_source = 'migration'
);

create or replace function public.sync_user_roles_from_legacy_role()
returns trigger
language plpgsql
as $$
declare
  active_role text;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  active_role := case
    when new.role in ('member', 'pro', 'notary', 'admin') then new.role
    else 'member'
  end;

  insert into public.user_roles (
    user_id,
    role,
    status,
    is_active_profile,
    granted_reason,
    metadata,
    activated_at
  )
  values (
    new.id,
    'member',
    'active',
    active_role = 'member',
    'Synced from public.users.role',
    jsonb_build_object('source', 'legacy_role_column'),
    now()
  )
  on conflict (user_id, role) do update
    set status = 'active',
        is_active_profile = excluded.is_active_profile,
        granted_reason = excluded.granted_reason,
        metadata = excluded.metadata,
        deactivated_at = null,
        updated_at = now();

  if active_role <> 'member' then
    insert into public.user_roles (
      user_id,
      role,
      status,
      is_active_profile,
      granted_reason,
      metadata,
      activated_at
    )
    values (
      new.id,
      active_role,
      'active',
      true,
      'Synced from public.users.role',
      jsonb_build_object('source', 'legacy_role_column'),
      now()
    )
    on conflict (user_id, role) do update
      set status = 'active',
          is_active_profile = true,
          granted_reason = excluded.granted_reason,
          metadata = excluded.metadata,
          deactivated_at = null,
          updated_at = now();
  end if;

  update public.user_roles
    set is_active_profile = (role = active_role and status = 'active'),
        updated_at = now()
  where user_id = new.id;

  return new;
end;
$$;

create or replace function public.sync_users_role_from_active_profile()
returns trigger
language plpgsql
as $$
declare
  target_user_id uuid;
  active_role text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  target_user_id := case
    when tg_op = 'DELETE' then old.user_id
    else new.user_id
  end;

  select public.user_roles.role
    into active_role
  from public.user_roles
  where public.user_roles.user_id = target_user_id
    and public.user_roles.is_active_profile = true
    and public.user_roles.status = 'active'
    and public.user_roles.role in ('member', 'pro', 'notary', 'admin')
  order by case public.user_roles.role
    when 'member' then 1
    when 'pro' then 2
    when 'notary' then 3
    else 4
  end
  limit 1;

  if active_role is null then
    select public.user_roles.role
      into active_role
    from public.user_roles
    where public.user_roles.user_id = target_user_id
      and public.user_roles.status = 'active'
      and public.user_roles.role in ('member', 'pro', 'notary', 'admin')
    order by case public.user_roles.role
      when 'member' then 1
      when 'pro' then 2
      when 'notary' then 3
      else 4
    end
    limit 1;
  end if;

  if active_role is null then
    active_role := 'member';
  end if;

  update public.users
    set role = active_role
  where public.users.id = target_user_id
    and public.users.role is distinct from active_role;

  return null;
end;
$$;

drop trigger if exists trg_user_roles_touch_updated_at on public.user_roles;
create trigger trg_user_roles_touch_updated_at
before update on public.user_roles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_user_role_verifications_touch_updated_at on public.user_role_verifications;
create trigger trg_user_role_verifications_touch_updated_at
before update on public.user_role_verifications
for each row execute function public.touch_updated_at();

drop trigger if exists trg_pro_profiles_touch_updated_at on public.pro_profiles;
create trigger trg_pro_profiles_touch_updated_at
before update on public.pro_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_notary_profiles_touch_updated_at on public.notary_profiles;
create trigger trg_notary_profiles_touch_updated_at
before update on public.notary_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists trg_users_sync_user_roles on public.users;
create trigger trg_users_sync_user_roles
after insert or update of role on public.users
for each row execute function public.sync_user_roles_from_legacy_role();

drop trigger if exists trg_user_roles_sync_users_role on public.user_roles;
create trigger trg_user_roles_sync_users_role
after insert or update or delete on public.user_roles
for each row execute function public.sync_users_role_from_active_profile();