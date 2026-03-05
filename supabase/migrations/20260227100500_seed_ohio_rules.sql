-- Seed Ohio jurisdiction rules

insert into public.jurisdiction_rules (
  jurisdiction,
  id_requirements,
  acknowledgment_template,
  venue_required,
  consent_required,
  retention_days
) values (
  'US-OH',
  'Identity verification handled by notary; not stored by DARCI',
  'TODO: Ohio acknowledgment wording from client materials',
  true,
  true,
  null
) on conflict do nothing;
