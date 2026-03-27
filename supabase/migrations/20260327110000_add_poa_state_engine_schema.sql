-- Extend POA requirements with legal-ops metadata and add normalized state-engine tables.

alter table public.poa_requirements
  add column if not exists adopts_upoaa boolean,
  add column if not exists statutory_form_mandatory boolean not null default false,
  add column if not exists general_financial_dpoa_supported boolean not null default true,
  add column if not exists last_legal_reviewed_at timestamptz,
  add column if not exists reviewed_by text,
  add column if not exists change_monitoring_priority text not null default 'medium';

alter table public.poa_requirements
  drop constraint if exists poa_requirements_review_status_check;

alter table public.poa_requirements
  add constraint poa_requirements_review_status_check
    check (review_status in (
      'draft',
      'reviewed',
      'approved',
      'needs_review',
      'deprecated',
      'blocked',
      'needs_update'
    ));

alter table public.poa_requirements
  add constraint poa_requirements_change_monitoring_priority_check
    check (change_monitoring_priority in (
      'high',
      'medium',
      'low'
    ));

create table if not exists public.poa_canonical_special_authorities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text not null,
  category text,
  sort_order integer not null default 100,
  is_core_national_key boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint poa_canonical_special_authorities_key_check
    check (key ~ '^[a-z0-9_]+$')
);

create index if not exists idx_poa_canonical_special_authorities_sort_order
  on public.poa_canonical_special_authorities(sort_order);

alter table public.poa_canonical_special_authorities enable row level security;

create policy "poa_canonical_special_authorities_read"
  on public.poa_canonical_special_authorities
  for select using (true);

create policy "poa_canonical_special_authorities_write"
  on public.poa_canonical_special_authorities
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "poa_canonical_special_authorities_service_role_access"
  on public.poa_canonical_special_authorities
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.poa_canonical_special_authorities to authenticated;

create table if not exists public.poa_special_authority_rules (
  id uuid primary key default gen_random_uuid(),
  poa_requirement_id uuid not null references public.poa_requirements(id) on delete cascade,
  canonical_authority_id uuid not null references public.poa_canonical_special_authorities(id) on delete restrict,
  explicitly_required boolean not null default false,
  requirement_type text not null,
  applies_to_general_financial_poa boolean not null default true,
  statutory_form_only boolean not null default false,
  custom_language_required boolean not null default false,
  initials_required boolean not null default false,
  checkbox_required boolean not null default false,
  freeform_text_allowed boolean not null default false,
  state_specific_label text,
  statutory_text_excerpt text,
  exact_statute_citation text,
  source_url text,
  plain_english_rule text not null,
  confidence text not null default 'medium',
  legal_review_status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by text,
  review_notes text,
  effective_start_date date,
  effective_end_date date,
  renderer_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint poa_special_authority_rules_unique
    unique (poa_requirement_id, canonical_authority_id),

  constraint poa_special_authority_rules_requirement_type_check
    check (requirement_type in (
      'express_grant',
      'specific_language',
      'separate_initials',
      'statutory_form_checkbox',
      'not_required',
      'unclear'
    )),

  constraint poa_special_authority_rules_confidence_check
    check (confidence in (
      'high',
      'medium',
      'low'
    )),

  constraint poa_special_authority_rules_legal_review_status_check
    check (legal_review_status in (
      'pending',
      'reviewed',
      'needs_update',
      'blocked'
    )),

  constraint poa_special_authority_rules_date_window_check
    check (
      effective_end_date is null
      or effective_start_date is null
      or effective_end_date >= effective_start_date
    )
);

create index if not exists idx_poa_special_authority_rules_poa_requirement_id
  on public.poa_special_authority_rules(poa_requirement_id);

create index if not exists idx_poa_special_authority_rules_canonical_authority_id
  on public.poa_special_authority_rules(canonical_authority_id);

create index if not exists idx_poa_special_authority_rules_review_status
  on public.poa_special_authority_rules(legal_review_status);

alter table public.poa_special_authority_rules enable row level security;

create policy "poa_special_authority_rules_read"
  on public.poa_special_authority_rules
  for select using (true);

create policy "poa_special_authority_rules_write"
  on public.poa_special_authority_rules
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "poa_special_authority_rules_service_role_access"
  on public.poa_special_authority_rules
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.poa_special_authority_rules to authenticated;

create table if not exists public.poa_glossary_terms (
  id uuid primary key default gen_random_uuid(),
  poa_requirement_id uuid not null references public.poa_requirements(id) on delete cascade,
  glossary_key text not null,
  generic_label text not null,
  state_specific_label text,
  product_description text not null,
  why_user_needs_this text,
  source_citation text,
  source_url text,
  is_materially_state_specific boolean not null default false,
  legal_review_status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by text,
  review_notes text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint poa_glossary_terms_unique
    unique (poa_requirement_id, glossary_key),

  constraint poa_glossary_terms_key_check
    check (glossary_key ~ '^[a-z0-9_]+$'),

  constraint poa_glossary_terms_legal_review_status_check
    check (legal_review_status in (
      'pending',
      'reviewed',
      'needs_update',
      'blocked'
    ))
);

create index if not exists idx_poa_glossary_terms_poa_requirement_id
  on public.poa_glossary_terms(poa_requirement_id);

create index if not exists idx_poa_glossary_terms_sort_order
  on public.poa_glossary_terms(poa_requirement_id, sort_order);

alter table public.poa_glossary_terms enable row level security;

create policy "poa_glossary_terms_read"
  on public.poa_glossary_terms
  for select using (true);

create policy "poa_glossary_terms_write"
  on public.poa_glossary_terms
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "poa_glossary_terms_service_role_access"
  on public.poa_glossary_terms
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.poa_glossary_terms to authenticated;

create table if not exists public.poa_form_rules (
  id uuid primary key default gen_random_uuid(),
  poa_requirement_id uuid not null unique references public.poa_requirements(id) on delete cascade,
  statutory_form_exists boolean not null default false,
  statutory_form_recommended boolean not null default false,
  statutory_form_mandatory_for_product boolean not null default false,
  must_track_statutory_ordering boolean not null default false,
  must_track_statutory_headings boolean not null default false,
  must_include_warning_to_principal boolean not null default false,
  must_include_notice_to_agent boolean not null default false,
  special_authorities_render_mode text not null default 'hidden',
  freeform_special_authority_text_allowed boolean not null default false,
  hybrid_rendering_allowed boolean not null default false,
  attorney_customization_recommended boolean not null default false,
  source_citation text,
  source_url text,
  legal_review_status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by text,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint poa_form_rules_render_mode_check
    check (special_authorities_render_mode in (
      'hidden',
      'checklist',
      'checklist_with_initials',
      'checkboxes_from_statutory_form',
      'freeform_text',
      'hybrid',
      'manual_review_only'
    )),

  constraint poa_form_rules_legal_review_status_check
    check (legal_review_status in (
      'pending',
      'reviewed',
      'needs_update',
      'blocked'
    ))
);

create index if not exists idx_poa_form_rules_review_status
  on public.poa_form_rules(legal_review_status);

alter table public.poa_form_rules enable row level security;

create policy "poa_form_rules_read"
  on public.poa_form_rules
  for select using (true);

create policy "poa_form_rules_write"
  on public.poa_form_rules
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "poa_form_rules_service_role_access"
  on public.poa_form_rules
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.poa_form_rules to authenticated;