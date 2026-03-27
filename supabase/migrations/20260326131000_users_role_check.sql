-- Enforce valid roles for users

update public.users
set role = 'member'
where role is null or role not in ('member', 'notary', 'admin');

alter table public.users
  alter column role set not null;

alter table public.users
  add constraint users_role_check
  check (role in ('member', 'notary', 'admin'));
