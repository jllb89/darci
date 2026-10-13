import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{Client}=require('../../backend/node_modules/pg');
assert(process.argv.includes('--approved-review-migration'));process.umask(0o077);
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const source=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/recovery-source').SecretString);
assert.equal(source.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
const url=new URL(source.DATABASE_URL);url.hostname='aws-0-us-east-1.pooler.supabase.com';url.username='postgres.jdrgluisxhgegdsesman';url.port='5432';url.search='';
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('infra/recovery/supabase-ca.crt','utf8')},connectionTimeoutMillis:15000});
const version='20261013215749',name='app_review_document_allowance';
const sql=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
try{
  await db.connect();
  const original=(await db.query("select pg_get_functiondef('public.consume_member_document_workflow(uuid,uuid,uuid,text,text,text,uuid)'::regprocedure) body")).rows[0].body;
  const existing=(await db.query('select statements from supabase_migrations.schema_migrations where version=$1',[version])).rows[0];
  if(existing){assert.equal(existing.statements.join('\n'),sql);console.log(JSON.stringify({alreadyApplied:true,version}));}
  else for(const apply of [false,true]){
    await db.query('begin');await db.query("set local statement_timeout='20s';set local lock_timeout='5s'");
    await db.query(sql);
    for(const role of ['anon','authenticated','service_role']){
      const allowed=(await db.query("select has_function_privilege($1,'public.consume_app_review_document_workflow(uuid,uuid,uuid,text,text,text,uuid)','EXECUTE') ok",[role])).rows[0].ok;
      assert.equal(allowed,role==='service_role');
    }
    assert.equal((await db.query("select prosecdef from pg_proc where oid='public.consume_app_review_document_workflow(uuid,uuid,uuid,text,text,text,uuid)'::regprocedure")).rows[0].prosecdef,false);
    assert.equal((await db.query("select pg_get_functiondef('public.consume_member_document_workflow(uuid,uuid,uuid,text,text,text,uuid)'::regprocedure) body")).rows[0].body,original);
    if(!apply){await db.query('rollback');continue;}
    await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,name,[sql]]);
    await db.query("notify pgrst,'reload schema'");await db.query('commit');
    const report={at:new Date().toISOString(),version,applied:true,rehearsed:true,securityInvoker:true,
      onlyServiceRoleCanExecute:true,paidBillingFunctionUnchanged:true,sqlSha256:createHash('sha256').update(sql).digest('hex')};
    writeFileSync('.recovery-private/apple-review-2026-10-13/migration-receipt.json',JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify(report));
  }
}catch(e){await db.query('rollback').catch(()=>{});console.error(JSON.stringify({failed:true,code:e.code??'assertion',reason:'Review migration stopped; sensitive connection details omitted'}));process.exitCode=1;}
finally{await db.end();}
