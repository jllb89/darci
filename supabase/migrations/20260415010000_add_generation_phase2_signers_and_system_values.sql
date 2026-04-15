create table if not exists public.document_output_signers (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  generation_run_id uuid not null references public.document_generation_runs(id) on delete cascade,
  document_party_id uuid references public.document_parties(id) on delete set null,
  output_key text not null,
  document_key text not null,
  party_role text not null,
  party_name text not null,
  obligation_type text not null,
  signing_group text,
  is_required boolean not null default true,
  resolution_source text not null,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint document_output_signers_output_key_check
    check (output_key ~ '^[a-z0-9_]+$'),

  constraint document_output_signers_document_key_check
    check (document_key ~ '^[a-z0-9_]+$'),

  constraint document_output_signers_party_name_check
    check (btrim(party_name) <> ''),

  constraint document_output_signers_obligation_type_check
    check (obligation_type in ('signer', 'acknowledger', 'witness', 'notary')),

  constraint document_output_signers_resolution_source_check
    check (resolution_source in ('template', 'jurisdiction_rule', 'manual_override')),

  constraint document_output_signers_sort_order_check
    check (sort_order >= 0)
);

create unique index if not exists ux_document_output_signers_run_role_order
  on public.document_output_signers(generation_run_id, obligation_type, party_role, sort_order, party_name);

create index if not exists idx_document_output_signers_document
  on public.document_output_signers(document_id, generation_run_id, created_at);

create index if not exists idx_document_output_signers_run
  on public.document_output_signers(generation_run_id, obligation_type, sort_order);

alter table public.document_output_signers enable row level security;

drop policy if exists "document_output_signers_owner_access" on public.document_output_signers;

create policy "document_output_signers_owner_access" on public.document_output_signers
  for all using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
  )
  with check (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
  );

grant select on table public.document_output_signers to authenticated;

comment on table public.document_output_signers is
'Per-generation-run signer, acknowledger, witness, and notary obligation snapshots derived from canonical intake data and template rules.';

create table if not exists public.document_system_values (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  system_key text not null,
  value_json jsonb not null default 'null'::jsonb,
  source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_system_values_unique
    unique (document_id, system_key),

  constraint document_system_values_system_key_check
    check (system_key ~ '^[a-z0-9_]+$'),

  constraint document_system_values_source_check
    check (source in (
      'document_idn',
      'submission_timestamp',
      'derived_url',
      'static_template_text',
      'template_profile'
    ))
);

drop trigger if exists trg_document_system_values_set_updated_at on public.document_system_values;

create trigger trg_document_system_values_set_updated_at
before update on public.document_system_values
for each row
execute function public.set_updated_at();

create index if not exists idx_document_system_values_document
  on public.document_system_values(document_id, system_key);

alter table public.document_system_values enable row level security;

drop policy if exists "document_system_values_owner_access" on public.document_system_values;

create policy "document_system_values_owner_access" on public.document_system_values
  for all using (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
  )
  with check (
    auth.role() = 'service_role'
    or auth.uid() = (
      select u.supabase_user_id
      from public.users u
      join public.documents d on d.owner_id = u.id
      where d.id = document_id
    )
  );

grant select on table public.document_system_values to authenticated;

comment on table public.document_system_values is
'Durable document-scoped system values used to resolve render-time placeholders such as registry numbers, trust registration dates, verification URLs, and acknowledgment text profiles.';

