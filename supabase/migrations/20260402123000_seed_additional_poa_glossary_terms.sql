-- Add glossary terms for POA intake fields introduced in the member-form aggregation flow.

with glossary_seed as (
  select *
  from (values
    (
      'successor_agent',
      'Successor agent',
      null,
      'A successor agent is a backup person named to act if the first-named agent cannot or will not serve.',
      'Users need this to understand who can step in when the primary agent is unavailable or declines to act.',
      false,
      150
    ),
    (
      'special_instructions',
      'Special instructions',
      null,
      'Special instructions are custom directions added by the principal to clarify limits, preferences, or extra terms in the POA.',
      'Users need this to understand where they can add tailored directions that are not captured by default authority options.',
      false,
      160
    )
  ) as t(
    glossary_key,
    generic_label,
    state_specific_label,
    product_description,
    why_user_needs_this,
    is_materially_state_specific,
    sort_order
  )
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
    when req.jurisdiction = 'US-CA' then 'Additional California glossary seed for member-form intake labels. Confirm final statutory wording before production reliance.'
    else 'Additional Ohio glossary seed for member-form intake labels. Confirm state terminology and citations before production reliance.'
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
