create table if not exists public.template_binding_rules (
  id uuid primary key default gen_random_uuid(),
  document_key text not null,
  placeholder text not null,
  description text not null,
  required boolean not null default false,
  source text not null,
  canonical_key text,
  source_field_key text,
  notes text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint template_binding_rules_unique
    unique (document_key, placeholder),

  constraint template_binding_rules_document_key_check
    check (document_key ~ '^[a-z0-9_]+$'),

  constraint template_binding_rules_source_check
    check (source in ('member_form', 'system', 'notary', 'signing')),

  constraint template_binding_rules_sort_order_check
    check (sort_order >= 0),

  constraint template_binding_rules_member_form_field_ref_check
    check (
      source <> 'member_form'
      or canonical_key is not null
      or source_field_key is not null
    )
);

create index if not exists idx_template_binding_rules_lookup
  on public.template_binding_rules(document_key, is_active, sort_order, placeholder);

drop trigger if exists trg_template_binding_rules_set_updated_at
  on public.template_binding_rules;
create trigger trg_template_binding_rules_set_updated_at
before update on public.template_binding_rules
for each row
execute function public.set_updated_at();

alter table public.template_binding_rules enable row level security;

drop policy if exists "template_binding_rules_read" on public.template_binding_rules;
create policy "template_binding_rules_read" on public.template_binding_rules
  for select using (true);

drop policy if exists "template_binding_rules_write" on public.template_binding_rules;
create policy "template_binding_rules_write" on public.template_binding_rules
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.template_binding_rules to authenticated;

comment on table public.template_binding_rules is
'Template placeholder binding catalog keyed by document_key; drives intake-requiredness and extraction coverage checks.';

insert into public.template_binding_rules (
  document_key,
  placeholder,
  description,
  required,
  source,
  canonical_key,
  source_field_key,
  notes,
  sort_order,
  is_active
)
values
  ('trust_rrr', 'TrustName', 'Registered trust name shown in title and confirmation section.', true, 'member_form', 'trust_name', null, null, 10, true),
  ('trust_rrr', 'DarciNo', 'Registry number assigned to this DARCi trust registration.', true, 'system', null, null, 'Issued by platform during registration.', 20, true),
  ('trust_rrr', 'Trustmaker(s)', 'Trustmaker names.', true, 'member_form', 'grantors', null, null, 30, true),
  ('trust_rrr', 'Document#.Name / Document#.Date', 'Prior trust documents listed in chronology order, including the originating trust document followed by amendments and supporting records.', true, 'member_form', 'prior_document_items', null, 'Preserve member-entered document order and chronology_order when assembling trust output context.', 40, true),
  ('trust_rrr', 'Trustee(s)', 'Current trustees listed in title and signature blocks.', true, 'member_form', 'trustees', null, null, 50, true),
  ('trust_rrr', 'TrustDate', 'Trust creation date.', true, 'member_form', 'trust_date', null, null, 60, true),
  ('trust_rrr', 'RevokePower', 'Who may revoke the trust.', true, 'member_form', 'revocation_holders', null, null, 70, true),
  ('trust_rrr', 'TaxSettlor', 'Primary Trustmaker tax ID owner for trust operations.', true, 'member_form', 'tax_id_owner', null, null, 80, true),
  ('trust_rrr', 'TrustState', 'Governing state law.', true, 'member_form', 'jurisdiction', null, null, 90, true),
  ('trust_rrr', 'SignatureAuthority', 'Signature rule for trustees exercising powers.', true, 'member_form', 'trustee_signature_authority', null, null, 100, true),
  ('trust_rrr', 'SignatureAuthorityCustomText', 'Custom trustee signing instructions used when custom signature authority is selected.', false, 'member_form', 'trustee_signature_authority_custom_text', null, null, 110, true),
  ('trust_rrr', 'Trustee powers checkboxes', 'Transaction authority grid for trustee powers.', true, 'member_form', 'trustee_powers', 'trustee_power_matrix', null, 120, true),
  ('trust_rrr', 'TrusteeIncapacityStandard', 'Standard required to evidence trustee incapacity.', true, 'member_form', 'trustee_incapacity_standard', null, null, 130, true),
  ('trust_rrr', 'TM1/TM2 signatures', 'Trustmaker signature participants.', true, 'member_form', 'grantors', null, null, 140, true),
  ('trust_rrr', 'Trustee1/Trustee2 signatures', 'Trustee signature participants.', true, 'member_form', 'trustees', null, null, 150, true),
  ('trust_rrr', 'County / Day / Month / Year', 'Notarial acknowledgment date and venue details.', true, 'notary', null, null, 'Collected in notary/execution phase.', 160, true),
  ('trust_rrr', 'Illuminotary', 'Notary identity in acknowledgment block.', true, 'notary', null, null, null, 170, true),

  ('poa_general', 'DdpoaNo', 'DARCi DDPOA identifier.', true, 'system', null, null, 'Issued by platform during POA creation.', 10, true),
  ('poa_general', 'Principal.FullName', 'Principal full legal name.', true, 'member_form', 'principal_full_name', null, null, 20, true),
  ('poa_general', 'Principal.Phone / Principal.Email', 'Principal contact details.', true, 'member_form', 'principal_contact', null, null, 30, true),
  ('poa_general', 'Agent[0].FullName', 'Primary agent full legal name.', true, 'member_form', 'agent_full_name', null, null, 40, true),
  ('poa_general', 'Agent[0].Phone / Agent[0].Email', 'Primary agent contact details.', true, 'member_form', 'agent_contact', null, null, 50, true),
  ('poa_general', 'Powers A-M / N', 'Selected statutory authority scope checkboxes.', true, 'member_form', 'authority_scope_selection', null, null, 60, true),
  ('poa_general', 'SpecialInstructions[text 6400]', 'Special instructions clause content.', false, 'member_form', 'special_instructions_text', null, null, 70, true),
  ('poa_general', 'Multiple Agents joint/separate rule', 'How multiple agents act (jointly or independently).', true, 'member_form', 'agent_signature_authority', null, 'Expected by DDPOA template language.', 80, true),
  ('poa_general', 'Execution day / month / year', 'POA execution date.', true, 'signing', 'execution_date', null, 'Captured from the member signing event, not the intake form.', 90, true),
  ('poa_general', 'QR Code', 'Rendered verification QR tied to DDPOA number.', true, 'system', null, null, null, 100, true),
  ('poa_general', 'CA_Notarial_Acknowledgment_Block', 'California acknowledgment text block.', true, 'system', null, null, 'Selected from template resolution / execution profile.', 110, true)
on conflict (document_key, placeholder)
do update set
  description = excluded.description,
  required = excluded.required,
  source = excluded.source,
  canonical_key = excluded.canonical_key,
  source_field_key = excluded.source_field_key,
  notes = excluded.notes,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();
