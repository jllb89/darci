-- Production SMS replay guard: no OTP, phone number, token or raw request retained.
begin;
create table if not exists public.auth_sms_hook_receipts (
  hook_hash text primary key check (hook_hash ~ '^[a-f0-9]{64}$'),
  payload_hmac text not null check (payload_hmac ~ '^[a-f0-9]{64}$'),
  status text not null default 'processing' check (status in ('processing','accepted','uncertain')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint accepted_sms_has_receipt check (status <> 'accepted' or provider_message_id is not null)
);
alter table public.auth_sms_hook_receipts enable row level security;
revoke all on public.auth_sms_hook_receipts from public, anon, authenticated;
grant select, insert, update on public.auth_sms_hook_receipts to service_role;
comment on table public.auth_sms_hook_receipts is
  'Signed-hook replay guard. Only keyed payload digest and provider receipt; no phone or OTP. Uncertain sends require a new login request, never automatic resend.';
commit;
