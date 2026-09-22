// Private artifacts only. Never log credentials, object names or SQL contents.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, readdir, stat, chmod } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { Client } = require('pg');

process.umask(0o077);
const flags = Object.fromEntries(process.argv.slice(3).map(a => {
  const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)];
}));
const region = flags.region ?? 'us-east-1';
const stackName = flags.stack ?? 'darci-recovery';
const maxBytes = Number(flags['max-bytes'] ?? 5 * 1024 ** 3);
assert(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 10 * 1024 ** 3, 'Invalid approved backup size bound');
const sha256 = b => createHash('sha256').update(b).digest('hex');
let stage = 'configuration';
let stack;
let taskAwsEnv = process.env;
let roleName; let roleExpiresAt = 0; let refreshingRole;
let objectVersionIndex;

async function command(bin, args, env = process.env, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = []; let length = 0; let stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    child.stdout.on('data', b => { length += b.length; if (length > 32 * 1024 ** 2) child.kill('SIGKILL'); else output.push(b); });
    // Retain only a bounded diagnostic internally; never print raw native errors.
    child.stderr.on('data', b => { if (stderr.length < 8192) stderr += b.toString(); });
    child.once('error', () => { clearTimeout(timer); reject(new Error(`${bin} unavailable`)); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0 && path.basename(bin) === 'pdftoppm' && /(?:Syntax Error|Command Line Error|^Error:)/m.test(stderr)) {
        const error = new Error('PDF rendering diagnostics require review');
        error.code = 'PDF_RENDER_FAILURE';
        return reject(error);
      }
      if (code === 0) return resolve(Buffer.concat(output).toString());
      const error = new Error(`${path.basename(bin)} failed at ${stage}`);
      const providerCode = stderr.match(/An error occurred \(([A-Za-z0-9_]{1,64})\)/)?.[1];
      error.code = timedOut ? 'COMMAND_TIMEOUT' : providerCode?.toUpperCase() ?? 'COMMAND_FAILED';
      reject(error);
    });
  });
}
async function aws(args, env = taskAwsEnv) {
  if (roleName && env === taskAwsEnv && roleExpiresAt - Date.now() < 300_000) {
    refreshingRole ??= useRole(roleName).finally(() => { refreshingRole = undefined; });
    await refreshingRole;
    env = taskAwsEnv;
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(await command('aws', [...args, '--region', region, '--output', 'json', '--cli-connect-timeout', '10', '--cli-read-timeout', '60'], {
        ...env, AWS_PAGER: '', AWS_RETRY_MODE: 'standard', AWS_MAX_ATTEMPTS: '3',
      }, 300_000) || '{}');
    } catch (error) {
      if (attempt >= 2 || !['COMMAND_FAILED', 'COMMAND_TIMEOUT'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}
async function useRole(name) {
  const { Credentials: c } = await aws(['sts', 'assume-role', '--role-arn', stack[name], '--role-session-name', `darci-recovery-${Date.now()}`], process.env);
  taskAwsEnv = { ...process.env, AWS_ACCESS_KEY_ID: c.AccessKeyId, AWS_SECRET_ACCESS_KEY: c.SecretAccessKey, AWS_SESSION_TOKEN: c.SessionToken };
  roleName = name; roleExpiresAt = Date.parse(c.Expiration);
  assert(Number.isFinite(roleExpiresAt), 'Role expiration missing');
}
async function upload(file, key) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  const hash = digest.digest('hex');
  const bytes = (await stat(file)).size;
  // Content-addressed keys allow incremental objects; record the exact S3 version.
  let existing;
  if (key.startsWith('objects/sha256/')) {
    objectVersionIndex ??= aws(['s3api', 'list-object-versions', '--bucket', stack.Bucket, '--prefix', 'objects/sha256/'])
      .then(listed => new Map((listed.Versions ?? []).filter(v => v.IsLatest).map(v => [v.Key, v])));
    existing = (await objectVersionIndex).get(key);
  } else {
    const listed = await aws(['s3api', 'list-object-versions', '--bucket', stack.Bucket, '--prefix', key]);
    existing = listed.Versions?.find(v => v.Key === key && v.IsLatest);
  }
  if (existing) return { key, versionId: existing.VersionId, sha256: hash, bytes };
  let result;
  try {
    result = await aws(['s3api', 'put-object', '--bucket', stack.Bucket, '--key', key, '--body', file,
      '--server-side-encryption', 'aws:kms', '--ssekms-key-id', stack.KeyArn, '--bucket-key-enabled',
      '--if-none-match', '*', '--checksum-sha256', Buffer.from(hash, 'hex').toString('base64')]);
  } catch (error) {
    if (error.code !== 'PRECONDITIONFAILED') throw error;
    // A timed-out conditional PUT may have completed, or another object may
    // have the same checksum. Never overwrite; pin the existing exact version.
    const retry = await aws(['s3api', 'list-object-versions', '--bucket', stack.Bucket, '--prefix', key]);
    const version = retry.Versions?.find(v => v.Key === key && v.IsLatest);
    assert(version, 'Conditional upload has no recoverable version');
    result = { VersionId: version.VersionId };
  }
  assert(result.VersionId, 'Versioning is required');
  if (key.startsWith('objects/sha256/')) (await objectVersionIndex).set(key, { Key: key, VersionId: result.VersionId });
  return { key, versionId: result.VersionId, sha256: hash, bytes };
}
async function download(item, file) {
  assert(Number.isSafeInteger(item.bytes) && item.bytes >= 0 && item.bytes <= maxBytes, 'Invalid recovery object size');
  assert(typeof item.sha256 === 'string' && /^[a-f0-9]{64}$/.test(item.sha256), 'Invalid recovery checksum');
  await aws(['s3api', 'get-object', '--bucket', stack.Bucket, '--key', item.key, '--version-id', item.versionId, file]);
  assert.equal((await stat(file)).size, item.bytes, 'Recovery length mismatch');
  const digest = createHash('sha256');
  let prefix = Buffer.alloc(0);
  for await (const chunk of createReadStream(file)) {
    digest.update(chunk);
    if (prefix.length < 1024) prefix = Buffer.concat([prefix, chunk.subarray(0, 1024 - prefix.length)]);
  }
  assert.equal(digest.digest('hex'), item.sha256, 'Recovery checksum mismatch');
  return prefix;
}
function postgresEnv(raw, extra = {}) {
  const u = new URL(raw);
  return { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGSSLMODE: ['localhost', '127.0.0.1'].includes(u.hostname) ? 'disable' : 'verify-full',
    ...(flags['ca-file'] ? { PGSSLROOTCERT: flags['ca-file'] } : {}), ...extra };
}
async function sourceClient(raw) {
  const u = new URL(raw); u.searchParams.delete('sslmode');
  const client = new Client({ connectionString: u.toString(), connectionTimeoutMillis: 15_000,
    ssl: { rejectUnauthorized: true, ...(flags['ca-file'] ? { ca: await readFile(flags['ca-file'], 'utf8') } : {}) } });
  await client.connect(); return client;
}
async function main() {
  const caller = await aws(['sts', 'get-caller-identity']);
  assert.equal(caller.Account, '427057633951', 'Wrong approved AWS account');
  const result = await aws(['cloudformation', 'describe-stacks', '--stack-name', stackName]);
  stack = Object.fromEntries(result.Stacks[0].Outputs.map(o => [o.OutputKey, o.OutputValue]));
  const scheduledTask = flags['task-role'] === 'true';
  if (scheduledTask) {
    assert.equal(process.argv[2], 'backup', 'Scheduled tasks cannot restore');
    const expectedRole = stack.WriterRoleArn.split('/').at(-1);
    assert(caller.Arn.startsWith(`arn:aws:sts::427057633951:assumed-role/${expectedRole}/`), 'Unexpected scheduled-task identity');
  }
  const folder = await mkdtemp(path.join(tmpdir(), 'darci-recovery-'));
  await chmod(folder, 0o700);
  if (process.argv[2] === 'restore-check') {
    assert(flags.manifest && flags.version, 'An exact manifest key and S3 version are required');
    await useRole('ReaderRoleArn');
    stage = 'restore manifest';
    const manifestFile = path.join(folder, 'manifest.json');
    await aws(['s3api', 'get-object', '--bucket', stack.Bucket, '--key', flags.manifest, '--version-id', flags.version, manifestFile]);
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    assert.equal(manifest.format, 1); assert.equal(manifest.complete, true);
    assert(manifest.totalBytes <= maxBytes, 'Restore exceeds approved size bound');
    stage = 'restore database archive';
    await download(manifest.database, path.join(folder, 'database.dump'));
    await command(path.join(flags['pg-bin'] ?? '/opt/homebrew/opt/postgresql@17/bin', 'pg_restore'), ['--list', path.join(folder, 'database.dump')]);
    let readablePdfs = 0; let restoredObjects = 0; let nextObject = 0;
    const failures = [];
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (nextObject < manifest.objects.length) {
      const i = nextObject++; const object = manifest.objects[i];
      stage = 'restore object and validate';
      const file = path.join(folder, `object-${i}`);
      let checksumVerified = false;
      try {
      const prefix = await download(object.backup, file);
      checksumVerified = true; restoredObjects++;
      if (prefix.includes(Buffer.from('%PDF-'))) {
        const info = await command('pdfinfo', [file]);
        const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
        assert(pageCount > 0 && pageCount <= 200, 'Recovered PDF page count needs review');
        await command('qpdf', ['--check', '--warning-exit-0', file]);
        const renderFolder = await mkdtemp(path.join(folder, `render-${i}-`));
        await command('pdftoppm', ['-scale-to', '64', '-png', file, path.join(renderFolder, 'page')], process.env, 30_000);
        assert.equal((await readdir(renderFolder)).filter(name => /^page-\d+\.png$/.test(name)).length, pageCount, 'Recovered PDF rendered an incomplete page set');
        readablePdfs++;
      }
      } catch (error) {
        failures.push({ objectIndex: i, checksumVerified, code: error.code ?? 'PDF_REVIEW_REQUIRED' });
      }
      if ((restoredObjects + failures.filter(f => !f.checksumVerified).length) % 100 === 0) {
        console.log(JSON.stringify({ status: 'in_progress', stage: 'restore checked', restoredObjects, failures: failures.length, total: manifest.objects.length }));
      }
      }
    }));
    if (manifest.identityKey) await download(manifest.identityKey, path.join(folder, 'identity-key.json'));
    const report = { kind: 'object-restore-check', complete: failures.length === 0, snapshotId: manifest.snapshotId,
      objectCount: manifest.objects.length, restoredObjects, readablePdfs, exactChecksums: restoredObjects === manifest.objects.length,
      failures,
      elapsedSeconds: (Date.now() - started) / 1000, artifactDirectory: folder,
      limitation: 'DB archive index checked, not restored into Supabase; app authorization and worker reconstruction still require the isolated drill.' };
    await writeFile(path.join(folder, 'restore-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    assert.equal(failures.length, 0, 'Recovered object integrity or PDF readability needs review; see private restore report');
    return;
  }
  assert.equal(process.argv[2], 'backup', 'Use backup or restore-check');
  stage = 'load source configuration';
  const sourceSecret = scheduledTask ? '/darci/staging/recovery-source' : '/darci/staging/app';
  assert.equal(flags['secret-id'] ?? sourceSecret, sourceSecret, 'Unexpected staging recovery secret');
  const secret = await aws(['secretsmanager', 'get-secret-value', '--secret-id', sourceSecret]);
  const config = JSON.parse(secret.SecretString);
  assert(new URL(config.SUPABASE_URL).hostname === 'oqferisuloumoojgbjde.supabase.co', 'Unexpected Supabase source');
  if (flags['session-pooler'] === 'true') {
    // The CLI's already-linked endpoint is authoritative; never guess a tenant
    // or send the database password to a caller-supplied host.
    const pooler = scheduledTask
      ? new URL('postgresql://postgres.oqferisuloumoojgbjde@aws-1-us-east-1.pooler.supabase.com:5432/postgres')
      : new URL((await readFile(new URL('../../supabase/.temp/pooler-url', import.meta.url), 'utf8')).trim());
    assert(/^aws-\d+-us-east-1\.pooler\.supabase\.com$/.test(pooler.hostname), 'Unexpected linked pooler');
    assert(decodeURIComponent(pooler.username) === 'postgres.oqferisuloumoojgbjde', 'Wrong linked project');
    const connection = new URL(config.DATABASE_URL);
    connection.hostname = pooler.hostname;
    connection.username = pooler.username;
    connection.port = '5432'; // Session pooling, never transaction pooling.
    config.DATABASE_URL = connection.toString();
  }
  stage = 'connect with verified database TLS';
  const db = await sourceClient(config.DATABASE_URL);
  const observer = await sourceClient(config.DATABASE_URL);
  if (!scheduledTask) await useRole('WriterRoleArn');
  const snapshotId = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`;
  try {
    const lock = (await observer.query("select pg_try_advisory_lock(hashtextextended('darci.recovery.staging.snapshot',0)) acquired")).rows[0].acquired;
    if (!lock) { console.log(JSON.stringify({ status: 'skipped', reason: 'another_snapshot_is_running' })); return; }
    stage = 'export database snapshot';
    await db.query('begin isolation level repeatable read read only');
    const snapshot = (await db.query('select pg_export_snapshot() as id')).rows[0].id;
    const objects = (await db.query('select id,bucket_id,name,version,metadata from storage.objects order by bucket_id,name')).rows;
    const estimatedBytes = objects.reduce((n, o) => n + Number(o.metadata?.size ?? 0), 0);
    assert(estimatedBytes <= maxBytes, 'Backup exceeds approved size bound');
    const dumpFile = path.join(folder, 'database.dump');
    await command(path.join(flags['pg-bin'] ?? '/opt/homebrew/opt/postgresql@17/bin', 'pg_dump'),
      ['--format=custom', '--no-owner', `--snapshot=${snapshot}`, `--file=${dumpFile}`], postgresEnv(config.DATABASE_URL), 3_600_000);
    // The archive and object inventory are now fixed. Do not hold an old MVCC
    // transaction throughout network transfers; each source version is checked.
    await db.query('commit');
    assert((await stat(dumpFile)).size + estimatedBytes <= maxBytes, 'Backup exceeds approved size bound');
    const database = await upload(dumpFile, `snapshots/${snapshotId}/database.dump`);
    console.log(JSON.stringify({ status: 'in_progress', stage: 'database archived', objectCount: objects.length, databaseBytes: database.bytes }));
    let totalBytes = database.bytes;
    let observerQueue = Promise.resolve();
    const observe = (query, params) => {
      const current = observerQueue.then(() => observer.query(query, params));
      observerQueue = current.catch(() => {});
      return current;
    };
    const entries = [];
    let next = 0; let copied = 0; let transferFailure;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < objects.length && !transferFailure) {
        const i = next++;
        const object = objects[i];
        try {
      stage = 'copy source object';
      const endpoint = `${config.SUPABASE_URL}/storage/v1/object/authenticated/${encodeURIComponent(object.bucket_id)}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`, apikey: config.SUPABASE_SERVICE_ROLE_KEY }, signal: AbortSignal.timeout(120_000) });
      assert(response.ok, 'Source object unavailable');
      assert(response.body, 'Source object has no response stream');
      // Stream directly to private disk, with a shared bound enforced before
      // writing each chunk. Four workers cannot accumulate unbounded buffers.
      const file = path.join(folder, `object-${i}`);
      const digest = createHash('sha256'); let objectBytes = 0;
      await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, callback) {
        try {
          totalBytes += chunk.length; objectBytes += chunk.length;
          assert(totalBytes <= maxBytes, 'Backup exceeds approved size bound');
          digest.update(chunk); callback(null, chunk);
        } catch(error) { callback(error); }
      }}), createWriteStream(file, { flags: 'wx', mode: 0o600 }));
      if (object.metadata?.size !== undefined) assert.equal(objectBytes, Number(object.metadata.size), 'Source object size differs from snapshot');
      const current = (await observe('select version,metadata from storage.objects where id=$1', [object.id])).rows[0];
      assert(current && current.version === object.version && JSON.stringify(current.metadata) === JSON.stringify(object.metadata), 'Source changed during snapshot; retry without marking complete');
      const backup = await upload(file, `objects/sha256/${digest.digest('hex')}`);
      entries[i] = { ...object, backup };
      copied++;
      if (copied % 25 === 0) console.log(JSON.stringify({ status: 'in_progress', stage: 'objects copied', copied, total: objects.length }));
        } catch (error) { transferFailure ??= error; }
      }
    }));
    if (transferFailure) throw transferFailure;
    assert.equal(copied, objects.length, 'Incomplete object transfer');
    let identityKey = null;
    if (config.IDENTITY_FIELD_ENCRYPTION_KEY) {
      const file = path.join(folder, 'identity-key.json');
      await writeFile(file, JSON.stringify({ keyId: config.IDENTITY_FIELD_ENCRYPTION_KEY_ID ?? 'v1', key: config.IDENTITY_FIELD_ENCRYPTION_KEY }));
      identityKey = await upload(file, `snapshots/${snapshotId}/identity-key.json`);
      totalBytes += identityKey.bytes;
      assert(totalBytes <= maxBytes, 'Backup exceeds approved size bound');
    }
    stage = 'commit complete snapshot manifest';
    const manifest = { format: 1, complete: true, snapshotId, sourceProject: 'oqferisuloumoojgbjde',
      startedAt: new Date(started).toISOString(), completedAt: new Date().toISOString(), secretVersionId: secret.VersionId,
      sourceAppSecretVersion: config.SOURCE_APP_SECRET_VERSION ?? secret.VersionId,
      database, objects: entries, identityKey, totalBytes, retention: 'No automatic deletion; approved policy pending' };
    const file = path.join(folder, 'manifest.json'); await writeFile(file, JSON.stringify(manifest, null, 2));
    const receipt = await upload(file, `snapshots/${snapshotId}/manifest.json`);
    await aws(['cloudwatch', 'put-metric-data', '--namespace', 'DARCi/Recovery', '--metric-data', JSON.stringify([{ MetricName: 'SnapshotCompleted', Value: 1, Unit: 'Count', Dimensions: [{ Name: 'Environment', Value: 'staging' }] }])]);
    console.log(JSON.stringify({ snapshotId, manifest: receipt.key, version: receipt.versionId, objectCount: entries.length,
      totalBytes, elapsedSeconds: (Date.now() - started) / 1000, artifactDirectory: folder }));
  } finally { await db.end(); await observer.end(); }
}
const started = Date.now();
main().catch(async error => {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code) ? error.code : undefined;
  // Our assertions contain fixed operational descriptions, never source names.
  const reason = error instanceof assert.AssertionError ? error.message : undefined;
  console.error(JSON.stringify({ status: 'failed', stage, code, reason,
    noSnapshotAcceptance: process.argv[2] === 'backup', noRestoreAcceptance: process.argv[2] === 'restore-check' }));
  if (stack) {
    try { await aws(['sns', 'publish', '--topic-arn', stack.AlertTopicArn, '--subject', '[DARCi] Recovery operation failed',
      '--message', `Recovery operation failed at ${stage}. No new snapshot/drill is accepted. Runbook: docs/production-recovery-runbook.md. Correlation: recovery-${started}. Inspect private local evidence; do not reset or overwrite source data.`]); } catch { console.error('Recovery failure notification was not delivered'); }
  }
  process.exitCode = 1;
});
