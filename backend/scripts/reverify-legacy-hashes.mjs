// Operator-only, staging-only, verification-only. No Storage writes or receipt edits.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Client } = require('pg');
process.umask(0o077);
const flags = Object.fromEntries(process.argv.slice(2).map(v => {
  const i = v.indexOf('='); return i < 0 ? [v.slice(2), true] : [v.slice(2, i), v.slice(i + 1)];
}));
const apply = flags.apply === true;
const execute = promisify(execFile);
async function command(tool, args) {
  try {
    const result = await execute(tool, args, { timeout: 30_000, maxBuffer: 2 * 1024 ** 2,
      env: { ...process.env, AWS_PAGER: '', LC_ALL: 'C' } });
    if (tool === 'pdftoppm' && /(?:Syntax Error|Command Line Error|^Error:)/m.test(result.stderr)) throw new Error('render');
    return result.stdout;
  } catch { throw new Error(`${tool === 'aws' ? 'AWS_REQUEST' : 'PDF_CHECK'}_FAILED`); }
}
const aws = async args => JSON.parse(await command('aws', [...args, '--region', 'us-east-1', '--output', 'json']));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let db;
try {
  assert.equal(flags['approval-reference'], 'approved_beta_hash_only_correction', 'Explicit approval reference required even for dry-run');
  assert(typeof flags['ca-file'] === 'string', 'Verified database CA required');
  const identity = await aws(['sts', 'get-caller-identity']);
  assert.equal(identity.Account, '427057633951', 'Wrong approved AWS account');
  const secret = await aws(['secretsmanager', 'get-secret-value', '--secret-id', '/darci/staging/app']);
  const config = JSON.parse(secret.SecretString);
  assert.equal(new URL(config.SUPABASE_URL).hostname, 'oqferisuloumoojgbjde.supabase.co');
  assert.equal(config.SUPABASE_STORAGE_BUCKET_DOCUMENTS ?? 'documents', 'documents');
  const pooler = new URL((await readFile(new URL('../../supabase/.temp/pooler-url', import.meta.url), 'utf8')).trim());
  assert(/^aws-\d+-us-east-1\.pooler\.supabase\.com$/.test(pooler.hostname));
  assert.equal(decodeURIComponent(pooler.username), 'postgres.oqferisuloumoojgbjde');
  const url = new URL(config.DATABASE_URL); url.hostname = pooler.hostname; url.username = pooler.username; url.port = '5432';
  url.searchParams.delete('sslmode');
  db = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 15000,
    ssl: { rejectUnauthorized: true, ca: await readFile(flags['ca-file'], 'utf8') } });
  await db.connect();
  await db.query("set statement_timeout='30s'");
  if (flags['install-evidence-schema'] === true) {
    assert(apply, 'Schema installation requires the approved apply mode');
    await db.query('begin');
    try {
      await db.query("select pg_advisory_xact_lock(hashtext('darci_legacy_hash_reverification_migration'))");
      const installed = (await db.query("select 1 from supabase_migrations.schema_migrations where version='20260917140000'")).rowCount > 0;
      if (!installed) {
        const migration = await readFile(new URL('../../supabase/migrations/20260917140000_legacy_hash_reverification.sql', import.meta.url), 'utf8');
        await db.query(migration);
        await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260917140000','legacy_hash_reverification',$1)", [[migration]]);
      }
      await db.query('commit');
    } catch (error) { await db.query('rollback'); throw error; }
  }
  if (apply) assert((await db.query("select to_regprocedure('public.record_legacy_hash_reverification(uuid,text,uuid,text,bigint,integer,text)') is not null ready")).rows[0].ready, 'Audited evidence migration must be installed first');
  // Invalid/missing object metadata is deliberately included and reported, not skipped.
  const candidates = (await db.query(`select distinct h.id hash_id,h.hash,h.algorithm,h.execution_run_id,
    v.id version_id,v.document_id,v.storage_path,v.size_bytes,o.id object_id,o.version object_version,o.metadata,
    exists(select 1 from public.document_execution_runs e where e.id=h.execution_run_id and e.document_id=v.document_id
      and e.output_document_version_id=v.id and e.execution_kind='watermark' and e.status='completed') execution_valid
    from public.document_hash_records h join public.document_versions v on v.id=h.document_version_id and v.document_id=h.document_id
    join public.documents d on d.id=v.document_id
    left join storage.objects o on o.bucket_id='documents' and o.name=v.storage_path
    where d.status='completed' and v.is_final and h.status='completed'
      and exists(select 1 from public.ledger_anchor_attempts a join public.ledger_entries l on l.id=a.ledger_entry_id
        where a.document_hash_record_id=h.id and a.document_id=d.id and a.status='anchored' and l.document_id=d.id and l.hash=h.hash)
    order by h.id`)).rows;
  const folder = await mkdtemp(path.join(tmpdir(), 'darci-legacy-recheck-'));
  const report = { mode: apply ? 'apply' : 'dry-run', candidateCount: candidates.length, verified: [], review: [], pdfsModified: 0, historicalReceiptsModified: 0 };
  for (const [index, candidate] of candidates.entries()) {
    try {
      assert(candidate.algorithm === 'sha256' && /^[a-f0-9]{64}$/.test(candidate.hash) && candidate.execution_valid, 'LEGACY_EVIDENCE_INVALID');
      const size = Number(candidate.size_bytes);
      assert(candidate.object_id && candidate.object_version && Number.isSafeInteger(size) && size > 0 && size <= 50 * 1024 ** 2
        && size === Number(candidate.metadata?.size), 'OBJECT_METADATA_REQUIRES_REVIEW');
      const response = await fetch(`${config.SUPABASE_URL}/storage/v1/object/authenticated/documents/${candidate.storage_path.split('/').map(encodeURIComponent).join('/')}`, {
        headers: { Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`, apikey: config.SUPABASE_SERVICE_ROLE_KEY }, signal: AbortSignal.timeout(30000), redirect: 'error',
      });
      assert(response.ok && response.body, 'OBJECT_DOWNLOAD_FAILED');
      const chunks = []; let length = 0;
      for await (const chunk of response.body) { length += chunk.length; assert(length <= size, 'OBJECT_SIZE_CHANGED'); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.length, size, 'OBJECT_SIZE_CHANGED'); assert.equal(digest(bytes), candidate.hash, 'PDF_HASH_MISMATCH');
      const file = path.join(folder, `candidate-${index}.pdf`);
      await writeFile(file, bytes, { flag: 'wx' });
      const info = await command('pdfinfo', [file]);
      const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
      assert(Number.isInteger(pages) && pages > 0 && pages <= 200, 'PDF_PAGE_COUNT_REQUIRES_REVIEW');
      await command('qpdf', ['--check', '--warning-exit-0', file]);
      const renders = await mkdtemp(path.join(folder, `render-${index}-`));
      await command('pdftoppm', ['-scale-to', '64', '-png', file, path.join(renders, 'page')]);
      assert.equal((await readdir(renders)).filter(n => /^page-\d+\.png$/.test(n)).length, pages, 'PDF_RENDER_INCOMPLETE');
      assert.equal(digest(await readFile(file)), candidate.hash, 'PDF_CHANGED_DURING_CHECK');
      const current = (await db.query('select version,metadata from storage.objects where id=$1 and name=$2', [candidate.object_id, candidate.storage_path])).rows[0];
      assert(current && current.version === candidate.object_version && JSON.stringify(current.metadata) === JSON.stringify(candidate.metadata), 'SOURCE_OBJECT_CHANGED');
      let evidenceId = null;
      if (apply) evidenceId = (await db.query('select public.record_legacy_hash_reverification($1,$2,$3,$4,$5,$6,$7) id', [
        candidate.hash_id, candidate.hash, candidate.object_id, candidate.object_version, size, pages, identity.Arn,
      ])).rows[0].id;
      report.verified.push({ documentId: candidate.document_id, versionId: candidate.version_id, hashRecordId: candidate.hash_id, pages, evidenceId });
    } catch (error) {
      // Never print raw SQL/tool/provider diagnostics or object paths.
      const safe = ['LEGACY_EVIDENCE_INVALID', 'OBJECT_METADATA_REQUIRES_REVIEW', 'OBJECT_DOWNLOAD_FAILED', 'OBJECT_SIZE_CHANGED',
        'PDF_HASH_MISMATCH', 'PDF_PAGE_COUNT_REQUIRES_REVIEW', 'PDF_CHECK_FAILED', 'PDF_RENDER_INCOMPLETE', 'PDF_CHANGED_DURING_CHECK', 'SOURCE_OBJECT_CHANGED'];
      report.review.push({ documentId: candidate.document_id, versionId: candidate.version_id, hashRecordId: candidate.hash_id,
        reason: safe.find(code => error.message?.includes(code)) ?? 'REVERIFICATION_REQUIRES_REVIEW' });
    }
    if ((index + 1) % 10 === 0) console.log(JSON.stringify({ mode: report.mode, checked: index + 1, total: candidates.length, verified: report.verified.length, review: report.review.length }));
  }
  await writeFile(path.join(folder, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode: report.mode, candidates: candidates.length, verified: report.verified.length, review: report.review.length,
    pdfsModified: 0, historicalReceiptsModified: 0, artifactDirectory: folder }));
  if (report.review.length) process.exitCode = 2;
} catch { console.error('Legacy verification stopped safely; no source PDF or receipt was changed. Check operator configuration and migration readiness.'); process.exitCode = 1; }
finally { if (db) await db.end(); }
