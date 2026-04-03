-- Seed explicit trust certification rows from existing trust RRR rows.
-- This keeps runtime fallback as a safety net while making certification row
-- coverage explicit and auditable per jurisdiction.

begin;

insert into public.trust_requirements (
  jurisdiction,
  document_type,
  ui_profile,
  derivation_mode,
  api_representation_mode,
  manual_review_required,
  governing_law,
  utc_adopted,
  revocability_presumption,
  writing_required,
  signature_required,
  notarization_required,
  witnesses_required,
  special_execution_rules,
  trust_certification_statutory_basis,
  certification_required_elements,
  certification_permissive_elements,
  certification_prohibited_elements,
  non_default_powers_requiring_express_authority,
  statutory_form_available,
  pour_over_will_recognized,
  registration_requirement,
  real_property_rule,
  competency_requirement,
  specific_authority_required_for_certain_acts,
  manual_review_required_text,
  trust_system,
  execution_level,
  acknowledgment_profile,
  base_template_key,
  state_overlay_key,
  asset_protection,
  directed_trusts,
  decanting_friendly,
  silent_trust_friendly,
  normalization_confidence,
  source_citation,
  source_url,
  review_status,
  reviewed_at,
  reviewed_by,
  notes,
  input_requirements,
  input_requirements_schema_version,
  input_requirements_updated_at
)
select
  rrr.jurisdiction,
  'certification',
  rrr.ui_profile,
  rrr.derivation_mode,
  rrr.api_representation_mode,
  rrr.manual_review_required,
  rrr.governing_law,
  rrr.utc_adopted,
  rrr.revocability_presumption,
  rrr.writing_required,
  rrr.signature_required,
  rrr.notarization_required,
  rrr.witnesses_required,
  rrr.special_execution_rules,
  rrr.trust_certification_statutory_basis,
  rrr.certification_required_elements,
  rrr.certification_permissive_elements,
  rrr.certification_prohibited_elements,
  rrr.non_default_powers_requiring_express_authority,
  rrr.statutory_form_available,
  rrr.pour_over_will_recognized,
  rrr.registration_requirement,
  rrr.real_property_rule,
  rrr.competency_requirement,
  rrr.specific_authority_required_for_certain_acts,
  rrr.manual_review_required_text,
  rrr.trust_system,
  rrr.execution_level,
  rrr.acknowledgment_profile,
  rrr.base_template_key,
  rrr.state_overlay_key,
  rrr.asset_protection,
  rrr.directed_trusts,
  rrr.decanting_friendly,
  rrr.silent_trust_friendly,
  rrr.normalization_confidence,
  rrr.source_citation,
  rrr.source_url,
  rrr.review_status,
  rrr.reviewed_at,
  rrr.reviewed_by,
  concat(
    coalesce(rrr.notes, ''),
    case when coalesce(rrr.notes, '') = '' then '' else ' ' end,
    'Auto-seeded certification row from RRR on 2026-04-03 for explicit coverage.'
  ),
  rrr.input_requirements,
  rrr.input_requirements_schema_version,
  rrr.input_requirements_updated_at
from public.trust_requirements rrr
where rrr.document_type = 'rrr'
  and not exists (
    select 1
    from public.trust_requirements existing
    where existing.jurisdiction = rrr.jurisdiction
      and existing.document_type = 'certification'
  )
on conflict (jurisdiction, document_type) do nothing;

commit;
