alter table public.documents
  add column if not exists updated_at timestamptz not null default now();

update public.documents
  set updated_at = created_at
  where updated_at is null;
