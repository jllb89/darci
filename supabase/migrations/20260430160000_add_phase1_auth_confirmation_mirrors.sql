-- Phase 1 auth lifecycle mirrors for Supabase Auth state

alter table public.users
  add column if not exists email_confirmed_at timestamptz,
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists last_auth_synced_at timestamptz;

create index if not exists idx_users_email_confirmed_at
  on public.users(email_confirmed_at);

create index if not exists idx_users_last_auth_synced_at
  on public.users(last_auth_synced_at desc);

comment on column public.users.email_confirmed_at is
  'Mirror of Supabase Auth email confirmation timestamp for app gating and support views; Supabase remains the source of truth.';

comment on column public.users.last_sign_in_at is
  'Mirror of Supabase Auth last sign-in timestamp when available from Auth user payloads.';

comment on column public.users.last_auth_synced_at is
  'Timestamp when DARCi last synchronized the local profile row from Supabase Auth.';