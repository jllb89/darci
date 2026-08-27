-- Recompile the Phase 2/3 snapshot function with an explicit PL/pgSQL
-- name-resolution policy. Its table-shaped return names intentionally mirror
-- internal column names, so column references inside SQL statements must win
-- over output-parameter variables.

do $migration$
declare
  v_signature regprocedure := 'public.apply_stripe_member_subscription_snapshot(uuid,uuid,text,text,text,text,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone,uuid,text,text,integer,text,text)'::regprocedure;
  v_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position('#variable_conflict use_column' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      'AS $function$',
      'AS $function$' || E'\n#variable_conflict use_column'
    );
    execute v_definition;
  end if;
end
$migration$;
