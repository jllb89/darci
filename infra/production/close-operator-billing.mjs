// Only after the exact paid acceptance succeeds. No charge, refund or provider change.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {withClosedOperatorBilling,operatorUserId,operatorPriceCode} from './operator-billing-setup.mjs';
process.umask(0o077);
assert(process.argv.includes('--close-completed-operator-test'));
const dir=realpathSync(process.argv[2]);assert(dir.startsWith(resolve('.recovery-private')+'/production-operator-billing-'));
const receipt=JSON.parse(readFileSync(dir+'/checkout.json'));
assert.equal(receipt.operatorUserId,operatorUserId);assert.equal(receipt.priceCode,operatorPriceCode);
for(const key of ['paid','cancelAtPeriodEnd','duplicatePaidEventPassed','reconciliationPassed'])assert.equal(receipt[key],true,`Acceptance incomplete: ${key}`);
assert(receipt.subscriptionId&&receipt.invoiceId&&receipt.portalUrl);
assert(!existsSync(dir+'/closeout-started.json'),'Inspect the prior closeout before retrying');
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const raw=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody,baseline=typeof raw==='string'?JSON.parse(raw):raw;
const template=withClosedOperatorBilling(baseline);
writeFileSync(dir+'/closeout-started.json',JSON.stringify({at:new Date().toISOString(),stack,baseline}),{flag:'wx',mode:0o600});
writeFileSync(dir+'/closed-template.json',JSON.stringify(template),{mode:0o600});
aws('cloudformation','update-stack','--stack-name',stack.StackName,'--template-body','file://'+dir+'/closed-template.json','--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
let done=false;
for(let i=0;i<100;i++){
  await new Promise(r=>setTimeout(r,15000));
  const after=aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0];
  console.log(JSON.stringify({phase:'close operator purchase window',status:after.StackStatus}));
  if(after.StackStatus.endsWith('_IN_PROGRESS'))continue;
  assert.equal(after.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(after.Parameters,stack.Parameters);done=true;break;
}
assert(done,'Inspect deployment before retry');
for(const service of ['api','worker']){
  const svc=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-'+service).services[0];
  assert.equal(svc.deployments.length,1);assert.equal(svc.deployments[0].rolloutState,'COMPLETED');assert.equal(svc.runningCount,svc.desiredCount);
  const task=aws('ecs','describe-task-definition','--task-definition',svc.taskDefinition).taskDefinition;
  assert.equal(task.containerDefinitions[0].environment.find(e=>e.name==='BILLING_LIVE_ACCESS_MODE').value,'closed');
}
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
const opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,opts),client=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,opts);
const ok=r=>{assert(!r.error,'Scoped acceptance authentication failed');return r.data;};
const user=ok(await admin.from('users').select('supabase_user_id').eq('id',operatorUserId).single());
const identity=ok(await admin.auth.admin.getUserById(user.supabase_user_id)).user;
assert.equal(identity.user_metadata.production_operator_acceptance,true);assert.equal(identity.user_metadata.synthetic,true);assert.equal(identity.email,'lopezb.jl@gmail.com');
const link=ok(await admin.auth.admin.generateLink({type:'magiclink',email:identity.email}));
const token=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session.access_token;
try {
  const request=async(path,body)=>{
    const r=await fetch('https://api.illuminotary.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Darci-Billing-Catalog':'2'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
    return {status:r.status,body:await r.json()};
  };
  for(const [path,body] of [['/billing/member-membership/checkout',{priceCode:operatorPriceCode,idempotencyToken:receipt.idempotencyToken}],['/billing/customer-portal-session',{}]]){
    const r=await request(path,body);assert.equal(r.status,403);assert.equal(r.body.error,'billing_purchase_unavailable');
  }
  const status=await request('/billing/member-membership');assert.equal(status.status,200);
  assert.equal(status.body.membership.state,'active');assert.equal(status.body.membership.priceCode,operatorPriceCode);
  assert.equal(status.body.membership.cancelAtPeriodEnd,true);assert.equal(status.body.membership.allowance.total,3);assert.equal(status.body.membership.allowance.used,0);
  assert.equal(status.body.actions.canCheckout,false);
}finally{await client.auth.signOut({scope:'local'});}
const report={at:new Date().toISOString(),purchaseWindowClosed:true,liveEventProcessingPreserved:true,subscriptionId:receipt.subscriptionId,cancelAtPeriodEnd:true,hostedPurchaseAndPortalDenied:true,paidAllowancePreserved:true};
writeFileSync(dir+'/closeout.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
