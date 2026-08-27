-- Phase 4 activation safety: completed packages created before release controls
-- existed are already customer-visible and must remain released when billing
-- enforcement later changes from observe to enforced.

with legacy_final_packages as (
  select
    documents.id as document_id,
    final_version.id as document_version_id,
    final_hash.id as document_hash_record_id
  from public.documents documents
  join lateral (
    select versions.id
    from public.document_versions versions
    where versions.document_id = documents.id
      and versions.is_final = true
    order by versions.version desc, versions.created_at desc
    limit 1
  ) final_version on true
  join lateral (
    select hashes.id
    from public.document_hash_records hashes
    where hashes.document_id = documents.id
      and hashes.document_version_id = final_version.id
      and hashes.status = 'completed'
    order by hashes.completed_at desc nulls last, hashes.created_at desc
    limit 1
  ) final_hash on true
  where documents.status = 'completed'
    and not exists (
      select 1
      from public.document_release_controls controls
      where controls.document_id = documents.id
    )
)
insert into public.document_release_controls (
  document_id,
  document_version_id,
  document_hash_record_id,
  release_status,
  hold_reason,
  held_at,
  released_at,
  changed_by_user_id,
  metadata
)
select
  legacy.document_id,
  legacy.document_version_id,
  legacy.document_hash_record_id,
  'released',
  null,
  null,
  now(),
  null,
  jsonb_build_object(
    'source', 'phase4_legacy_release_backfill',
    'reason', 'completed_before_billing_release_enforcement'
  )
from legacy_final_packages legacy
on conflict (document_id) do nothing;

comment on table public.document_release_controls is
  'Server-owned release decisions for finalized packages. Legacy completed packages were backfilled as released before Phase 4 enforcement activation.';
