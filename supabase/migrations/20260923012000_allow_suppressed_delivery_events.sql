-- Match the existing application callback type without rewriting event history.
begin;
alter table public.outbound_message_events
  drop constraint outbound_message_events_event_type_check;
alter table public.outbound_message_events
  add constraint outbound_message_events_event_type_check check (event_type in (
    'queued', 'sent', 'delivered', 'deferred', 'failed', 'bounced',
    'complained', 'opened', 'clicked', 'accepted', 'rejected',
    'unsubscribed', 'rendered', 'suppressed'
  ));
commit;
