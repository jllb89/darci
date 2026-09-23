-- Selecting a clean production namespace is not permission to charge customers.
-- Keep approval false while deploying a private production candidate. All Stripe
-- mutations still pass the shared assertion, which now enforces activation too.
alter table public.billing_runtime_configuration
  drop constraint billing_runtime_configuration_check;

create or replace function public.assert_stripe_runtime_environment(p_environment text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_environment text; v_approved boolean;
begin
  select stripe_environment, live_activation_approved into v_environment, v_approved
    from public.billing_runtime_configuration where singleton;
  if p_environment is null or p_environment not in ('test','live') or p_environment is distinct from v_environment then
    raise exception 'STRIPE_RUNTIME_ENVIRONMENT_MISMATCH';
  end if;
  if v_environment = 'live' and v_approved is not true then
    raise exception 'STRIPE_LIVE_ACTIVATION_DISABLED';
  end if;
end;
$$;
revoke all on function public.assert_stripe_runtime_environment(text) from public, anon, authenticated;
grant execute on function public.assert_stripe_runtime_environment(text) to service_role;
