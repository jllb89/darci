-- Add AWS SNS as a DARCi-owned SMS notification provider.
-- This does not enable Supabase Auth phone OTP; it only lets the existing
-- notification outbox dispatch SMS deliveries through SNS.

alter table public.notification_deliveries
  drop constraint if exists notification_deliveries_provider_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_provider_check
  check (provider in ('internal', 'resend', 'sendgrid', 'ses', 'sns', 'twilio', 'webhook'));

alter table public.outbound_message_events
  drop constraint if exists outbound_message_events_provider_check;

alter table public.outbound_message_events
  add constraint outbound_message_events_provider_check
  check (provider in ('internal', 'resend', 'sendgrid', 'ses', 'sns', 'twilio', 'webhook'));
