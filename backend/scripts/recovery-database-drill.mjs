// Offline, disposable reconstruction. Never connects to a hosted database.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const execute = promisify(execFile);
const folder = process.argv[2];
const rehearseUpgrade = process.argv.includes('--rehearse-phase1-upgrade');
assert(process.argv.includes('--confirm-isolated') && path.isAbsolute(folder ?? ''), 'Private restored-artifact folder and isolation confirmation required');
process.umask(0o077);
const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
assert.equal(manifest.format, 1); assert.equal(manifest.complete, true);
const expectedProject = process.argv.includes('--production-source') ? 'jdrgluisxhgegdsesman' : 'oqferisuloumoojgbjde';
assert.equal(manifest.sourceProject, expectedProject);
const dump = path.join(folder, 'database.dump');
assert.equal((await stat(dump)).size, manifest.database.bytes);
const digest = createHash('sha256'); for await (const chunk of createReadStream(dump)) digest.update(chunk);
assert.equal(digest.digest('hex'), manifest.database.sha256);
const name = `darci-recovery-drill-${randomUUID().slice(0, 8)}`;
const started = Date.now();
let stage = 'start offline database';
const docker = async args => (await execute('docker', args, { timeout: 120000, maxBuffer: 16 * 1024 ** 2 })).stdout;
const sql = async text => docker(['exec', name, 'psql', '-h', '/tmp', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text]);
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const sqlInput = async input => new Promise((resolve, reject) => {
  const child = spawn('docker', ['exec', '-i', name, 'psql', '-h', '/tmp', '-U', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '--single-transaction'], { stdio: ['pipe', 'ignore', 'ignore'] });
  const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
  child.stdin.on('error', () => {});
  child.on('error', reject);
  child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('ISOLATED_UPGRADE_FAILED')); });
  child.stdin.end(input);
});
async function evidenceFingerprints() {
  const tables = ['documents', 'document_versions', 'signatures', 'acknowledgment_pages',
    'document_execution_runs', 'document_hash_records', 'ledger_anchor_attempts', 'ledger_entries',
    'document_release_controls', 'document_hash_reverifications', 'audit_events',
    'identity_verification_events', 'meeting_checkins', 'billing_entitlements',
    'billing_subscriptions', 'document_access_invites'];
  const fingerprints = {};
  for (const table of tables) {
    fingerprints[table] = JSON.parse(await sql(`select json_build_object('rows',count(*),
      'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by id),''),'UTF8')),'hex'))
      from public.${table} t`));
  }
  return fingerprints;
}
try {
  await docker(['run', '--detach', '--name', name, '--network', 'none', '--user', 'postgres',
    '--memory', '1536m', '--cpus', '2', '--pids-limit', '128', '--tmpfs', '/tmp:rw,nosuid,size=1073741824',
    '--entrypoint', '/bin/sh', 'public.ecr.aws/supabase/postgres:17.6.1.075', '-c',
    'initdb -D /tmp/recovery-db --auth-local=trust --auth-host=reject > /tmp/init.log 2>&1 && exec postgres -D /tmp/recovery-db -k /tmp -c listen_addresses= -c shared_preload_libraries=']);
  assert.equal((await docker(['inspect', name, '--format', '{{.HostConfig.NetworkMode}}'])).trim(), 'none');
  for (let i = 0; ; i++) {
    try { await sql('select 1'); break; }
    catch { assert(i < 30, 'OFFLINE_DATABASE_START_TIMEOUT'); await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  const roles = ['anon', 'authenticated', 'authenticator', 'dashboard_user', 'service_role', 'supabase_admin',
    'supabase_auth_admin', 'supabase_etl_admin', 'supabase_functions_admin', 'supabase_read_only_user', 'supabase_realtime_admin',
    'supabase_replication_admin', 'supabase_storage_admin', 'supabase_superuser', 'pgbouncer'];
  await sql(roles.map(role => `create role "${role}" nologin`).join(';'));
  stage = 'restore exact database archive';
  await new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', name, 'pg_restore', '-h', '/tmp', '-U', 'postgres', '-d', 'postgres',
      '--no-owner', '--exit-on-error', '--single-transaction'], { stdio: ['pipe', 'ignore', 'ignore'] });
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    const source = createReadStream(dump); source.pipe(child.stdin);
    source.on('error', reject); child.stdin.on('error', () => {});
    child.on('error', reject); child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('DATABASE_RESTORE_FAILED')); });
  });
  stage = 'verify restored relationships';
  const objects = JSON.parse(await sql("select coalesce(json_agg(json_build_object('id',id,'bucket',bucket_id,'name',name,'version',version)),'[]') from storage.objects"));
  assert.equal(objects.length, manifest.objects.length);
  const objectMap = new Map(manifest.objects.map(o => [o.id, o]));
  for (const object of objects) {
    const saved = objectMap.get(object.id);
    assert(saved && saved.name === object.name && saved.bucket_id === object.bucket && saved.version === object.version, 'STORAGE_SNAPSHOT_RELATIONSHIP_MISMATCH');
  }
  const hashes = JSON.parse(await sql(`select coalesce(json_agg(json_build_object('id',h.id,'hash',h.hash,'path',v.storage_path,'final',v.is_final)),'[]')
    from public.document_hash_records h join public.document_versions v on v.id=h.document_version_id and v.document_id=h.document_id where h.status='completed'`));
  const byPath = new Map(manifest.objects.filter(o => o.bucket_id === 'documents').map(o => [o.name, o]));
  const hashReview = [];
  for (const record of hashes) if (byPath.get(record.path)?.backup.sha256 !== record.hash) hashReview.push({ hashRecordId: record.id, final: record.final });
  const counts = JSON.parse(await sql(`select json_build_object('documents',(select count(*) from public.documents),
    'versions',(select count(*) from public.document_versions),'hashRecords',(select count(*) from public.document_hash_records),
    'authUsers',(select count(*) from auth.users),'storageObjects',(select count(*) from storage.objects),
    'auditEvents',(select count(*) from public.audit_events),
    'unmatchedAppAuthIdentities',(select count(*) from public.users u where u.supabase_user_id is not null and not exists(select 1 from auth.users a where a.id=u.supabase_user_id)))`));
  let upgrade;
  if (rehearseUpgrade) {
    stage = 'fingerprint recovered evidence before isolated upgrade';
    const before = await evidenceFingerprints();
    const migrationRoot = new URL('../../supabase/migrations/', import.meta.url);
    const candidates = (await readdir(migrationRoot)).filter(f => /^20260917\d{6}_[a-z0-9_]+\.sql$/.test(f)).sort();
    assert.equal(candidates.length, 9, 'Review the candidate migration set before changing this rehearsal');
    const installed = new Set(JSON.parse(await sql("select coalesce(json_agg(version),'[]') from supabase_migrations.schema_migrations")));
    const applied = [];
    for (const file of candidates) {
      const version = file.slice(0, 14);
      if (installed.has(version)) continue;
      stage = `rehearse candidate migration ${version}`;
      const source = await readFile(new URL(file, migrationRoot), 'utf8');
      await sqlInput(source);
      await sql(`insert into supabase_migrations.schema_migrations(version,name,statements)
        values(${literal(version)},${literal(file.slice(15, -4))},array[${literal(source)}])`);
      applied.push({ version, sha256: createHash('sha256').update(source).digest('hex') });
    }
    stage = 'verify recovered evidence after isolated upgrade';
    assert.deepEqual(await evidenceFingerprints(), before, 'CANDIDATE_UPGRADE_CHANGED_EXISTING_EVIDENCE');
    assert.equal((await sql("select stripe_environment from public.billing_runtime_configuration where singleton")).trim(), 'test');
    assert.equal((await sql("select public.is_auth_session_active('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000')")).trim(), 'f');
    upgrade = { applied, unchangedEvidenceTables: Object.keys(before), existingEvidencePreserved: true,
      externalEffects: 'blocked', sourceDatabaseChanged: false,
      limitations: ['Offline schema/data rehearsal only; does not authorize staging deployment or prove full application compatibility.'] };
  }
  const report = { kind: 'offline-database-restore', databaseRestored: true, snapshotId: manifest.snapshotId,
    network: 'none', externalEffects: 'blocked', exactStorageInventory: true, counts, checkedHashRecords: hashes.length,
    hashMatches: hashes.length - hashReview.length, hashReview, upgrade, elapsedSeconds: (Date.now() - started) / 1000,
    limitations: ['NOLOGIN role placeholders; original role passwords/ownership are not reconstructed.',
      'Does not prove full Supabase Auth/Storage/API/worker recovery, private/held access, or decryption-key recovery.',
      'PDF readability is reported separately by the object restore check; pre-existing defects must not be hidden.'] };
  await writeFile(path.join(folder, rehearseUpgrade ? 'database-upgrade-report.json' : 'database-restore-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch { console.error(JSON.stringify({ stage, status: 'failed', container: name, sourceModified: false })); process.exitCode = 1; }
finally {
  // Stop, do not remove; no source or recovery object is ever deleted.
  try { await docker(['stop', name]); } catch {}
}
