-- Enable realtime invalidation for the in-person session and finalization surfaces.

do $$
declare
  realtime_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach realtime_table in array array[
      'notarization_requests',
      'illuminotarization_workflows',
      'workflow_status_history',
      'meetings',
      'meeting_participants',
      'meeting_checkins',
      'geolocation_samples',
      'proximity_evaluations',
      'identity_verification_events',
      'meeting_artifacts',
      'document_versions',
      'finalization_status_history',
      'document_hash_records',
      'ledger_anchor_attempts'
    ] loop
      if to_regclass(format('public.%I', realtime_table)) is not null
        and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = realtime_table
        ) then
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      end if;
    end loop;
  end if;
end $$;