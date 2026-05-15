-- Phone auth mirrors for Supabase Auth users.
-- Supabase remains the source of truth for phone OTP/session state.

alter table public.users
  alter column email drop not null,
  add column if not exists phone text,
  add column if not exists phone_confirmed_at timestamptz;

alter table public.users
  drop constraint if exists users_phone_e164_check;

alter table public.users
  add constraint users_phone_e164_check
  check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$');

create unique index if not exists ux_users_phone_not_null
  on public.users(phone)
  where phone is not null;

create index if not exists idx_users_phone_confirmed_at
  on public.users(phone_confirmed_at);

comment on column public.users.phone is
  'Mirror of Supabase Auth phone for phone OTP accounts; Supabase remains the source of truth.';

comment on column public.users.phone_confirmed_at is
  'Mirror of Supabase Auth phone confirmation timestamp for support and auth state visibility.';