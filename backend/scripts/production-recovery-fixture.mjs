// Approved unsigned synthetic recovery objects only; never final legal evidence.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),PDFDocument=require('pdfkit'),{createClient}=require('@supabase/supabase-js');
process.umask(0o077);
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const hash=b=>createHash('sha256').update(b).digest('hex');
const prepare=process.argv.includes('--prepare-local');
const folder=prepare?path.join(root,'.recovery-private','production-fixture-'+randomUUID()):path.resolve(process.argv[2]??'');
assert(folder.startsWith(path.join(root,'.recovery-private','production-fixture-')));
let stage='prepare';
try {
  if(prepare){
    await mkdir(folder,{recursive:true,mode:0o700});
    const fixture={id:randomUUID(),createdAt:new Date().toISOString(),objects:[]};
    for(const bucket of ['documents','signatures','notarized-copies']) {
      const pdf=new PDFDocument({size:'LETTER',margin:54});const chunks=[];
      const bytes=new Promise(resolve=>{pdf.on('data',b=>chunks.push(b));pdf.on('end',()=>resolve(Buffer.concat(chunks)));});
      for(let page=1;page<=2;page++){
        if(page>1)pdf.addPage();
        pdf.fontSize(24).text('SYNTHETIC RECOVERY TEST');
        pdf.moveDown().fontSize(18).text('UNSIGNED - NO LEGAL EFFECT');
        pdf.moveDown().fontSize(12).text(`Private storage bucket: ${bucket}\nFixture: ${fixture.id}\nPage ${page} of 2\n\nThis file is test data only. It is not a signature, acknowledgment, notarization or customer document.\n\nRecovery must preserve every byte and both readable pages.`);
      }
      pdf.end();const data=await bytes;await writeFile(path.join(folder,bucket+'.pdf'),data);
      fixture.objects.push({bucket,sha256:hash(data),bytes:data.length});
    }
    await writeFile(path.join(folder,'fixture.json'),JSON.stringify(fixture,null,2));
    console.log(JSON.stringify({prepared:true,folder,pdfs:3,unsigned:true}));
  }else{
    const verify=process.argv.includes('--verify-production');
    assert(verify||process.argv.includes('--approve-production-fixtures'));
    const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
    assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
    const config=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app').SecretString);
    assert.equal(config.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
    const db=createClient(config.SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const ok=r=>{if(r.error){const e=new Error('Fixture operation failed');e.code=r.error.code??r.error.status;throw e;}return r.data;};
    const fixture=JSON.parse(await readFile(path.join(folder,'fixture.json'),'utf8'));
    if(verify){
      assert(fixture.appliedAt&&fixture.authId&&fixture.documentId);
      const doc=ok(await db.from('documents').select('id,status,owner_id').eq('id',fixture.documentId).single());
      assert.equal(doc.owner_id,fixture.ownerId);assert.equal(doc.status,'draft');
      const version=ok(await db.from('document_versions').select('is_final,storage_path').eq('id',fixture.versionId).single());assert.equal(version.is_final,false);
      const counts={};
      for(const table of ['users','documents','document_versions','signatures','notarization_requests','document_hash_records','billing_subscriptions','notification_jobs']){
        const r=await db.from(table).select('id',{head:true,count:'exact'});ok(r);counts[table]=r.count;
        assert.equal(r.count,['users','documents','document_versions'].includes(table)?1:0);
      }
      for(const object of fixture.objects){
        const data=Buffer.from(await ok(await db.storage.from(object.bucket).download(object.storagePath)).arrayBuffer());assert.equal(hash(data),object.sha256);
      }
      const result={verifiedAt:new Date().toISOString(),sourceFixtureUnchanged:true,exactObjects:3,counts};
      await writeFile(path.join(folder,'source-verification.json'),JSON.stringify(result,null,2));
      console.log(JSON.stringify(result));
      process.exit(0);
    }
    assert(!fixture.authId,'Fixture already applied; inspect receipt instead of duplicating it');
    for(const table of ['users','documents','signatures','billing_subscriptions']){
      const r=await db.from(table).select('id',{head:true,count:'exact'});ok(r);assert.equal(r.count,0,'Fresh production fixture baseline changed');
    }
    const billing=ok(await db.from('billing_runtime_configuration').select('stripe_environment,live_activation_approved').single());
    assert.equal(billing.stripe_environment,'live');assert.equal(billing.live_activation_approved,false);
    const save=()=>writeFile(path.join(folder,'fixture.json'),JSON.stringify(fixture,null,2));
    stage='create synthetic auth';
    const email=`production-recovery-${fixture.id}@example.invalid`;
    fixture.authId=ok(await db.auth.admin.createUser({email,email_confirm:true,user_metadata:{synthetic_recovery_test:true}})).user.id;await save();
    stage='create synthetic member';
    const existing=ok(await db.from('users').select('id').eq('supabase_user_id',fixture.authId).maybeSingle());
    fixture.ownerId=(existing??ok(await db.from('users').insert({supabase_user_id:fixture.authId,email,role:'member',status:'active'}).select('id').single())).id;await save();
    stage='create unsigned draft';
    fixture.documentId=ok(await db.from('documents').insert({owner_id:fixture.ownerId,status:'draft',document_type:'document',jurisdiction:'US-CA'}).select('id').single()).id;await save();
    for(const object of fixture.objects){
      stage=`upload synthetic ${object.bucket}`;
      const bytes=await readFile(path.join(folder,object.bucket+'.pdf'));assert.equal(hash(bytes),object.sha256);
      object.storagePath=`${fixture.ownerId}/${fixture.documentId}/SYNTHETIC-RECOVERY-${object.bucket}.pdf`;
      ok(await db.storage.from(object.bucket).upload(object.storagePath,bytes,{contentType:'application/pdf',upsert:false}));await save();
      const returned=Buffer.from(await ok(await db.storage.from(object.bucket).download(object.storagePath)).arrayBuffer());assert.equal(hash(returned),object.sha256);
      if(object.bucket==='documents'){
        fixture.versionId=ok(await db.from('document_versions').insert({document_id:fixture.documentId,version:1,storage_path:object.storagePath,file_name:'SYNTHETIC RECOVERY - UNSIGNED - NO LEGAL EFFECT.pdf',mime_type:'application/pdf',size_bytes:object.bytes,is_final:false,created_by:fixture.ownerId}).select('id').single()).id;await save();
      }
    }
    fixture.appliedAt=new Date().toISOString();await save();
    console.log(JSON.stringify({applied:true,folder,objects:fixture.objects.length,unsigned:true,notificationsSent:false,payments:false,finalEvidenceCreated:false}));
  }
}catch(e){console.error(JSON.stringify({failed:true,stage,code:e.code??'FIXTURE_CHECK_FAILED',folder}));process.exitCode=1;}
