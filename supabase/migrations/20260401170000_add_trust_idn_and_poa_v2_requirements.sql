-- Add Trust + IDN requirement structures and POA v2 schema support.
-- This migration aligns database structures with docs:
-- - docs/trust-input-requirements-schema.md
-- - docs/idn-input-requirements-schema.md
-- - docs/poa-input-requirements-schema.md

-- ---------------------------------------------------------------------------
-- TRUST REQUIREMENTS
-- ---------------------------------------------------------------------------

create table if not exists public.trust_requirements (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  document_type text not null,
  ui_profile text not null default 'trust_standard',
  derivation_mode text not null default 'rules_plus_overrides',

  governing_law text,
  utc_adopted text,
  revocability_presumption text,
  writing_required text,
  signature_required text,
  notarization_required text,
  witnesses_required text,
  special_execution_rules text,
  trust_certification_statutory_basis text,
  certification_required_elements text,
  certification_permissive_elements text,
  certification_prohibited_elements text,
  non_default_powers_requiring_express_authority text,
  statutory_form_available text,
  pour_over_will_recognized text,
  registration_requirement text,
  real_property_rule text,
  competency_requirement text,
  specific_authority_required_for_certain_acts text,
  manual_review_required_text text,

  trust_system text,
  execution_level text,
  acknowledgment_profile text,
  base_template_key text,
  state_overlay_key text,

  asset_protection boolean not null default false,
  directed_trusts boolean not null default false,
  decanting_friendly boolean not null default false,
  silent_trust_friendly boolean not null default false,

  normalization_confidence text not null default 'medium',

  source_citation text,
  source_url text,
  review_status text not null default 'draft',
  reviewed_at timestamptz,
  reviewed_by text,
  notes text,

  input_requirements jsonb not null default '{}'::jsonb,
  input_requirements_schema_version text,
  input_requirements_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trust_requirements_document_type_check
    check (document_type in ('rrr', 'certification', 'other')),

  constraint trust_requirements_derivation_mode_check
    check (derivation_mode in ('rules_only', 'rules_plus_overrides', 'manual_review')),

  constraint trust_requirements_trust_system_check
    check (
      trust_system is null
      or trust_system in (
        'UTC_STANDARD',
        'UTC_PLUS',
        'NON_UTC_STANDARD',
        'TRUST_FRIENDLY',
        'CIVIL_LAW'
      )
    ),

  constraint trust_requirements_execution_level_check
    check (
      execution_level is null
      or execution_level in (
        'STANDARD',
        'NOTARIZATION_REQUIRED',
        'ACK_OR_WITNESS_ALTERNATIVE',
        'FORMAL_ACT'
      )
    ),

  constraint trust_requirements_normalization_confidence_check
    check (normalization_confidence in ('high', 'medium', 'low')),

  constraint trust_requirements_review_status_check
    check (review_status in (
      'draft',
      'verified',
      'needs_review'
    )),

  constraint trust_requirements_unique_jurisdiction_type
    unique (jurisdiction, document_type)
);

create index if not exists idx_trust_requirements_jurisdiction
  on public.trust_requirements(jurisdiction);

create index if not exists idx_trust_requirements_document_type
  on public.trust_requirements(document_type);

create index if not exists idx_trust_requirements_review_status
  on public.trust_requirements(review_status);

create index if not exists idx_trust_requirements_trust_system
  on public.trust_requirements(trust_system);

alter table public.trust_requirements enable row level security;

drop policy if exists "trust_requirements_read" on public.trust_requirements;
create policy "trust_requirements_read" on public.trust_requirements
  for select using (true);

drop policy if exists "trust_requirements_write" on public.trust_requirements;
create policy "trust_requirements_write" on public.trust_requirements
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.trust_requirements to authenticated;

alter table public.trust_requirements
  add column if not exists api_representation_mode text not null default 'sectioned_only',
  add column if not exists manual_review_required boolean not null default false;

alter table public.trust_requirements
  drop constraint if exists trust_requirements_api_representation_mode_check;

alter table public.trust_requirements
  add constraint trust_requirements_api_representation_mode_check
    check (api_representation_mode in ('sectioned_only', 'sectioned_plus_flattened_summaries'));

-- ---------------------------------------------------------------------------
-- IDN REQUIREMENTS
-- ---------------------------------------------------------------------------

