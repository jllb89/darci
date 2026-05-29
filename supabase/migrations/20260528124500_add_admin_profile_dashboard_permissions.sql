-- Admin profile dashboard capabilities.

create table if not exists public.admin_permissions (
  user_id uuid primary key references public.users(id) on delete cascade,
  can_manage_admins boolean not null default false,
  can_review_notaries boolean not null default true,
  can_manage_users boolean not null default true,
  can_view_audit boolean not null default true,
  can_manage_platform_rules boolean not null default false,
  granted_by_user_id uuid references public.users(id) on delete set null,
  granted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_permissions_manage_admins
  on public.admin_permissions(can_manage_admins)
  where can_manage_admins;

alter table public.admin_permissions enable row level security;

drop policy if exists "admin_permissions_service_role_access" on public.admin_permissions;
create policy "admin_permissions_service_role_access" on public.admin_permissions
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.admin_permissions to authenticated;

with target_users as (
  select id
  from public.users
  where lower(email) = 'lopezb.jl@gmail.com'
)
update public.user_roles ur
set is_active_profile = false,
  updated_at = now()
from target_users
where ur.user_id = target_users.id
  and ur.is_active_profile = true;

insert into public.user_roles (user_id, role, status, is_active_profile, granted_reason)
select id, 'admin', 'active', true, 'Bootstrap admin manager'
from public.users
where lower(email) = 'lopezb.jl@gmail.com'
on conflict (user_id, role) do update
set status = 'active',
  is_active_profile = true,
  granted_reason = coalesce(public.user_roles.granted_reason, excluded.granted_reason),
  updated_at = now();

update public.users
set role = 'admin'
where lower(email) = 'lopezb.jl@gmail.com';

insert into public.admin_permissions (
  user_id,
  can_manage_admins,
  can_review_notaries,
  can_manage_users,
  can_view_audit,
  can_manage_platform_rules,
  granted_reason
)
select id, true, true, true, true, false, 'Bootstrap admin manager'
from public.users
where lower(email) = 'lopezb.jl@gmail.com'
on conflict (user_id) do update
set can_manage_admins = true,
  can_review_notaries = true,
  can_manage_users = true,
  can_view_audit = true,
  updated_at = now();