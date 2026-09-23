// Approved: one operator email + one push, transient token registration, no client records.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
const receipt='.recovery-private/production-operator-outbox-20260923.json';
const marker='production-operator-outbox-20260923',email='lopezb.jl@gmail.com';
process.umask(0o077);
assert(process.argv.includes('--approved-targeted-operator-notifications'));
assert(!existsSync(receipt),'Inspect existing evidence before any retry; no automatic resend');
const report={at:new Date().toISOString(),marker,stage:'preflight',passed:false,checks:[],messagesAttempted:0};
const save=()=>writeFileSync(receipt,JSON.stringify(report,null,2),{mode:0o600});
const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
const ok=r=>{assert(!r.error,'Provider query failed: '+(r.error?.code??r.error?.status??'unknown'));return r.data;};
let db,client,token,installationId,deviceId,taskRunning=false;
async function api(path,method='GET',body,authenticated=true){
  const r=await fetch('https://api.illuminotary.com'+path,{method,headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  return {status:r.status,body:await r.json().catch(()=>null)};
}
try {
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const prod=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
  assert.equal(prod.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  db=createClient(prod.SUPABASE_URL,prod.SUPABASE_SERVICE_ROLE_KEY,options);
  const authUser=ok(await db.auth.admin.getUserById('e34fe749-3072-4bf1-bd0a-914018880972')).user;
  assert.equal(authUser.email,email);assert.equal(authUser.user_metadata.production_operator_acceptance,true);assert.equal(authUser.user_metadata.synthetic,true);
  const user=ok(await db.from('users').select('id,status').eq('supabase_user_id',authUser.id).single());assert.equal(user.status,'active');
  const stage=require('../../backend/node_modules/dotenv').parse(readFileSync('.env.staging'));
  assert.equal(stage.SUPABASE_URL,'https://oqferisuloumoojgbjde.supabase.co');
  const staging=createClient(stage.SUPABASE_URL,stage.SUPABASE_SERVICE_ROLE_KEY,options);
  const owners=ok(await staging.from('users').select('id').eq('email',email));
  const devices=ok(await staging.from('device_push_tokens').select('device_token,last_registered_at').in('user_id',owners.map(x=>x.id))
    .eq('is_active',true).eq('environment','production').eq('app_bundle_id','com.illuminote.darci').eq('provider','apns').eq('permission_status','authorized'));
  assert.equal(devices.length,1);assert(Date.now()-Date.parse(devices[0].last_registered_at)<86400000);
  assert.equal(ok(await db.from('device_push_tokens').select('id').eq('user_id',user.id).eq('is_active',true)).length,0,'Do not replace an existing production device');
  client=createClient(prod.SUPABASE_URL,prod.SUPABASE_ANON_KEY,options);
  const link=ok(await db.auth.admin.generateLink({type:'magiclink',email}));
  token=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session.access_token;
  installationId=randomUUID();Object.assign(report,{userId:user.id,installationId,stage:'registration'});
  writeFileSync(receipt,JSON.stringify(report),{flag:'wx',mode:0o600});
  const registration=await api('/notifications/devices/'+installationId,'PUT',{deviceToken:devices[0].device_token,environment:'production',permissionStatus:'authorized',appBundleId:'com.illuminote.darci',appVersion:'operator-acceptance'});
  assert.equal(registration.status,200,'Authenticated device registration');
  deviceId=ok(await db.from('device_push_tokens').select('id').eq('installation_id',installationId).eq('user_id',user.id).single()).id;
  report.deviceId=deviceId;report.checks.push('Authenticated production API device registration');save();
  assert.equal((await api('/notifications/devices/'+installationId,'PUT',{},false)).status,401);
  const jobs=[],deliveries={};
  report.jobs=jobs;report.deliveries=deliveries;
  for(const channel of ['email','push']) {
    const templateId=randomUUID(),jobId=randomUUID(),deliveryId=randomUUID();
    const metadata={synthetic:true,purpose:marker};
    ok(await db.from('notification_templates').insert({id:templateId,template_key:'production_operator_outbox_test',template_version:'20260923',channel,
      audience_scope:'registrant',subject_template:`[DARCi TEST] AWS outbox ${channel}`,body_template:'Targeted production worker verification for Jorge only. No client documents or payments changed.',body_format:'text',metadata}));
    ok(await db.from('notification_jobs').insert({id:jobId,template_id:templateId,job_kind:'transactional',channel,status:'queued',
      requested_by_user_id:user.id,dedupe_key:marker+':'+channel,payload_json:{apnsData:{route:'user_settings'}},metadata}));
    jobs.push(jobId);deliveries[channel]=deliveryId;save();
    ok(await db.from('notification_deliveries').insert({id:deliveryId,notification_job_id:jobId,target_user_id:user.id,channel,
      recipient_address:channel==='email'?email:null,device_push_token_id:channel==='push'?deviceId:null,
      recipient_display_name:'Jorge — TEST',provider:channel==='email'?'resend':'apns',status:'queued',metadata}));
  }
  report.stage='AWS dispatch';save();
  const svc=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-api').services[0];
  assert.equal(svc.deployments.length,1);assert.equal(svc.deployments[0].rolloutState,'COMPLETED');
  const definition=aws('ecs','describe-task-definition','--task-definition',svc.taskDefinition).taskDefinition;
  assert.equal(definition.containerDefinitions[0].environment.find(e=>e.name==='NOTIFICATION_OUTBOX_RUNNER_ENABLED').value,'false');
  const input={cluster:'darci-production',taskDefinition:svc.taskDefinition,launchType:'FARGATE',networkConfiguration:svc.networkConfiguration,count:1,
    startedBy:'operator-outbox-20260923',clientToken:marker,
    overrides:{containerOverrides:[{name:'api',command:['node','-e',readFileSync(new URL('./operator-outbox-task.cjs',import.meta.url),'utf8')],
      environment:[{name:'OPERATOR_OUTBOX_FIXTURE',value:JSON.stringify({marker,userId:user.id,deviceId,jobs})}]}]}};
  const task=aws('ecs','run-task','--cli-input-json',JSON.stringify(input));assert.equal(task.failures.length,0);
  report.taskArn=task.tasks[0].taskArn;taskRunning=true;report.messagesAttempted=2;save();
  console.log(JSON.stringify({stage:report.stage,evidence:receipt,task:report.taskArn}));
  let stopped;
  for(let i=0;i<120;i++){
    await new Promise(r=>setTimeout(r,5000));
    const t=aws('ecs','describe-tasks','--cluster','darci-production','--tasks',report.taskArn).tasks[0];
    if(t.lastStatus==='STOPPED'){stopped=t;taskRunning=false;break;}
    if(i%6===0)console.log(JSON.stringify({taskStatus:t.lastStatus}));
  }
  assert(stopped,'Worker timeout; inspect exact task');assert.equal(stopped.containers[0].exitCode,0,'Worker failed; do not resend');
  const push=ok(await db.from('notification_deliveries').select('status,provider_message_id,metadata').eq('id',deliveries.push).single());
  assert.equal(push.status,'accepted');assert(push.provider_message_id);assert.equal(push.metadata.workerId,marker);
  report.checks.push('AWS compiled outbox worker sent one APNs push; provider accepted; repeated targeted run sent nothing');save();
  let delivered=false;
  for(let i=0;i<40;i++){
    const events=ok(await db.from('outbound_message_events').select('event_type,metadata').eq('notification_delivery_id',deliveries.email));
    if(events.some(e=>e.event_type==='delivered'&&e.metadata.source==='resend_webhook')){delivered=true;break;}
    await new Promise(r=>setTimeout(r,3000));
  }
  assert(delivered,'Real signed Resend delivered callback missing; do not resend');
  report.checks.push('AWS outbox email and real signed Resend delivery callback');
  assert.equal((await api('/notifications/push-deliveries/'+deliveries.push+'/open','POST',{route:'user_settings'},false)).status,401);
  for(let i=0;i<2;i++)assert.equal((await api('/notifications/push-deliveries/'+deliveries.push+'/open','POST',{route:'user_settings'})).status,200);
  assert.equal(ok(await db.from('outbound_message_events').select('id').eq('provider_event_id','mobile-open:'+deliveries.push)).length,1);
  report.checks.push('Synthetic authenticated open API twice produces one event; anonymous open denied. Not a physical production-app tap.');
  report.passed=true;
} catch(e){report.errorClass=e.name;report.failure=e instanceof assert.AssertionError?e.message:'Provider operation failed; sensitive payload omitted';process.exitCode=1;}
finally {
  if(taskRunning&&report.taskArn){try{aws('ecs','stop-task','--cluster','darci-production','--task',report.taskArn,'--reason','Scoped operator acceptance timeout');}catch{report.taskStopNeedsReview=true;}}
  if(db&&installationId){
    try{
      const result=await api('/notifications/devices/'+installationId,'DELETE');assert.equal(result.status,200);
      assert.equal(ok(await db.from('device_push_tokens').select('is_active').eq('installation_id',installationId)).filter(x=>x.is_active).length,0);
      report.deviceDeactivated=true;
    }catch{report.deviceDeactivated=false;report.passed=false;process.exitCode=1;}
  }
  if(db&&report.jobs?.length) {
    // Only our unprocessed retryable fixture jobs; never leave a later general runner able to send them.
    try{ok(await db.from('notification_jobs').update({status:'canceled',canceled_at:new Date().toISOString()}).in('id',report.jobs).in('status',['queued','scheduled','failed','partially_sent']));}catch{report.fixtureCleanupNeedsReview=true;}
  }
  if(client)await client.auth.signOut({scope:'local'});
  if(existsSync(receipt))save();
  console.log(JSON.stringify({...report,evidence:receipt}));
}
