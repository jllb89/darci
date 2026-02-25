-- Constraints and indexes for DARCI v1

-- Core constraints
alter table public.users
  alter column supabase_user_id set not null,
  alter column email set not null;

alter table public.documents
  alter column status set not null,
  alter column document_type set not null,
  alter column jurisdiction set not null;

alter table public.document_versions
  alter column storage_path set not null,
  alter column file_name set not null,
  alter column mime_type set not null,
  alter column size_bytes set not null;

alter table public.notarization_requests
  alter column status set not null;

alter table public.illuminotarization_codes
  alter column status set not null;

alter table public.signatures
  alter column signature_type set not null;

alter table public.signature_fields
  alter column page_number set not null,
  alter column x set not null,
  alter column y set not null,
  alter column width set not null,
  alter column height set not null;

alter table public.jurisdiction_rules
  alter column jurisdiction set not null;

alter table public.notary_profiles
  alter column user_id set not null;

-- Check constraints
alter table public.documents
  add constraint documents_status_check
  check (status in ('draft','pending_signature','pending_notary','notarized','rejected'));

alter table public.notarization_requests
  add constraint notarization_requests_status_check
  check (status in ('pending','in_review','completed','rejected'));

alter table public.illuminotarization_codes
  add constraint illuminotarization_codes_status_check
  check (status in ('active','expired','consumed','revoked','resent','regenerated'));

alter table public.signatures
  add constraint signatures_type_check
  check (signature_type in ('member','notary'));

alter table public.illuminotarization_codes
  add constraint illuminotarization_codes_attempt_check
  check (attempt_count >= 0);

alter table public.document_versions
  add constraint document_versions_size_check
  check (size_bytes >= 0);

alter table public.jurisdiction_rules
  add constraint jurisdiction_rules_retention_check
  check (retention_days is null or retention_days >= 0);

-- Uniqueness
create unique index if not exists ux_ledger_entries_document on public.ledger_entries(document_id);
create unique index if not exists ux_notary_profiles_user on public.notary_profiles(user_id);

-- Additional indexes for lookups
create index if not exists idx_documents_idn on public.documents(idn);
create index if not exists idx_documents_status on public.documents(status);
create index if not exists idx_notarization_requests_status on public.notarization_requests(status);
create index if not exists idx_notarization_requests_assigned on public.notarization_requests(assigned_notary_id);
create index if not exists idx_codes_code on public.illuminotarization_codes(code);
create index if not exists idx_codes_status on public.illuminotarization_codes(status);
create index if not exists idx_ledger_entries_idn on public.ledger_entries(idn);
create index if not exists idx_audit_events_actor on public.audit_events(actor_id);
create index if not exists idx_audit_events_created on public.audit_events(created_at);

-- Storage bucket validation (ensure buckets exist)
insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('signatures', 'signatures', false),
  ('notarized-copies', 'notarized-copies', false)
on conflict do nothing;
