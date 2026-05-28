-- Notary enrollment workflow: member application, admin approval, and editable notary profile.

create table if not exists public.notary_profile_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  jurisdiction text not null,
  service_area_kind text not null,
  service_area_name text not null,
  signature_data_url text,
  seal_data_url text,
  status text not null default 'pending',
  review_notes text,
  reviewed_by_user_id uuid references public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notary_profile_applications_status on public.notary_profile_applications(status);
create index if not exists idx_notary_profile_applications_user on public.notary_profile_applications(user_id);

alter table public.notary_profiles
  add column if not exists service_area_kind text,
  add column if not exists service_area_name text,
  add column if not exists signature_data_url text,
  add column if not exists seal_data_url text,
  add column if not exists updated_at timestamptz not null default now();
