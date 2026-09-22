import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
assert(process.argv.includes('--confirm-isolated'));
const url = new URL(process.env.PHASE1_TEST_DATABASE_URL ?? '');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
const pool = new Pool({ connectionString: url.toString(), max: 10 });
const sql = (q, args = []) => pool.query(q, args);
const ids = Object.fromEntries(['owner', 'doc', 'version', 'execution', 'hash', 'entry', 'attempt', 'object'].map(k => [k, randomUUID()]));
const hash = 'a'.repeat(64); const objectVersion = randomUUID();
const record = (overrides = {}) => {
  const p = { hash, object: ids.object, objectVersion, bytes: 100, pages: 2, operator: 'isolated-test', ...overrides };
  return sql('select public.record_legacy_hash_reverification($1,$2,$3,$4,$5,$6,$7) id', [ids.hash, p.hash, p.object, p.objectVersion, p.bytes, p.pages, p.operator]);
};
try {
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal((await sql("select has_function_privilege($1,'public.record_legacy_hash_reverification(uuid,text,uuid,text,bigint,integer,text)','EXECUTE') ok", [role])).rows[0].ok, false);
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) {
      assert.equal((await sql('select has_table_privilege($1,$2,$3) ok', [role, 'public.document_hash_reverifications', privilege])).rows[0].ok, false);
    }
  }
  await sql("insert into public.users(id,supabase_user_id,email,status) values($1,$1,$2,'active')", [ids.owner, `recheck-${ids.owner}@example.invalid`]);
  await sql("insert into public.documents(id,owner_id,idn,status,jurisdiction,document_type) values($1,$2,$3,'completed','US-CA','document')", [ids.doc, ids.owner, ids.doc.replaceAll('-', '').slice(0, 12).toUpperCase()]);
  const objectPath = `${ids.owner}/${ids.doc}/unchanged-final.pdf`;
  await sql("insert into public.document_versions(id,document_id,version,storage_path,file_name,mime_type,size_bytes,is_final) values($1,$2,1,$3,'unchanged.pdf','application/pdf',100,true)", [ids.version, ids.doc, objectPath]);
  await sql("insert into public.document_execution_runs(id,document_id,source_document_version_id,output_document_version_id,execution_kind,status) values($1,$2,$3,$3,'watermark','completed')", [ids.execution, ids.doc, ids.version]);
  await sql("insert into public.document_hash_records(id,document_id,document_version_id,execution_run_id,algorithm,hash,status) values($1,$2,$3,$4,'sha256',$5,'completed')", [ids.hash, ids.doc, ids.version, ids.execution, hash]);
  await sql("insert into public.ledger_entries(id,document_id,idn,hash,ledger_tx_id,anchored_at) values($1,$2,'SIMULATED',$3,'ledger_SIMULATED',now())", [ids.entry, ids.doc, hash]);
  await sql("insert into public.ledger_anchor_attempts(id,document_id,document_hash_record_id,ledger_entry_id,status,response_payload) values($1,$2,$3,$4,'anchored','{\"provider\":\"stub\"}')", [ids.attempt, ids.doc, ids.hash, ids.entry]);
  await sql("insert into storage.buckets(id,name,public) values('documents','documents',false) on conflict do nothing");
  await sql("insert into storage.objects(id,bucket_id,name,version,metadata) values($1,'documents',$2,$3,'{\"size\":100}')", [ids.object, objectPath, objectVersion]);
  const original = (await sql(`select to_jsonb(v) version,to_jsonb(h) hash,to_jsonb(l) ledger,to_jsonb(a) attempt
    from public.document_versions v,public.document_hash_records h,public.ledger_entries l,public.ledger_anchor_attempts a
    where v.id=$1 and h.id=$2 and l.id=$3 and a.id=$4`, [ids.version, ids.hash, ids.entry, ids.attempt])).rows[0];
  await assert.rejects(record({ hash: 'b'.repeat(64) }), /REVERIFICATION_HASH_MISMATCH/);
  await assert.rejects(record({ objectVersion: randomUUID() }), /REVERIFICATION_OBJECT_CHANGED/);
  await assert.rejects(record({ bytes: 101 }), /REVERIFICATION_OBJECT_CHANGED/);
  await assert.rejects(record({ pages: 0 }), /check constraint/);
  await sql(`create function public.phase1_reject_recheck_audit() returns trigger language plpgsql as $$
    begin if new.action='verification.legacy_hash_rechecked' then raise exception 'RECHECK_AUDIT_OUTAGE'; end if; return new; end $$;
    create trigger phase1_reject_recheck_audit before insert on public.audit_events for each row execute function public.phase1_reject_recheck_audit()`);
  await assert.rejects(record(), /RECHECK_AUDIT_OUTAGE/);
  assert.equal((await sql('select count(*)::int n from public.document_hash_reverifications where document_hash_record_id=$1', [ids.hash])).rows[0].n, 0);
  await sql('drop trigger phase1_reject_recheck_audit on public.audit_events; drop function public.phase1_reject_recheck_audit()');
  const results = await Promise.all(Array.from({ length: 10 }, () => record()));
  assert(results.every(r => r.rows[0].id === results[0].rows[0].id));
  assert.equal((await sql("select count(*)::int n from public.audit_events where entity_id=$1 and action='verification.legacy_hash_rechecked'", [ids.doc])).rows[0].n, 1);
  await assert.rejects(record({ pages: 3 }), /REVERIFICATION_EXISTING_EVIDENCE_CONFLICT/);
  await assert.rejects(sql('update public.document_hash_reverifications set rendered_page_count=3 where document_hash_record_id=$1', [ids.hash]), /HASH_REVERIFICATION_IMMUTABLE/);
  await assert.rejects(sql('delete from public.document_hash_reverifications where document_hash_record_id=$1', [ids.hash]), /HASH_REVERIFICATION_IMMUTABLE/);
  const after = (await sql(`select to_jsonb(v) version,to_jsonb(h) hash,to_jsonb(l) ledger,to_jsonb(a) attempt
    from public.document_versions v,public.document_hash_records h,public.ledger_entries l,public.ledger_anchor_attempts a
    where v.id=$1 and h.id=$2 and l.id=$3 and a.id=$4`, [ids.version, ids.hash, ids.entry, ids.attempt])).rows[0];
  assert.deepEqual(after, original);
  console.log('PASS: operator-only RPC/table writes; wrong hash/object/size/page rejection; audit-outage rollback; ten concurrent retries yield one immutable attestation and audit; original version/hash/receipt/attempt unchanged.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await pool.end(); }
