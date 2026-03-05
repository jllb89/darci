-- Add optional embeddings table for AI search over audit events
create extension if not exists vector;

create table if not exists public.audit_event_embeddings (
  id uuid primary key default gen_random_uuid(),
  audit_event_id uuid not null references public.audit_events(id) on delete cascade,
  embedding vector(1536),
  model text not null,
  input_hash text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_event_embeddings_event
  on public.audit_event_embeddings(audit_event_id);

alter table public.audit_event_embeddings enable row level security;

create policy "audit_event_embeddings_service_role_access" on public.audit_event_embeddings
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
