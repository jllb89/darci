-- Grants for authenticated role to read reference tables
grant select on table public.jurisdiction_rules to authenticated;
grant select on table public.documents to authenticated;
grant select on table public.notarization_requests to authenticated;
grant select on table public.illuminotarization_codes to authenticated;
grant select on table public.signatures to authenticated;
grant select on table public.signature_fields to authenticated;
grant select on table public.ledger_entries to authenticated;
grant select on table public.notary_profiles to authenticated;
