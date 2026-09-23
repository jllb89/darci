// --prepare creates a hosted link; only the cardholder can authorize its payment.
// --verify checks that exact payment and cancels only its future renewal.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {operatorUserId,operatorPriceCode} from './operator-billing-setup.mjs';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
process.umask(0o077);
assert(process.argv.includes('--approved-operator-live-test'));
const dir=realpathSync(process.argv[2]);assert(dir.startsWith(resolve('.recovery-private')+'/production-operator-billing-'));
const activation=JSON.parse(readFileSync(dir+'/activation.json'));assert.equal(activation.passed,true);assert.equal(activation.operatorUserId,operatorUserId);
const prepare=process.argv.includes('--prepare');assert(prepare||process.argv.includes('--verify'));
const file=dir+'/checkout.json';
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const ok=r=>{assert(!r.error,'Provider operation failed: '+(r.error?.code??r.error?.status??'unknown'));return r.data;};
let db,client,token,negativeAuthId,report={checks:[]},phase='preflight';
const save=()=>writeFileSync(file,JSON.stringify(report,null,2),{mode:0o600});
async function api(path,body,accessToken=token){
  const r=await fetch('https://api.illuminotary.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json','X-Darci-Billing-Catalog':'2'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(40000)});
  return {status:r.status,body:await r.json()};
}
try {
  assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
  const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
  const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
  assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
  const options={auth:{persistSession:false,autoRefreshToken:false}};db=createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,options);
  const user=ok(await db.from('users').select('id,supabase_user_id,email,email_confirmed_at').eq('id',operatorUserId).single());
  const authUser=ok(await db.auth.admin.getUserById(user.supabase_user_id)).user;
  assert.equal(authUser.user_metadata.production_operator_acceptance,true);assert.equal(authUser.user_metadata.synthetic,true);assert.equal(authUser.email,'lopezb.jl@gmail.com');assert(authUser.email_confirmed_at);
  if(!user.email_confirmed_at)ok(await db.from('users').update({email_confirmed_at:authUser.email_confirmed_at}).eq('id',operatorUserId));
  client=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,options);
  const login=ok(await db.auth.admin.generateLink({type:'magiclink',email:authUser.email}));
  token=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:login.properties.hashed_token})).session.access_token;
  const Stripe=require('../../backend/node_modules/stripe'),stripe=new Stripe(secret.STRIPE_SECRET_KEY,{apiVersion:'2026-07-29.dahlia',timeout:20000,maxNetworkRetries:1});
  assert.equal((await stripe.accounts.retrieve()).id,'acct_1HxKd9ETAqmB3GAq');
  if(prepare){
    assert(!existsSync(file),'Checkout preparation already attempted: inspect before retry');
    Object.assign(report,{at:new Date().toISOString(),operatorUserId,priceCode:operatorPriceCode,idempotencyToken:'operator-live-20260923-'+randomUUID(),paid:false});
    writeFileSync(file,JSON.stringify(report),{flag:'wx',mode:0o600});
    phase='negative purchase boundaries';
    for(const [path,body] of [
      ['/billing/member-membership/checkout',{priceCode:'member_plus_monthly_v2',idempotencyToken:report.idempotencyToken+'-forbidden'}],
      ['/billing/member-membership/plan-change',{targetPriceCode:operatorPriceCode,idempotencyToken:report.idempotencyToken+'-change'}],
    ]){const result=await api(path,body);assert.equal(result.status,403);assert.equal(result.body.error,'billing_purchase_unavailable');}
    const negativeEmail='production-billing-denial-'+randomUUID()+'@example.invalid';
    negativeAuthId=ok(await db.auth.admin.createUser({email:negativeEmail,email_confirm:true,user_metadata:{synthetic:true,production_billing_denial:true}})).user.id;
    report.negativeAuthId=negativeAuthId;save();
    let negativeUser=ok(await db.from('users').select('id').eq('supabase_user_id',negativeAuthId).maybeSingle());
    if(!negativeUser)negativeUser=ok(await db.from('users').insert({supabase_user_id:negativeAuthId,email:negativeEmail,status:'active',role:'member'}).select('id').single());
    ok(await db.from('user_roles').upsert({user_id:negativeUser.id,role:'member',status:'active',is_active_profile:true,granted_reason:'Isolated operator-only billing denial test'},{onConflict:'user_id,role'}));
    const otherClient=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,options);
    const otherLink=ok(await db.auth.admin.generateLink({type:'magiclink',email:negativeEmail}));
    const otherToken=ok(await otherClient.auth.verifyOtp({type:'magiclink',token_hash:otherLink.properties.hashed_token})).session.access_token;
    try {
      for(const [path,body] of [
        ['/billing/member-membership/checkout',{priceCode:operatorPriceCode,idempotencyToken:report.idempotencyToken+'-other'}],
        ['/billing/member-membership/plan-change',{targetPriceCode:operatorPriceCode,idempotencyToken:report.idempotencyToken+'-other-change'}],
        ['/billing/customer-portal-session',{}],
      ]){const r=await api(path,body,otherToken);assert.equal(r.status,403);assert.equal(r.body.error,'billing_purchase_unavailable');}
      assert.equal(ok(await db.from('billing_accounts').select('id').eq('owner_user_id',negativeUser.id)).length,0);
      const status=await api('/billing/member-membership',null,otherToken);assert.equal(status.status,200);assert.equal(status.body.actions.canCheckout,false);
    }finally{await otherClient.auth.signOut({scope:'local'});}
    report.checks.push('Other member cannot checkout/change plans/open portal; no billing account created; operator cannot buy unapproved tier or change plans');save();
    phase='create operator checkout';
    const result=await api('/billing/member-membership/checkout',{priceCode:operatorPriceCode,idempotencyToken:report.idempotencyToken});
    assert.equal(result.status,201,'Operator Checkout failed; inspect response code without logging personal data');
    report.checkoutSessionId=result.body.checkoutSessionId;report.checkoutUrl=result.body.checkoutUrl;save();
    const session=await stripe.checkout.sessions.retrieve(report.checkoutSessionId);
    assert(session.livemode);assert.equal(session.amount_total,999);assert.equal(session.currency,'usd');assert.equal(session.metadata.darci_owner_user_id,operatorUserId);assert.equal(session.mode,'subscription');
    assert(session.expires_at*1000<=Date.parse(activation.expiresAt));
    const repeated=await api('/billing/member-membership/checkout',{priceCode:operatorPriceCode,idempotencyToken:report.idempotencyToken});assert.equal(repeated.status,201);assert.equal(repeated.body.checkoutSessionId,session.id);assert.equal(repeated.body.reused,true);
    report.checks.push('Exact $9.99 monthly live Checkout and same-key reuse; session expires within approved operator window');
    report.checkoutPrepared=true;save();
    console.log(JSON.stringify({checkoutPrepared:true,checkoutUrl:report.checkoutUrl,expiresAt:new Date(session.expires_at*1000).toISOString(),paid:false,evidence:file}));
  }else{
    report=JSON.parse(readFileSync(file));assert.equal(report.operatorUserId,operatorUserId);assert.equal(report.checkoutPrepared,true);
    phase='verify exact payment';
    const session=await stripe.checkout.sessions.retrieve(report.checkoutSessionId);assert(session.livemode);assert.equal(session.metadata.darci_owner_user_id,operatorUserId);
    if(session.payment_status!=='paid'){console.log(JSON.stringify({paid:false,status:session.status,waitingForCardholder:true}));}
    else {
      assert.equal(session.amount_total,999);assert.equal(session.currency,'usd');
      const subscriptionId=typeof session.subscription==='string'?session.subscription:session.subscription?.id;assert(subscriptionId);
      const subscription=await stripe.subscriptions.retrieve(subscriptionId,{expand:['latest_invoice']});assert(subscription.livemode);assert.equal(subscription.metadata.darci_owner_user_id,operatorUserId);assert.equal(subscription.metadata.darci_price_code,operatorPriceCode);
      assert.equal(subscription.items.data.length,1);assert.equal(subscription.items.data[0].price.unit_amount,999);assert.equal(subscription.status,'active');
      const invoice=subscription.latest_invoice;assert(invoice&&typeof invoice!=='string');assert.equal(invoice.status,'paid');assert.equal(invoice.amount_paid,999);
      // Authorized in advance: stop only this test renewal; do not refund or charge.
      const canceled=await stripe.subscriptions.update(subscriptionId,{cancel_at_period_end:true},{idempotencyKey:'darci-operator-end-renewal:'+subscriptionId});assert.equal(canceled.cancel_at_period_end,true);
      Object.assign(report,{paid:true,subscriptionId,invoiceId:invoice.id,cancelAtPeriodEnd:true});save();
      let status;
      for(let i=0;i<30;i++){
        status=await api('/billing/member-membership');
        if(status.status===200&&status.body.membership.state==='active'&&status.body.membership.cancelAtPeriodEnd===true)break;
        await new Promise(r=>setTimeout(r,3000));
      }
      assert.equal(status.status,200);assert.equal(status.body.membership.state,'active');assert.equal(status.body.membership.cancelAtPeriodEnd,true);
      assert.equal(status.body.membership.priceCode,operatorPriceCode);assert.equal(status.body.membership.allowance.total,3);assert.equal(status.body.membership.allowance.used,0);
      const portal=await api('/billing/customer-portal-session',{});assert.equal(portal.status,201);assert.equal(new URL(portal.body.portalUrl).hostname,'billing.stripe.com');
      report.portalUrl=portal.body.portalUrl;report.checks.push('Actual paid invoice; webhook-derived active three-workflow entitlement; period-end cancellation projected; authorized Portal session created');save();
      console.log(JSON.stringify({paid:true,amountCents:999,allowance:3,cancelAtPeriodEnd:true,portalUrl:report.portalUrl,evidence:file}));
    }
  }
}catch(e){console.error(JSON.stringify({passed:false,phase,errorClass:e.name,evidence:file,reason:'Inspect exact receipt; do not repeat payment or assume no external change'}));process.exitCode=1;}
finally {
  if(db&&negativeAuthId){
    try {
      const target=ok(await db.auth.admin.getUserById(negativeAuthId)).user;assert.equal(target.user_metadata.production_billing_denial,true);
      const u=ok(await db.from('users').select('id').eq('supabase_user_id',negativeAuthId).single());
      ok(await db.from('user_roles').update({status:'revoked',is_active_profile:false}).eq('user_id',u.id));
      ok(await db.from('users').update({status:'suspended'}).eq('id',u.id));ok(await db.auth.admin.updateUserById(negativeAuthId,{ban_duration:'876000h'}));
      report.negativeFixtureRevoked=true;save();
    }catch{console.error(JSON.stringify({negativeFixtureCleanupFailed:true}));process.exitCode=1;}
  }
  if(client)await client.auth.signOut({scope:'local'});
}
