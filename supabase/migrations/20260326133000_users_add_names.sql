-- Add name fields for auth and account setup

alter table public.users
  add column if not exists first_name text,
  add column if not exists last_name text;
