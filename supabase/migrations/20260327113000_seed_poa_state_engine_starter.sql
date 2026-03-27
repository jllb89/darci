-- Seed starter POA state-engine data: canonical authorities plus California and Ohio normalized rules.

insert into public.poa_canonical_special_authorities (
  key,
  label,
  description,
  category,
  sort_order,
  is_core_national_key
) values
  ('create_or_modify_trust', 'Create or modify a trust', 'Authority for the agent to create, amend, revoke, or terminate a trust for the principal.', 'estate_planning', 10, true),
  ('make_gifts', 'Make gifts', 'Authority for the agent to make gifts of the principal''s property.', 'estate_planning', 20, true),
  ('change_survivorship_rights', 'Change survivorship rights', 'Authority to create, modify, or terminate survivorship rights in property.', 'estate_planning', 30, true),
  ('change_beneficiary_designations', 'Change beneficiary designations', 'Authority to create or change beneficiary designations affecting the principal''s property or accounts.', 'estate_planning', 40, true),
  ('delegate_authority', 'Delegate authority', 'Authority for the agent to delegate powers granted under the POA to another person.', 'delegation', 50, true),
  ('waive_joint_and_survivor_annuity', 'Waive joint and survivor annuity', 'Authority to waive the principal''s right to be a beneficiary of a joint and survivor annuity.', 'retirement', 60, true),
  ('exercise_fiduciary_powers', 'Exercise fiduciary powers', 'Authority to exercise fiduciary powers the principal may delegate.', 'fiduciary', 70, true),
  ('disclaim_property_interests', 'Disclaim property interests', 'Authority to disclaim, renounce, or refuse property interests or powers.', 'estate_planning', 80, true),
  ('access_digital_assets', 'Access digital assets', 'Authority to access or manage the principal''s digital assets or electronic communications when state law permits.', 'digital_assets', 90, true),
  ('change_payable_on_death_designations', 'Change payable-on-death designations', 'Authority to create or change payable-on-death or transfer-on-death beneficiary designations.', 'estate_planning', 100, true),
  ('create_or_change_joint_tenancy', 'Create or change joint tenancy', 'Authority to create or change joint tenancy or similar co-ownership arrangements.', 'estate_planning', 110, true),
  ('make_medicaid_or_public_benefits_transfers', 'Make Medicaid or public benefits transfers', 'Authority to transfer assets in ways that may affect Medicaid or public-benefits eligibility.', 'public_benefits', 120, true)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_core_national_key = excluded.is_core_national_key,
  updated_at = now();

update public.poa_requirements
set
  adopts_upoaa = false,
  statutory_form_mandatory = false,
  general_financial_dpoa_supported = true,
  change_monitoring_priority = 'high',
  updated_at = now()
where jurisdiction = 'US-CA'
  and poa_type = 'general';

update public.poa_requirements
set
  adopts_upoaa = true,
  statutory_form_mandatory = false,
  general_financial_dpoa_supported = true,
  change_monitoring_priority = 'high',
  updated_at = now()
where jurisdiction = 'US-OH'
  and poa_type = 'general';

with req as (
  select id, jurisdiction, source_citation, source_url
  from public.poa_requirements
  where poa_type = 'general'
    and jurisdiction in ('US-CA', 'US-OH')
)
insert into public.poa_form_rules (
  poa_requirement_id,
  statutory_form_exists,
  statutory_form_recommended,
  statutory_form_mandatory_for_product,
  must_track_statutory_ordering,
  must_track_statutory_headings,
  must_include_warning_to_principal,
  must_include_notice_to_agent,
  special_authorities_render_mode,
  freeform_special_authority_text_allowed,
  hybrid_rendering_allowed,
  attorney_customization_recommended,
  source_citation,
  source_url,
  legal_review_status,
  review_notes
)
select
  req.id,
  case when req.jurisdiction = 'US-CA' then true else false end,
  case when req.jurisdiction = 'US-CA' then true else false end,
  false,
  case when req.jurisdiction = 'US-CA' then true else false end,
  case when req.jurisdiction = 'US-CA' then true else false end,
  case when req.jurisdiction = 'US-CA' then true else false end,
  case when req.jurisdiction = 'US-CA' then true else false end,
  case
    when req.jurisdiction = 'US-CA' then 'checklist_with_initials'
    else 'checklist'
  end,
  false,
  false,
  case when req.jurisdiction = 'US-CA' then true else false end,
  req.source_citation,
  req.source_url,
  'pending',
  case
    when req.jurisdiction = 'US-CA'
      then 'Starter California render profile seeded from existing statutory-form summary. Confirm final consumer rendering against Probate Code form requirements before production reliance.'
    else 'Starter Ohio render profile seeded from normalized POA rules. Confirm whether any statutory-form workflow should supersede checklist rendering before production reliance.'
  end
