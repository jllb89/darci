// Reconstruct a PRIVATE backup locally. Never deploy or contact hosted providers.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url), jwt = require('jsonwebtoken');
const execute = promisify(execFile);
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const folder = process.argv[2];
assert(process.argv.includes('--confirm-isolated') && path.isAbsolute(folder ?? ''), 'Explicit private backup directory and isolation confirmation required');
process.umask(0o077);
const manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
assert(manifest.complete && manifest.sourceProject === 'oqferisuloumoojgbjde');
const name = `darci-app-recovery-${randomUUID().slice(0, 8)}`;
// Colima shares the user workspace, not macOS /var/folders. Keep private
// reconstructed bytes in an explicitly ignored, mode-0700 shared directory.
const runtimeRoot=path.join(root,'.recovery-private');await mkdir(runtimeRoot,{recursive:true,mode:0o700});
const work = path.join(runtimeRoot, name); await mkdir(work, { mode: 0o700 });
const started = Date.now(), containers = [];
const docker = async args => (await execute('docker', args, { timeout: 120000, maxBuffer: 16 * 1024 ** 2 })).stdout.trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const dbName = `${name}-db`;
const sql = async source => docker(['exec', dbName, 'psql', '-h', '/tmp', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', source]);
const password = randomBytes(32).toString('hex'), secret = randomBytes(40).toString('hex');
const anon = jwt.sign({ role: 'anon', iss: 'supabase' }, secret, { expiresIn: '1d' });
const service = jwt.sign({ role: 'service_role', iss: 'supabase' }, secret, { expiresIn: '1d' });
const connection = role => `postgresql://${role}:${password}@db:5432/postgres`;
const base = 'http://gateway:8000';
let stage = 'check exact backup', success = false;
async function checksum(file) { const h = createHash('sha256'); for await (const c of createReadStream(file)) h.update(c); return h.digest('hex'); }
async function launch(alias, image, env = {}, args = [], mounts = [], publish = [], command = []) {
  const container = `${name}-${alias}`; containers.push(container);
  const envFile = path.join(work, `${alias}.env`);
  assert(Object.values(env).every(v => !String(v).includes('\n')));
  await writeFile(envFile, Object.entries(env).map(([k,v]) => `${k}=${v}`).join('\n'), { mode: 0o600 });
  await docker(['run', '-d', '--name', container, '--network', name, '--network-alias', alias,
    '--env-file', envFile, ...mounts.flatMap(m => ['-v', m]), ...publish.flatMap(p => ['-p', p]), ...args, image, ...command]);
  return container;
}
try {
  assert.equal(await checksum(path.join(folder, 'database.dump')), manifest.database.sha256);
  const report = JSON.parse(await readFile(path.join(folder, 'restore-report.json'), 'utf8'));
  assert.equal(report.snapshotId, manifest.snapshotId); assert.equal(report.exactChecksums, true);
  // Historical readability exceptions remain preserved and explicitly reported.
  assert(report.failures.every(f => f.checksumVerified));
  await docker(['network', 'create', '--internal', name]);
  assert.equal(JSON.parse(await docker(['network','inspect',name]))[0].Internal, true);
  containers.push(dbName);
  await docker(['run','-d','--name',dbName,'--network',name,'--network-alias','db','--user','postgres',
    '--memory','2g','--tmpfs','/tmp:rw,nosuid,size=1610612736','-v',`${root}/backend/scripts/recovery-pg_hba.conf:/recovery-pg_hba.conf:ro`,'--entrypoint','/bin/sh',
    'public.ecr.aws/supabase/postgres:17.6.1.075','-c',
    'initdb -D /tmp/recovery-db --auth-local=trust --auth-host=reject >/tmp/init.log 2>&1 && exec postgres -D /tmp/recovery-db -k /tmp -h 0.0.0.0 -c shared_preload_libraries= -c hba_file=/recovery-pg_hba.conf']);
  for(let i=0;;i++){try{await sql('select 1');break;}catch{assert(i<30);await new Promise(r=>setTimeout(r,500));}}
  const roles=['anon','authenticated','authenticator','dashboard_user','service_role','supabase_admin','supabase_auth_admin','supabase_etl_admin','supabase_functions_admin','supabase_read_only_user','supabase_realtime_admin','supabase_replication_admin','supabase_storage_admin','supabase_superuser','pgbouncer'];
  await sql(roles.map(r=>`create role "${r}" nologin`).join(';'));
  stage='restore database';
  await new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',dbName,'pg_restore','-h','/tmp','-U','postgres','-d','postgres','--no-owner','--exit-on-error','--single-transaction'],{stdio:['pipe','ignore','ignore']});
    const timer=setTimeout(()=>child.kill('SIGKILL'),120000);createReadStream(path.join(folder,'database.dump')).pipe(child.stdin);child.stdin.on('error',()=>{});
    child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('RESTORE_FAILED'));});
  });
  await sql(`alter role postgres password ${literal(password)}; alter role authenticator login password ${literal(password)}; alter role service_role bypassrls; grant anon,authenticated,service_role to authenticator;`);
  const installed=new Set(JSON.parse(await sql("select coalesce(json_agg(version),'[]') from supabase_migrations.schema_migrations")));
  for(const file of (await readdir(path.join(root,'supabase/migrations'))).filter(f=>/^20260917\d{6}_.*\.sql$/.test(f)).sort()){
    const version=file.slice(0,14);if(installed.has(version))continue;
    const source=await readFile(path.join(root,'supabase/migrations',file),'utf8');
    // Only the already-reviewed Phase 1 set, and only this isolated restored copy.
    await sql(source);
    await sql(`insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(version)},${literal(file.slice(15,-4))},array[${literal(source)}])`);
  }
  // Restore connections are internal-only and ephemeral. Restored application
  // RLS uses anon/authenticated/service_role; original hosted passwords are not reused.
  stage='restore exact object bytes';
  const storageRoot=path.join(work,'storage');await mkdir(storageRoot);
  for(let i=0;i<manifest.objects.length;i++){
    const o=manifest.objects[i],source=path.join(folder,`object-${i}`);
    assert.equal(await checksum(source),o.backup.sha256);
    const dest=path.resolve(storageRoot,'recovery','recovery',o.bucket_id,o.name,...(o.version?[o.version]:[]));
    assert(dest.startsWith(storageRoot+path.sep),'Unsafe restored object path');
    await mkdir(path.dirname(dest),{recursive:true});await copyFile(source,dest);
  }
  const key=JSON.parse(await readFile(path.join(folder,'identity-key.json'),'utf8'));
  assert.equal(await checksum(path.join(folder,'identity-key.json')),manifest.identityKey.sha256);
  stage='start isolated Supabase';
  await launch('rest','public.ecr.aws/supabase/postgrest:v14.3',{
    PGRST_DB_URI:connection('authenticator'),PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions',PGRST_DB_MAX_ROWS:'1000'});
  await launch('auth','public.ecr.aws/supabase/gotrue:v2.186.0',{
    GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:base+'/auth/v1',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:connection('postgres')+'?options=-csearch_path%3Dauth',GOTRUE_SITE_URL:'http://127.0.0.1:3000',
    GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_ISSUER:base+'/auth/v1',GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',
    GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_EXTERNAL_PHONE_ENABLED:'false',
    GOTRUE_MFA_TOTP_ENROLL_ENABLED:'true',GOTRUE_MFA_TOTP_VERIFY_ENABLED:'true',GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED:'true',GOTRUE_RATE_LIMIT_VERIFY:'1000'});
  await launch('storage','public.ecr.aws/supabase/storage-api:v1.35.3',{
    DATABASE_URL:connection('postgres'),ANON_KEY:anon,SERVICE_KEY:service,AUTH_JWT_SECRET:secret,
    STORAGE_BACKEND:'file',FILE_STORAGE_BACKEND_PATH:'/mnt',TENANT_ID:'recovery',GLOBAL_S3_BUCKET:'recovery',REGION:'local',STORAGE_S3_REGION:'local',FILE_SIZE_LIMIT:'52428800',
    ENABLE_IMAGE_TRANSFORMATION:'false',S3_PROTOCOL_ENABLED:'false',TUS_USE_FILE_VERSION_SEPARATOR:'false'},[],[`${storageRoot}:/mnt`,`${root}/backend/scripts/recovery-storage-metadata.cjs:/restore-metadata.cjs:ro`]);
  await new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',`${name}-storage`,'node','/restore-metadata.cjs'],{stdio:['pipe','ignore','ignore']});
    const timer=setTimeout(()=>child.kill('SIGKILL'),120000);child.on('error',reject);
    child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('STORAGE_METADATA_RESTORE_FAILED'));});
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(manifest.objects));
  });
  // Gateway cannot reach anything except fixed service names on this internal network.
  await launch('gateway','node:24-alpine',{},['--entrypoint','node'],[`${root}/backend/scripts/recovery-local-gateway.cjs:/gateway.cjs:ro`],[],['/gateway.cjs']);
  const localBase=base;
  for(let i=0;;i++){
    try { await docker(['exec',`${name}-gateway`,'node','-e',`fetch('${base}/auth/v1/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))`]);break; } catch { /* wait for local service */ }
    assert(i<30,'AUTH_START_TIMEOUT');await new Promise(r=>setTimeout(r,1000));
  }
  stage='start recovered application';
  await launch('redis','redis:7.4-alpine');
  const appEnv={
    NODE_ENV:'production',APP_ENV:'recovery',PORT:'4000',SUPABASE_URL:base,SUPABASE_ANON_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:service,SUPABASE_JWT_SECRET:secret,
    DATABASE_URL:connection('postgres'),OTEL_SDK_DISABLED:'1',SENTRY_ENABLED:'false',SENTRY_DSN:'',DISABLE_REDIS_QUEUES:'true',REDIS_URL:'redis://redis:6379',
    NOTIFICATION_OUTBOX_RUNNER_ENABLED:'false',STRIPE_WEBHOOK_RUNNER_ENABLED:'false',BILLING_RECONCILIATION_RUNNER_ENABLED:'false',STRIPE_WEBHOOK_RETENTION_RUNNER_ENABLED:'false',
    STRIPE_ENVIRONMENT:'test',BILLING_ENFORCEMENT_MODE:'observe',LEDGER_ANCHOR_MODE:'hash_only',LEDGER_ALLOW_STUB_PROVIDER:'false',
    IDENTITY_FIELD_ENCRYPTION_KEY:key.key,IDENTITY_FIELD_ENCRYPTION_KEY_ID:key.keyId,
    CORS_ALLOWED_ORIGINS:'http://127.0.0.1:3000'};
  await launch('api','darci-api:phase1-19',appEnv,[],[`${root}/backend/dist:/app/dist:ro`]);
  await launch('worker','darci-api:phase1-19',appEnv,[],[`${root}/backend/dist:/app/dist:ro`],[],['node','dist/worker/index.js']);
  const localApi='http://api:4000';
  for(let i=0;;i++){
    try { await docker(['exec',`${name}-gateway`,'node','-e',`fetch('${localApi}/health/live',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))`]);break; } catch { /* wait */ }
    assert(i<30,'API_START_TIMEOUT');await new Promise(r=>setTimeout(r,1000));
  }
  await writeFile(path.join(work,'endpoints.json'),JSON.stringify({localBase,localApi}),{mode:0o600});
  // Worker runs heartbeat/watchdog only: queues and provider outboxes remain
  // quarantined. Starting normally would replay restored invitations/payments.
  stage='application booted; functional drill pending';
  success=true;
} catch(error) {
  console.error(JSON.stringify({status:'failed',stage,code:error.code??'RECOVERY_ASSERTION_FAILED',message:String(error.message).replace(/postgresql:\/\/\S+/g,'[redacted]').slice(0,150),work}));
  process.exitCode=1;
} finally {
  await writeFile(path.join(work,'runtime.json'),JSON.stringify({name,containers,started,backupFolder:folder,snapshotId:manifest.snapshotId,stage,success,base,anon,service,secret,password},null,2),{mode:0o600});
  console.log(JSON.stringify({stage,work,elapsedSeconds:(Date.now()-started)/1000,sourceChanged:false,networkInternal:true,success}));
}
