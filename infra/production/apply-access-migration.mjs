import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {Client}=require('../../backend/node_modules/pg');
const target=process.argv.find(a=>a.startsWith('--target='))?.slice(9);
assert.equal(target,'production','This reviewed application is approved for production only; staging requires new authorization');
assert(process.argv.includes('--apply-reviewed-access-fix'));
const project='jdrgluisxhgegdsesman';
const secret=JSON.parse(JSON.parse(execFileSync('aws',['secretsmanager','get-secret-value','--secret-id',`/darci/${target}/recovery-source`,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).SecretString);
assert.equal(secret.SUPABASE_URL,`https://${project}.supabase.co`);
const url=new URL(secret.DATABASE_URL);url.hostname='aws-0-us-east-1.pooler.supabase.com';url.username=`postgres.${project}`;url.port='5432';url.search='';
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,ca:readFileSync('infra/recovery/supabase-ca.crt','utf8')},connectionTimeoutMillis:15000});
const version='20260923190000',name='close_backend_only_table_access';
const sql=readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
const assertions=readFileSync('supabase/tests/backend_only_tables.test.sql','utf8').replace(/^begin;\s*/,'').replace(/rollback;\s*$/,'');
const tables=['template_artifacts','notary_profile_applications','notary_identity_document_types','notary_identity_document_fields'];
const fingerprints=async()=>{
  const result={};
  for(const t of tables) result[t]=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(row_to_json(t)::text,E'\\n' order by row_to_json(t)::text),'')) fingerprint from public.${t} t`)).rows[0];
  return result;
};
try {
  await db.connect();
  const recorded=(await db.query('select statements from supabase_migrations.schema_migrations where version=$1',[version])).rows[0];
  if(recorded){assert.equal(recorded.statements.join('\n'),sql);console.log(JSON.stringify({target,alreadyApplied:true}));}
  else {
    const before=await fingerprints();
    for(const apply of [false,true]) {
      await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='20s'");
      // Prevent concurrent edits to these exact small configuration/application tables
      // during the integrity check. Existing data is never rewritten.
      await db.query(`lock table ${tables.map(t=>'public.'+t).join(',')} in share row exclusive mode`);
      const locked=await fingerprints();
      await db.query(sql);await db.query(assertions);
      assert.deepEqual(await fingerprints(),locked,'Migration changed stored rows');
      if(apply){
        await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,name,[sql]]);
        await db.query("notify pgrst,'reload schema'");await db.query('commit');
      } else await db.query('rollback');
    }
    const after=await fingerprints();
    const report={at:new Date().toISOString(),target,version,sqlSha256:createHash('sha256').update(sql).digest('hex'),rehearsalPassed:true,applied:true,before,after};
    const dir=mkdtempSync(`.recovery-private/${target}-access-fix-`);writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify({...report,evidence:dir}));
  }
}catch(error){await db.query('rollback').catch(()=>{});console.error(JSON.stringify({passed:false,target,code:error.code||'assertion',reason:error instanceof assert.AssertionError?error.message:'Access migration stopped; credentials omitted'}));process.exitCode=1;}finally{await db.end();}
