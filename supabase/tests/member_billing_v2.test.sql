begin;
select set_config('request.jwt.claim.role','service_role',true);
set role service_role;
do $$
declare w record;
begin
 select * into w from public.member_monthly_allowance_window('2026-01-31','2027-01-31','2026-02-28');
 if w.window_start<>'2026-02-28'::timestamptz or w.window_end<>'2026-03-31'::timestamptz then raise exception 'Month end drift'; end if;
 select * into w from public.member_monthly_allowance_window('2028-01-31','2029-01-31','2028-02-29');
 if w.window_start<>'2028-02-29'::timestamptz or w.window_end<>'2028-03-31'::timestamptz then raise exception 'Leap-year drift'; end if;
 select * into w from public.member_monthly_allowance_window('2026-01-31','2027-01-31','2026-03-31');
 if w.window_start<>'2026-03-31'::timestamptz or w.window_end<>'2026-04-30'::timestamptz then raise exception 'Boundary inclusive error'; end if;
 if exists(select 1 from public.billing_catalog_prices where price_code like '%_v2' and is_active) then raise exception 'New contracts must be staged inactive'; end if;
 begin
  perform public.activate_member_pricing_v2();
  raise exception 'Activation accepted missing mappings';
 exception when others then if sqlerrm<>'MEMBER_PRICING_V2_MAPPINGS_INCOMPLETE' then raise; end if;
 end;
end; $$;
insert into public.billing_provider_price_mappings(catalog_price_id,provider,provider_environment,provider_product_id,provider_price_id,status,verified_at)
 select id,'stripe','test','prod_ISOLATED_V2','price_ISOLATED_V2_'||price_code,'verified',now()
 from public.billing_catalog_prices where metadata->>'catalog_version'='2';
select public.activate_member_pricing_v2();
insert into public.users(id,supabase_user_id,email,role,status,email_confirmed_at)
 values('f8000000-0000-0000-0000-000000000001','f8100000-0000-0000-0000-000000000001','isolated-pricing-v2@example.invalid','member','active',now());
insert into public.billing_accounts(id,owner_user_id,account_key,status,is_default)
 values('f8200000-0000-0000-0000-000000000001','f8000000-0000-0000-0000-000000000001','isolated_v2','active',false);
do $$
declare a uuid:='f8200000-0000-0000-0000-000000000001'; u uuid:='f8000000-0000-0000-0000-000000000001';
 p timestamptz:=date_trunc('second',now())-interval '1 day'; r record; c record; e uuid; doc uuid; item uuid; w record; n integer;
