-- Foreign key cascade and delete rules for DARCI v1

-- Documents: prevent deleting owners while documents exist; cascade updates to keys.
alter table public.documents
  drop constraint if exists documents_owner_id_fkey,
  add constraint documents_owner_id_fkey
    foreign key (owner_id) references public.users(id)
    on delete restrict on update cascade;

-- Document versions: delete versions with document; preserve history if creator is removed.
alter table public.document_versions
  drop constraint if exists document_versions_document_id_fkey,
  add constraint document_versions_document_id_fkey
    foreign key (document_id) references public.documents(id)
    on delete cascade on update cascade,
  drop constraint if exists document_versions_created_by_fkey,
  add constraint document_versions_created_by_fkey
    foreign key (created_by) references public.users(id)
    on delete set null on update cascade;

-- Notarization requests: delete with document; release notary assignment if user removed.
alter table public.notarization_requests
  drop constraint if exists notarization_requests_document_id_fkey,
  add constraint notarization_requests_document_id_fkey
    foreign key (document_id) references public.documents(id)
    on delete cascade on update cascade,
  drop constraint if exists notarization_requests_assigned_notary_id_fkey,
  add constraint notarization_requests_assigned_notary_id_fkey
    foreign key (assigned_notary_id) references public.users(id)
    on delete set null on update cascade;

-- Illuminotarization codes: delete codes when request is removed.
alter table public.illuminotarization_codes
  drop constraint if exists illuminotarization_codes_request_id_fkey,
  add constraint illuminotarization_codes_request_id_fkey
    foreign key (request_id) references public.notarization_requests(id)
    on delete cascade on update cascade;

-- Signatures: delete with document; keep records if signer removed.
alter table public.signatures
  drop constraint if exists signatures_document_id_fkey,
  add constraint signatures_document_id_fkey
    foreign key (document_id) references public.documents(id)
    on delete cascade on update cascade,
  drop constraint if exists signatures_signer_id_fkey,
  add constraint signatures_signer_id_fkey
    foreign key (signer_id) references public.users(id)
    on delete set null on update cascade;

-- Signature fields: delete fields when document is removed.
alter table public.signature_fields
  drop constraint if exists signature_fields_document_id_fkey,
  add constraint signature_fields_document_id_fkey
    foreign key (document_id) references public.documents(id)
    on delete cascade on update cascade;

-- Acknowledgment pages: delete acknowledgments when document is removed.
alter table public.acknowledgment_pages
  drop constraint if exists acknowledgment_pages_document_id_fkey,
  add constraint acknowledgment_pages_document_id_fkey
    foreign key (document_id) references public.documents(id)
    on delete cascade on update cascade;

-- Ledger entries: delete ledger linkage if document is removed.
alter table public.ledger_entries
  drop constraint if exists ledger_entries_document_id_fkey,
  add constraint ledger_entries_document_id_fkey
    foreign key (document_id) references public.documents(id)
    on delete cascade on update cascade;

-- Audit events: keep audit trail; null out actor if user removed.
alter table public.audit_events
  drop constraint if exists audit_events_actor_id_fkey,
  add constraint audit_events_actor_id_fkey
    foreign key (actor_id) references public.users(id)
    on delete set null on update cascade;

-- Notary profiles: prevent deletion of notary user while profile exists.
alter table public.notary_profiles
  drop constraint if exists notary_profiles_user_id_fkey,
  add constraint notary_profiles_user_id_fkey
    foreign key (user_id) references public.users(id)
    on delete restrict on update cascade;
