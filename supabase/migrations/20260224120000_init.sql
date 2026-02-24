-- Initial schema for DARCI v1
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid unique,
  email text,
  role text default 'member',
  status text default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id),
  idn text not null unique,
  status text default 'draft',
  created_at timestamptz not null default now()
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  version integer not null default 1,
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.notarization_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  assigned_notary_id uuid references public.users(id),
  status text default 'pending',
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.illuminotarization_codes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.notarization_requests(id),
  code text not null unique,
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  signer_id uuid references public.users(id),
  signature_type text default 'member',
  storage_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.acknowledgment_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  jurisdiction text,
  content text,
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  idn text not null,
  hash text not null,
  ledger_tx_id text,
  anchored_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_owner on public.documents(owner_id);
create index if not exists idx_document_versions_document on public.document_versions(document_id);
create index if not exists idx_notarization_requests_document on public.notarization_requests(document_id);
create index if not exists idx_codes_request on public.illuminotarization_codes(request_id);
create index if not exists idx_signatures_document on public.signatures(document_id);
create index if not exists idx_ledger_entries_document on public.ledger_entries(document_id);
create index if not exists idx_audit_events_entity on public.audit_events(entity_type, entity_id);

alter table public.users enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.notarization_requests enable row level security;
alter table public.illuminotarization_codes enable row level security;
alter table public.signatures enable row level security;
alter table public.acknowledgment_pages enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.audit_events enable row level security;

create policy "users_select_self" on public.users
  for select using (auth.uid() = supabase_user_id);

create policy "users_insert_self" on public.users
  for insert with check (auth.uid() = supabase_user_id);

create policy "users_update_self" on public.users
  for update using (auth.uid() = supabase_user_id)
  with check (auth.uid() = supabase_user_id);

create policy "documents_owner_access" on public.documents
  for all using (auth.uid() = (select supabase_user_id from public.users where id = owner_id))
  with check (auth.uid() = (select supabase_user_id from public.users where id = owner_id));

create policy "document_versions_owner_access" on public.document_versions
  for all using (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
  )
  with check (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
  );

create policy "notarization_requests_owner_or_notary" on public.notarization_requests
  for all using (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.uid() = (select supabase_user_id from public.users where id = assigned_notary_id)
  )
  with check (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.role() = 'service_role'
  );

create policy "illuminotarization_codes_access" on public.illuminotarization_codes
  for select using (
    auth.role() = 'service_role'
    or auth.uid() = (select supabase_user_id from public.users
      join public.notarization_requests on public.notarization_requests.assigned_notary_id = public.users.id
      where public.notarization_requests.id = request_id)
    or auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      join public.notarization_requests on public.notarization_requests.document_id = public.documents.id
      where public.notarization_requests.id = request_id)
  );

create policy "illuminotarization_codes_write" on public.illuminotarization_codes
  for insert with check (auth.role() = 'service_role');

create policy "signatures_owner_or_notary" on public.signatures
  for all using (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.uid() = (select supabase_user_id from public.users
      join public.notarization_requests on public.notarization_requests.assigned_notary_id = public.users.id
      where public.notarization_requests.document_id = document_id)
  )
  with check (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.role() = 'service_role'
  );

create policy "acknowledgment_pages_access" on public.acknowledgment_pages
  for select using (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.role() = 'service_role'
  );

create policy "acknowledgment_pages_write" on public.acknowledgment_pages
  for insert with check (auth.role() = 'service_role');

create policy "ledger_entries_access" on public.ledger_entries
  for select using (
    auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.role() = 'service_role'
  );

create policy "ledger_entries_write" on public.ledger_entries
  for insert with check (auth.role() = 'service_role');

create policy "audit_events_admin_access" on public.audit_events
  for select using (auth.role() = 'service_role');

-- Storage buckets for documents and notarized assets
insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('signatures', 'signatures', false),
  ('notarized-copies', 'notarized-copies', false)
on conflict do nothing;

-- Basic storage policies (tighten for production)
create policy "documents_bucket_read" on storage.objects
  for select using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "documents_bucket_write" on storage.objects
  for insert with check (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "documents_bucket_update" on storage.objects
  for update using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "documents_bucket_delete" on storage.objects
  for delete using (bucket_id = 'documents' and auth.role() = 'authenticated');

create policy "signatures_bucket_write" on storage.objects
  for insert with check (bucket_id = 'signatures' and auth.role() = 'authenticated');

create policy "signatures_bucket_read" on storage.objects
  for select using (bucket_id = 'signatures' and auth.role() = 'authenticated');

create policy "signatures_bucket_update" on storage.objects
  for update using (bucket_id = 'signatures' and auth.role() = 'authenticated');

create policy "notarized_bucket_read" on storage.objects
  for select using (bucket_id = 'notarized-copies' and auth.role() = 'authenticated');

create policy "notarized_bucket_write" on storage.objects
  for insert with check (bucket_id = 'notarized-copies' and auth.role() = 'authenticated');

create policy "notarized_bucket_update" on storage.objects
  for update using (bucket_id = 'notarized-copies' and auth.role() = 'authenticated');