create table if not exists public.idn_requirements (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  document_type text not null default 'acknowledgment',
  ui_profile text not null default 'idn_standard',
  derivation_mode text not null default 'rules_plus_overrides',
  api_representation_mode text not null default 'sectioned_only',

  governing_law text,
  acknowledgment_form text,
  notary_commission_authority text,
  venue_requirement text,
  signer_identification text,
  witness_requirements text,
  remote_online_notarization text,
  e_notarization text,
  notarial_certificate_required_elements text,
  seal_stamp_requirements text,
  commission_expiration_on_certificate text,
  recording_requirements text,
  competency_of_signer text,

  notarial_system text,
  execution_presence_mode text,
  digital_channel_status text,
  acknowledgment_profile text,
  base_template_key text,
  jurisdiction_overlay_key text,

  ron_allowed boolean not null default false,
  e_notarization_allowed boolean not null default false,
  witnesses_required_for_primary_act boolean not null default false,
  personal_knowledge_only_identification_allowed boolean not null default false,
  credible_witness_identification_allowed boolean not null default false,
  commission_expiration_on_certificate_required boolean not null default false,
  statutory_short_form_available boolean not null default false,
  custom_certificate_language_required boolean not null default false,

  normalization_confidence text not null default 'medium',

  source_citation text,
  source_url text,
  review_status text not null default 'draft',
  reviewed_at timestamptz,
  reviewed_by text,
  notes text,

  input_requirements jsonb not null default '{}'::jsonb,
  input_requirements_schema_version text,
  input_requirements_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint idn_requirements_document_type_check
    check (document_type in ('acknowledgment', 'authentic_act', 'public_instrument')),

  constraint idn_requirements_derivation_mode_check
    check (derivation_mode in ('rules_only', 'rules_plus_overrides', 'manual_review')),

  constraint idn_requirements_api_representation_mode_check
    check (api_representation_mode in ('sectioned_only', 'sectioned_plus_flattened_summaries')),

  constraint idn_requirements_notarial_system_check
    check (
      notarial_system is null
      or notarial_system in (
        'COMMON_LAW_STANDARD',
        'COMMON_LAW_VARIANT',
        'CIVIL_LAW_AUTHENTIC_ACT',
        'CIVIL_LAW_PUBLIC_INSTRUMENT'
      )
    ),

  constraint idn_requirements_execution_presence_mode_check
    check (
      execution_presence_mode is null
      or execution_presence_mode in (
        'IN_PERSON_ONLY',
        'IN_PERSON_OR_REMOTE_ALLOWED',
        'CIVIL_LAW_IN_PERSON_DEFAULT'
      )
    ),

  constraint idn_requirements_digital_channel_status_check
    check (
      digital_channel_status is null
      or digital_channel_status in (
        'RON_AUTHORIZED',
        'E_NOTARIZATION_AUTHORIZED_NO_RON',
        'DIGITAL_NOT_AUTHORIZED',
        'DIGITAL_STATUS_EVOLVING'
      )
    ),

  constraint idn_requirements_normalization_confidence_check
    check (normalization_confidence in ('high', 'medium', 'low')),

  constraint idn_requirements_review_status_check
    check (review_status in (
      'draft',
      'verified',
      'needs_review'
    )),

  constraint idn_requirements_unique_jurisdiction_type
    unique (jurisdiction, document_type)
);

create index if not exists idx_idn_requirements_jurisdiction
  on public.idn_requirements(jurisdiction);

create index if not exists idx_idn_requirements_document_type
  on public.idn_requirements(document_type);

create index if not exists idx_idn_requirements_review_status
  on public.idn_requirements(review_status);

create index if not exists idx_idn_requirements_notarial_system
  on public.idn_requirements(notarial_system);

alter table public.idn_requirements enable row level security;

drop policy if exists "idn_requirements_read" on public.idn_requirements;
create policy "idn_requirements_read" on public.idn_requirements
  for select using (true);

drop policy if exists "idn_requirements_write" on public.idn_requirements;
create policy "idn_requirements_write" on public.idn_requirements
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.idn_requirements to authenticated;

alter table public.idn_requirements
  add column if not exists manual_review_required boolean not null default false;

-- ---------------------------------------------------------------------------
-- POA V2 EXTENSIONS
-- ---------------------------------------------------------------------------

