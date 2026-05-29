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
    'oh_trust_rrr',
    '2026.04.14.v1',
    'sha256:oh-trustrrr-v1',
    'templates/oh_trust_rrr.template.md',
    'text/markdown',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'localTemplatePath', '../docs/OH - DARCi Trust Registration Amendment .md',
      'templateLabel', 'Ohio Trust Registration Amendment'
    ),
    true,
    now()
  ),
  (
    'oh_trust_certificate',
    '2026.04.14.v1',
    'sha256:oh-trustcert-v1',
    'templates/oh_trust_certificate.template.md',
    'text/markdown',
    'other',
    jsonb_build_object(
      'renderer', 'context_snapshot',
      'localTemplatePath', '../docs/OH - DARCi Trust Certification .md',
      'templateLabel', 'Ohio Certification of Trust'
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
  ('US-OH', 'trust_rrr', 'trust_rrr', 'oh_trust_rrr', '2026.04.14.v1', 'sha256:oh-trustrrr-v1', now(), true),
  ('US-OH', 'trust_certificate', 'trust_certificate', 'oh_trust_certificate', '2026.04.14.v1', 'sha256:oh-trustcert-v1', now(), true)
on conflict (jurisdiction, output_key, template_version)
do update set
  document_key = excluded.document_key,
  template_key = excluded.template_key,
  template_hash = excluded.template_hash,
  effective_to = null,
  is_active = excluded.is_active;