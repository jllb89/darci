-- Seed core POA authority-scope options for CA and OH without modifying existing special-power rows.
-- These rows are tagged in renderer_metadata so the contract form can prefer them for
-- authority_scope_selection while leaving legacy special-authority records intact.

insert into public.poa_canonical_special_authorities (
  key,
  label,
  description,
  category,
  sort_order,
  is_core_national_key
) values
  (
    'real_property',
    'Real property',
    'Core authority-scope option covering real-property transactions in a financial power of attorney.',
    'core_authority_scope',
    10,
    true
  ),
  (
    'tangible_personal_property',
    'Tangible personal property',
    'Core authority-scope option covering tangible personal property transactions.',
    'core_authority_scope',
    20,
    true
  ),
  (
    'stocks_and_bonds',
    'Stocks and bonds',
    'Core authority-scope option covering stocks and bonds transactions.',
    'core_authority_scope',
    30,
    true
  ),
  (
    'commodities_and_options',
    'Commodities and options',
    'Core authority-scope option covering commodities and options transactions.',
    'core_authority_scope',
    40,
    true
  ),
  (
    'banking_and_financial',
    'Banking and financial institutions',
    'Core authority-scope option covering banking and financial institution transactions.',
    'core_authority_scope',
    50,
    true
  ),
  (
    'business_operations',
    'Business operations',
    'Core authority-scope option covering operation of a business or other entity.',
    'core_authority_scope',
    60,
    true
  ),
  (
    'insurance_and_annuities',
    'Insurance and annuities',
    'Core authority-scope option covering insurance and annuity transactions.',
    'core_authority_scope',
    70,
    true
  ),
  (
    'estates_trusts_and_beneficial_interests',
    'Estates, trusts, and other beneficial interests',
    'Core authority-scope option covering estates, trusts, and other beneficial interests.',
    'core_authority_scope',
    80,
    true
  ),
  (
    'claims_and_litigation',
    'Claims and litigation',
    'Core authority-scope option covering claims and litigation matters.',
    'core_authority_scope',
    90,
    true
  ),
  (
    'personal_and_family_maintenance',
    'Personal and family maintenance',
    'Core authority-scope option covering personal and family maintenance matters.',
    'core_authority_scope',
    100,
    true
  ),
  (
    'government_benefits',
    'Government benefits',
    'Core authority-scope option covering benefits from governmental programs or service.',
    'core_authority_scope',
    110,
    true
  ),
  (
    'retirement_plans',
    'Retirement plans',
    'Core authority-scope option covering retirement plan transactions.',
    'core_authority_scope',
    120,
    true
  ),
  (
    'taxes',
    'Taxes',
    'Core authority-scope option covering tax matters.',
    'core_authority_scope',
    130,
    true
  )
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  category = excluded.category,
  sort_order = excluded.sort_order,
  is_core_national_key = excluded.is_core_national_key,
  updated_at = now();

with core_scope_seed as (
  select *
  from (values
    ('US-CA', 'real_property', 'Real property transactions', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'tangible_personal_property', 'Tangible personal property', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'stocks_and_bonds', 'Stocks and bonds', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'commodities_and_options', 'Commodities and options', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'banking_and_financial', 'Banking and financial institution transactions', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'business_operations', 'Business operating transactions', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'insurance_and_annuities', 'Insurance and annuities', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'estates_trusts_and_beneficial_interests', 'Estates, trusts, and other beneficial interests', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'claims_and_litigation', 'Claims and litigation', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'personal_and_family_maintenance', 'Personal and family maintenance', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'government_benefits', 'Benefits from social security, medicare, or other governmental programs', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'retirement_plans', 'Retirement plans', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-CA', 'taxes', 'Tax matters', 'Cal. Prob. Code § 4401', 'Core authority-scope option from the California statutory financial power of attorney form.', 'high'),
    ('US-OH', 'real_property', 'Real property', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'tangible_personal_property', 'Tangible personal property', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'stocks_and_bonds', 'Stocks and bonds', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'commodities_and_options', 'Commodities and options', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'banking_and_financial', 'Banks and financial institutions', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'business_operations', 'Operation of entity or business', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'insurance_and_annuities', 'Insurance and annuities', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'estates_trusts_and_beneficial_interests', 'Estates, trusts, and other beneficial interests', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'claims_and_litigation', 'Claims and litigation', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'personal_and_family_maintenance', 'Personal and family maintenance', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'government_benefits', 'Benefits from governmental programs or military service', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'retirement_plans', 'Retirement plans', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high'),
    ('US-OH', 'taxes', 'Taxes', 'Ohio Rev. Code § 1337.25', 'Core authority-scope option from the Ohio financial power of attorney template.', 'high')
  ) as t(jurisdiction, canonical_key, state_specific_label, exact_statute_citation, plain_english_rule, confidence)
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
  where key in (
    'real_property',
    'tangible_personal_property',
    'stocks_and_bonds',
    'commodities_and_options',
    'banking_and_financial',
    'business_operations',
    'insurance_and_annuities',
    'estates_trusts_and_beneficial_interests',
    'claims_and_litigation',
    'personal_and_family_maintenance',
    'government_benefits',
    'retirement_plans',
    'taxes'
  )
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
  false,
  'statutory_form_checkbox',
  true,
  false,
  false,
  false,
  true,
  false,
  core_scope_seed.state_specific_label,
  null,
  core_scope_seed.exact_statute_citation,
  core_scope_seed.plain_english_rule,
  core_scope_seed.confidence::text,
  'pending',
  case
    when core_scope_seed.jurisdiction = 'US-CA'
      then 'Seeded California core authority-scope options from the current POA template so authority_scope_selection reflects statutory scope rather than special powers.'
    else 'Seeded Ohio core authority-scope options from the current POA template so authority_scope_selection reflects template scope rather than special powers.'
  end,
  jsonb_build_object('authority_scope_surface', 'core_authority')
from core_scope_seed
join req
  on req.jurisdiction = core_scope_seed.jurisdiction
join canon
  on canon.key = core_scope_seed.canonical_key
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