-- Browser/native clients use server-authorized signed transfers. Direct JWT
-- storage access must not bypass final-package holds or overwrite legal evidence.
create policy evidence_storage_requires_server_authorization
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id not in ('documents','signatures','notarized-copies','meeting-evidence','illuminotary-assets'))
with check (bucket_id not in ('documents','signatures','notarized-copies','meeting-evidence','illuminotary-assets'));

-- Mutations are performed by authenticated/authorized backend workflows, never
-- by a client rewriting an evidence, entitlement or release row through PostgREST.
revoke insert,update,delete on public.document_execution_runs, public.document_hash_records,
  public.ledger_anchor_attempts, public.ledger_entries, public.acknowledgment_pages,
  public.finalization_status_history, public.document_release_controls,
  public.identity_verification_events, public.meeting_checkins, public.meeting_artifacts,
  public.billing_entitlements, public.billing_subscriptions, public.billing_orders,
  public.stripe_webhook_events, public.audit_events from anon,authenticated;

-- Legacy identity metadata can still contain full values until the reviewed
-- encryption backfill. Only the server's redacted serializers may expose it.
revoke select on public.identity_verification_events,public.meeting_checkins from anon,authenticated;
