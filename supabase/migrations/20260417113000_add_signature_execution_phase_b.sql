alter table public.signatures
  add column if not exists generation_run_id uuid references public.document_generation_runs(id),
  add column if not exists document_output_signer_id uuid references public.document_output_signers(id),
  add column if not exists capture_method text not null default 'upload',
  add column if not exists typed_value text,
  add column if not exists typed_kind text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists status text not null default 'upload_pending',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists captured_at timestamptz;

alter table public.signatures
  drop constraint if exists signatures_capture_method_check,
  add constraint signatures_capture_method_check
  check (capture_method in ('upload', 'type', 'draw'));

alter table public.signatures
  drop constraint if exists signatures_typed_kind_check,
  add constraint signatures_typed_kind_check
  check (typed_kind is null or typed_kind in ('name', 'initials'));

alter table public.signatures
  drop constraint if exists signatures_status_check,
  add constraint signatures_status_check
  check (status in ('upload_pending', 'captured'));

create index if not exists idx_signatures_generation_run
  on public.signatures(generation_run_id);

create index if not exists idx_signatures_output_signer
  on public.signatures(document_output_signer_id);

update public.signatures
set
  status = case
    when storage_path is not null then 'captured'
    else 'upload_pending'
  end,
  mime_type = case
    when storage_path ilike '%.png' then 'image/png'
    when storage_path ilike '%.jpg' or storage_path ilike '%.jpeg' then 'image/jpeg'
    else mime_type
  end,
  capture_method = coalesce(capture_method, 'upload'),
  captured_at = case
    when storage_path is not null then coalesce(captured_at, created_at)
    else captured_at
  end
where status is distinct from case when storage_path is not null then 'captured' else 'upload_pending' end
   or capture_method is null
   or captured_at is null;

comment on column public.signatures.generation_run_id is
  'Generation run whose official output this captured signature is intended for.';

comment on column public.signatures.document_output_signer_id is
  'Signer obligation snapshot this signature capture fulfills.';

comment on column public.signatures.capture_method is
  'Capture mode used for this signature: upload, type, or draw.';