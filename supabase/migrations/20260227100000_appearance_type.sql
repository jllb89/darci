-- Add appearance type for IPEN vs other models

alter table public.notarization_requests
  add column if not exists appearance_type text not null default 'ipen';

alter table public.notarization_requests
  add constraint notarization_requests_appearance_check
  check (appearance_type in ('ipen'));
