-- Scope queue invalidations to the authenticated notary's database user ID.

do $$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;

  execute 'drop policy if exists "darci_request_realtime_broadcast_receive" on realtime.messages';

  execute $policy$
    create policy "darci_request_realtime_broadcast_receive"
    on realtime.messages
    for select
    to authenticated
    using (
      (
        realtime.topic() ~* '^notary-queue:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.users u
          left join public.user_roles ur
            on ur.user_id = u.id
            and ur.status = 'active'
            and ur.role in ('notary', 'admin')
          where u.id = split_part(realtime.topic(), ':', 2)::uuid
            and u.supabase_user_id = auth.uid()
            and (u.role in ('notary', 'admin') or ur.id is not null)
        )
      )
      or (
        realtime.topic() ~* '^request:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1
          from public.notarization_requests nr
          join public.documents d on d.id = nr.document_id
          left join public.users owner_user on owner_user.id = d.owner_id
          left join public.users assigned_notary on assigned_notary.id = nr.assigned_notary_id
          where nr.id = split_part(realtime.topic(), ':', 2)::uuid
            and (
              owner_user.supabase_user_id = auth.uid()
              or assigned_notary.supabase_user_id = auth.uid()
              or exists (
                select 1
                from public.users admin_user
                left join public.user_roles admin_role
                  on admin_role.user_id = admin_user.id
                  and admin_role.status = 'active'
                  and admin_role.role = 'admin'
                where admin_user.supabase_user_id = auth.uid()
                  and (admin_user.role = 'admin' or admin_role.id is not null)
              )
            )
        )
      )
    )
  $policy$;
end $$;
