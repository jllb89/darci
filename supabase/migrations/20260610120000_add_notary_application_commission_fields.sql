alter table public.notary_profile_applications
  add column if not exists commission_number text,
  add column if not exists commission_expires_at timestamptz;