alter table public.poa_requirements
  add column if not exists api_representation_mode text not null default 'sectioned_only',
  add column if not exists derivation_mode text not null default 'rules_plus_overrides',
  add column if not exists poa_system text,
  add column if not exists execution_model text,
  add column if not exists execution_profile text,
  add column if not exists notary_required boolean,
  add column if not exists witnesses_required boolean,
  add column if not exists alternative_execution_path_allowed boolean,
  add column if not exists special_authority_initials_required boolean,
  add column if not exists statutory_form_available boolean,
  add column if not exists springing_authority_supported boolean,
  add column if not exists durability_default_presumed boolean,
  add column if not exists type_specific_execution_rules_present boolean,
  add column if not exists execution_rule text,
  add column if not exists durability_default_status text,
  add column if not exists specific_authority_status text,
  add column if not exists effective_date_status text,
  add column if not exists statutory_form_status text,
  add column if not exists competency_status text,
  add column if not exists normalization_confidence text not null default 'medium',
  add column if not exists base_template_key text,
  add column if not exists state_overlay_key text,
  add column if not exists input_requirements jsonb not null default '{}'::jsonb,
  add column if not exists input_requirements_schema_version text,
  add column if not exists input_requirements_updated_at timestamptz;

update public.poa_requirements
set
  notary_required = coalesce(notary_required, false),
  witnesses_required = coalesce(witnesses_required, false),
  alternative_execution_path_allowed = coalesce(alternative_execution_path_allowed, false),
  special_authority_initials_required = coalesce(special_authority_initials_required, false),
  statutory_form_available = coalesce(statutory_form_available, false),
  springing_authority_supported = coalesce(springing_authority_supported, false),
  durability_default_presumed = coalesce(durability_default_presumed, false),
  type_specific_execution_rules_present = coalesce(type_specific_execution_rules_present, false);

-- Normalize legacy values before enforcing stricter v2 checks.
update public.poa_requirements
set
  review_status = case
    when review_status is null then 'draft'
    when review_status in ('draft', 'verified', 'needs_review') then review_status
    when review_status in ('reviewed', 'approved') then 'verified'
    when review_status in ('blocked', 'needs_update', 'deprecated') then 'needs_review'
    else 'needs_review'
  end,
  poa_type = case
    when poa_type is null then null
    when poa_type in ('general', 'durable', 'medical', 'limited') then poa_type
    when lower(poa_type) in ('healthcare', 'health_care', 'medical_poa') then 'medical'
    when lower(poa_type) in ('financial', 'general_financial') then 'general'
    when lower(poa_type) in ('springing', 'special', 'limited_special') then 'limited'
    else null
  end;

alter table public.poa_requirements
  alter column notary_required set default false,
  alter column notary_required set not null,
  alter column witnesses_required set default false,
  alter column witnesses_required set not null,
  alter column alternative_execution_path_allowed set default false,
  alter column alternative_execution_path_allowed set not null,
  alter column special_authority_initials_required set default false,
  alter column special_authority_initials_required set not null,
  alter column statutory_form_available set default false,
  alter column statutory_form_available set not null,
  alter column springing_authority_supported set default false,
  alter column springing_authority_supported set not null,
  alter column durability_default_presumed set default false,
  alter column durability_default_presumed set not null,
  alter column type_specific_execution_rules_present set default false,
  alter column type_specific_execution_rules_present set not null;

alter table public.poa_requirements
  drop constraint if exists poa_requirements_review_status_check,
  drop constraint if exists poa_requirements_api_representation_mode_check,
  drop constraint if exists poa_requirements_poa_type_v2_check,
  drop constraint if exists poa_requirements_derivation_mode_v2_check,
  drop constraint if exists poa_requirements_poa_system_v2_check,
  drop constraint if exists poa_requirements_execution_model_v2_check,
  drop constraint if exists poa_requirements_execution_rule_v2_check,
  drop constraint if exists poa_requirements_durability_default_status_v2_check,
  drop constraint if exists poa_requirements_specific_authority_status_v2_check,
  drop constraint if exists poa_requirements_effective_date_status_v2_check,
  drop constraint if exists poa_requirements_statutory_form_status_v2_check,
  drop constraint if exists poa_requirements_competency_status_v2_check,
  drop constraint if exists poa_requirements_normalization_confidence_v2_check;

