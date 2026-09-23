-- These tables are consumed only by authorized backend services. They must not
-- inherit Supabase's default public REST grants. No row or PDF bytes change.
alter table public.template_artifacts enable row level security;
alter table public.notary_profile_applications enable row level security;
alter table public.notary_identity_document_types enable row level security;
alter table public.notary_identity_document_fields enable row level security;

revoke all on table public.template_artifacts, public.notary_profile_applications,
  public.notary_identity_document_types, public.notary_identity_document_fields
  from public, anon, authenticated;

grant select, insert, update, delete on table public.template_artifacts,
  public.notary_profile_applications, public.notary_identity_document_types,
  public.notary_identity_document_fields to service_role;
