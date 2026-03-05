begin;

-- Seed data with service role
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
set role service_role;

-- Create test users
insert into public.users (id, supabase_user_id, email, role, status)
values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'member1@example.com', 'member', 'active'),
  ('00000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'member2@example.com', 'member', 'active'),
  ('00000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'notary1@example.com', 'notary', 'active');

-- Create document + request
insert into public.documents (id, owner_id, idn, status, document_type, jurisdiction)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'IDN-TEST-1', 'draft', 'generic', 'US-CA');

insert into public.documents (id, owner_id, idn, status, document_type, jurisdiction)
values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000002', 'IDN-TEST-2', 'draft', 'generic', 'US-CA');

insert into public.notarization_requests (id, document_id, assigned_notary_id, status)
values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003', 'pending');

insert into public.illuminotarization_codes (id, request_id, code, status)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'CODE-TEST', 'active');

-- Seed supporting records
insert into public.signatures (id, document_id, signer_id, signature_type, storage_path)
values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'member', 'signatures/aaaaaaaa/signature.png');

insert into public.signature_fields (id, document_id, page_number, x, y, width, height, required)
values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 100, 100, 150, 40, true);

insert into public.ledger_entries (id, document_id, idn, hash)
values ('11111111-1111-1111-1111-111111111110', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'IDN-TEST-1', 'HASH-TEST');

insert into public.notary_profiles (id, user_id, jurisdiction, commission_number)
values ('22222222-2222-2222-2222-222222222220', '00000000-0000-0000-0000-000000000003', 'US-OH', 'COMM-1');

insert into public.jurisdiction_rules (id, jurisdiction, id_requirements)
values ('33333333-3333-3333-3333-333333333330', 'US-OH', 'Identity verification handled by notary; not stored by DARCI');

-- Member1 context
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;
set row_security = on;

-- Member1 can read own document
do $$
declare v_count int;
begin
  select count(*) into v_count from public.documents where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_count != 1 then
    raise exception 'Member1 should read own document';
  end if;
end $$;

-- Member1 cannot read other member's document
do $$
declare v_count int;
begin
  select count(*) into v_count from public.documents where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  if v_count != 0 then
    raise exception 'Member1 should not read member2 document';
  end if;
end $$;

-- Notary context
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;
set row_security = on;

-- Notary can read assigned notarization request
 do $$
declare v_count int;
begin
  select count(*) into v_count from public.notarization_requests where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if v_count != 1 then
    raise exception 'Notary should read assigned request';
  end if;
end $$;

-- Notary can read signature for assigned document
do $$
declare v_count int;
begin
  select count(*) into v_count from public.signatures where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  if v_count != 1 then
    raise exception 'Notary should read signature for assigned document';
  end if;
end $$;

-- Notary can read ledger entry for assigned document
do $$
declare v_count int;
begin
  select count(*) into v_count from public.ledger_entries where id = '11111111-1111-1111-1111-111111111110';
  if v_count != 1 then
    raise exception 'Notary should read ledger entry for assigned document';
  end if;
end $$;

-- Notary can read own profile
do $$
declare v_count int;
begin
  select count(*) into v_count from public.notary_profiles where id = '22222222-2222-2222-2222-222222222220';
  if v_count != 1 then
    raise exception 'Notary should read own profile';
  end if;
end $$;

-- Member can read code for own request
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;
set row_security = on;

 do $$
declare v_count int;
begin
  select count(*) into v_count from public.illuminotarization_codes where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  if v_count != 1 then
    raise exception 'Member should read code for own request';
  end if;
end $$;

-- Member can read own signature
do $$
declare v_count int;
begin
  select count(*) into v_count from public.signatures where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  if v_count != 1 then
    raise exception 'Member should read own signature';
  end if;
end $$;

-- Member can read signature fields for own document
do $$
declare v_count int;
begin
  select count(*) into v_count from public.signature_fields where id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  if v_count != 1 then
    raise exception 'Member should read signature fields for own document';
  end if;
end $$;

-- Member can read ledger entry for own document
do $$
declare v_count int;
begin
  select count(*) into v_count from public.ledger_entries where id = '11111111-1111-1111-1111-111111111110';
  if v_count != 1 then
    raise exception 'Member should read ledger entry for own document';
  end if;
end $$;

-- Member can read jurisdiction rules
do $$
declare v_count int;
declare v_count_all int;
declare v_role text;
declare v_user text;
declare v_uid text;
begin
  select current_user into v_user;
  select auth.role() into v_role;
  select auth.uid()::text into v_uid;
  raise notice 'jurisdiction_rules check: current_user=%, auth.role()=%, auth.uid()=%', v_user, v_role, v_uid;
  select count(*) into v_count_all from public.jurisdiction_rules;
  raise notice 'jurisdiction_rules total rows visible=%', v_count_all;
  select count(*) into v_count from public.jurisdiction_rules where id = '33333333-3333-3333-3333-333333333330';
  if v_count != 1 then
    raise exception 'Member should read jurisdiction rules';
  end if;
end $$;

rollback;