begin
 select * into r from public.apply_stripe_member_subscription_snapshot(a,u,'cus_isolated_v2','sub_isolated_v2','price_ISOLATED_V2_member_starter_annual_v2','active',p,p+interval '1 year',false);
 e:=r.entitlement_id; item:=r.subscription_item_id;
 if r.quantity_limit<>3 then raise exception 'Annual allowance must be monthly three'; end if;
 if (select ends_at from public.billing_entitlements where id=e)<>p+interval '1 month' then raise exception 'Annual entitlement incorrectly lasts a year'; end if;
 if (select current_period_end from public.billing_subscriptions where id=r.subscription_id)<>p+interval '1 year' then raise exception 'Financial period shortened'; end if;
 for n in 1..3 loop
  doc:=gen_random_uuid();
  insert into public.documents(id,owner_id,status,document_type,jurisdiction,product_flow_mode) values(doc,u,'draft','uploaded_document','US-CA','notarize_document');
  select * into c from public.consume_member_document_workflow(a,e,doc,'v2-submit-'||n,'draft','pending_notary',u);
 end loop;
 doc:=gen_random_uuid();
 insert into public.documents(id,owner_id,status,document_type,jurisdiction,product_flow_mode) values(doc,u,'draft','uploaded_document','US-OH','notarize_document');
 begin
  perform public.consume_member_document_workflow(a,e,doc,'v2-submit-4','draft','pending_notary',u);
  raise exception 'Fourth document accepted on Starter';
 exception when others then if sqlerrm not like '%LIMIT_REACHED%' then raise; end if;
 end;
 -- Annual upgrades preserve this month's counter and original paid period.
 select * into r from public.apply_stripe_member_subscription_snapshot(a,u,'cus_isolated_v2','sub_isolated_v2','price_ISOLATED_V2_member_plus_annual_v2','active',p,p+interval '1 year',true);
 if r.entitlement_id<>e or r.quantity_used<>3 or r.quantity_limit<>25 then raise exception 'Upgrade reset usage'; end if;
 select * into c from public.consume_member_document_workflow(a,e,doc,'v2-submit-4','draft','pending_notary',u);
 if c.quantity_remaining<>21 then raise exception 'Upgrade allowance wrong'; end if;
 select * into r from public.apply_stripe_member_subscription_snapshot(a,u,'cus_isolated_v2','sub_isolated_v2','price_ISOLATED_V2_member_unlimited_annual_v2','active',p,p+interval '1 year',true);
 if r.quantity_limit is not null or r.quantity_used<>4 then raise exception 'Unlimited projection wrong'; end if;
 for n in 5..30 loop
  doc:=gen_random_uuid();
  insert into public.documents(id,owner_id,status,document_type,jurisdiction,product_flow_mode) values(doc,u,'draft','poa_general','US-CA','poa_only');
  select * into c from public.consume_member_document_workflow(a,e,doc,'v2-submit-'||n,'draft','pending_signature',u);
  if c.quantity_remaining is not null then raise exception 'Unlimited reported finite remaining'; end if;
 end loop;
 -- Simulate the next anniversary with historical windows; annual payment is unchanged.
 update public.billing_subscription_items set current_period_start=p-interval '1 month',current_period_end=p+interval '11 months' where id=item;
 update public.billing_subscriptions set current_period_start=p-interval '1 month',current_period_end=p+interval '11 months' where id=r.subscription_id;
 update public.billing_entitlements set starts_at=p-interval '1 month',ends_at=p where id=e;
 perform public.refresh_member_billing_window(a);
 perform public.refresh_member_billing_window(a);
 select * into w from public.billing_entitlements where subscription_item_id=item and status='active';
 if w.id=e or w.quantity_used<>0 or not w.is_unlimited then raise exception 'Monthly rollover failed'; end if;
 if (select quantity_used from public.billing_entitlements where id=e)<>30 then raise exception 'History changed'; end if;
 if (select count(*) from public.billing_entitlements where subscription_item_id=item)<>2 then raise exception 'Refresh not idempotent'; end if;
 -- Replayed submission after rollover still refers to the original consumption.
 select * into c from public.consume_member_document_workflow(a,w.id,doc,'v2-submit-30','draft','pending_signature',u);
 if not c.was_already_consumed or c.quantity_used<>30 then raise exception 'Rollover retry double counted'; end if;
 if (select quantity_used from public.billing_entitlements where id=w.id)<>0 then raise exception 'Old retry charged new month'; end if;
 select * into c from public.reverse_billing_usage_event(c.usage_event_id,'v2-reversal','Isolated regression fixture',u);
 if c.quantity_used<>29 or c.quantity_remaining is not null then raise exception 'Unlimited reversal wrong'; end if;
 if (select quantity_used from public.billing_entitlements where id=w.id)<>0 then raise exception 'Historical reversal changed the new window'; end if;
 if exists(select 1 from public.billing_catalog_prices where price_code in ('member_starter_monthly','member_plus_monthly','member_volume_monthly') and (not is_active or available_for_purchase)) then raise exception 'Legacy contract preservation failed'; end if;
end; $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.refresh_member_billing_window(uuid)','EXECUTE')
 or has_function_privilege('anon','public.activate_member_pricing_v2()','EXECUTE') then raise exception 'Privileged billing RPC exposed'; end if;
end; $$;
rollback;
