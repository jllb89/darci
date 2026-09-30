// Authenticate only the existing, explicitly labeled operator fixture. GET only;
// no customer, subscription, checkout session, charge or client session changes.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {writeFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {operatorUserId} from './operator-billing-setup.mjs';
import {MEMBER_PRICING_V2} from '../../backend/src/config/memberPricing.ts';
const require=createRequire(import.meta.url);
const {createClient}=require('../../backend/node_modules/@supabase/supabase-js');
const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const ok=result=>{assert(!result.error,'Provider operation failed');return result.data;};
let client;
try {
  const dir=realpathSync(process.argv[2]);
  assert(dir.startsWith(resolve('.recovery-private')+'/production-private-sales-'));
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
  assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
  assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const db=createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,options);
  const user=ok(await db.from('users').select('supabase_user_id').eq('id',operatorUserId).single());
  const authUser=ok(await db.auth.admin.getUserById(user.supabase_user_id)).user;
  assert.equal(authUser.user_metadata.synthetic,true);
  assert.equal(authUser.user_metadata.production_operator_acceptance,true);
  assert.equal(authUser.email,'lopezb.jl@gmail.com');
  client=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,options);
  const link=ok(await db.auth.admin.generateLink({type:'magiclink',email:authUser.email}));
  const token=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session.access_token;
  const response=await fetch('https://api.illuminotary.com/billing/member-membership',{headers:{Authorization:'Bearer '+token,'X-Darci-Billing-Catalog':'2','X-DARCi-Profile':'member'},signal:AbortSignal.timeout(40000)});
  if(response.status!==200){
    const content=await response.text();
    let code;try{const parsed=JSON.parse(content);code=parsed.error??parsed.code;}catch{}
    console.log(JSON.stringify({httpStatus:response.status,contentType:response.headers.get('content-type'),errorCode:typeof code==='string'?code.slice(0,120):undefined,requestId:response.headers.get('x-request-id')}));
  }
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.providerEnvironment,'live'); assert.equal(body.paymentsReal,true);
  assert.equal(body.catalogVersion,2); assert.equal(body.enforcementMode,'enforced');
  assert.equal(body.actions.iosCheckoutAvailable,true);
  const visible=body.plans.filter(p=>p.visibleInCatalog);
  assert.equal(visible.length,6);
  for(const expected of MEMBER_PRICING_V2){
    const plan=visible.find(p=>p.priceCode===expected.priceCode); assert(plan);
    assert.equal(plan.availableForPurchase,true); assert.equal(plan.unitAmountCents,expected.amount);
    assert.equal(plan.billingInterval,expected.interval); assert.equal(plan.documentWorkflowAllowance,expected.allowance);
    assert.equal(plan.isUnlimited,expected.unlimited);
  }
  const report={at:new Date().toISOString(),passed:true,httpStatus:response.status,providerEnvironment:body.providerEnvironment,
    paymentsReal:body.paymentsReal,iosCheckoutAvailable:body.actions.iosCheckoutAvailable,
    plans:visible.map(p=>({code:p.priceCode,amount:p.unitAmountCents,interval:p.billingInterval,purchasable:p.availableForPurchase})),
    fixtureMembershipState:body.membership.state,fixtureCanCheckout:body.actions.canCheckout,
    fixtureCanOpenPortal:body.actions.canOpenPortal,chargesCreated:0,paidCheckoutManuallyAccepted:false};
  writeFileSync(dir+'/api-verification.json',JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report));
} catch(error){console.error(JSON.stringify({passed:false,reason:error.name==='AssertionError'?error.message:'Provider verification failed; credentials omitted'}));process.exitCode=1;}
finally {if(client)await client.auth.signOut({scope:'local'});}
