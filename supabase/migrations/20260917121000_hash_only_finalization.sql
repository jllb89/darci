-- Hash-only is a recorded disposition, never a simulated external anchor.
alter table public.ledger_anchor_attempts drop constraint ledger_anchor_attempts_status_check;
alter table public.ledger_anchor_attempts add constraint ledger_anchor_attempts_status_check
  check (status in ('pending', 'anchored', 'not_required', 'failed'));
alter table public.ledger_anchor_attempts add constraint ledger_anchor_attempts_hash_only_check
  check (status <> 'not_required' or (
    (response_payload->>'provider') is not distinct from 'hash_only'
    and nullif(response_payload->>'ledgerTxId', '') is null
    and nullif(response_payload->>'anchoredAt', '') is null
    and completed_at is not null and failed_at is null
  ));
alter table public.finalization_status_history drop constraint finalization_status_history_status_check;
alter table public.finalization_status_history add constraint finalization_status_history_status_check
  check (status in ('acknowledgment_appended', 'watermark_applied', 'hash_recorded',
    'hash_verified', 'ledger_anchored', 'verification_checked', 'failed'));
