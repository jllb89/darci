-- Refine starter POA tooltip seed text so California and Ohio expose distinct
-- state-specific glossary and special-authority explanations in the API.

with req as (
  select id, jurisdiction
  from public.poa_requirements
  where poa_type = 'general'
    and jurisdiction in ('US-CA', 'US-OH')
)
update public.poa_glossary_terms as term
set
  product_description = case
    when req.jurisdiction = 'US-CA' and term.glossary_key = 'proxy_signer'
      then 'California permits another person to sign the power of attorney for the principal at the principal''s direction and in the principal''s presence.'
    when req.jurisdiction = 'US-OH' and term.glossary_key = 'proxy_signer'
      then 'Ohio permits another person to sign the power of attorney for the principal at the principal''s direction and in the principal''s presence.'
    when req.jurisdiction = 'US-CA' and term.glossary_key = 'special_authority'
      then 'California''s statutory form treats certain powers as special authorities that should be separately initialed instead of being left inside the general grant of authority.'
    when req.jurisdiction = 'US-OH' and term.glossary_key = 'special_authority'
      then 'Ohio treats certain powers as authorities that must be expressly granted in the document instead of being implied by a general grant.'
    else term.product_description
  end,
  why_user_needs_this = case
    when req.jurisdiction = 'US-CA' and term.glossary_key = 'proxy_signer'
      then 'DARCI only asks for a proxy signer when someone other than the principal will sign under California''s signing rule.'
    when req.jurisdiction = 'US-OH' and term.glossary_key = 'proxy_signer'
      then 'DARCI only asks for a proxy signer when someone other than the principal will sign under Ohio''s signing rule.'
    when req.jurisdiction = 'US-CA' and term.glossary_key = 'special_authority'
      then 'DARCI needs these powers called out separately because California''s statutory form gives them their own special-authority treatment.'
    when req.jurisdiction = 'US-OH' and term.glossary_key = 'special_authority'
      then 'DARCI needs these powers called out expressly because Ohio requires an explicit grant for this category of authority.'
    else term.why_user_needs_this
  end,
  is_materially_state_specific = case
    when term.glossary_key in ('proxy_signer', 'special_authority') then true
    else term.is_materially_state_specific
  end,
  updated_at = now()
from req
where term.poa_requirement_id = req.id
  and term.glossary_key in ('proxy_signer', 'special_authority');

with req as (
  select id, jurisdiction
  from public.poa_requirements
  where poa_type = 'general'
    and jurisdiction in ('US-CA', 'US-OH')
)
update public.poa_special_authority_rules as rule
set
  plain_english_rule = case
    when req.jurisdiction = 'US-CA'
      then 'California treats this as a special authority that should be separately initialed on the statutory form.'
    when req.jurisdiction = 'US-OH'
      then 'Ohio requires this authority to be expressly granted in the power of attorney.'
    else rule.plain_english_rule
  end,
  updated_at = now()
from req
where rule.poa_requirement_id = req.id;