from req
on conflict (poa_requirement_id) do update set
  statutory_form_exists = excluded.statutory_form_exists,
  statutory_form_recommended = excluded.statutory_form_recommended,
  statutory_form_mandatory_for_product = excluded.statutory_form_mandatory_for_product,
  must_track_statutory_ordering = excluded.must_track_statutory_ordering,
  must_track_statutory_headings = excluded.must_track_statutory_headings,
  must_include_warning_to_principal = excluded.must_include_warning_to_principal,
  must_include_notice_to_agent = excluded.must_include_notice_to_agent,
  special_authorities_render_mode = excluded.special_authorities_render_mode,
  freeform_special_authority_text_allowed = excluded.freeform_special_authority_text_allowed,
  hybrid_rendering_allowed = excluded.hybrid_rendering_allowed,
  attorney_customization_recommended = excluded.attorney_customization_recommended,
  source_citation = excluded.source_citation,
  source_url = excluded.source_url,
  legal_review_status = excluded.legal_review_status,
  review_notes = excluded.review_notes,
  updated_at = now();

with glossary_seed as (
  select *
  from (values
    ('principal', 'Principal', null, 'The principal is the person granting authority to another person under the power of attorney.', 'Users need to know whose authority is being delegated and whose intent controls the document.', false, 10),
    ('agent', 'Agent', null, 'The agent is the person authorized to act on behalf of the principal under the power of attorney.', 'Users need to know who can exercise the powers described in the document.', false, 20),
    ('attorney_in_fact', 'Attorney-in-fact', 'Agent', 'Attorney-in-fact is a traditional legal term for the agent named in a power of attorney.', 'Users may see this older term in statutes or forms and should understand it usually refers to the agent.', true, 30),
    ('durable', 'Durable', null, 'A durable power of attorney continues to operate even if the principal later becomes incapacitated, if state law and document language allow it.', 'Users need this term to understand whether the POA survives incapacity.', false, 40),
    ('special_authority', 'Special authority', null, 'Special authority refers to powers that a state may require the principal to grant more explicitly than ordinary financial powers.', 'Users need this to understand why certain powers are separately listed or require extra acknowledgment.', false, 50),
    ('proxy_signer', 'Proxy signer', null, 'A proxy signer is a person who signs for the principal at the principal''s direction when state law permits that execution method.', 'Users need this to understand why an additional signer may appear in the workflow.', false, 60),
    ('witness', 'Witness', null, 'A witness is a person who observes or attests to the principal''s signing when state law requires or permits witness execution.', 'Users need this to understand whether additional people must be present at signing.', false, 70),
    ('acknowledgment', 'Acknowledgment', null, 'An acknowledgment is the formal declaration, usually before a notary, that the signature is the act of the principal.', 'Users need this to understand the difference between simply signing and completing a valid notarized execution.', false, 80),
    ('notary_acknowledgment', 'Notary acknowledgment', null, 'A notary acknowledgment is the notarial act confirming the principal acknowledged the signature before an authorized notarial officer.', 'Users need this to know whether a notary must be involved for valid execution.', false, 90),
    ('statutory_form', 'Statutory form', null, 'A statutory form is a form published or recognized by statute that may influence how the POA should be drafted or presented.', 'Users need this to understand when the state supplies preferred wording, ordering, or notices.', false, 100),
    ('effective_date', 'Effective date', null, 'The effective date describes when the power of attorney becomes usable, either immediately or upon a later triggering event.', 'Users need this to understand when the agent can begin acting.', false, 110),
    ('springing_power', 'Springing power', null, 'A springing power of attorney becomes effective only after a specified future event, such as incapacity, occurs.', 'Users need this to understand delayed-effect powers and triggering conditions.', false, 120),
    ('recording', 'Recording', null, 'Recording means filing the document in public records when state law or a real-estate transaction requires it.', 'Users need this because some states tie enforceability or real-property use to recording.', false, 130),
    ('capacity', 'Capacity', null, 'Capacity means the level of legal and mental ability the principal must have to validly sign the power of attorney.', 'Users need this to understand that signing requires a minimum legal standard beyond willingness alone.', false, 140)
  ) as t(glossary_key, generic_label, state_specific_label, product_description, why_user_needs_this, is_materially_state_specific, sort_order)
),
req as (
  select id, jurisdiction, source_citation, source_url
  from public.poa_requirements
  where poa_type = 'general'
    and jurisdiction in ('US-CA', 'US-OH')
)
insert into public.poa_glossary_terms (
  poa_requirement_id,
  glossary_key,
  generic_label,
  state_specific_label,
  product_description,
  why_user_needs_this,
  source_citation,
  source_url,
  is_materially_state_specific,
  legal_review_status,
  review_notes,
  sort_order
)
select
  req.id,
  glossary_seed.glossary_key,
  glossary_seed.generic_label,
  glossary_seed.state_specific_label,
  glossary_seed.product_description,
  glossary_seed.why_user_needs_this,
  req.source_citation,
  req.source_url,
  glossary_seed.is_materially_state_specific,
  'pending',
  case
    when req.jurisdiction = 'US-CA' then 'Starter glossary for California. Confirm term-level citations and any statutory-form labels before production reliance.'
    else 'Starter glossary for Ohio. Confirm term-level citations and state-specific terminology before production reliance.'
  end,
  glossary_seed.sort_order
