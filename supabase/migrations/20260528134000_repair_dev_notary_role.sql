-- Repair accidental admin bootstrap for the dev notary test user.

with target_user as (
  select id
  from public.users
  where lower(email) = 'dev.intelligentleads@gmail.com'
)
update public.user_roles ur
set is_active_profile = false,
  updated_at = now()
from target_user tu
where ur.user_id = tu.id
  and ur.is_active_profile = true;

with target_user as (
  select id
  from public.users
  where lower(email) = 'dev.intelligentleads@gmail.com'
)
update public.user_roles ur
set status = 'revoked',
  is_active_profile = false,
  updated_at = now()
from target_user tu
where ur.user_id = tu.id
  and ur.role = 'admin';

delete from public.admin_permissions ap
using public.users u
where ap.user_id = u.id
  and lower(u.email) = 'dev.intelligentleads@gmail.com';

insert into public.user_roles (user_id, role, status, is_active_profile, granted_reason)
select id, 'member', 'active', true, 'Repair accidental admin bootstrap'
from public.users
where lower(email) = 'dev.intelligentleads@gmail.com'
on conflict (user_id, role) do update
set status = 'active',
  is_active_profile = true,
  granted_reason = coalesce(public.user_roles.granted_reason, excluded.granted_reason),
  updated_at = now();

insert into public.user_roles (user_id, role, status, is_active_profile, granted_reason)
select distinct u.id, 'notary', 'active', false, 'Restored from approved notary profile'
from public.users u
where lower(u.email) = 'dev.intelligentleads@gmail.com'
  and (
    exists (
      select 1
      from public.notary_profiles np
      where np.user_id = u.id
    )
    or exists (
      select 1
      from public.notary_profile_applications npa
      where npa.user_id = u.id
        and npa.status = 'approved'
    )
  )
on conflict (user_id, role) do update
set status = 'active',
  is_active_profile = false,
  granted_reason = coalesce(public.user_roles.granted_reason, excluded.granted_reason),
  updated_at = now();

update public.users
set role = 'member'
where lower(email) = 'dev.intelligentleads@gmail.com';