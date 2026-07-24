alter table public.users
  add column if not exists address text;

comment on column public.users.address is
  'Member-provided mailing address displayed in personal profile settings.';