from req
cross join glossary_seed
on conflict (poa_requirement_id, glossary_key) do update set
  generic_label = excluded.generic_label,
  state_specific_label = excluded.state_specific_label,
  product_description = excluded.product_description,
  why_user_needs_this = excluded.why_user_needs_this,
  source_citation = excluded.source_citation,
  source_url = excluded.source_url,
  is_materially_state_specific = excluded.is_materially_state_specific,
  legal_review_status = excluded.legal_review_status,
  review_notes = excluded.review_notes,
  sort_order = excluded.sort_order,
  updated_at = now();

with authority_seed as (
  select *
  from (values
    ('US-CA', 'create_or_modify_trust', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for special trust powers in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To create, modify, revoke, or terminate a trust.', 'medium', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-CA', 'make_gifts', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for gift authority in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To make gifts.', 'medium', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-CA', 'change_survivorship_rights', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for survivorship-right changes in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To create or change rights of survivorship.', 'medium', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-CA', 'change_beneficiary_designations', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for beneficiary-designation changes in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To create or change a beneficiary designation.', 'medium', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-CA', 'delegate_authority', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for delegation powers in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To delegate authority granted under the power of attorney.', 'low', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-CA', 'waive_joint_and_survivor_annuity', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for joint-and-survivor-annuity waivers in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To waive the principal''s right to be a beneficiary of a joint and survivor annuity.', 'low', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-CA', 'exercise_fiduciary_powers', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for fiduciary-power exercises in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To exercise fiduciary powers that the principal has authority to delegate.', 'medium', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-CA', 'disclaim_property_interests', true, 'separate_initials', true, false, true, true, false, 'Starter California mapping for disclaimer powers in statutory-form workflows.', 'Cal. Prob. Code §§ 4264, 4401', 'To disclaim property, including a power of appointment.', 'medium', '{"render_mode":"checklist_with_initials"}'::jsonb),
    ('US-OH', 'create_or_modify_trust', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for trust powers under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'medium', '{"render_mode":"checklist"}'::jsonb),
    ('US-OH', 'make_gifts', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for gift authority under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'high', '{"render_mode":"checklist"}'::jsonb),
    ('US-OH', 'change_survivorship_rights', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for survivorship-right changes under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'medium', '{"render_mode":"checklist"}'::jsonb),
    ('US-OH', 'change_beneficiary_designations', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for beneficiary-designation changes under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'medium', '{"render_mode":"checklist"}'::jsonb),
    ('US-OH', 'delegate_authority', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for delegation authority under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'medium', '{"render_mode":"checklist"}'::jsonb),
    ('US-OH', 'waive_joint_and_survivor_annuity', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for annuity waivers under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'low', '{"render_mode":"checklist"}'::jsonb),
    ('US-OH', 'exercise_fiduciary_powers', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for fiduciary-power exercises under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'medium', '{"render_mode":"checklist"}'::jsonb),
    ('US-OH', 'disclaim_property_interests', true, 'express_grant', false, false, false, false, false, 'Starter Ohio mapping for disclaimers under hot-power style rules.', 'Ohio Rev. Code § 1337.42', null, 'medium', '{"render_mode":"checklist"}'::jsonb)
  ) as t(jurisdiction, canonical_key, explicitly_required, requirement_type, statutory_form_only, custom_language_required, initials_required, checkbox_required, freeform_text_allowed, plain_english_rule, exact_statute_citation, statutory_text_excerpt, confidence, renderer_metadata)
),
req as (
  select id, jurisdiction
  from public.poa_requirements
  where poa_type = 'general'
    and jurisdiction in ('US-CA', 'US-OH')
),
canon as (
  select id, key
  from public.poa_canonical_special_authorities
)
insert into public.poa_special_authority_rules (
  poa_requirement_id,
  canonical_authority_id,
  explicitly_required,
  requirement_type,
  applies_to_general_financial_poa,
  statutory_form_only,
  custom_language_required,
  initials_required,
  checkbox_required,
  freeform_text_allowed,
  state_specific_label,
  statutory_text_excerpt,
  exact_statute_citation,
  plain_english_rule,
  confidence,
  legal_review_status,
  review_notes,
  renderer_metadata
)
select
  req.id,
  canon.id,
  authority_seed.explicitly_required,
  authority_seed.requirement_type,
  true,
  authority_seed.statutory_form_only,
  authority_seed.custom_language_required,
  authority_seed.initials_required,
  authority_seed.checkbox_required,
  authority_seed.freeform_text_allowed,
  null,
  authority_seed.statutory_text_excerpt,
  authority_seed.exact_statute_citation,
  authority_seed.plain_english_rule,
  authority_seed.confidence,
  'pending',
  case
    when authority_seed.jurisdiction = 'US-CA' then 'Starter California mapping only. Confirm each enumerated authority, label, and initial requirement against the current statutory form before production reliance.'
    else 'Starter Ohio mapping only. Confirm final hot-power coverage and any state-specific drafting language before production reliance.'
  end,
  authority_seed.renderer_metadata
from authority_seed
join req
  on req.jurisdiction = authority_seed.jurisdiction
join canon
  on canon.key = authority_seed.canonical_key
on conflict (poa_requirement_id, canonical_authority_id) do update set
  explicitly_required = excluded.explicitly_required,
  requirement_type = excluded.requirement_type,
  applies_to_general_financial_poa = excluded.applies_to_general_financial_poa,
  statutory_form_only = excluded.statutory_form_only,
  custom_language_required = excluded.custom_language_required,
  initials_required = excluded.initials_required,
  checkbox_required = excluded.checkbox_required,
  freeform_text_allowed = excluded.freeform_text_allowed,
  state_specific_label = excluded.state_specific_label,
  statutory_text_excerpt = excluded.statutory_text_excerpt,
  exact_statute_citation = excluded.exact_statute_citation,
  plain_english_rule = excluded.plain_english_rule,
  confidence = excluded.confidence,
  legal_review_status = excluded.legal_review_status,
  review_notes = excluded.review_notes,
  renderer_metadata = excluded.renderer_metadata,
  updated_at = now();