// Operator-only additive staging migration. Does not activate prices or mutate subscriptions.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {Client}=require('pg');
const root=new URL('../../',import.meta.url);
const aws=args=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(aws(['sts','get-caller-identity']).Account,'427057633951');
const config=JSON.parse(aws(['secretsmanager','get-secret-value','--secret-id','/darci/staging/app']).SecretString);
assert.equal(new URL(config.SUPABASE_URL).hostname,'oqferisuloumoojgbjde.supabase.co');
const pooler=new URL(readFileSync(new URL('supabase/.temp/pooler-url',root),'utf8').trim());
assert.equal(pooler.hostname,'aws-1-us-east-1.pooler.supabase.com');
assert.equal(decodeURIComponent(pooler.username),'postgres.oqferisuloumoojgbjde');
const url=new URL(config.DATABASE_URL);
url.hostname=pooler.hostname;url.username=pooler.username;url.port='5432';url.searchParams.delete('sslmode');
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync(new URL('infra/recovery/supabase-ca.crt',root),'utf8')},connectionTimeoutMillis:15000});
const version='20260923030000';
const sql=readFileSync(new URL(`supabase/migrations/${version}_member_pricing_v2.sql`,root),'utf8');
const hash=createHash('sha256').update(sql).digest('hex');
await db.connect();
try {
  assert.equal((await db.query('select stripe_environment from public.billing_runtime_configuration where singleton')).rows[0].stripe_environment,'test');
  const existing=(await db.query('select statements from supabase_migrations.schema_migrations where version=$1',[version])).rows[0];
  if(existing){assert.equal(existing.statements.join('\n'),sql,'Previously applied migration differs');console.log(JSON.stringify({alreadyApplied:true,version,sha256:hash}));}
  else {
    const versions=aws(['s3api','list-object-versions','--bucket','darci-recovery-427057633951-us-east-1','--prefix','snapshots/']).Versions??[];
    const snapshot=versions.filter(v=>v.IsLatest&&v.Key.endsWith('/manifest.json')).sort((a,b)=>Date.parse(b.LastModified)-Date.parse(a.LastModified))[0];
    assert(snapshot&&Date.now()-Date.parse(snapshot.LastModified)<86400000,'A recovery manifest less than 24 hours old is required');
    await db.query("begin isolation level repeatable read; set local lock_timeout='5s'; set local statement_timeout='30s'");
    const tables=['billing_subscriptions','billing_subscription_items','billing_entitlements','billing_usage_events','billing_provider_price_mappings','documents','document_versions','signatures','document_hash_records','document_release_controls'];
    const fingerprint=async()=>{const result={};for(const table of tables)result[table]=(await db.query(`select count(*)::int rows,md5(coalesce(string_agg(h,'' order by h),'')) hash from (select md5(to_jsonb(t)::text) h from public.${table} t) s`)).rows[0];return result;};
    const before=await fingerprint();
    const legacyBefore=(await db.query("select to_jsonb(t)-'available_for_purchase' row from public.billing_catalog_prices t where price_code in ('member_starter_monthly','member_plus_monthly','member_volume_monthly') order by price_code")).rows;
    await db.query(sql);
    assert.deepEqual(await fingerprint(),before);
    assert.deepEqual((await db.query("select to_jsonb(t)-'available_for_purchase' row from public.billing_catalog_prices t where price_code in ('member_starter_monthly','member_plus_monthly','member_volume_monthly') order by price_code")).rows,legacyBefore);
    const newRows=(await db.query("select price_code,is_active from public.billing_catalog_prices where metadata->>'catalog_version'='2'")).rows;
    assert.equal(newRows.length,6);assert(newRows.every(r=>r.is_active===false));
    const apply=process.argv.includes('--apply-staging-migration');
    if(apply){await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,'member_pricing_v2',[sql]]);await db.query("notify pgrst, 'reload schema'");await db.query('commit');}
    else await db.query('rollback');
    console.log(JSON.stringify({applied:apply,version,sha256:hash,inactiveNewPrices:6,protectedTables:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.rows])),recoveryManifest:snapshot.Key,legacyPricesUnchanged:true,pricesActivated:false}));
  }
} catch(error){await db.query('rollback');console.error(error instanceof assert.AssertionError?error.message:'Staging preparation failed; transaction rolled back. Inspect privately.');process.exitCode=1;}
finally{await db.end();}
