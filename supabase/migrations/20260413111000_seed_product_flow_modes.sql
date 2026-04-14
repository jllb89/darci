-- Seed product flow modes, family mappings, output bundles, and jurisdiction availability.

insert into public.product_flow_modes (
  mode_key,
  display_name,
  description,
  is_active,
  is_default,
  sort_order
)
values
  (
    'poa_only',
    'Generate a POA',
    'Generate a Power of Attorney document using jurisdiction-aware requirements.',
    true,
    false,
    10
  ),
  (
    'trust_bundle',
    'Generate a Trust',
    'Generate Trust Registration Amendment, Certificate of Trust, and POA from one intake.',
    true,
    true,
    20
  ),
  (
    'notarize_document',
    'Notarize a Document',
    'Collect POA inputs and uploaded document details for notarization workflow.',
    true,
    false,
    30
  )
on conflict (mode_key)
do update set
  display_name = excluded.display_name,
  description = excluded.description,
  is_active = excluded.is_active,
  is_default = excluded.is_default,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.product_flow_modes
set
  is_default = (mode_key = 'trust_bundle'),
  updated_at = now()
where mode_key in ('poa_only', 'trust_bundle', 'notarize_document');

insert into public.product_flow_mode_families (
  mode_id,
  family,
  default_document_type,
  is_required,
  sort_order
)
select
  mode.id,
  seed.family,
  seed.default_document_type,
  seed.is_required,
  seed.sort_order
from public.product_flow_modes mode
join (
  values
    ('poa_only', 'poa', 'general', true, 10),
    ('trust_bundle', 'poa', 'general', true, 10),
    ('trust_bundle', 'trust', 'rrr', true, 20),
    ('notarize_document', 'poa', 'general', true, 10)
) as seed(mode_key, family, default_document_type, is_required, sort_order)
  on seed.mode_key = mode.mode_key
on conflict (mode_id, family)
do update set
  default_document_type = excluded.default_document_type,
  is_required = excluded.is_required,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.product_flow_mode_outputs (
  mode_id,
  output_key,
  output_label,
  is_required,
  sort_order,
  metadata
)
select
  mode.id,
  seed.output_key,
  seed.output_label,
  seed.is_required,
  seed.sort_order,
  seed.metadata::jsonb
from public.product_flow_modes mode
join (
  values
    ('poa_only', 'poa_document', 'Power of Attorney', true, 10, '{}'),
    ('trust_bundle', 'trust_certificate', 'Certificate of Trust', true, 10, '{}'),
    ('trust_bundle', 'trust_rrr', 'Trust Registration Amendment', true, 20, '{}'),
    ('trust_bundle', 'poa_document', 'Power of Attorney', true, 30, '{}'),
    ('notarize_document', 'poa_document', 'Power of Attorney', true, 10, '{}'),
    ('notarize_document', 'uploaded_document_with_seal', 'Uploaded Document with Applied Seal', true, 20, '{}')
) as seed(mode_key, output_key, output_label, is_required, sort_order, metadata)
  on seed.mode_key = mode.mode_key
on conflict (mode_id, output_key)
do update set
  output_label = excluded.output_label,
  is_required = excluded.is_required,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.product_flow_mode_ui (
  mode_id,
  group_key,
  layout_mode,
  show_upload_column,
  upload_required,
  sort_order,
  metadata
)
select
  mode.id,
  seed.group_key,
  seed.layout_mode,
  seed.show_upload_column,
  seed.upload_required,
  seed.sort_order,
  seed.metadata::jsonb
from public.product_flow_modes mode
join (
  values
    ('poa_only', 'general_information', 'wizard-step', false, false, 10, '{}'),
    ('poa_only', 'poa_requirements', 'wizard-step', false, false, 20, '{}'),
    ('trust_bundle', 'general_information', 'wizard-step', true, false, 10, '{}'),
    ('trust_bundle', 'poa_requirements', 'wizard-step', true, false, 20, '{}'),
    ('trust_bundle', 'trust_requirements', 'wizard-step', true, false, 30, '{}'),
    ('notarize_document', 'general_information', 'wizard-step', true, true, 10, '{}'),
    ('notarize_document', 'poa_requirements', 'wizard-step', true, true, 20, '{}')
) as seed(mode_key, group_key, layout_mode, show_upload_column, upload_required, sort_order, metadata)
  on seed.mode_key = mode.mode_key
on conflict (mode_id, group_key)
do update set
  layout_mode = excluded.layout_mode,
  show_upload_column = excluded.show_upload_column,
  upload_required = excluded.upload_required,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.jurisdiction_product_availability (
  jurisdiction,
  family,
  document_type,
  is_available,
  reason_if_unavailable,
  seeded_at
)
select
  requirements.jurisdiction,
  'poa'::text,
  requirements.poa_type,
  true,
  null,
  now()
from public.poa_requirements requirements
on conflict (jurisdiction, family, document_type)
do update set
  is_available = excluded.is_available,
  reason_if_unavailable = excluded.reason_if_unavailable,
  seeded_at = coalesce(public.jurisdiction_product_availability.seeded_at, excluded.seeded_at),
  updated_at = now();

insert into public.jurisdiction_product_availability (
  jurisdiction,
  family,
  document_type,
  is_available,
  reason_if_unavailable,
  seeded_at
)
select
  requirements.jurisdiction,
  'trust'::text,
  requirements.document_type,
  true,
  null,
  now()
from public.trust_requirements requirements
on conflict (jurisdiction, family, document_type)
do update set
  is_available = excluded.is_available,
  reason_if_unavailable = excluded.reason_if_unavailable,
  seeded_at = coalesce(public.jurisdiction_product_availability.seeded_at, excluded.seeded_at),
  updated_at = now();

insert into public.jurisdiction_product_availability (
  jurisdiction,
  family,
  document_type,
  is_available,
  reason_if_unavailable,
  seeded_at
)
select
  requirements.jurisdiction,
  'idn'::text,
  requirements.document_type,
  true,
  null,
  now()
from public.idn_requirements requirements
on conflict (jurisdiction, family, document_type)
do update set
  is_available = excluded.is_available,
  reason_if_unavailable = excluded.reason_if_unavailable,
  seeded_at = coalesce(public.jurisdiction_product_availability.seeded_at, excluded.seeded_at),
  updated_at = now();
