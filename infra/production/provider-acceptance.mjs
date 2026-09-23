// Negative/correctly-closed callback acceptance. Never sends a valid SMS or charges a card.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {verifyPreparedStripeEndpoint,productionWebhookUrl} from './provider-setup.mjs';
const require=createRequire(import.meta.url),Stripe=require('../../backend/node_modules/stripe'),{Webhook}=require('../../backend/node_modules/standardwebhooks');
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const version=stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',version).SecretString);
assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');assert.equal(secret.STRIPE_LIVE_MODE_ENABLED,'false');
const checks=[];
async function request(path,expected,headers={},body='{}'){
  const r=await fetch('https://api.illuminotary.com'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body,signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,expected,`${path} expected ${expected}`);checks.push({path,status:r.status});
}
await request('/webhooks/stripe',400);
await request('/webhooks/supabase/auth/send-sms',400);
const hook=new Webhook(secret.SUPABASE_AUTH_SMS_HOOK_SECRET.replace(/^v\d+,/,''));
const id='production-negative-'+randomUUID(),body=JSON.stringify({user:{phone:'+15555550123'},sms:{otp:''}}),now=new Date();
const headers=(date,payload=body)=>({'webhook-id':id,'webhook-timestamp':String(Math.floor(date.getTime()/1000)),'webhook-signature':hook.sign(id,date,payload)});
await request('/webhooks/supabase/auth/send-sms',401,headers(new Date(Date.now()-3600000)),body);
await request('/webhooks/supabase/auth/send-sms',401,headers(now),body+' ');
await request('/webhooks/supabase/auth/send-sms',400,headers(now),body); // Valid signature, invalid empty OTP, no send.
const stripe=new Stripe(secret.STRIPE_SECRET_KEY,{apiVersion:'2026-07-29.dahlia',maxNetworkRetries:1,timeout:15000});
const endpoints=await stripe.webhookEndpoints.list({limit:100});assert(!endpoints.has_more);
const endpoint=endpoints.data.filter(e=>e.url===productionWebhookUrl);assert.equal(endpoint.length,1);verifyPreparedStripeEndpoint(endpoint[0]);
const services=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-api','darci-production-worker','darci-production-web').services;
const runtime=[];
for(const service of services){
  assert.equal(service.pendingCount,0);assert.equal(service.runningCount,service.desiredCount);assert.equal(service.deployments.length,1);assert.equal(service.deployments[0].rolloutState,'COMPLETED');
  const task=aws('ecs','describe-task-definition','--task-definition',service.taskDefinition).taskDefinition;
  const c=task.containerDefinitions[0];
  if(c.name!=='web'){
    for(const name of ['STRIPE_LIVE_MODE_ENABLED','NOTIFICATION_OUTBOX_RUNNER_ENABLED','STRIPE_WEBHOOK_RUNNER_ENABLED'])assert.equal(c.environment.find(e=>e.name===name).value,'false');
    for(const s of c.secrets)assert(s.valueFrom.endsWith('::'+version),'Secret version drift');
  }
  runtime.push({service:service.serviceName,taskDefinition:service.taskDefinition,running:service.runningCount,image:c.image});
}
const report={at:new Date().toISOString(),passed:true,checks,runtime,secretVersion:version,stripeEndpoint:endpoint[0].id,stripeEndpointEnabled:false,
  smsSent:0,chargesCreated:0,scope:'Callback signatures/closed billing and healthy rollout only. Valid-event replay, device receipt, live billing and client acceptance are separate.'};
const dir=mkdtempSync('.recovery-private/production-provider-acceptance-');writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify({...report,evidence:dir}));