insert into public.template_artifacts (
  template_key,
  template_version,
  template_hash,
  artifact_storage_path,
  artifact_mime_type,
  render_engine,
  artifact_metadata,
  is_active,
  created_at
)
values
  (
    'ca_poa_general',
    '2026.04.14.v1',
    'sha256:ca-poadoc-v1',
    'templates/ca_poa_general.template.md',
    'text/markdown',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'localTemplatePath', '../docs/CA DDPOA.md',
      'templateLabel', 'California DDPOA'
    ),
    true,
    now()
  ),
  (
    'ca_trust_rrr',
    '2026.04.14.v1',
    'sha256:ca-trustrrr-v1',
    'templates/ca_trust_rrr.template.md',
    'text/markdown',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'localTemplatePath', '../docs/CA - DARCi Trust Registration Amendment (APE 260305) (1).md',
      'templateLabel', 'California Trust Registration Amendment'
    ),
    true,
    now()
  ),
  (
    'ca_trust_certificate',
    '2026.04.14.v1',
    'sha256:ca-trustcert-v1',
    'templates/ca_trust_certificate.template.md',
    'text/markdown',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'localTemplatePath', '../docs/CA - DARCi Trust Certification (APE 260305).md',
      'templateLabel', 'California Certification of Trust'
    ),
    true,
    now()
  ),
  (
    'ca_uploaded_document_with_seal',
    '2026.04.14.v1',
    'sha256:ca-uploadseal-v1',
    'templates/ca_uploaded_document_with_seal.template.json',
    'application/json',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'templateLabel', 'California Uploaded Document With Seal'
    ),
    true,
    now()
  ),
  (
    'oh_poa_general',
    '2026.04.14.v1',
    'sha256:oh-poadoc-v1',
    'templates/oh_poa_general.template.json',
    'application/json',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'templateLabel', 'Ohio General POA'
    ),
    true,
    now()
  ),
  (
    'oh_trust_rrr',
    '2026.04.14.v1',
    'sha256:oh-trustrrr-v1',
    'templates/oh_trust_rrr.template.json',
    'application/json',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'templateLabel', 'Ohio Trust Registration Amendment'
    ),
    true,
    now()
  ),
  (
    'oh_trust_certificate',
    '2026.04.14.v1',
    'sha256:oh-trustcert-v1',
    'templates/oh_trust_certificate.template.json',
    'application/json',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'templateLabel', 'Ohio Certification of Trust'
    ),
    true,
    now()
  ),
  (
    'oh_uploaded_document_with_seal',
    '2026.04.14.v1',
    'sha256:oh-uploadseal-v1',
    'templates/oh_uploaded_document_with_seal.template.json',
    'application/json',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'templateLabel', 'Ohio Uploaded Document With Seal'
    ),
    true,
    now()
  )
on conflict (template_key, template_version, template_hash)
do update set
  artifact_storage_path = excluded.artifact_storage_path,
  artifact_mime_type = excluded.artifact_mime_type,
  render_engine = excluded.render_engine,
  artifact_metadata = excluded.artifact_metadata,
  is_active = excluded.is_active;

insert into public.template_binding_rules (
  document_key,
  placeholder,
  description,
  required,
  source,
  canonical_key,
  source_field_key,
  notes,
  sort_order,
  is_active
)
values
  ('trust_certificate', 'Trust.Name', 'Trust name shown in the certification heading and body.', true, 'member_form', 'trust_name', null, null, 10, true),
  ('trust_certificate', 'Trust.No', 'Registry number assigned to the trust.', true, 'system', null, null, 'Uses the document registry number provider.', 20, true),
  ('trust_certificate', 'Trust.Date', 'Trust creation date.', true, 'member_form', 'trust_date', null, null, 30, true),
  ('trust_certificate', 'Trust.Revoke', 'Who may revoke the trust.', true, 'member_form', 'revocation_holders', null, null, 40, true),
  ('trust_certificate', 'Trust.Maker.Tax.Name', 'Primary tax ID owner referenced by the trust.', true, 'member_form', 'tax_id_owner', null, null, 50, true),
  ('trust_certificate', 'Trust.RegDate', 'Trust registration date assigned by DARCi.', true, 'system', null, null, 'Persisted as a document system value at generation time.', 60, true),
  ('trust_certificate', 'TrustName', 'Alternative trust name placeholder used in title formatting.', true, 'member_form', 'trust_name', null, null, 70, true),
  ('trust_certificate', 'Trustees', 'Current trustees listed in the certification and acknowledgment.', true, 'member_form', 'trustees', null, null, 80, true),
  ('trust_certificate', 'SignatureAuthority', 'Signature rule for currently acting trustees.', true, 'member_form', 'trustee_signature_authority', null, null, 90, true),
  ('trust_certificate', 'TrustState', 'Governing state law for the trust.', true, 'member_form', 'jurisdiction', null, null, 100, true),
  ('trust_certificate', 'NotaryState', 'State used for the perjury and notarial acknowledgment block.', false, 'notary', null, null, 'Deferred until notarial execution metadata is captured.', 110, true),
  ('trust_certificate', 'TM1/TM2 signatures', 'Trustmaker signature placeholders that remain in the source template but are not currently required for signer obligation resolution.', false, 'member_form', 'grantors', null, 'Template contains trustmaker signature blocks; current policy resolves trustees as the required certificate signers.', 120, true),
  ('trust_certificate', 'Trustee1/Trustee2 signatures', 'Trustee signature participants for certification execution.', true, 'member_form', 'trustees', null, null, 130, true),
  ('trust_certificate', 'County / Day / Month / Year', 'Notarial acknowledgment venue and date details.', true, 'notary', null, null, 'Collected during the notary/execution phase.', 140, true),
  ('trust_certificate', 'illuminotary', 'Notary identity used in the acknowledgment block.', true, 'notary', null, null, null, 150, true)
on conflict (document_key, placeholder)
do update set
  description = excluded.description,
  required = excluded.required,
  source = excluded.source,
  canonical_key = excluded.canonical_key,
  source_field_key = excluded.source_field_key,
  notes = excluded.notes,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();