alter table public.poa_requirements
  add constraint poa_requirements_review_status_check
    check (review_status in (
      'draft',
      'verified',
      'needs_review'
    )),

  add constraint poa_requirements_api_representation_mode_check
    check (api_representation_mode in ('sectioned_only', 'sectioned_plus_flattened_summaries')),

  add constraint poa_requirements_poa_type_v2_check
    check (poa_type in ('general', 'durable', 'medical', 'limited')),

  add constraint poa_requirements_derivation_mode_v2_check
    check (derivation_mode in ('rules_only', 'rules_plus_overrides', 'manual_review')),

  add constraint poa_requirements_poa_system_v2_check
    check (
      poa_system is null
      or poa_system in (
        'UPOAA_STANDARD',
        'UPOAA_PLUS',
        'NON_UPOAA_STANDARD',
        'CIVIL_LAW_MANDATE',
        'HIGH_FORMALITY_VARIANT'
      )
    ),

  add constraint poa_requirements_execution_model_v2_check
    check (
      execution_model is null
      or execution_model in (
        'NOTARY_ONLY',
        'WITNESSES_ONLY',
        'NOTARY_OR_WITNESSES',
        'NOTARY_AND_WITNESSES',
        'FORMAL_ACT',
        'TYPE_SPECIFIC_VARIANT'
      )
    ),

  add constraint poa_requirements_execution_rule_v2_check
    check (
      execution_rule is null
      or execution_rule in (
        'NOTARY_ONLY',
        'WITNESSES_ONLY',
        'NOTARY_OR_WITNESSES',
        'NOTARY_AND_WITNESSES',
        'FORMAL_ACT',
        'TYPE_SPECIFIC_VARIANT'
      )
    ),

  add constraint poa_requirements_durability_default_status_v2_check
    check (
      durability_default_status is null
      or durability_default_status in (
        'durable_by_default',
        'durable_if_stated',
        'non_durable_by_default',
        'type_specific',
        'not_addressed'
      )
    ),

  add constraint poa_requirements_specific_authority_status_v2_check
    check (
      specific_authority_status is null
      or specific_authority_status in (
        'explicit_required',
        'explicit_required_with_initials',
        'not_required',
        'type_specific',
        'not_addressed'
      )
    ),

  add constraint poa_requirements_effective_date_status_v2_check
    check (
      effective_date_status is null
      or effective_date_status in (
        'immediate_default',
        'immediate_or_specified',
        'specified_event_allowed',
        'type_specific',
        'not_addressed'
      )
    ),

  add constraint poa_requirements_statutory_form_status_v2_check
    check (
      statutory_form_status is null
      or statutory_form_status in (
        'available',
        'available_not_mandatory',
        'multiple_forms_available',
        'not_available',
        'not_addressed'
      )
    ),

  add constraint poa_requirements_competency_status_v2_check
    check (
      competency_status is null
      or competency_status in (
        'capacity_required',
        'competent_adult_required',
        'sound_mind_required',
        'not_addressed'
      )
    ),

  add constraint poa_requirements_normalization_confidence_v2_check
    check (normalization_confidence in ('high', 'medium', 'low'));

create index if not exists idx_poa_requirements_poa_system_v2
  on public.poa_requirements(poa_system);

create index if not exists idx_poa_requirements_execution_model_v2
  on public.poa_requirements(execution_model);

create index if not exists idx_poa_requirements_normalization_confidence_v2
  on public.poa_requirements(normalization_confidence);

-- ---------------------------------------------------------------------------
-- DERIVED INPUT CONTRACTS (SHARED: POA/TRUST/IDN)
-- ---------------------------------------------------------------------------

create table if not exists public.input_requirement_contracts (
  id uuid primary key default gen_random_uuid(),
  document_family text not null,
  jurisdiction text not null,
  document_type text not null,
  schema_version text not null,

  ui_profile text not null,
  derivation_mode text not null default 'rules_plus_overrides',
  review_status text not null default 'draft',
  api_representation_mode text,
  manual_review_required boolean not null default false,

  classification jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  template_resolution jsonb not null default '{}'::jsonb,
  workflow jsonb not null default '{}'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  section_summaries jsonb not null default '{}'::jsonb,
  document_outputs jsonb not null default '[]'::jsonb,
  notices jsonb not null default '[]'::jsonb,
  source_trace jsonb not null default '[]'::jsonb,

  source_table text,
  source_record_id uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint input_requirement_contracts_document_family_check
    check (document_family in ('poa', 'trust', 'idn')),

  constraint input_requirement_contracts_document_type_by_family_check
    check (
      (document_family = 'poa' and document_type in ('general', 'durable', 'medical', 'limited'))
      or (document_family = 'trust' and document_type in ('rrr', 'certification', 'other'))
      or (document_family = 'idn' and document_type in ('acknowledgment', 'authentic_act', 'public_instrument'))
    ),

  constraint input_requirement_contracts_derivation_mode_check
    check (derivation_mode in ('rules_only', 'rules_plus_overrides', 'manual_review')),

  constraint input_requirement_contracts_review_status_check
    check (review_status in ('draft', 'verified', 'needs_review')),

  constraint input_requirement_contracts_manual_review_status_check
    check (
      (manual_review_required = true and review_status = 'needs_review')
      or (manual_review_required = false and review_status in ('draft', 'verified'))
    ),

  constraint input_requirement_contracts_manual_derivation_check
    check (
      derivation_mode <> 'manual_review'
      or (
        manual_review_required = true
        and review_status = 'needs_review'
      )
    ),

  constraint input_requirement_contracts_api_representation_mode_check
    check (
      api_representation_mode is null
      or api_representation_mode in ('sectioned_only', 'sectioned_plus_flattened_summaries')
    ),

  constraint input_requirement_contracts_api_representation_mode_required_check
    check (
      document_family = 'trust'
      or api_representation_mode in ('sectioned_only', 'sectioned_plus_flattened_summaries')
    ),

  constraint input_requirement_contracts_unique
    unique (document_family, jurisdiction, document_type, schema_version)
);

