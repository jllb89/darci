-- API-only liveness check: a signed, unexpired JWT is not proof that the
-- session still exists after logout or account removal. No session data leaves
-- this function. Migration must precede the corresponding API release.
begin;
create or replace function public.is_auth_session_active(p_user_id uuid, p_session_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.sessions s
    join auth.users u on u.id = s.user_id
    where s.id = p_session_id and s.user_id = p_user_id
      and (s.not_after is null or s.not_after > now())
      and (u.banned_until is null or u.banned_until <= now())
      and u.deleted_at is null
  );
$$;
revoke all on function public.is_auth_session_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_auth_session_active(uuid, uuid) to service_role;
comment on function public.is_auth_session_active(uuid, uuid) is
  'Server-only session ownership, logout, expiry, banned/deleted-user check. Does not expose auth session records.';
commit;
