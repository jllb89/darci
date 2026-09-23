begin;
do $$
declare t text; r text;
begin
  foreach t in array array['template_artifacts','notary_profile_applications',
    'notary_identity_document_types','notary_identity_document_fields'] loop
    if not (select relrowsecurity from pg_class where oid=('public.'||t)::regclass) then
      raise exception 'Backend-only table % must have RLS',t;
    end if;
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Unexpected direct % privilege on %',r,t;
      end if;
    end loop;
    if not has_table_privilege('service_role','public.'||t,'SELECT')
      or not has_table_privilege('service_role','public.'||t,'INSERT')
      or not has_table_privilege('service_role','public.'||t,'UPDATE')
      or not has_table_privilege('service_role','public.'||t,'DELETE') then
      raise exception 'Backend service access missing on %',t;
    end if;
  end loop;
end $$;
rollback;