create index if not exists idx_input_requirement_contracts_lookup
  on public.input_requirement_contracts(document_family, jurisdiction, document_type);

create index if not exists idx_input_requirement_contracts_review_status
  on public.input_requirement_contracts(review_status);

create index if not exists idx_input_requirement_contracts_source_lookup
  on public.input_requirement_contracts(source_table, source_record_id);

alter table public.input_requirement_contracts enable row level security;

drop policy if exists "input_requirement_contracts_read" on public.input_requirement_contracts;
create policy "input_requirement_contracts_read" on public.input_requirement_contracts
  for select using (true);

drop policy if exists "input_requirement_contracts_write" on public.input_requirement_contracts;
create policy "input_requirement_contracts_write" on public.input_requirement_contracts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.input_requirement_contracts to authenticated;

comment on table public.input_requirement_contracts is
'Canonical published derived input-requirement contracts for POA, Trust, and IDN. Source-family tables store legal/source requirements and may also cache latest derived contract fragments.';

comment on column public.input_requirement_contracts.source_table is
'Source family table name for lineage of the published derived contract record.';

comment on column public.input_requirement_contracts.source_record_id is
'Source row id in the source family table for lineage of the published derived contract record.';

comment on column public.poa_requirements.execution_rule is
'Final normalized execution rule derived from raw legal/source phrasing; not a direct copy of source text.';

comment on column public.poa_requirements.durability_default_status is
'Final normalized durability status derived from staging rules.';

comment on column public.poa_requirements.specific_authority_status is
'Final normalized specific-authority requirement status derived from staging rules.';

comment on column public.poa_requirements.effective_date_status is
'Final normalized effective-date status derived from staging rules.';

comment on column public.poa_requirements.statutory_form_status is
'Final normalized statutory-form availability status derived from staging rules.';

comment on column public.poa_requirements.competency_status is
'Final normalized competency status derived from staging rules.';

comment on table public.trust_requirements is
'Jurisdiction-level trust requirements table. Readable by authenticated users by design for application rendering and validation.';

comment on constraint trust_requirements_unique_jurisdiction_type on public.trust_requirements is
'Deliberately keeps a single canonical source row per jurisdiction/document_type. Use input_requirement_contracts.schema_version for published historical versions.';

comment on table public.idn_requirements is
'Jurisdiction-level IDN requirements table. Readable by authenticated users by design for application rendering and validation.';

comment on constraint idn_requirements_unique_jurisdiction_type on public.idn_requirements is
'Deliberately keeps a single canonical source row per jurisdiction/document_type. Use input_requirement_contracts.schema_version for published historical versions.';

comment on table public.poa_requirements is
'Jurisdiction-level POA requirements table. Readable by authenticated users by design for application rendering and validation.';

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_updated_at'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute $fn$
      create function public.set_updated_at()
      returns trigger
      language plpgsql
      as $body$
      begin
        new.updated_at = now();
        return new;
      end;
      $body$;
    $fn$;
  end if;
end;
$$;

drop trigger if exists trg_trust_requirements_set_updated_at on public.trust_requirements;
create trigger trg_trust_requirements_set_updated_at
before update on public.trust_requirements
for each row
execute function public.set_updated_at();

drop trigger if exists trg_idn_requirements_set_updated_at on public.idn_requirements;
create trigger trg_idn_requirements_set_updated_at
before update on public.idn_requirements
for each row
execute function public.set_updated_at();

drop trigger if exists trg_poa_requirements_set_updated_at on public.poa_requirements;
create trigger trg_poa_requirements_set_updated_at
before update on public.poa_requirements
for each row
execute function public.set_updated_at();

drop trigger if exists trg_input_requirement_contracts_set_updated_at on public.input_requirement_contracts;
create trigger trg_input_requirement_contracts_set_updated_at
before update on public.input_requirement_contracts
for each row
execute function public.set_updated_at();
