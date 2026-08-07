drop index if exists public.ux_ledger_entries_document;

create unique index if not exists ux_ledger_entries_document_hash
  on public.ledger_entries(document_id, hash);