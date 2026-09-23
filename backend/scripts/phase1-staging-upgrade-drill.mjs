// Explicitly authorized synthetic Stripe TEST fixture only; never a customer account.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createClient}=require('@supabase/supabase-js'),Stripe=require('stripe');
assert(process.argv.includes('--confirm-staging-fixture'));
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'oqferisuloumoojgbjde.supabase.co');
assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
assert.notEqual(process.env.APP_ENV,'production');
process.umask(0o077);
const [receiptPath,pdfPath,outPath]=process.argv.slice(2,5);
assert(receiptPath&&pdfPath&&outPath);
const prior=JSON.parse(await readFile(receiptPath,'utf8')),fixture=prior.fixtures.find(f=>f.name==='declined');
assert(prior.run.startsWith('phase1-')&&fixture?.email.endsWith('@example.invalid'));
const run='phase1-upgrade-'+randomUUID(),report={run,checks:[],subscriptionId:null,cleanup:false};
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const stripe=new Stripe(process.env.STRIPE_SECRET_KEY,{apiVersion:'2026-07-29.dahlia',timeout:30000,maxNetworkRetries:1});
const ok=r=>{assert(!r.error,r.error?.code??'query failed');return r.data;};
const poll=async(name,fn)=>{for(let n=0;n<60;n++){if(await fn())return;await new Promise(r=>setTimeout(r,3000));}throw new Error('Timed out: '+name);};
let token;
const call=async(route,body)=>{const r=await fetch('https://api.staging.darciregistry.dev'+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await r.json();assert(r.ok,route+': '+r.status+' '+(data.error??''));return data;};
const save=()=>writeFile(outPath,JSON.stringify(report,null,2),{mode:0o600});
try{
 const customer=await stripe.customers.retrieve(fixture.customerId);
 assert(!customer.deleted&&!customer.livemode&&!customer.email&&!customer.test_clock);
 assert.equal(customer.metadata.fixture_run,prior.run);
 const existing=await stripe.subscriptions.list({customer:customer.id,status:'all',limit:100});
 assert(existing.data.every(s=>['canceled','incomplete_expired'].includes(s.status)),'Fixture has existing active work; do not interfere');
 const user=ok(await db.auth.admin.getUserById(fixture.authUserId)).user;assert.equal(user.email,fixture.email);
 const link=ok(await db.auth.admin.generateLink({type:'magiclink',email:fixture.email}));
 token=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session.access_token;
 const prices=ok(await db.from('billing_catalog_prices').select('id,price_code').in('price_code',['member_starter_monthly','member_plus_monthly']));
 const mappings=ok(await db.from('billing_provider_price_mappings').select('catalog_price_id,provider_price_id').eq('provider_environment','test').eq('status','verified').in('catalog_price_id',prices.map(p=>p.id)));
 const priceId=code=>mappings.find(m=>m.catalog_price_id===prices.find(p=>p.price_code===code).id).provider_price_id;
 const pm=await stripe.paymentMethods.attach('pm_card_visa',{customer:customer.id});
 const sub=await stripe.subscriptions.create({customer:customer.id,items:[{price:priceId('member_starter_monthly')}],default_payment_method:pm.id,payment_behavior:'allow_incomplete',metadata:{darci_environment:'test',darci_billing_account_id:fixture.accountId,darci_owner_user_id:fixture.userId,darci_price_code:'member_starter_monthly',fixture_run:run}},{idempotencyKey:run});
 assert(!sub.livemode);report.subscriptionId=sub.id;await save();
 await poll('active webhook',async()=>ok(await db.from('billing_subscriptions').select('status').eq('provider_subscription_id',sub.id).maybeSingle())?.status==='active');
 const pdf=await readFile(pdfPath);assert(pdf.subarray(0,5).toString()==='%PDF-');
 const created=await call('/documents',{title:'SYNTHETIC '+run+' NO LEGAL EFFECT',fileName:run+'.pdf',fileSize:pdf.length,mimeType:'application/pdf',productFlowMode:'notarize_document',jurisdiction:'US-OH',documentDescription:'SYNTHETIC UPGRADE TEST ONLY - NO LEGAL EFFECT',requesterName:'Synthetic Upgrade',requesterEmail:fixture.email});
 report.documentId=created.document.id;await save();
 ok(await client.storage.from(created.upload.bucket).uploadToSignedUrl(created.upload.path,created.upload.token,pdf,{contentType:'application/pdf'}));
 await call('/documents/'+report.documentId+'/upload-finalize',{documentVersionId:created.version.id});
 await call('/documents/'+report.documentId+'/review-approval',{agreed:true});
 const before=ok(await db.from('billing_usage_events').select('*').eq('document_id',report.documentId).order('id'));
 assert.equal(before.filter(e=>e.event_kind==='consume').reduce((n,e)=>n+Number(e.quantity_delta),0),1);
 const localBefore=ok(await db.from('billing_subscriptions').select('id,current_period_start,current_period_end').eq('provider_subscription_id',sub.id).single());
 report.checks.push('Real upload/review consumed one Starter workflow before upgrade');
 const change={targetPriceCode:'member_plus_monthly',idempotencyToken:run+'-change'};
 await call('/billing/member-membership/plan-change',change);
 await poll('upgraded webhook',async()=>ok(await db.from('billing_subscription_items').select('usage_limit_quantity').eq('subscription_id',localBefore.id).single()).usage_limit_quantity===10);
 await call('/billing/member-membership/plan-change',change);
 const localAfter=ok(await db.from('billing_subscriptions').select('id,current_period_start,current_period_end').eq('provider_subscription_id',sub.id).single());
 assert.deepEqual(localAfter,localBefore,'Upgrade must not reset the usage period');
 assert.deepEqual(ok(await db.from('billing_usage_events').select('*').eq('document_id',report.documentId).order('id')),before);
 const status=await call('/billing/member-membership');
 assert.equal(status.membership.allowance.total,10);
 assert.equal(status.membership.allowance.used,1);
 assert.equal(status.membership.allowance.remaining,9);
 report.allowance=status.membership.allowance;
 report.checks.push('Starter-to-Plus real webhook preserves nonzero usage, original period and exactly one consume; duplicate change is safe');
 report.completedAt=new Date().toISOString();
}catch(e){report.failure=e.message;process.exitCode=1;}
finally{
 try{if(report.subscriptionId){const sub=await stripe.subscriptions.retrieve(report.subscriptionId);assert.equal(sub.metadata.fixture_run,run);assert(!sub.livemode);if(sub.status!=='canceled')await stripe.subscriptions.cancel(sub.id,{invoice_now:false,prorate:false});await poll('cancellation webhook',async()=>ok(await db.from('billing_subscriptions').select('status').eq('provider_subscription_id',sub.id).single()).status==='canceled');}ok(await client.auth.signOut({scope:'global'}));report.cleanup=true;}catch{report.cleanup=false;process.exitCode=1;}
 await save();console.log(JSON.stringify({run,checks:report.checks,failure:report.failure??null,cleanup:report.cleanup,receipt:outPath}));
}
