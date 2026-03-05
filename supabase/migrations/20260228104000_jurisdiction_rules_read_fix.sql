-- Fix jurisdiction_rules read policy for authenticated role contexts

grant usage on schema public to authenticated;

drop policy if exists "jurisdiction_rules_read" on public.jurisdiction_rules;

create policy "jurisdiction_rules_read" on public.jurisdiction_rules
  for select using (
    auth.role() in ('authenticated', 'service_role')
    or current_user = 'authenticated'
  );
