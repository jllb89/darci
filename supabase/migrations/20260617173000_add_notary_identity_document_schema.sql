create table if not exists public.notary_identity_document_types (
  code text primary key,
  label text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notary_identity_document_fields (
  id uuid primary key default gen_random_uuid(),
  document_type_code text not null references public.notary_identity_document_types(code) on delete cascade,
  field_key text not null check (field_key in ('issuingJurisdiction', 'documentExpirationDate', 'documentNumberTail', 'maskedIdentifier')),
  label text not null,
  placeholder text,
  input_kind text not null check (input_kind in ('text', 'date')),
  is_required boolean not null default false,
  min_length integer,
  max_length integer,
  pattern text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_type_code, field_key)
);

create index if not exists idx_notary_identity_document_types_active_sort
  on public.notary_identity_document_types (is_active, sort_order, label);

create index if not exists idx_notary_identity_document_fields_type_sort
  on public.notary_identity_document_fields (document_type_code, sort_order, field_key);

insert into public.notary_identity_document_types (code, label, is_active, sort_order)
values
  ('state_driver_license', 'State driver license', true, 10),
  ('state_identification_card', 'State identification card', true, 20),
  ('passport', 'Passport', true, 30),
  ('passport_card', 'Passport card', true, 40),
  ('military_id', 'Military ID', true, 50),
  ('permanent_resident_card', 'Permanent resident card', true, 60),
  ('tribal_identification_card', 'Tribal identification card', true, 70),
  ('foreign_passport', 'Foreign passport', true, 80)
on conflict (code) do update
set
  label = excluded.label,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.notary_identity_document_fields
  (document_type_code, field_key, label, placeholder, input_kind, is_required, min_length, max_length, pattern, sort_order)
values
  ('state_driver_license', 'issuingJurisdiction', 'Issuing state', 'Issuing state', 'text', true, 2, 80, null, 10),
  ('state_driver_license', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('state_driver_license', 'documentNumberTail', 'License number tail', 'Last 4 characters', 'text', true, 2, 4, '^[A-Za-z0-9]{2,4}$', 30),

  ('state_identification_card', 'issuingJurisdiction', 'Issuing state', 'Issuing state', 'text', true, 2, 80, null, 10),
  ('state_identification_card', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('state_identification_card', 'documentNumberTail', 'ID number tail', 'Last 4 characters', 'text', true, 2, 4, '^[A-Za-z0-9]{2,4}$', 30),

  ('passport', 'issuingJurisdiction', 'Issuing country', 'Issuing country', 'text', true, 2, 80, null, 10),
  ('passport', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('passport', 'maskedIdentifier', 'Passport number', 'Passport number', 'text', true, 4, 64, '^[A-Za-z0-9\-\s]{4,64}$', 30),

  ('passport_card', 'issuingJurisdiction', 'Issuing country', 'Issuing country', 'text', true, 2, 80, null, 10),
  ('passport_card', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('passport_card', 'maskedIdentifier', 'Passport card number', 'Passport card number', 'text', true, 4, 64, '^[A-Za-z0-9\-\s]{4,64}$', 30),

  ('military_id', 'issuingJurisdiction', 'Issuing authority', 'Issuing authority', 'text', true, 2, 80, null, 10),
  ('military_id', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('military_id', 'maskedIdentifier', 'Military ID number', 'Military ID number', 'text', true, 4, 64, '^[A-Za-z0-9\-\s]{4,64}$', 30),

  ('permanent_resident_card', 'issuingJurisdiction', 'Issuing country', 'Issuing country', 'text', true, 2, 80, null, 10),
  ('permanent_resident_card', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('permanent_resident_card', 'maskedIdentifier', 'Resident card number', 'Resident card number', 'text', true, 4, 64, '^[A-Za-z0-9\-\s]{4,64}$', 30),

  ('tribal_identification_card', 'issuingJurisdiction', 'Issuing tribe or jurisdiction', 'Issuing tribe or jurisdiction', 'text', true, 2, 120, null, 10),
  ('tribal_identification_card', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('tribal_identification_card', 'documentNumberTail', 'Tribal ID number tail', 'Last 4 characters', 'text', true, 2, 4, '^[A-Za-z0-9]{2,4}$', 30),

  ('foreign_passport', 'issuingJurisdiction', 'Issuing country', 'Issuing country', 'text', true, 2, 80, null, 10),
  ('foreign_passport', 'documentExpirationDate', 'Expiration date', 'Expiration date', 'date', true, 10, 10, null, 20),
  ('foreign_passport', 'maskedIdentifier', 'Passport number', 'Passport number', 'text', true, 4, 64, '^[A-Za-z0-9\-\s]{4,64}$', 30)
on conflict (document_type_code, field_key) do update
set
  label = excluded.label,
  placeholder = excluded.placeholder,
  input_kind = excluded.input_kind,
  is_required = excluded.is_required,
  min_length = excluded.min_length,
  max_length = excluded.max_length,
  pattern = excluded.pattern,
  sort_order = excluded.sort_order,
  updated_at = now();
