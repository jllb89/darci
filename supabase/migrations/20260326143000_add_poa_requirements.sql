create table if not exists public.poa_requirements (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  poa_type text not null default 'general',
  ui_profile text not null default 'standard',
  notarization_rule text not null,
  witness_rule text not null,
  witness_count integer,
  durability_rule text not null,
  statutory_form_rule text not null,
  effective_date_rule text not null,
  competency_rule text not null,
  special_authority_rule text not null,
  allows_agent_certification boolean not null default false,
  requires_principal_signature boolean not null default true,
  allows_proxy_signature boolean not null default false,
  requires_acknowledgment_certificate boolean not null default false,
  governing_law text,
  execution_requirements_text text,
  acknowledgment_witnessing_text text,
  durability_text text,
  special_authority_text text,
  competency_text text,
  statutory_form_text text,
  effective_date_text text,
  source_citation text,
  source_url text,
  review_status text not null default 'draft',
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint poa_requirements_type_check
    check (poa_type in (
      'general',
      'limited',
      'durable',
      'medical',
      'vehicle',
      'tax',
      'springing',
      'other'
    )),

  constraint poa_requirements_ui_profile_check
    check (ui_profile in (
      'standard',
      'notary_only',
      'witness_only',
      'notary_or_witness',
      'notary_and_witness',
      'review_required'
    )),

  constraint poa_requirements_notarization_rule_check
    check (notarization_rule in (
      'required',
      'optional',
      'alternative_to_witnesses',
      'not_required',
      'varies_by_type',
      'not_addressed'
    )),

  constraint poa_requirements_witness_rule_check
    check (witness_rule in (
      'none',
      'required',
      'optional',
      'alternative_to_notary',
      'additional_to_notary',
      'varies_by_type',
      'not_addressed'
    )),

  constraint poa_requirements_witness_count_check
    check (witness_count is null or witness_count >= 0),

  constraint poa_requirements_durability_rule_check
    check (durability_rule in (
      'conditional',
      'requires_explicit_language',
      'presumed_durable',
      'not_durable_unless_stated',
      'varies_by_type',
      'not_addressed'
    )),

  constraint poa_requirements_statutory_form_rule_check
    check (statutory_form_rule in (
      'available',
      'not_available',
      'multiple_forms',
      'not_addressed'
    )),

  constraint poa_requirements_effective_date_rule_check
    check (effective_date_rule in (
      'upon_execution',
      'upon_execution_unless_specified',
      'upon_triggering_event',
      'varies_by_type',
      'not_addressed'
    )),

  constraint poa_requirements_competency_rule_check
    check (competency_rule in (
      'general_capacity_required',
      'contract_capacity_required',
      'sound_mind_required',
      'understand_nature_and_effect',
      'sufficient_mental_capacity',
      'not_addressed'
    )),

  constraint poa_requirements_special_authority_rule_check
    check (special_authority_rule in (
      'required_for_certain_acts',
      'not_required',
      'varies_by_type',
      'not_addressed'
    )),

  constraint poa_requirements_review_status_check
    check (review_status in (
      'draft',
      'reviewed',
      'approved',
      'needs_review',
      'deprecated'
    )),

  constraint poa_requirements_unique_jurisdiction_type
    unique (jurisdiction, poa_type)
);

create index if not exists idx_poa_requirements_jurisdiction
  on public.poa_requirements(jurisdiction);

create index if not exists idx_poa_requirements_type
  on public.poa_requirements(poa_type);

create index if not exists idx_poa_requirements_review_status
  on public.poa_requirements(review_status);

alter table public.poa_requirements enable row level security;

create policy "poa_requirements_read" on public.poa_requirements
  for select using (true);

create policy "poa_requirements_write" on public.poa_requirements
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "poa_requirements_service_role_access" on public.poa_requirements
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.poa_requirements to authenticated;