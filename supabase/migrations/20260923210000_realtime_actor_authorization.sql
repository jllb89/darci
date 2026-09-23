-- A policy join through documents_owner_access hid the owner's document from
-- assigned notaries, rejecting their private request subscriptions. Evaluate a
-- boolean relationship check without granting access to the underlying rows.
create or replace function public.can_receive_private_realtime(p_topic text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_session text := auth.jwt()->>'session_id';
  v_user uuid;
  v_target uuid;
  v_notary boolean;
  v_admin boolean;
begin
  if v_auth is null or v_session is null or v_session !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_topic is null or p_topic !~* '^(request|notary-queue):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if not public.is_auth_session_active(v_auth, v_session::uuid) then return false; end if;
  select u.id into v_user from public.users u
    where u.supabase_user_id = v_auth and u.status = 'active';
  if v_user is null or not exists (
    select 1 from public.user_roles r where r.user_id = v_user and r.status = 'active'
  ) then return false; end if;
  select exists(select 1 from public.user_roles r where r.user_id=v_user and r.role='notary' and r.status='active'),
         exists(select 1 from public.user_roles r where r.user_id=v_user and r.role='admin' and r.status='active')
    into v_notary, v_admin;
  v_target := split_part(p_topic, ':', 2)::uuid;
  if split_part(p_topic, ':', 1) = 'notary-queue' then
    return v_target = v_user and (v_notary or v_admin);
  end if;
  return exists (
    select 1 from public.notarization_requests nr
    join public.documents d on d.id = nr.document_id
    where nr.id = v_target and (
      d.owner_id = v_user or (nr.assigned_notary_id = v_user and v_notary) or v_admin
    )
  );
end;
$$;
revoke all on function public.can_receive_private_realtime(text) from public, anon, authenticated;
grant execute on function public.can_receive_private_realtime(text) to authenticated;
comment on function public.can_receive_private_realtime(text) is
  'Boolean-only, current-caller authorization for private invalidation topics. No row data or caller-selectable identity. Requires live session and current active role.';

do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute 'drop policy if exists "darci_request_realtime_broadcast_receive" on realtime.messages';
    execute $policy$
      create policy "darci_request_realtime_broadcast_receive" on realtime.messages
      for select to authenticated
      using (extension = 'broadcast' and public.can_receive_private_realtime(realtime.topic()))
    $policy$;
  end if;
end $$;
