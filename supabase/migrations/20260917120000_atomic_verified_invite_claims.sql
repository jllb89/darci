-- Server-only claim boundary. A bearer invite token is not signing authority.
create or replace function public.claim_document_invite(
  p_viewer_user_id uuid,
  p_token_hash text default null,
  p_invite_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_invite public.document_access_invites%rowtype;
  v_token public.invite_tokens%rowtype;
  v_recipient public.invite_recipients%rowtype;
  v_email text;
  v_id uuid;
  v_status text;
begin
  if p_viewer_user_id is null or ((p_token_hash is null) = (p_invite_id is null)) then
    raise exception 'INVITE_IDENTITY_REQUIRED';
  end if;
  select lower(btrim(a.email)) into v_email
    from public.users u join auth.users a on a.id = u.supabase_user_id
    where u.id = p_viewer_user_id and u.status = 'active'
      and a.email_confirmed_at is not null and a.deleted_at is null
      and (a.banned_until is null or a.banned_until <= now());
  if v_email is null or v_email = '' then raise exception 'INVITE_IDENTITY_REQUIRED'; end if;

  v_id := p_invite_id;
  if p_token_hash is not null then
    select invite_id into v_id from public.invite_tokens where token_hash = p_token_hash;
  end if;
  -- Always lock invite before token: concurrent token and inbox claims serialize.
  select * into v_invite from public.document_access_invites where id = v_id for update;
  if not found or v_invite.invite_kind <> 'document_signing'
    or v_invite.document_output_signer_id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;
  select * into v_recipient from public.invite_recipients
    where invite_id = v_invite.id and is_primary and recipient_kind = 'to'
      and channel = 'email' and lower(btrim(delivery_address)) = v_email
      and (target_user_id is null or target_user_id = p_viewer_user_id)
    order by created_at, id limit 1 for update;
  if not found then raise exception 'INVITE_IDENTITY_REQUIRED'; end if;
  if v_invite.status in ('declined', 'revoked', 'expired', 'failed') or v_invite.revoked_at is not null then
    raise exception 'INVITE_UNAVAILABLE';
  end if;
  if v_invite.claimed_user_id is not null and v_invite.claimed_user_id <> p_viewer_user_id then
    raise exception 'INVITE_ALREADY_CLAIMED';
  end if;
  if p_token_hash is not null then
    select * into v_token from public.invite_tokens
      where token_hash = p_token_hash and invite_id = v_invite.id for update;
    if not found or v_token.status in ('revoked', 'expired') or v_token.expires_at <= now()
      or v_token.purpose not in ('invite_access', 'signup_claim') then
      raise exception 'INVITE_UNAVAILABLE';
    end if;
  end if;
  -- Already granted access survives invitation-link expiry through authenticated inbox,
  -- but never invite revocation or an account/email mismatch. Retry creates no new claim.
  if v_invite.status in ('claimed', 'accepted', 'completed') then
    if v_invite.claimed_user_id = p_viewer_user_id then return to_jsonb(v_invite); end if;
    raise exception 'INVITE_ALREADY_CLAIMED';
  end if;
  if v_invite.status not in ('queued', 'sent', 'opened')
    or (v_invite.expires_at is not null and v_invite.expires_at <= now()) then
    raise exception 'INVITE_UNAVAILABLE';
  end if;
  if p_token_hash is not null and (v_token.status <> 'active' or v_token.use_count >= v_token.max_uses) then
    raise exception 'INVITE_ALREADY_CLAIMED';
  end if;
  v_status := case when v_invite.requires_acceptance then 'claimed' else 'accepted' end;
  insert into public.invite_claims (invite_id, invite_token_id, claimed_user_id, claim_status,
    claim_method, claim_channel, claim_address, accepted_at, metadata)
  values (v_invite.id, v_token.id, p_viewer_user_id, v_status, 'existing_session', 'email', v_email,
    case when v_status = 'accepted' then now() end, '{"source":"verified_atomic_claim"}'::jsonb);
  update public.document_access_invites set status = v_status, claimed_user_id = p_viewer_user_id,
    first_clicked_at = coalesce(first_clicked_at, now()),
    accepted_at = case when v_status = 'accepted' then now() else accepted_at end, updated_at = now()
    where id = v_invite.id returning * into v_invite;
  -- Revoke sibling links on inbox/token claim; no leftover bearer can assign the invite.
  update public.invite_tokens set status = 'revoked', updated_at = now()
    where invite_id = v_invite.id and status = 'active' and id is distinct from v_token.id;
  if v_token.id is not null then
    update public.invite_tokens set use_count = use_count + 1, status = 'consumed',
      last_used_at = now(), consumed_at = now(), consumed_by_user_id = p_viewer_user_id, updated_at = now()
      where id = v_token.id;
  end if;
  update public.invite_recipients set status = 'claimed', target_user_id = p_viewer_user_id,
    last_event_at = now(), updated_at = now() where id = v_recipient.id;
  -- An audit failure rolls the entire claim back, including consumed tokens.
  insert into public.audit_events (actor_id, entity_type, entity_id, action, metadata)
    values (p_viewer_user_id, 'document_invite', v_invite.id, 'invite_claimed',
      jsonb_build_object('document_id', v_invite.document_id, 'token_id', v_token.id,
        'claim_method', 'existing_session', 'verified_email_match', true));
  return to_jsonb(v_invite);
end;
$$;
revoke all on function public.claim_document_invite(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_document_invite(uuid, text, uuid) to service_role;
