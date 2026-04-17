alter table public.document_system_values
  drop constraint if exists document_system_values_source_check,
  add constraint document_system_values_source_check
  check (source in (
    'document_idn',
    'submission_timestamp',
    'derived_url',
    'static_template_text',
    'template_profile',
    'review_approval',
    'signature_execution'
  ));