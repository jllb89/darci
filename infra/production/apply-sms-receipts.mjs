import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{Client}=require('../../backend/node_modules/pg');
const version='20260923220000',name='auth_sms_hook_receipts';
const original=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
const sql=original.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const local=process.argv.includes('--rehearse-local');
assert(local||process.argv.includes('--approved-private-production-fix'));
let config;
if(local) config={connectionString:'postgresql://postgres:postgres@127.0.0.1:55322/postgres'};
else {
  const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/recovery-source').SecretString);
  assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const url=new URL(secret.DATABASE_URL);url.hostname='aws-0-us-east-1.pooler.supabase.com';url.username='postgres.jdrgluisxhgegdsesman';url.port='5432';url.search='';
  config={connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('infra/recovery/supabase-ca.crt','utf8')}};
}
const db=new Client({...config,connectionTimeoutMillis:15000});
async function verify(){
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.auth_sms_hook_receipts'::regclass")).rows[0].relrowsecurity,true);
  for(const role of ['anon','authenticated']) for(const action of ['SELECT','INSERT','UPDATE','DELETE'])
    assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,'public.auth_sms_hook_receipts',action])).rows[0].allowed,false);
  for(const action of ['SELECT','INSERT','UPDATE']) assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',['service_role','public.auth_sms_hook_receipts',action])).rows[0].allowed,true);
  await db.query('savepoint fixture');
  await db.query('insert into public.auth_sms_hook_receipts(hook_hash,payload_hmac) values($1,$2)',['a'.repeat(64),'b'.repeat(64)]);
  await db.query('savepoint duplicate');
  await assert.rejects(db.query('insert into public.auth_sms_hook_receipts(hook_hash,payload_hmac) values($1,$2)',['a'.repeat(64),'b'.repeat(64)]),e=>e.code==='23505');
  await db.query('rollback to savepoint duplicate');
  await db.query('rollback to savepoint fixture');
}
try {
  await db.connect();
  const existing=(await db.query('select statements from supabase_migrations.schema_migrations where version=$1',[version])).rows[0];
  if(existing){assert.equal(existing.statements.join('\n'),original);console.log(JSON.stringify({version,alreadyApplied:true}));}
  else {
    assert.equal((await db.query("select to_regclass('public.auth_sms_hook_receipts') table_name")).rows[0].table_name,null,'Untracked existing table requires review');
    for(const apply of local?[false]:[false,true]){
      await db.query("begin; set local statement_timeout='15s'; set local lock_timeout='5s'");
      await db.query(sql);await verify();
      assert.equal(Number((await db.query('select count(*) from public.auth_sms_hook_receipts')).rows[0].count),0);
      if(apply){
        await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,name,[original]]);
        await db.query("notify pgrst,'reload schema'");await db.query('commit');
      }else await db.query('rollback');
    }
    const report={at:new Date().toISOString(),version,local,rehearsed:true,applied:!local,tableEmpty:true,publicAccessDenied:true,sqlSha256:createHash('sha256').update(original).digest('hex')};
    const dir=mkdtempSync('.recovery-private/sms-receipt-migration-');writeFileSync(dir+'/report.json',JSON.stringify(report),{mode:0o600});
    console.log(JSON.stringify({...report,evidence:dir}));
  }
}catch(e){await db.query('rollback').catch(()=>{});console.error(JSON.stringify({passed:false,code:e.code??e.name,reason:'Migration stopped; sensitive details omitted'}));process.exitCode=1;}
finally{await db.end();}
