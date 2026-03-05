-- Allow assigned notary to read ledger entries for their requests

drop policy if exists "ledger_entries_access" on public.ledger_entries;

create policy "ledger_entries_access" on public.ledger_entries
  for select using (
    auth.role() = 'service_role'
    or auth.uid() = (select supabase_user_id from public.users
      join public.documents on public.documents.owner_id = public.users.id
      where public.documents.id = document_id)
    or auth.uid() = (select supabase_user_id from public.users
      join public.notarization_requests on public.notarization_requests.assigned_notary_id = public.users.id
      where public.notarization_requests.document_id = document_id)
  );
