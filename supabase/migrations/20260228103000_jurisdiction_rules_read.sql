-- Ensure authenticated users can read jurisdiction rules

drop policy if exists "jurisdiction_rules_read" on public.jurisdiction_rules;

create policy "jurisdiction_rules_read" on public.jurisdiction_rules
  for select using (
    auth.role() in ('authenticated', 'service_role')
  );
