-- Refresh product mode card copy so frontend can use API fields without hardcoded overrides.

update public.product_flow_modes
set
  display_name = case mode_key
    when 'poa_only' then 'Power of Attorney'
    when 'trust_bundle' then 'Trust Registration'
    when 'notarize_document' then 'Document Notarization'
    else display_name
  end,
  description = case mode_key
    when 'poa_only' then 'Authorize someone you trust to handle legal and financial decisions when you cannot or prefer not to act directly.'
    when 'trust_bundle' then 'Protect family assets with clear trustee authority and the core trust documents needed to administer and present your trust confidently.'
    when 'notarize_document' then 'Prepare an existing document for formal acceptance with secure upload and a guided notarization-ready workflow.'
    else description
  end,
  updated_at = now()
where mode_key in ('poa_only', 'trust_bundle', 'notarize_document');
