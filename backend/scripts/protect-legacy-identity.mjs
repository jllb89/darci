// Explicit operator-only, frozen-plan legacy protection. Never prints identity values.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
const flags=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];}));
assert(['plan','rehearse','apply'].includes(flags.mode));
const local=flags.target==='isolated',root=local?'/app':path.resolve(new URL('..',import.meta.url).pathname);
assert(local || flags.target==='staging');
assert(path.isAbsolute(flags.plan??''));
process.umask(0o077);
const require=createRequire(path.join(root,'package.json'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const tables=['meeting_checkins','identity_verification_events'];
let config={...process.env},ssl;
if(local){assert.equal(process.env.APP_ENV,'recovery');assert.equal(new URL(config.DATABASE_URL).hostname,'db');}
else {
  config=JSON.parse(JSON.parse(execFileSync('aws',['secretsmanager','get-secret-value','--secret-id','/darci/staging/app','--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).SecretString);
  assert.equal(new URL(config.SUPABASE_URL).hostname,'oqferisuloumoojgbjde.supabase.co');
  const pooler=new URL((await readFile(path.join(root,'../supabase/.temp/pooler-url'),'utf8')).trim());
  assert.equal(pooler.hostname,'aws-1-us-east-1.pooler.supabase.com');assert.equal(pooler.username,'postgres.oqferisuloumoojgbjde');
  const u=new URL(config.DATABASE_URL);u.hostname=pooler.hostname;u.username=pooler.username;u.port='5432';u.searchParams.delete('sslmode');config.DATABASE_URL=u.toString();
  ssl={rejectUnauthorized:true,ca:await readFile(path.join(root,'../infra/recovery/supabase-ca.crt'),'utf8')};
}
Object.assign(process.env,{IDENTITY_FIELD_ENCRYPTION_KEY:config.IDENTITY_FIELD_ENCRYPTION_KEY,IDENTITY_FIELD_ENCRYPTION_KEY_ID:config.IDENTITY_FIELD_ENCRYPTION_KEY_ID});
const {encryptIdentityValue,decryptIdentityValue,isProtectedIdentityConfigured}=require(path.join(root,'dist/services/protectedIdentityService.js'));
assert(isProtectedIdentityConfigured());
const db=new(require('pg').Client)({connectionString:config.DATABASE_URL,ssl,application_name:'darci-approved-legacy-identity-protection',statement_timeout:30000});
const protectedTables=['documents','document_versions','signatures','acknowledgment_pages','document_hash_records','document_release_controls','meeting_artifacts','meetings'];
async function fingerprints(){const result={};for(const t of protectedTables)result[t]=hash((await db.query(`select * from public.${t} order by id`)).rows);return result;}
let transaction=false;
try{
  await db.connect();await db.query(flags.mode==='plan'?'begin isolation level repeatable read read only':'begin isolation level serializable');transaction=true;
  const rows=[];
  for(const table of tables){const result=await db.query(`select * from public.${table} where nullif(metadata#>>'{identityDocument,maskedIdentifier}','') is not null order by id ${flags.mode==='plan'?'':'for update'}`);for(const row of result.rows)rows.push({table,row});}
  const inventory=rows.map(({table,row})=>({table,id:row.id,rowHash:hash(row)}));
  const plan={operation:'phase1-legacy-identity-protection-20260922',count:44,inventory,fingerprint:hash(inventory)};
  assert.equal(rows.length,44,'Frozen authorization covers exactly 44 existing copies');
  assert.equal(rows.filter(x=>x.table===tables[0]).length,22);assert.equal(rows.filter(x=>x.table===tables[1]).length,22);
  if(flags.mode==='plan'){
    assert(!local,'Freeze the exact authorized staging inventory');await writeFile(flags.plan,JSON.stringify(plan,null,2),{mode:0o600});await db.query('rollback');transaction=false;
    console.log(JSON.stringify({planned:44,fingerprint:plan.fingerprint}));
  }else{
    const frozen=JSON.parse(await readFile(flags.plan,'utf8'));assert.deepEqual(plan,frozen,'Legacy row changed since approved inventory; refuse mutation');
    if(flags.mode==='rehearse')assert(local,'Rehearsal must run on isolated restored application');
    if(flags.mode==='apply'){
      assert(!local,'Use rehearsal for local copy');
      const rehearsal=JSON.parse(await readFile(flags.rehearsal,'utf8'));
      assert(rehearsal.rolledBack && rehearsal.protectedTablesUnchanged && rehearsal.decryptionVerified===44);
      assert.equal(rehearsal.fingerprint,frozen.fingerprint);
    }
    const before=await fingerprints();
    const initial=(await db.query('select count(*)::int as n from private.identity_document_values')).rows[0].n;
    for(const {table,row} of rows){
      const actor=table===tables[0]?row.recorded_by_user_id:row.verified_by_user_id;
      assert(actor && row.meeting_id && row.meeting_participant_id);
      const id=randomUUID(),value=row.metadata.identityDocument.maskedIdentifier;
      assert.equal(typeof value,'string');assert(Buffer.byteLength(value)<=4096);
      const envelope=encryptIdentityValue(value,id,row.meeting_id);
      assert.equal(decryptIdentityValue(envelope,id,row.meeting_id),value);
      const metadata=structuredClone(row.metadata);delete metadata.identityDocument.maskedIdentifier;
      assert(!metadata.identityDocument.protectedIdentityId,'Never replace an existing protected reference');
      metadata.identityDocument.protectedIdentityId=id;metadata.identityDocument.identifierStorage='restricted_encrypted';
      await db.query('insert into private.identity_document_values(id,meeting_id,participant_id,recorded_by,encrypted_value,key_id) values($1,$2,$3,$4,$5,$6)',[id,row.meeting_id,row.meeting_participant_id,actor,envelope,envelope.keyId]);
      const updated=(await db.query(`update public.${table} set metadata=$2 where id=$1 returning *`,[row.id,metadata])).rows[0];
      // Existing touch_updated_at triggers remain enabled and truthful.
      assert.deepEqual({...updated,metadata:row.metadata,updated_at:row.updated_at},row,'Only metadata and the existing update timestamp may change');
      const restored=structuredClone(metadata);delete restored.identityDocument.protectedIdentityId;delete restored.identityDocument.identifierStorage;
      restored.identityDocument.maskedIdentifier=value;
      assert.deepEqual(restored,row.metadata,'All other metadata including GPS/notes must remain exact');
      const persisted=(await db.query('select * from private.identity_document_values where id=$1',[id])).rows[0];
      assert.equal(decryptIdentityValue(persisted.encrypted_value,id,row.meeting_id),value);
      assert.equal(persisted.retention_until,null);assert.equal(persisted.legal_hold,false);
      await db.query('insert into public.audit_events(actor_id,entity_type,entity_id,action,metadata) values($1,$2,$3,$4,$5)',[null,table,row.id,'identity.legacy_protected',{operation:frozen.operation,approvedBy:'Jorge',operator:'approved_cli_backfill',originalRecordedBy:actor,sourceTable:table,protectedIdentityId:id,beforeHash:hash(row),afterHash:hash(updated),keyId:envelope.keyId,noAutomaticDeletion:true}]);
    }
    assert.deepEqual(await fingerprints(),before);
    assert.equal((await db.query('select count(*)::int as n from private.identity_document_values')).rows[0].n,initial+44);
    assert.equal((await db.query("select count(*)::int as n from audit_events where action='identity.legacy_protected' and metadata->>'operation'=$1",[frozen.operation])).rows[0].n,44);
    if(flags.mode==='rehearse')await db.query('rollback');else await db.query('commit');transaction=false;
    const report={operation:frozen.operation,fingerprint:frozen.fingerprint,decryptionVerified:44,protectedTablesUnchanged:true,rolledBack:flags.mode==='rehearse',committed:flags.mode==='apply',at:new Date().toISOString(),pdfsChanged:false,automaticDeletion:false};
    await writeFile(flags.report,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
  }
}catch(error){if(transaction)await db.query('rollback').catch(()=>{});console.error(JSON.stringify({status:'failed',code:error.code??'IDENTITY_BACKFILL_ASSERTION',message:'Protected backfill failed; no sensitive diagnostics emitted'}));process.exitCode=1;}
finally{await db.end();}
