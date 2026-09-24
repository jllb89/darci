// One real upload-ready email to the approved operator, plus a scheduled in-app probe.
// No signatures, notary submission, additional payment, SMS or APNs dispatch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
assert(process.argv.includes('--approved-operator-product-email'));
process.umask(0o077);
const evidence='.recovery-private/production-product-notification-20260923.json';
const resumeScheduler=process.argv.includes('--resume-scheduler-only');
assert(resumeScheduler?existsSync(evidence):!existsSync(evidence),'Inspect existing receipt; never automatically repeat the email');
const report=resumeScheduler?JSON.parse(readFileSync(evidence)):{at:new Date().toISOString(),stage:'preflight',passed:false};
if(resumeScheduler){
  assert.equal(report.productEmailDelivered,true);assert.equal(report.repeatedProductActionCreatedNoJobs,true);
  assert.equal(report.passed,false);assert(!report.schedulerProbeJobId,'Inspect existing scheduled probe instead of creating another');
  report.previousProbeFailure=report.failure;delete report.failure;delete report.errorClass;
}
const save=()=>writeFileSync(evidence,JSON.stringify(report,null,2),{mode:0o600});
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
const ok=r=>{assert(!r.error,'Provider operation failed: '+(r.error?.code??'unknown'));return r.data;};
let client,db;
try {
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const service=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-worker').services[0];
  const def=aws('ecs','describe-task-definition','--task-definition',service.taskDefinition).taskDefinition;
  const env=Object.fromEntries(def.containerDefinitions[0].environment.map(e=>[e.name,e.value]));
  assert.equal(env.NOTIFICATION_OUTBOX_RUNNER_ENABLED,'true');assert.equal(env.NOTIFICATION_PROVIDER_APNS_ENABLED,'false');assert.equal(env.BILLING_LIVE_ACCESS_MODE,'closed');
  const p=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
  assert.equal(p.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  db=createClient(p.SUPABASE_URL,p.SUPABASE_SERVICE_ROLE_KEY,options);
  const userId='b85bfa13-0e4d-4766-b691-180b904f57a9',email='lopezb.jl@gmail.com';
  const user=ok(await db.from('users').select('id,email,status,supabase_user_id').eq('id',userId).single());
  assert.equal(user.email,email);assert.equal(user.status,'active');
  const identity=ok(await db.auth.admin.getUserById(user.supabase_user_id)).user;
  assert.equal(identity.user_metadata.synthetic,true);assert.equal(identity.user_metadata.production_operator_acceptance,true);
  assert.equal(ok(await db.from('device_push_tokens').select('id').eq('user_id',userId).eq('is_active',true)).length,0,'No push registration expected in this email-only drill');
  assert.equal(ok(await db.from('notification_jobs').select('id').in('status',['queued','scheduled','processing','failed','partially_sent'])).length,0);
  const bytes=readFileSync('.recovery-private/production-fixture-d25ecf0c-1d9b-413f-9163-64629ff568c8/documents.pdf');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),'bb5c480181d41aa712fe223788fe48b72cd10b316e75be78bcdc9c86b655b104');
  client=createClient(p.SUPABASE_URL,p.SUPABASE_ANON_KEY,options);
  const link=ok(await db.auth.admin.generateLink({type:'magiclink',email}));
  const token=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session.access_token;
  const api=async(path,body)=>{
    const r=await fetch('https://api.illuminotary.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
    const data=await r.json();assert(r.ok,`Product API ${path} failed: ${r.status} ${data.error??''}`);return data;
  };
  if(!resumeScheduler){
  writeFileSync(evidence,JSON.stringify(report),{flag:'wx',mode:0o600});
  const created=await api('/documents',{fileName:'[DARCi TEST] UNSIGNED notification acceptance.pdf',fileSize:bytes.length,mimeType:'application/pdf',documentType:'notarize_document',productFlowMode:'notarize_document',jurisdiction:'US-CA',documentDescription:'[DARCi TEST] Unsigned notification acceptance. No legal effect. Operator only.',requesterName:'Jorge - TEST',requesterEmail:email});
  report.documentId=created.document.id;report.versionId=created.version.id;report.stage='upload';save();
  assert.equal(created.upload.bucket,'documents');assert(created.upload.path.startsWith(userId+'/'+report.documentId+'/'));
  ok(await client.storage.from(created.upload.bucket).uploadToSignedUrl(created.upload.path,created.upload.token,bytes,{contentType:'application/pdf'}));
  report.stage='product action sends one operator email';save();
  await api(`/documents/${report.documentId}/upload-finalize`,{documentVersionId:report.versionId});
  const jobs=ok(await db.from('notification_jobs').select('id,status,channel').eq('document_id',report.documentId));
  report.productJobs=jobs;save();
  const deliveries=ok(await db.from('notification_deliveries').select('id,notification_job_id,target_user_id,recipient_address,channel,provider,status,metadata').in('notification_job_id',jobs.map(j=>j.id)));
  assert(deliveries.every(d=>d.target_user_id===userId));
  const emails=deliveries.filter(d=>d.channel==='email');assert.equal(emails.length,1);assert.equal(emails[0].recipient_address,email);assert.equal(emails[0].provider,'resend');
  report.emailDeliveryId=emails[0].id;save();
  let callback=false;
  for(let i=0;i<20;i++){
    const events=ok(await db.from('outbound_message_events').select('event_type,metadata').eq('notification_delivery_id',emails[0].id));
    if(events.some(e=>e.event_type==='delivered'&&e.metadata?.source==='resend_webhook')){callback=true;break;}
    await new Promise(r=>setTimeout(r,3000));
  }
  assert(callback,'Signed delivery callback not observed; do not resend');report.productEmailDelivered=true;save();
  await api(`/documents/${report.documentId}/upload-finalize`,{documentVersionId:report.versionId});
  const repeated=ok(await db.from('notification_jobs').select('id').eq('document_id',report.documentId));
  assert.deepEqual(repeated.map(j=>j.id).sort(),jobs.map(j=>j.id).sort());report.repeatedProductActionCreatedNoJobs=true;
  save();
  }
  const jobs=ok(await db.from('notification_jobs').select('id,status,channel').eq('document_id',report.documentId));
  // Independent scheduler probe: in-app only, never an extra provider email/push.
  // Upload-ready has email/push templates, not an in-app companion. Never change
  // production templates to satisfy the probe; create an explicitly synthetic one.
  const probeId=randomUUID(),deliveryId=randomUUID(),templateId=randomUUID();Object.assign(report,{schedulerProbeJobId:probeId,schedulerProbeDeliveryId:deliveryId,schedulerProbeTemplateId:templateId,stage:'scheduled in-app probe'});save();
  const metadata={synthetic:true,purpose:'production-product-notification-20260923-scheduler'};
  ok(await db.from('notification_templates').insert({id:templateId,template_key:'production_operator_scheduler_test',template_version:'20260923',channel:'in_app',audience_scope:'registrant',subject_template:'[DARCi TEST] Scheduled in-app probe',body_template:'Unsigned operator fixture only. No external message.',body_format:'text',metadata}));
  ok(await db.from('notification_jobs').insert({id:probeId,template_id:templateId,document_id:report.documentId,requested_by_user_id:userId,job_kind:'status_update',channel:'in_app',status:'scheduled',scheduled_for:new Date(Date.now()+10000).toISOString(),dedupe_key:metadata.purpose,payload_json:{},metadata}));
  ok(await db.from('notification_deliveries').insert({id:deliveryId,notification_job_id:probeId,target_user_id:userId,channel:'in_app',provider:'internal',status:'queued',metadata}));
  let scheduled=false;
  for(let i=0;i<25;i++){
    await new Promise(r=>setTimeout(r,5000));
    const events=ok(await db.from('outbound_message_events').select('event_type,metadata').eq('notification_delivery_id',deliveryId));
    if(events.some(e=>e.metadata?.workerId==='worker-scheduled')){scheduled=true;break;}
  }
  assert(scheduled,'Scheduled worker probe not processed; inspect before retrying');
  report.scheduledWorkerProcessed=true;
  const final=ok(await db.from('notification_jobs').select('id,status').in('id',[...jobs.map(j=>j.id),probeId]));
  assert(final.every(j=>['completed','sent','suppressed'].includes(j.status)),'Fixture jobs left pending');
  const doc=ok(await db.from('documents').select('status').eq('id',report.documentId).single());assert.equal(doc.status,'pending_review');
  Object.assign(report,{stage:'complete',passed:true,completedAt:new Date().toISOString(),documentUnsigned:true,finalJobs:final,inboxReceiptConfirmed:false});
}catch(e){report.errorClass=e.name;report.failure=e instanceof assert.AssertionError?e.message:'Operation failed; sensitive details omitted';process.exitCode=1;}
finally{
  if(client)await client.auth.signOut({scope:'local'});
  if(existsSync(evidence))save();
  console.log(JSON.stringify({...report,evidence}));
}
