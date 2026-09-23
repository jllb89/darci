// Isolated real PDF/Storage/PostgreSQL finalization; synthetic legal prerequisites only.
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{spawn}=require('node:child_process');
const {createClient}=require('@supabase/supabase-js');
assert.equal(process.env.APP_ENV,'recovery');assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');
assert(!process.env.STRIPE_SECRET_KEY&&!process.env.RESEND_API_KEY);
process.env.BILLING_ENFORCEMENT_MODE='enforced';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ok=r=>{assert(!r.error,JSON.stringify({code:r.error?.code,message:r.error?.message}));return r.data;};
async function attempt(input){
 const assert=require('node:assert/strict');assert.equal(process.env.APP_ENV,'recovery');
 const storage=require('./dist/services/storageService'),originalUpload=storage.uploadGeneratedDocument,download=storage.downloadDocumentObject;
 if(input.fault==='upload')storage.uploadGeneratedDocument=async(...args)=>{await originalUpload(...args);process.exit(77);};
 if(input.fault==='malformed-second')storage.downloadDocumentObject=async(...args)=>String(args[0]).endsWith('/synthetic-source-1.pdf')?Buffer.from('not a PDF'):download(...args);
 const original=global.fetch;
 global.fetch=async(...args)=>{
  const url=String(args[0]);
  if(input.fault==='database'&&url.includes('/rpc/commit_hash_only_output'))return new Response(JSON.stringify({code:'ISOLATED_FAULT',message:'synthetic transaction unavailable'}),{status:503,headers:{'Content-Type':'application/json'}});
  const response=await original(...args);
  if(response.ok&&((input.fault==='output'&&url.includes('/rpc/commit_hash_only_output'))||(input.fault==='completion'&&url.includes('/rpc/complete_hash_only_package'))))process.exit(77);
  return response;
 };
 await require('./dist/services/documentFinalizationService').watermarkWithNotice({documentId:input.documentId,actorSupabaseId:input.notaryAuthId,actorRole:'notary'});
}
async function child(input){return new Promise((resolve,reject)=>{
 const source='('+attempt.toString()+')('+JSON.stringify(input)+').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(2)})';
 const p=spawn(process.execPath,['-e',source],{stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',v=>error+=v);const timer=setTimeout(()=>p.kill('SIGKILL'),90000);
 p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);resolve({code,error});});
});}
(async()=>{
 const run=randomUUID(),actors=[];
 for(const role of ['member','notary']){const email='final-crash-'+role+'-'+run+'@example.invalid';const auth=ok(await db.auth.admin.createUser({email,email_confirm:true})).user;const row=ok(await db.from('users').insert({supabase_user_id:auth.id,email,role,status:'active'}).select('id').single());actors.push({id:row.id,authId:auth.id});}
 const [owner,notary]=actors;
 const {PDFDocument}=require('pdf-lib'),p=await PDFDocument.create();p.addPage([612,792]).drawText('SYNTHETIC FINALIZATION TEST - NO LEGAL EFFECT',{x:30,y:740,size:13});const source=Buffer.from(await p.save());
 const cases=[],signals=[];
 for(const jurisdiction of ['US-CA','US-OH'])for(const fault of ['upload','output','completion','database','malformed-second']){
  const doc=ok(await db.from('documents').insert({owner_id:owner.id,document_type:'document',jurisdiction,status:'pending_notary',idn:randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}).select('id').single());
  const workflow=await require('./dist/services/illuminotarizationWorkflowService').createIlluminotarizationWorkflow({ownerUserId:owner.id,primaryDocumentId:doc.id,createdByUserId:owner.id,status:'in_review',assignedNotaryUserId:notary.id,metadata:{fixture:run}});
  const request=ok(await db.from('notarization_requests').insert({document_id:doc.id,assigned_notary_id:notary.id,status:'in_review',workflow_id:workflow.id}).select('id').single());
  ok(await db.from('meetings').insert({request_id:request.id,status:'completed'}));
  const sources=[];
  for(let index=0;index<2;index++){
   const path=owner.id+'/'+doc.id+'/synthetic-source-'+index+'.pdf';ok(await db.storage.from('documents').upload(path,source,{contentType:'application/pdf',upsert:false}));
   const version=ok(await db.from('document_versions').insert({document_id:doc.id,version:index+1,storage_path:path,file_name:'synthetic-source-'+index+'.pdf',mime_type:'application/pdf',size_bytes:source.length,created_by:owner.id}).select('id').single());
   const ack=ok(await db.from('acknowledgment_pages').insert({document_id:doc.id,jurisdiction,content:'SYNTHETIC TEST ONLY - NO LEGAL EFFECT'}).select('id').single());
   ok(await db.from('document_execution_runs').insert({document_id:doc.id,source_document_version_id:version.id,output_document_version_id:version.id,execution_kind:'acknowledgment_append',status:'completed',metadata:{acknowledgmentPageId:ack.id,acknowledgmentBatchSize:2,fixture:run}}));sources.push({id:version.id,path});
  }
  const input={documentId:doc.id,notaryAuthId:notary.authId};
  const crashed=await child({...input,fault});assert.equal(crashed.code,['database','malformed-second'].includes(fault)?2:77,'Fault '+fault+': '+crashed.error);
  for(const line of crashed.error.split('\n')){try{const signal=JSON.parse(line);if(signal.kind==='darci_critical_signal')signals.push(signal);}catch{}}
  const beforeDoc=ok(await db.from('documents').select('status').eq('id',doc.id).single());
  const control=ok(await db.from('document_release_controls').select('*').eq('document_id',doc.id).maybeSingle());
  assert.equal(beforeDoc.status,fault==='completion'?'completed':'pending_notary');assert.equal(control?.release_status??null,fault==='completion'?'pending':null);
  const committed=ok(await db.from('document_versions').select('*').eq('document_id',doc.id).gt('version',2).order('id'));
  const recovered=await child(input);assert.equal(recovered.code,0,'Recovery '+fault+': '+recovered.error);
  const versions=ok(await db.from('document_versions').select('*').eq('document_id',doc.id).eq('is_final',true).order('id'));assert.equal(versions.length,2);
  for(const old of committed){assert(versions.some(v=>v.id===old.id&&v.storage_path===old.storage_path),'Committed output replaced');}
  const after=ok(await db.from('document_release_controls').select('*').eq('document_id',doc.id).single());assert.equal(after.release_status,'billing_held');
  assert.equal(ok(await db.from('illuminotarization_workflows').select('status').eq('id',workflow.id).single()).status,'completed','Workflow completion recovered');
  const hashes=ok(await db.from('document_hash_records').select('*').eq('document_id',doc.id).order('id'));assert.equal(hashes.length,2);
  for(const v of versions){const bytes=Buffer.from(await ok(await db.storage.from('documents').download(v.storage_path)).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),hashes.find(h=>h.document_version_id===v.id).hash);await require('./dist/services/pdfProcessingService').validateRenderedPdf(bytes,1);}
  for(const s of sources)assert(Buffer.from(await ok(await db.storage.from('documents').download(s.path)).arrayBuffer()).equals(source));
  assert.equal((await child(input)).code,0,'Completed retry');
  assert.deepEqual(ok(await db.from('document_versions').select('*').eq('document_id',doc.id).eq('is_final',true).order('id')),versions);
  assert.deepEqual(ok(await db.from('document_hash_records').select('*').eq('document_id',doc.id).order('id')),hashes);
  assert.deepEqual(ok(await db.from('document_release_controls').select('*').eq('document_id',doc.id).single()),after);
  cases.push({jurisdiction,fault,documentId:doc.id,readableFinals:2,reusedCommittedOutputs:committed.length,release:'billing_held',sourceUnchanged:true,duplicateRetryUnchanged:true});
  console.log('PROGRESS '+JSON.stringify({jurisdiction,fault,passed:true}));
 }
 console.log('RESULT '+JSON.stringify({passed:true,cases,signals,scope:'Real isolated native PDF/Storage/database finalization and abrupt exits; acknowledgment/session prerequisites synthetic, not legal or physical-device acceptance'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
