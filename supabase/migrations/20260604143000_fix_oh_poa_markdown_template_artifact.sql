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
  '2026.04.14.v1',
  'sha256:oh-poadoc-v1',
  'templates/oh_poa_general.template.md',
  'text/markdown',
  'other',
  jsonb_build_object(
    'renderer', 'context_snapshot',
    'localTemplatePath', '../docs/OH DDPOA 1.0.docx.md',
    'templateLabel', 'Ohio General POA'
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
values
  ('US-OH', 'poa_document', 'poa_general', 'oh_poa_general', '2026.04.14.v1', 'sha256:oh-poadoc-v1', now(), true)
on conflict (jurisdiction, output_key, template_version)
do update set
  document_key = excluded.document_key,
  template_key = excluded.template_key,
  template_hash = excluded.template_hash,
  effective_to = null,
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
  (
    'poa_general',
    'OH_Notarial_Acknowledgment_Block',
    'Ohio acknowledgment text block.',
    true,
    'system',
    null,
    null,
    'Selected from template resolution / execution profile.',
    120,
    true
  )
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