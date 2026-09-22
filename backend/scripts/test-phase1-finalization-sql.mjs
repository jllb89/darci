// Run only against a newly migrated disposable local Supabase instance.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
assert(process.argv.includes('--confirm-isolated'), 'Explicit disposable-database confirmation required');
const url = new URL(process.env.PHASE1_TEST_DATABASE_URL ?? '');
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '54322' && url.pathname === '/postgres', 'Only the local Supabase rehearsal is allowed');
const pool = new Pool({ connectionString: url.toString(), max: 12 });
const sql = (query, args = []) => pool.query(query, args);
const ids = { owner: randomUUID(), notary: randomUUID(), stranger: randomUUID(), doc: randomUUID(), request: randomUUID() };
const commit = (source, actor = ids.notary) => sql('select public.commit_hash_only_output($1,$2,$3,$4,$5,$6,$7,$8,$9) as result', [
  ids.doc, source, actor, `${ids.owner}/${ids.doc}/finalization/watermark/${randomUUID()}.pdf`, 'fixture.pdf', 100,
  (source.endsWith('0') ? 'b' : 'a').repeat(64), 'TEST ONLY', { source: 'phase1-isolated-sql-test' },
]);
const complete = (versions, actor = ids.notary) => sql('select public.complete_hash_only_package($1,$2,$3)', [ids.doc, actor, versions]);
try {
  assert.equal((await sql("select count(*)::int n from supabase_migrations.schema_migrations where version='20260917125000'")).rows[0].n, 1, 'Finalization migration must be installed');
  assert.equal((await sql('select count(*)::int n from public.documents')).rows[0].n, 0, 'Use a fresh disposable database; existing documents must not be touched');
  for (const role of ['anon', 'authenticated']) {
    for (const signature of ['public.commit_hash_only_output(uuid,uuid,uuid,text,text,bigint,text,text,jsonb)', 'public.complete_hash_only_package(uuid,uuid,uuid[])']) {
      assert.equal((await sql('select has_function_privilege($1,$2,\'EXECUTE\') ok', [role, signature])).rows[0].ok, false);
    }
  }
  for (const [name, id] of Object.entries(ids).filter(([k]) => ['owner', 'notary', 'stranger'].includes(k))) {
    await sql('insert into public.users(id,supabase_user_id,email,status) values($1,$1,$2,\'active\')', [id, `phase1-${name}-${id}@example.invalid`]);
  }
  await sql("insert into public.documents(id,owner_id,idn,status,jurisdiction,document_type) values($1,$2,'SQLPHASE1ABC','pending_notary','US-CA','document')", [ids.doc, ids.owner]);
  await sql("insert into public.notarization_requests(id,document_id,assigned_notary_id,status) values($1,$2,$3,'in_review')", [ids.request, ids.doc, ids.notary]);
  await sql("insert into public.meetings(request_id,status) values($1,'completed')", [ids.request]);
  const sources = [];
  for (let i = 0; i < 2; i++) {
    const v = (await sql("insert into public.document_versions(document_id,version,storage_path,file_name,mime_type,size_bytes) values($1,$2,$3,'ack.pdf','application/pdf',100) returning id", [ids.doc, i + 1, `${ids.owner}/${ids.doc}/ack-${i}.pdf`])).rows[0].id;
    await sql("insert into public.document_execution_runs(document_id,source_document_version_id,output_document_version_id,execution_kind,status,metadata) values($1,$2,$2,'acknowledgment_append','completed',$3)", [ids.doc, v, { acknowledgmentBatchSize: 2 }]);
    sources.push(v);
  }
  await assert.rejects(commit(sources[0], ids.stranger), /FINALIZATION_ACTOR_OR_SESSION_INVALID/);
  const first = await Promise.all(Array.from({ length: 12 }, () => commit(sources[0])));
  const v1 = first[0].rows[0].result.version.id;
  assert(first.every(r => r.rows[0].result.version.id === v1), 'Concurrent retries must return the same output');
  assert.equal((await sql("select count(*)::int n from public.document_execution_runs where document_id=$1 and execution_kind='watermark'", [ids.doc])).rows[0].n, 1);
  await assert.rejects(complete([v1]), /FINALIZATION_PACKAGE_INCOMPLETE/);
  assert.equal((await sql('select count(*)::int n from public.document_versions where document_id=$1 and is_final', [ids.doc])).rows[0].n, 0);
  await sql(`create function public.phase1_reject_hash_audit() returns trigger language plpgsql as $$
    begin if new.entity_type='document_hash_records' then raise exception 'PHASE1_INJECTED_AUDIT_OUTAGE'; end if; return new; end $$;
    create trigger phase1_reject_hash_audit before insert on public.audit_events for each row execute function public.phase1_reject_hash_audit();`);
  await assert.rejects(commit(sources[1]), /PHASE1_INJECTED_AUDIT_OUTAGE/);
  assert.equal((await sql('select count(*)::int n from public.document_versions where document_id=$1', [ids.doc])).rows[0].n, 3, 'Audit failure must roll back the entire output');
  await sql('drop trigger phase1_reject_hash_audit on public.audit_events; drop function public.phase1_reject_hash_audit()');
  const second = (await commit(sources[1])).rows[0].result;
  const v2 = second.version.id;
  await assert.rejects(complete([v1, v1]), /FINALIZATION_PACKAGE_EVIDENCE_INVALID/);
  await assert.rejects(complete([v1, v2], ids.stranger), /FINALIZATION_ACTOR_OR_SESSION_INVALID/);
  await assert.rejects(sql('update public.document_hash_records set hash=$1 where id=$2', ['f'.repeat(64), second.hashRecord.id]), /IMMUTABLE/);
  await sql("insert into public.document_release_controls(document_id,document_version_id,document_hash_record_id,release_status,released_at) values($1,$2,$3,'released',now())", [ids.doc, v1, first[0].rows[0].result.hashRecord.id]);
  await Promise.all(Array.from({ length: 12 }, () => complete([v1, v2])));
  assert.equal((await sql('select status from public.documents where id=$1', [ids.doc])).rows[0].status, 'completed');
  assert.equal((await sql('select status from public.notarization_requests where id=$1', [ids.request])).rows[0].status, 'completed');
  assert.equal((await sql('select count(*)::int n from public.document_versions where document_id=$1 and is_final', [ids.doc])).rows[0].n, 2);
  assert.equal((await sql('select release_status from public.document_release_controls where document_id=$1', [ids.doc])).rows[0].release_status, 'pending', 'Stale release permission must be reset before publishing new final versions');
  assert.equal((await sql("select count(*)::int n from public.audit_events where entity_id=$1 and action='finalization.package_completed'", [ids.doc])).rows[0].n, 1);
  console.log('PASS: actual migrated SQL; wrong actor and unprivileged RPC denial; 12 concurrent output retries; partial-package rejection; audit-outage rollback; immutable hash; duplicate-version rejection; 12 concurrent completion retries; release pending until billing evaluation.');
  console.log('Scope: database state and grants only. Native PDF bytes and signed-storage authorization require separate tests. Disposable fixture data retained.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await pool.end(); }
