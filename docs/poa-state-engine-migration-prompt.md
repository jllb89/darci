# POA State Engine Migration Prompt

Use the prompt below with the browser ChatGPT instance. It is written against the current DARCI schema and should produce additive Supabase migrations, not a parallel redesign.

```text
You are working inside the DARCI repository.

Task:
Generate Supabase SQL migration files for a normalized POA state engine extension.

Important constraints:
- Do NOT replace or rename the existing public.poa_requirements table.
- Do NOT create a separate states table yet.
- Treat public.poa_requirements as the root jurisdiction-level POA summary table.
- The migration must be additive and compatible with the existing backend model.
- Follow the existing migration style already used in the repo for public.poa_requirements.
- Use relational tables for legal rules and glossary data. Use JSONB only for optional renderer metadata.
- Add RLS, grants, and service-role policies consistent with the existing public.poa_requirements policies.
- Seed only California and Ohio starter data for the new normalized tables.
- Do NOT seed all 50 states.
- Assume today's date is 2026-03-27.

Current schema context you must respect:
- There is already a public.poa_requirements table with one row per jurisdiction + poa_type.
- It already contains columns like:
  jurisdiction, poa_type, ui_profile, notarization_rule, witness_rule, witness_count,
  durability_rule, statutory_form_rule, effective_date_rule, competency_rule,
  special_authority_rule, allows_agent_certification, requires_principal_signature,
  allows_proxy_signature, requires_acknowledgment_certificate,
  governing_law, execution_requirements_text, acknowledgment_witnessing_text,
  durability_text, special_authority_text, competency_text, statutory_form_text,
  effective_date_text, source_citation, source_url, review_status, reviewed_at, notes,
  created_at, updated_at.

What to generate:

1. One migration that extends public.poa_requirements with these root-level legal ops columns:

- adopts_upoaa boolean
- statutory_form_mandatory boolean not null default false
- general_financial_dpoa_supported boolean not null default true
- last_legal_reviewed_at timestamptz
- reviewed_by text
- change_monitoring_priority text not null default 'medium'

Also:
- Update the existing review_status check constraint so it allows:
  draft, reviewed, approved, needs_review, deprecated, blocked, needs_update
- Add a check constraint for change_monitoring_priority in:
  high, medium, low

2. One migration that creates this national dictionary table:

Table: public.poa_canonical_special_authorities

Columns:
- id uuid primary key default gen_random_uuid()
- key text not null unique
- label text not null
- description text not null
- category text
- sort_order integer not null default 100
- is_core_national_key boolean not null default true
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Constraints/indexes:
- key must match ^[a-z0-9_]+$
- index on sort_order

3. One migration that creates this state-specific special-authority rules table:

Table: public.poa_special_authority_rules

Columns:
- id uuid primary key default gen_random_uuid()
- poa_requirement_id uuid not null references public.poa_requirements(id) on delete cascade
- canonical_authority_id uuid not null references public.poa_canonical_special_authorities(id) on delete restrict
- explicitly_required boolean not null default false
- requirement_type text not null
- applies_to_general_financial_poa boolean not null default true
- statutory_form_only boolean not null default false
- custom_language_required boolean not null default false
- initials_required boolean not null default false
- checkbox_required boolean not null default false
- freeform_text_allowed boolean not null default false
- state_specific_label text
- statutory_text_excerpt text
- exact_statute_citation text
- source_url text
- plain_english_rule text not null
- confidence text not null default 'medium'
- legal_review_status text not null default 'pending'
- reviewed_at timestamptz
- reviewed_by text
- review_notes text
- effective_start_date date
- effective_end_date date
- renderer_metadata jsonb not null default '{}'::jsonb
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Constraints/indexes:
- unique (poa_requirement_id, canonical_authority_id)
- requirement_type in:
  express_grant, specific_language, separate_initials, statutory_form_checkbox, not_required, unclear
- confidence in:
  high, medium, low
- legal_review_status in:
  pending, reviewed, needs_update, blocked
- effective_end_date >= effective_start_date when both are present
- index on poa_requirement_id
- index on canonical_authority_id
- index on legal_review_status

4. One migration that creates this state-specific glossary table:

Table: public.poa_glossary_terms

Columns:
- id uuid primary key default gen_random_uuid()
- poa_requirement_id uuid not null references public.poa_requirements(id) on delete cascade
- glossary_key text not null
- generic_label text not null
- state_specific_label text
- product_description text not null
- why_user_needs_this text
- source_citation text
- source_url text
- is_materially_state_specific boolean not null default false
- legal_review_status text not null default 'pending'
- reviewed_at timestamptz
- reviewed_by text
- review_notes text
- sort_order integer not null default 100
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Constraints/indexes:
- unique (poa_requirement_id, glossary_key)
- glossary_key must match ^[a-z0-9_]+$
- legal_review_status in:
  pending, reviewed, needs_update, blocked
- index on poa_requirement_id
- index on (poa_requirement_id, sort_order)

5. One migration that creates this optional render/form rules table:

Table: public.poa_form_rules

Columns:
- id uuid primary key default gen_random_uuid()
- poa_requirement_id uuid not null unique references public.poa_requirements(id) on delete cascade
- statutory_form_exists boolean not null default false
- statutory_form_recommended boolean not null default false
- statutory_form_mandatory_for_product boolean not null default false
- must_track_statutory_ordering boolean not null default false
- must_track_statutory_headings boolean not null default false
- must_include_warning_to_principal boolean not null default false
- must_include_notice_to_agent boolean not null default false
- special_authorities_render_mode text not null default 'hidden'
- freeform_special_authority_text_allowed boolean not null default false
- hybrid_rendering_allowed boolean not null default false
- attorney_customization_recommended boolean not null default false
- source_citation text
- source_url text
- legal_review_status text not null default 'pending'
- reviewed_at timestamptz
- reviewed_by text
- review_notes text
- created_at timestamptz not null default now()
- updated_at timestamptz not null default now()

Constraints/indexes:
- special_authorities_render_mode in:
  hidden, checklist, checklist_with_initials, checkboxes_from_statutory_form, freeform_text, hybrid, manual_review_only
- legal_review_status in:
  pending, reviewed, needs_update, blocked
- index on legal_review_status

6. RLS and grants:
- For each new table:
  - enable row level security
  - create a read policy allowing select using (true)
  - create write/service_role policies matching the style used for public.poa_requirements
  - grant select to authenticated

7. Seed migration requirements:
- Create a separate seed migration for the new normalized tables.
- Seed public.poa_canonical_special_authorities with these starter canonical keys:
  create_or_modify_trust
  make_gifts
  change_survivorship_rights
  change_beneficiary_designations
  delegate_authority
  waive_joint_and_survivor_annuity
  exercise_fiduciary_powers
  disclaim_property_interests
  access_digital_assets
  change_payable_on_death_designations
  create_or_change_joint_tenancy
  make_medicaid_or_public_benefits_transfers

- For California and Ohio only, seed:
  - poa_form_rules rows
  - poa_special_authority_rules rows
  - poa_glossary_terms rows

Legal-content seed expectations:
- California should reflect statutory-form complexity and checklist/initials behavior where appropriate.
- Ohio should reflect explicit-grant style handling where appropriate.
- If legal certainty is low for any individual seeded rule, mark legal_review_status as pending or needs_update instead of pretending it is final.
- Use exact_statute_citation and plain_english_rule where possible.
- Do not invent certainty.

8. Glossary starter keys to seed for California and Ohio:
- principal
- agent
- attorney_in_fact
- durable
- special_authority
- proxy_signer
- witness
- acknowledgment
- notary_acknowledgment
- statutory_form
- effective_date
- springing_power
- recording
- capacity

9. Output format:
- Return complete migration file contents.
- Use realistic Supabase migration filenames in chronological order after the existing POA migrations.
- Include brief comments at the top of each migration file describing purpose.
- Do not include prose outside the migration files except for a short implementation summary.

10. Important implementation rule:
- Do not change the current frontend page.
- Do not change backend controller/service code yet unless absolutely necessary to support the migration shape.
- The goal in this step is schema + starter seed migrations only.
```

## Expected Follow-Up After Migration Drafts

After the browser instance returns the migration files, the next implementation step in DARCI should be:

1. Review the California and Ohio seed content for legal precision.
2. Apply the migrations locally.
3. Extend the backend POA service/controller to join and return:
   - `formRules`
   - `specialAuthorities`
   - `glossary`
4. Remove page-local glossary text from the frontend and render from API data.