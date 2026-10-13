-- A shared review credential must not allow direct profile/commission edits.
-- Ordinary accounts retain their existing policies. Service-owned API actions
-- still work; this adds a restrictive fence only for the signed review marker.
drop policy if exists app_review_no_direct_profile_access on public.users;
create policy app_review_no_direct_profile_access on public.users
as restrictive for all to authenticated
using (
  not coalesce(((select auth.jwt())->'app_metadata') ? 'app_review',false)
  and coalesce((select auth.jwt())->>'email','') <> 'apple-review@illuminotary.com'
)
with check (
  not coalesce(((select auth.jwt())->'app_metadata') ? 'app_review',false)
  and coalesce((select auth.jwt())->>'email','') <> 'apple-review@illuminotary.com'
);
drop policy if exists app_review_no_direct_notary_profile_access on public.notary_profiles;
create policy app_review_no_direct_notary_profile_access on public.notary_profiles
as restrictive for all to authenticated
using (
  not coalesce(((select auth.jwt())->'app_metadata') ? 'app_review',false)
  and coalesce((select auth.jwt())->>'email','') <> 'apple-review@illuminotary.com'
)
with check (
  not coalesce(((select auth.jwt())->'app_metadata') ? 'app_review',false)
  and coalesce((select auth.jwt())->>'email','') <> 'apple-review@illuminotary.com'
);
