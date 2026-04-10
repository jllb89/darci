-- Backfill a default principal party row for existing documents.

insert into public.document_parties (
  document_id,
  party_role,
  full_name,
  email,
  phone_country_code,
  phone,
  is_signing_party,
  sort_order,
  metadata
)
select
  d.id,
  'principal',
  coalesce(
    nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
    nullif(trim(u.email), ''),
    'Document Owner'
  ),
  nullif(trim(u.email), ''),
  '+1',
  null,
  false,
  0,
  jsonb_build_object(
    'seed_source',
    'documents_owner_user',
    'seed_migration',
    '20260407104500_seed_document_parties_from_documents'
  )
from public.documents d
join public.users u
  on u.id = d.owner_id
where not exists (
  select 1
  from public.document_parties p
  where p.document_id = d.id
    and p.party_role = 'principal'
);
