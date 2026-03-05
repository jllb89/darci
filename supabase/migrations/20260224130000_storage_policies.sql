
-- Documents bucket
 drop policy if exists "documents_bucket_read" on storage.objects;
 drop policy if exists "documents_bucket_write" on storage.objects;
 drop policy if exists "documents_bucket_update" on storage.objects;
 drop policy if exists "documents_bucket_delete" on storage.objects;

create policy "documents_bucket_read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
    )
  );

create policy "documents_bucket_write" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
    )
  );

create policy "documents_bucket_update" on storage.objects
  for update using (
    bucket_id = 'documents'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
    )
  );

create policy "documents_bucket_delete" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
    )
  );

-- Signatures bucket
 drop policy if exists "signatures_bucket_read" on storage.objects;
 drop policy if exists "signatures_bucket_write" on storage.objects;
 drop policy if exists "signatures_bucket_update" on storage.objects;

create policy "signatures_bucket_read" on storage.objects
  for select using (
    bucket_id = 'signatures'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
      or exists (
        select 1
        from public.notarization_requests r
        join public.users u on u.id = r.assigned_notary_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = r.document_id::text
      )
    )
  );

create policy "signatures_bucket_write" on storage.objects
  for insert with check (
    bucket_id = 'signatures'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
      or exists (
        select 1
        from public.notarization_requests r
        join public.users u on u.id = r.assigned_notary_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = r.document_id::text
      )
    )
  );

create policy "signatures_bucket_update" on storage.objects
  for update using (
    bucket_id = 'signatures'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
      or exists (
        select 1
        from public.notarization_requests r
        join public.users u on u.id = r.assigned_notary_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = r.document_id::text
      )
    )
  );

-- Notarized copies bucket
 drop policy if exists "notarized_bucket_read" on storage.objects;
 drop policy if exists "notarized_bucket_write" on storage.objects;
 drop policy if exists "notarized_bucket_update" on storage.objects;

create policy "notarized_bucket_read" on storage.objects
  for select using (
    bucket_id = 'notarized-copies'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.documents d
        join public.users u on u.id = d.owner_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = d.id::text
      )
      or exists (
        select 1
        from public.notarization_requests r
        join public.users u on u.id = r.assigned_notary_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = r.document_id::text
      )
    )
  );

create policy "notarized_bucket_write" on storage.objects
  for insert with check (
    bucket_id = 'notarized-copies'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.notarization_requests r
        join public.users u on u.id = r.assigned_notary_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = r.document_id::text
      )
    )
  );

create policy "notarized_bucket_update" on storage.objects
  for update using (
    bucket_id = 'notarized-copies'
    and (
      auth.role() = 'service_role'
      or exists (
        select 1
        from public.notarization_requests r
        join public.users u on u.id = r.assigned_notary_id
        where u.supabase_user_id = auth.uid()
          and split_part(storage.objects.name, '/', 1) = r.document_id::text
      )
    )
  );
