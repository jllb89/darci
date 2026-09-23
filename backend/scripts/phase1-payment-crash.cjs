// Real application worker and PostgreSQL effects; deterministic Stripe transport.
// No provider keys/network. Complements (does not replace) real staging lifecycle proof.
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {spawn}=require('node:child_process');
const {createClient}=require('@supabase/supabase-js');
assert.equal(process.env.APP_ENV,'recovery');
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');
assert(!process.env.STRIPE_SECRET_KEY&&!process.env.RESEND_API_KEY);
process.env.BILLING_ENFORCEMENT_MODE='enforced';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ok=r=>{assert(!r.error,JSON.stringify({code:r.error?.code,message:r.error?.message}));return r.data;};
const policy=require('./dist/services/billingPolicyService');
async function workerMain(input){
 const assert=require('node:assert/strict');
 assert.equal(process.env.APP_ENV,'recovery');assert(!process.env.STRIPE_SECRET_KEY);
 const config=require('./dist/config/stripe');
 config.getStripeClient=()=>({events:{retrieve:async id=>{assert.equal(id,input.event.id);return input.event;}},subscriptions:{retrieve:async id=>{assert.equal(id,input.subscription.id);return input.subscription;}}});
 const original=global.fetch;
 global.fetch=async(...args)=>{
  const response=await original(...args),url=String(args[0]);
  if(response.ok&&((input.killAt==='snapshot'&&url.includes('/rpc/apply_stripe_member_subscription_snapshot'))||(input.killAt==='release'&&url.includes('/rpc/set_document_release_status'))))process.exit(77);
  return response;
 };
 if(input.killAt==='ack')global.fetch=async(...args)=>{if(String(args[0]).includes('/rpc/resolve_stripe_webhook_event'))process.exit(77);return original(...args);};
 const r=await require('./dist/services/stripeWebhookService').processStoredStripeWebhook({storedEventId:input.storedId,workerId:'isolated-process-'+process.pid});
 assert.equal(r.outcome,'processed');
}
async function child(input){
 return new Promise((resolve,reject)=>{
  const source='('+workerMain.toString()+')('+JSON.stringify(input)+').then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(2)})';
  const p=spawn(process.execPath,['-e',source],{stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',v=>error+=v);
  const timer=setTimeout(()=>p.kill('SIGKILL'),45000);p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);if(code===2)console.error(error);resolve(code);});
 });
}
async function event(subscription,label){
 const e={id:'evt_isolated_'+randomUUID(),livemode:false,type:'customer.subscription.updated',data:{object:{id:subscription.id}}};
 const row=ok(await db.from('stripe_webhook_events').insert({provider:'stripe',provider_environment:'test',event_id:e.id,event_type:e.type,livemode:false,status:'received',payload:{fixture:'isolated_crash',label},next_attempt_at:new Date().toISOString()}).select('id').single());
 return {subscription,event:e,storedId:row.id};
}
async function fixture(killAt,priceId,pdf){
 const run=randomUUID(),email='crash-'+run+'@example.invalid';
 const auth=ok(await db.auth.admin.createUser({email,email_confirm:true})).user;
 const owner=ok(await db.from('users').insert({supabase_user_id:auth.id,email,role:'member',status:'active'}).select('id').single());
 const account=ok(await db.from('billing_accounts').insert({owner_user_id:owner.id,account_key:'default',is_default:true,status:'active',billing_email:email}).select('id').single());
 const now=Math.floor(Date.now()/1000),subscription={id:'sub_isolated_'+run,livemode:false,status:'active',customer:'cus_isolated_'+run,currency:'usd',cancel_at_period_end:false,canceled_at:null,ended_at:null,latest_invoice:{id:'in_isolated_'+run,livemode:false,status:'paid',amount_paid:4900,currency:'usd'},metadata:{darci_environment:'test',darci_billing_account_id:account.id,darci_owner_user_id:owner.id},items:{data:[{current_period_start:now-60,current_period_end:now+86400,price:{id:priceId,livemode:false,metadata:{darci_product_code:'member_membership'}}}]}};
 assert.equal(await child(await event(subscription,'initial')),0);
 const docs=[];
 for(let n=0;n<2;n++){
  const doc=ok(await db.from('documents').insert({owner_id:owner.id,status:'draft',document_type:'poa',jurisdiction:'US-CA'}).select('id').single());
  await policy.consumeMemberDocumentWorkflow({ownerUserId:owner.id,documentId:doc.id,expectedDocumentStatus:'draft',nextDocumentStatus:'pending_signature',actorUserId:owner.id});
  const storagePath=owner.id+'/'+doc.id+'/isolated-final.pdf';ok(await db.storage.from('documents').upload(storagePath,pdf,{contentType:'application/pdf',upsert:false}));
  const version=ok(await db.from('document_versions').insert({document_id:doc.id,version:1,storage_path:storagePath,file_name:'isolated-final.pdf',mime_type:'application/pdf',size_bytes:pdf.length,is_final:true,created_by:owner.id}).select('id').single());
  const hash=ok(await db.from('document_hash_records').insert({document_id:doc.id,document_version_id:version.id,hash:createHash('sha256').update(pdf).digest('hex'),status:'completed',metadata:{fixture:run}}).select('id').single());
  docs.push({id:doc.id,versionId:version.id,hashId:hash.id,storagePath});
 }
 assert.equal(await child(await event({...subscription,status:'canceled',canceled_at:now},'lapse')),0);
 assert.equal((await policy.evaluateMemberBillingPolicy(owner.id)).canProceed,false);
 for(const doc of docs)assert.equal((await policy.applyFinalPackageBillingPolicy({ownerUserId:owner.id,documentId:doc.id,documentVersionId:doc.versionId,documentHashRecordId:doc.hashId})).release_status,'billing_held');
 const usage=ok(await db.from('billing_usage_events').select('*').in('document_id',docs.map(d=>d.id)).order('id'));assert.equal(usage.length,2);
 const input=await event(subscription,'reactivate-'+killAt);
 assert.equal(await child({...input,killAt}),77,'Actual process must die at '+killAt);
 const stored=ok(await db.from('stripe_webhook_events').select('status,attempt_count,processing_lease_expires_at').eq('id',input.storedId).single());
 assert.equal(stored.status,'processing');assert.equal(stored.attempt_count,1);
 const controls=ok(await db.from('document_release_controls').select('release_status').in('document_id',docs.map(d=>d.id)));
 assert.equal(controls.filter(c=>c.release_status==='released').length,killAt==='snapshot'?0:killAt==='release'?1:2);
 return {run,killAt,input,docs,usage,account,owner,leaseUntil:stored.processing_lease_expires_at};
}
(async()=>{
 const originals=ok(await db.from('stripe_webhook_events').select('*').order('id'));
 const originalReleases=ok(await db.from('document_release_controls').select('*').order('id'));
 const price=ok(await db.from('billing_catalog_prices').select('id').eq('price_code','member_starter_monthly').single());
 const mapping=ok(await db.from('billing_provider_price_mappings').select('provider_price_id').eq('catalog_price_id',price.id).eq('provider_environment','test').eq('status','verified').single());
 const {PDFDocument}=require('pdf-lib'),p=await PDFDocument.create();p.addPage([300,300]).drawText('SYNTHETIC CRASH TEST - NO LEGAL EFFECT',{x:12,y:150,size:9});const pdf=Buffer.from(await p.save());
 const cases=await Promise.all(['snapshot','release','ack'].map(killAt=>fixture(killAt,mapping.provider_price_id,pdf)));
 console.log('PROGRESS '+JSON.stringify({stage:'three_actual_process_deaths',cases:cases.map(c=>c.killAt),waitingFor:'natural 90-second leases; no forced expiry'}));
 const wait=Math.max(...cases.map(c=>new Date(c.leaseUntil).getTime()))-Date.now()+1000;
 if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
 const results=[];
 for(const f of cases){
  assert.equal(await child(f.input),0,'Recovery '+f.killAt);
  const replay=await require('./dist/services/stripeWebhookService').processStoredStripeWebhook({storedEventId:f.input.storedId,workerId:'duplicate-after-completion'});assert.equal(replay.claimed,false);
  const row=ok(await db.from('stripe_webhook_events').select('status,attempt_count').eq('id',f.input.storedId).single());assert.equal(row.status,'processed');assert.equal(row.attempt_count,2);
  const controls=ok(await db.from('document_release_controls').select('*').in('document_id',f.docs.map(d=>d.id)));assert(controls.every(c=>c.release_status==='released'));
  assert.deepEqual(ok(await db.from('billing_usage_events').select('*').in('document_id',f.docs.map(d=>d.id)).order('id')),f.usage);
  const entitlement=ok(await db.from('billing_entitlements').select('quantity_total,quantity_used').eq('billing_account_id',f.account.id).eq('status','active').single());assert.deepEqual(entitlement,{quantity_total:3,quantity_used:2});
  for(const doc of f.docs){const control=controls.find(c=>c.document_id===doc.id);assert.equal(control.document_version_id,doc.versionId);assert.equal(control.document_hash_record_id,doc.hashId);const bytes=Buffer.from(await ok(await db.storage.from('documents').download(doc.storagePath)).arrayBuffer());assert(bytes.equals(pdf));}
  results.push({interruptedAfter:f.killAt,actualProcessExit:77,attempts:2,usage:2,allowance:3,identicalFinals:2,duplicateClaim:false});
 }
 assert.deepEqual(ok(await db.from('stripe_webhook_events').select('*').in('id',originals.map(r=>r.id)).order('id')),originals);
 assert.deepEqual(ok(await db.from('document_release_controls').select('*').in('id',originalReleases.map(r=>r.id)).order('id')),originalReleases);
 console.log('RESULT '+JSON.stringify({passed:true,cases:results,originalEventsAndReleasesUnchanged:true,providerTransport:'deterministic fixture; no real Stripe call',databaseAndWorker:'real compiled service, committed PostgreSQL RPCs, actual abrupt child exits and natural lease expiry'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
