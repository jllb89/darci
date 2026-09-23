// Production-only, approved private-candidate fix. No customer/PDF row writes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Client}=require('../../backend/node_modules/pg');
assert(process.argv.includes('--approved-private-production-fix'));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/recovery-source').SecretString);
assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
const url=new URL(secret.DATABASE_URL);url.hostname='aws-0-us-east-1.pooler.supabase.com';url.username='postgres.jdrgluisxhgegdsesman';url.port='5432';url.search='';
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('infra/recovery/supabase-ca.crt','utf8')},connectionTimeoutMillis:15000});
const version='20260923210000',name='realtime_actor_authorization',sql=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
const fingerprint=async()=>{
  const out={};for(const t of ['users','user_roles','documents','document_versions','notarization_requests','signatures','document_hash_records'])
    out[t]=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' order by row_to_json(t)::text),'')) hash from public.${t} t`)).rows[0];
  return out;
};
try{
  await db.connect();const existing=(await db.query('select statements from supabase_migrations.schema_migrations where version=$1',[version])).rows[0];
  if(existing){assert.equal(existing.statements.join('\n'),sql);console.log(JSON.stringify({alreadyApplied:true,version}));}
  else{
    for(const apply of [false,true]){
      await db.query('begin isolation level repeatable read');await db.query("set local statement_timeout='20s';set local lock_timeout='5s'");
      const before=await fingerprint();await db.query(sql);
      assert.equal((await db.query("select public.can_receive_private_realtime('request:invalid') denied")).rows[0].denied,false);
      assert.equal((await db.query("select has_function_privilege('anon','public.can_receive_private_realtime(text)','EXECUTE') allowed")).rows[0].allowed,false);
      assert.equal((await db.query("select has_function_privilege('authenticated','public.can_receive_private_realtime(text)','EXECUTE') allowed")).rows[0].allowed,true);
      assert.deepEqual(await fingerprint(),before,'Evidence/user rows changed');
      if(!apply){await db.query('rollback');continue;}
      await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,name,[sql]]);
      await db.query("notify pgrst,'reload schema'");await db.query('commit');
      const dir=mkdtempSync('.recovery-private/production-realtime-migration-');
      const report={at:new Date().toISOString(),version,sqlSha256:createHash('sha256').update(sql).digest('hex'),rehearsalPassed:true,applied:true,unchanged:before};
      writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,evidence:dir}));
    }
  }
}catch(error){await db.query('rollback').catch(()=>{});console.error(JSON.stringify({passed:false,code:error.code??'assertion',reason:error instanceof assert.AssertionError?error.message:'Migration stopped; sensitive details omitted'}));process.exitCode=1;}
finally{await db.end();}
