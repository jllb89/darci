insert into public.poa_canonical_special_authorities (
  key,
  label,
  description,
  category,
  sort_order,
  is_core_national_key
)
values (
  'access_digital_assets',
  'Access digital assets',
  'Authority to access or manage the principal''s digital assets or electronic communications when state law permits.',
  'digital_assets',
  90,
  true
)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_core_national_key = excluded.is_core_national_key,
  updated_at = now();

with req as (
  select id
  from public.poa_requirements
  where jurisdiction = 'US-OH'
    and poa_type = 'general'
  limit 1
),
canon as (
  select id
  from public.poa_canonical_special_authorities
  where key = 'access_digital_assets'
)
insert into public.poa_special_authority_rules (
  poa_requirement_id,
  canonical_authority_id,
  explicitly_required,
  requirement_type,
  applies_to_general_financial_poa,
  statutory_form_only,
  custom_language_required,
  initials_required,
  checkbox_required,
  freeform_text_allowed,
  state_specific_label,
  statutory_text_excerpt,
  exact_statute_citation,
  plain_english_rule,
  confidence,
  legal_review_status,
  review_notes,
  renderer_metadata
)
select
  req.id,
  canon.id,
  false,
  'statutory_form_checkbox',
  true,
  false,
  false,
  false,
  true,
  false,
  'Digital assets',
  null,
  'Ohio Rev. Code § 1337.25; Ohio Rev. Code Chapter 2137',
  'Core Ohio POA authority-scope option for digital assets and electronic communications.',
  'high',
  'pending',
  'Seeded Ohio digital-assets authority as a core authority-scope subject for the OH POA template.',
  jsonb_build_object('authority_scope_surface', 'core_authority')
from req
cross join canon
on conflict (poa_requirement_id, canonical_authority_id) do update set
  explicitly_required = excluded.explicitly_required,
  requirement_type = excluded.requirement_type,
  applies_to_general_financial_poa = excluded.applies_to_general_financial_poa,
  statutory_form_only = excluded.statutory_form_only,
  custom_language_required = excluded.custom_language_required,
  initials_required = excluded.initials_required,
  checkbox_required = excluded.checkbox_required,
  freeform_text_allowed = excluded.freeform_text_allowed,
  state_specific_label = excluded.state_specific_label,
  statutory_text_excerpt = excluded.statutory_text_excerpt,
  exact_statute_citation = excluded.exact_statute_citation,
  plain_english_rule = excluded.plain_english_rule,
  confidence = excluded.confidence,
  legal_review_status = excluded.legal_review_status,
  review_notes = excluded.review_notes,
  renderer_metadata = excluded.renderer_metadata,
  updated_at = now();

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
values (
  'oh_poa_general',
  '2026.06.05.v2',
  'sha256:oh-poadoc-v2-digital-assets',
  'templates/oh_poa_general.template.md',
  'text/markdown',
  'other',
  jsonb_build_object(
    'renderer', 'context_snapshot',
    'localTemplatePath', '../docs/OH DDPOA 1.0.docx.md',
    'templateLabel', 'Ohio General POA',
    'changeNote', 'Adds Digital assets as an Ohio POA authority-scope subject.'
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

insert into public.template_registry (
  jurisdiction,
  output_key,
  document_key,
  template_key,
  template_version,
  template_hash,
  effective_from,
  is_active
)
values (
  'US-OH',
  'poa_document',
  'poa_general',
  'oh_poa_general',
  '2026.06.05.v2',
  'sha256:oh-poadoc-v2-digital-assets',
  now(),
  true
)
on conflict (jurisdiction, output_key, template_version)
do update set
  document_key = excluded.document_key,
  template_key = excluded.template_key,
  template_hash = excluded.template_hash,
  effective_to = null,
  is_active = excluded.is_active;