-- Track 6 / Phase 7 hardening: evidence retention lifecycle and tighter storage policy coverage.

-- Ensure retention windows never precede capture timestamps.
alter table public.meeting_artifacts
  drop constraint if exists meeting_artifacts_retention_after_capture_check;

alter table public.meeting_artifacts
  add constraint meeting_artifacts_retention_after_capture_check
  check (
    retention_until is null
    or captured_at is null
    or retention_until >= captured_at
  );

-- Ensure lifecycle states that represent redaction or deletion always carry an event timestamp.
alter table public.meeting_artifacts
  drop constraint if exists meeting_artifacts_redaction_timestamp_required_check;

alter table public.meeting_artifacts
  add constraint meeting_artifacts_redaction_timestamp_required_check
  check (
    status not in ('redacted', 'expired', 'deleted')
    or redacted_at is not null
  );

create or replace function public.meeting_artifact_apply_lifecycle_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('redacted', 'expired', 'deleted') and new.redacted_at is null then
    new.redacted_at = now();
  end if;

  if new.status = 'deleted' and new.retention_until is null then
    new.retention_until = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_meeting_artifacts_apply_lifecycle_defaults on public.meeting_artifacts;
create trigger trg_meeting_artifacts_apply_lifecycle_defaults
before insert or update on public.meeting_artifacts
for each row execute function public.meeting_artifact_apply_lifecycle_defaults();

-- Tighten storage access by binding object visibility to persisted artifact rows.
drop policy if exists "meeting_evidence_bucket_select_visible" on storage.objects;
create policy "meeting_evidence_bucket_select_visible" on storage.objects
  for select using (
    bucket_id = 'meeting-evidence'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.meeting_artifacts artifacts
        where artifacts.storage_bucket = storage.objects.bucket_id
          and artifacts.storage_path = storage.objects.name
          and (
            public.auth_user_matches(artifacts.uploaded_by_user_id)
            or public.meeting_visible_to_auth(artifacts.meeting_id)
          )
      )
    )
  );

drop policy if exists "meeting_evidence_bucket_write_visible" on storage.objects;
create policy "meeting_evidence_bucket_write_visible" on storage.objects
  for insert with check (
    bucket_id = 'meeting-evidence'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.meeting_artifacts artifacts
        where artifacts.storage_bucket = storage.objects.bucket_id
          and artifacts.storage_path = storage.objects.name
          and (
            public.auth_user_matches(artifacts.uploaded_by_user_id)
            or public.meeting_visible_to_auth(artifacts.meeting_id)
          )
      )
    )
  );

drop policy if exists "meeting_evidence_bucket_update_visible" on storage.objects;
create policy "meeting_evidence_bucket_update_visible" on storage.objects
  for update using (
    bucket_id = 'meeting-evidence'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.meeting_artifacts artifacts
        where artifacts.storage_bucket = storage.objects.bucket_id
          and artifacts.storage_path = storage.objects.name
          and (
            public.auth_user_matches(artifacts.uploaded_by_user_id)
            or public.meeting_visible_to_auth(artifacts.meeting_id)
          )
      )
    )
  );

drop policy if exists "meeting_evidence_bucket_delete_visible" on storage.objects;
create policy "meeting_evidence_bucket_delete_visible" on storage.objects
  for delete using (
    bucket_id = 'meeting-evidence'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.meeting_artifacts artifacts
        where artifacts.storage_bucket = storage.objects.bucket_id
          and artifacts.storage_path = storage.objects.name
          and (
            public.auth_user_matches(artifacts.uploaded_by_user_id)
            or public.meeting_visible_to_auth(artifacts.meeting_id)
          )
      )
    )
  );

drop policy if exists "illuminotary_assets_bucket_select_visible" on storage.objects;
create policy "illuminotary_assets_bucket_select_visible" on storage.objects
  for select using (
    bucket_id = 'illuminotary-assets'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.illuminotary_assets assets
        where assets.storage_bucket = storage.objects.bucket_id
          and assets.storage_path = storage.objects.name
          and public.auth_user_matches(assets.user_id)
      )
    )
  );

drop policy if exists "illuminotary_assets_bucket_write_visible" on storage.objects;
create policy "illuminotary_assets_bucket_write_visible" on storage.objects
  for insert with check (
    bucket_id = 'illuminotary-assets'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.illuminotary_assets assets
        where assets.storage_bucket = storage.objects.bucket_id
          and assets.storage_path = storage.objects.name
          and public.auth_user_matches(assets.user_id)
      )
    )
  );

drop policy if exists "illuminotary_assets_bucket_update_visible" on storage.objects;
create policy "illuminotary_assets_bucket_update_visible" on storage.objects
  for update using (
    bucket_id = 'illuminotary-assets'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.illuminotary_assets assets
        where assets.storage_bucket = storage.objects.bucket_id
          and assets.storage_path = storage.objects.name
          and public.auth_user_matches(assets.user_id)
      )
    )
  );

drop policy if exists "illuminotary_assets_bucket_delete_visible" on storage.objects;
create policy "illuminotary_assets_bucket_delete_visible" on storage.objects
  for delete using (
    bucket_id = 'illuminotary-assets'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.illuminotary_assets assets
        where assets.storage_bucket = storage.objects.bucket_id
          and assets.storage_path = storage.objects.name
          and public.auth_user_matches(assets.user_id)
      )
    )
  );
