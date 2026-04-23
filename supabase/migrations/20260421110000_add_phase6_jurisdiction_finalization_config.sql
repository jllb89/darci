alter table public.jurisdiction_rules
  add column if not exists acknowledgment_template_version text,
  add column if not exists watermark_text_template text;

comment on column public.jurisdiction_rules.acknowledgment_template_version is
'Version identifier for the jurisdiction-specific acknowledgment template used during Phase 6 finalization.';

comment on column public.jurisdiction_rules.watermark_text_template is
'Jurisdiction-scoped Phase 6 watermark text template. Use {{idn}} as the final IDN placeholder.';

insert into public.jurisdiction_rules (
  jurisdiction,
  id_requirements,
  acknowledgment_template,
  acknowledgment_template_version,
  watermark_text_template,
  venue_required,
  consent_required,
  retention_days
)
select
  'US-CA',
  'Identity verification handled by notary; not stored by DARCI',
  'us_ca_acknowledgment_v1',
  '2026.04.21.v1',
  'DIGITAL ORIGINAL {{idn}}',
  true,
  true,
  null
where not exists (
  select 1
  from public.jurisdiction_rules
  where jurisdiction = 'US-CA'
);

insert into public.jurisdiction_rules (
  jurisdiction,
  id_requirements,
  acknowledgment_template,
  acknowledgment_template_version,
  watermark_text_template,
  venue_required,
  consent_required,
  retention_days
)
select
  'US-OH',
  'Identity verification handled by notary; not stored by DARCI',
  'us_oh_acknowledgment_v1',
  '2026.04.21.v1',
  'DIGITAL ORIGINAL {{idn}}',
  true,
  true,
  null
where not exists (
  select 1
  from public.jurisdiction_rules
  where jurisdiction = 'US-OH'
);

update public.jurisdiction_rules
set
  acknowledgment_template = case
    when jurisdiction = 'US-CA'
      and (acknowledgment_template is null or btrim(acknowledgment_template) = '')
      then 'us_ca_acknowledgment_v1'
    when jurisdiction = 'US-OH'
      and (
        acknowledgment_template is null
        or btrim(acknowledgment_template) = ''
        or acknowledgment_template ilike 'TODO:%'
      )
      then 'us_oh_acknowledgment_v1'
    else acknowledgment_template
  end,
  acknowledgment_template_version = coalesce(
    nullif(btrim(acknowledgment_template_version), ''),
    '2026.04.21.v1'
  ),
  watermark_text_template = coalesce(
    nullif(btrim(watermark_text_template), ''),
    'DIGITAL ORIGINAL {{idn}}'
  )
where jurisdiction in ('US-CA', 'US-OH');