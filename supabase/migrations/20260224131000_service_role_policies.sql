create policy "users_service_role_access" on public.users
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "documents_service_role_access" on public.documents
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "document_versions_service_role_access" on public.document_versions
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "notarization_requests_service_role_access" on public.notarization_requests
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "illuminotarization_codes_service_role_access" on public.illuminotarization_codes
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "signatures_service_role_access" on public.signatures
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "signature_fields_service_role_access" on public.signature_fields
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "acknowledgment_pages_service_role_access" on public.acknowledgment_pages
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "ledger_entries_service_role_access" on public.ledger_entries
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "audit_events_service_role_access" on public.audit_events
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "jurisdiction_rules_service_role_access" on public.jurisdiction_rules
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "notary_profiles_service_role_access" on public.notary_profiles
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
