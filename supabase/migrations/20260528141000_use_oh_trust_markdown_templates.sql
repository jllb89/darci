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
)
on conflict (template_key, template_version, template_hash)
do update set
  artifact_storage_path = excluded.artifact_storage_path,
  artifact_mime_type = excluded.artifact_mime_type,
  render_engine = excluded.render_engine,
  artifact_metadata = excluded.artifact_metadata,
  is_active = excluded.is_active;

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