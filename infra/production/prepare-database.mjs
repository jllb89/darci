import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {Client}=require('pg');
const apply=process.argv.includes('--apply-production');
const installLocal=process.argv.includes('--install-local');
assert(apply||process.argv.includes('--rehearse-local'),'Explicit mode required');
const version='20260923050000';
const sql=readFileSync(new URL(`../../supabase/migrations/${version}_production_billing_preactivation.sql`,import.meta.url),'utf8');
const hash=createHash('sha256').update(sql).digest('hex');
let config={connectionString:'postgresql://postgres:postgres@127.0.0.1:55322/postgres'};
if(apply) {
  const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const s=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/recovery-source').SecretString);
  assert.equal(s.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const url=new URL(s.DATABASE_URL);
  if(url.hostname==='db.jdrgluisxhgegdsesman.supabase.co') {
    assert.equal(decodeURIComponent(url.username),'postgres');
    url.hostname='aws-0-us-east-1.pooler.supabase.com';
    url.username='postgres.jdrgluisxhgegdsesman'; url.port='5432';
  }
  assert.equal(decodeURIComponent(url.username),'postgres.jdrgluisxhgegdsesman');
  assert.equal(url.hostname,'aws-0-us-east-1.pooler.supabase.com');
  url.search='';
  config={connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('../recovery/supabase-ca.crt',import.meta.url),'utf8')}};
}
const db=new Client({...config,connectionTimeoutMillis:15000});
await db.connect();
try {
  await db.query('begin');
  await db.query("set local statement_timeout='15s'");
  await db.query("select pg_advisory_xact_lock(hashtext('darci-production-pactivation'))");
  const existing=(await db.query('select statements from supabase_migrations.schema_migrations where version=$1',[version])).rows[0];
  if(existing) assert.equal(existing.statements.join('\n'),sql,'Recorded migration differs');
  else await db.query(sql);
  await db.query('savepoint migration_installed');
  for(const table of ['auth.users','public.users','public.documents','storage.objects','public.billing_customers','public.billing_orders','public.billing_subscriptions','public.stripe_webhook_events','public.billing_provider_price_mappings'])
    assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,`${table} must be empty for initial production setup`);
  await db.query("update public.billing_runtime_configuration set stripe_environment='live',live_activation_approved=false where singleton");
  await db.query('savepoint live_disabled');
  await assert.rejects(db.query("select public.assert_stripe_runtime_environment('live')"),/STRIPE_LIVE_ACTIVATION_DISABLED/);
  await db.query('rollback to savepoint live_disabled');
  await db.query('savepoint test_disabled');
  await assert.rejects(db.query("select public.assert_stripe_runtime_environment('test')"),/STRIPE_RUNTIME_ENVIRONMENT_MISMATCH/);
  await db.query('rollback to savepoint test_disabled');
  for(const role of ['anon','authenticated','service_role']) assert.equal((await db.query("select has_table_privilege($1,'public.billing_runtime_configuration','UPDATE') allowed",[role])).rows[0].allowed,false);
  if(apply||installLocal) {
    if(installLocal&&!apply) await db.query('rollback to savepoint migration_installed');
    if(!existing) await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,'production_billing_preactivation',[sql]]);
    await db.query("notify pgrst, 'reload schema'");
    await db.query('commit');
  } else await db.query('rollback');
  console.log(JSON.stringify({passed:true,mode:apply?'production':installLocal?'local-migration-only':'local-rollback',version,sha256:hash,liveActivationApproved:false,testEntitlementsRejected:true,liveMutationsRejected:true}));
} catch(error) {
  await db.query('rollback');
  // Never emit driver connection diagnostics, which may contain credentials.
  console.error(JSON.stringify({passed:false,stage:'production database preparation',code:error.code??'assertion',reason:error instanceof assert.AssertionError?error.message:'Database operation failed; inspect the guarded operation locally.'}));
  process.exitCode=1;
} finally {await db.end();}
