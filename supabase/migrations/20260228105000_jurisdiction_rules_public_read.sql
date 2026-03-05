-- Make jurisdiction rules readable under RLS for any authenticated session

drop policy if exists "jurisdiction_rules_read" on public.jurisdiction_rules;

create policy "jurisdiction_rules_read" on public.jurisdiction_rules
  for select using (true);
