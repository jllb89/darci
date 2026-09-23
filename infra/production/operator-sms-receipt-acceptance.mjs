// One approved real operator OTP. --inspect only polls; never automatically resend.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
process.umask(0o077);
const send=process.argv.includes('--send-approved-operator-otp');
const retry=process.argv.includes('--retry-after-reviewed-access-denial');
assert(!retry||send);
assert(send||process.argv.includes('--inspect'));
const file='.recovery-private/production-operator-sms-receipt-20260923.json';
const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const ok=r=>{assert(!r.error,'Scoped provider check failed');return r.data;};
let report;
const save=()=>writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600});
try {
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const service=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-api').services[0];
  assert.equal(service.deployments.length,1);assert.equal(service.deployments[0].rolloutState,'COMPLETED');
  const task=aws('ecs','describe-task-definition','--task-definition',service.taskDefinition).taskDefinition;
  const env=Object.fromEntries(task.containerDefinitions[0].environment.map(e=>[e.name,e.value]));
  assert.equal(env.SUPABASE_AUTH_SMS_CONFIGURATION_SET,'darci-production-auth-sms');
  const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
  assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const opts={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,opts);
  const user=ok(await admin.auth.admin.getUserById('e34fe749-3072-4bf1-bd0a-914018880972')).user;
  assert.equal(user.user_metadata.production_operator_acceptance,true);assert.equal(user.user_metadata.synthetic,true);
  assert.equal(user.email,'lopezb.jl@gmail.com');assert.equal(user.phone,'525542850675');
  const phone='+'+user.phone,phoneHash=createHash('sha256').update(user.phone).digest('hex').slice(0,16);
  if(send) {
    let deniedAttempt;
    if(retry){
      const prior=JSON.parse(readFileSync(file));assert.equal(prior.requested,false);assert(!prior.priorDeniedAttempt);
      const logs=aws('logs','filter-log-events','--log-group-name','/ecs/darci-production-api','--start-time',String(Date.parse(prior.startedAt)),'--filter-pattern','auth_sms_handoff').events??[];
      const handoffs=logs.flatMap(e=>{try{return [JSON.parse(e.message)];}catch{return [];}}).filter(e=>e.kind==='auth_sms_handoff'&&e.phoneHash===phoneHash);
      assert.equal(handoffs.length,1);assert.equal(handoffs[0].outcome,'failed');assert.equal(handoffs[0].providerFailure,'AccessDeniedException');
      deniedAttempt={...prior,confirmedFailure:'AccessDeniedException',noCarrierHandoff:true};
    }
    report={startedAt:new Date().toISOString(),requested:false,phoneSuffix:'0675',carrierReceiptObserved:false,deviceDelivered:false,inboxReceiptConfirmed:false};
    if(deniedAttempt)report.priorDeniedAttempt=deniedAttempt;
    writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600,flag:retry?'w':'wx'});
    const client=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,opts);
    const result=await client.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});
    report.requested=!result.error;report.errorCode=result.error?.code??null;report.errorStatus=result.error?.status??null;save();
    assert(!result.error,'OTP request failed; inspect without resending');
    console.log(JSON.stringify({requested:true,phoneSuffix:'0675',otpPrinted:false}));
  } else report=JSON.parse(readFileSync(file));
  assert(report.requested,'Earlier request did not succeed; do not resend automatically');
  for(let i=0;i<12;i++) {
    // Lambda's text logger prefixes the sanitized JSON with timestamp/request ID.
    const events=aws('logs','filter-log-events','--log-group-name','/darci/production/auth-sms-delivery','--start-time',String(Date.parse(report.startedAt)),'--filter-pattern',`"${phoneHash}"`).events??[];
    const receipts=events.flatMap(e=>{try{return [JSON.parse(e.message.slice(e.message.indexOf('{')))];}catch{return [];}}).filter(e=>e.kind==='auth_sms_delivery'&&e.environment==='production'&&e.phoneHash===phoneHash);
    if(receipts.length) {
      report.events=receipts.map(({messageId,status,deviceDelivered,isFinal})=>({messageId,status,deviceDelivered,isFinal}));
      const ids=[...new Set(receipts.map(e=>e.messageId))];
      const claims=ok(await admin.from('auth_sms_hook_receipts').select('provider_message_id,status').in('provider_message_id',ids).gte('created_at',report.startedAt));
      assert.equal(ids.length,1,'Multiple sends found in the inspection window; review individually');
      assert.equal(claims.length,1);assert.equal(claims[0].status,'accepted');
      report.carrierReceiptObserved=true;report.deviceDelivered=receipts.some(e=>e.deviceDelivered===true);save();
      if(report.deviceDelivered||receipts.some(e=>e.isFinal))break;
    }
    await new Promise(r=>setTimeout(r,5000));
  }
  save();console.log(JSON.stringify({...report,evidence:file,scope:'Provider OTP request and carrier callback, not a completed user login'}));
}catch(e){console.error(JSON.stringify({passed:false,errorClass:e.name,evidence:file,reason:'Inspect receipt and deployed configuration; do not resend automatically'}));process.exitCode=1;}
