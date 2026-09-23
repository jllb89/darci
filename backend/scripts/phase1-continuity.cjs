// Actual internal Auth/API workflow after lapse. Never a legal in-person session.
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{createClient}=require('@supabase/supabase-js');
assert.equal(process.env.APP_ENV,'recovery');assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');assert(!process.env.STRIPE_SECRET_KEY&&!process.env.RESEND_API_KEY);
process.env.BILLING_ENFORCEMENT_MODE='enforced';
process.env.REALTIME_BROADCASTS_DISABLED='true';
const originalFetch=global.fetch;global.fetch=async(...args)=>{const r=await originalFetch(...args);if(!r.ok&&String(args[0]).includes('/rest/v1/')){const e=await r.clone().json().catch(()=>({}));console.error('DATABASE_DIAGNOSTIC '+JSON.stringify({status:r.status,code:e.code,message:e.message}));}return r;};
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),roles=require('./dist/services/userRoleService');
const ok=r=>{assert(!r.error,JSON.stringify({code:r.error?.code,message:r.error?.message}));return r.data;};
const run=randomUUID(),actors=[],checks=[],matrix=[],signals=[],billingNow=Date.now();let requestCount=0,server,base;
const originalError=console.error;console.error=(...args)=>{for(const x of args)if(typeof x==='string'){try{const v=JSON.parse(x);if(v.kind==='darci_critical_signal')signals.push(v);}catch{}}originalError(...args);};
async function api(actor,route,body){requestCount++;const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+actor.token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});return {status:r.status,body:await r.json()};}
const expect=(r,status,label)=>{assert.equal(r.status,status,label+': '+JSON.stringify(r.body));return r.body;};
async function actor(label,role='member'){
 const email='continuity-'+label+'-'+run+'@example.invalid',auth=ok(await db.auth.admin.createUser({email,email_confirm:true,user_metadata:{first_name:'SYNTHETIC',last_name:label,fixture_run:run}})).user;
 const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),link=ok(await db.auth.admin.generateLink({type:'magiclink',email})),session=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session;
 const a={email,authId:auth.id,client,token:session.access_token,role};actors.push(a);expect(await api(a,'/auth/session/sync',{intent:'signup'}),200,'Bootstrap');a.id=ok(await db.from('users').select('id').eq('supabase_user_id',auth.id).single()).id;
 if(role!=='member')await roles.upsertUserRoleAssignmentBySupabaseUserId({supabaseUserId:auth.id,role,status:'active',makeActive:true,grantedReason:'isolated continuity fixture'});
 ok(await db.from('notification_preferences').insert(['email','sms','push'].map(channel=>({user_id:a.id,channel,preference_scope:'transactional',is_enabled:false,source:'user_settings'}))));
 return a;
}
async function snapshot(owner,account,price,status){
 const now=Math.floor(billingNow/1000);ok(await db.rpc('apply_stripe_member_subscription_snapshot',{p_billing_account_id:account.id,p_owner_user_id:owner.id,p_provider_customer_id:'cus_continuity_'+run,p_provider_subscription_id:'sub_continuity_'+run,p_provider_price_id:price,p_subscription_status:status,p_period_start:new Date((now-60)*1000).toISOString(),p_period_end:new Date((now+86400)*1000).toISOString(),p_cancel_at_period_end:false,p_invoice_id:'in_continuity_'+run,p_invoice_status:'paid',p_invoice_amount_cents:4900,p_invoice_currency:'USD',p_event_id:'evt_continuity_'+randomUUID(),p_provider_environment:'test'}));
}
(async()=>{
 // This recovery topology intentionally has no Realtime server. Transport
 // delivery is not part of this HTTP/database continuity acceptance.
 const controller=require('./dist/controllers/documentsController'),capture=controller.captureSignature;controller.captureSignature=async(...args)=>{try{return await capture(...args);}catch(e){console.error('CAPTURE_DIAGNOSTIC '+e.stack);throw e;}};
 server=await new Promise(resolve=>{const s=require('./dist/index').app.listen(0,'127.0.0.1',()=>resolve(s));});base='http://127.0.0.1:'+server.address().port;
 const owner=await actor('owner'),signer=await actor('signer'),unrelated=await actor('unrelated'),notary=await actor('selected','notary'),wrong=await actor('wrong','notary'),admin=await actor('admin','admin');
 const account=ok(await db.from('billing_accounts').insert({owner_user_id:owner.id,account_key:'default',is_default:true,status:'active'}).select('id').single());
 const price=ok(await db.from('billing_catalog_prices').select('id').eq('price_code','member_starter_monthly').single()),mapping=ok(await db.from('billing_provider_price_mappings').select('provider_price_id').eq('catalog_price_id',price.id).eq('provider_environment','test').eq('status','verified').single());
 await snapshot(owner,account,mapping.provider_price_id,'active');
 const {PDFDocument}=require('pdf-lib'),p=await PDFDocument.create();p.addPage([612,792]).drawText('SYNTHETIC CONTINUITY TEST - NO LEGAL EFFECT',{x:30,y:720,size:13});const pdf=Buffer.from(await p.save());
 const made=expect(await api(owner,'/documents',{title:'SYNTHETIC CONTINUITY NO LEGAL EFFECT',fileName:'synthetic.pdf',fileSize:pdf.length,mimeType:'application/pdf',productFlowMode:'notarize_document',jurisdiction:'US-CA',documentDescription:'SYNTHETIC FIXTURE ONLY',requesterName:'SYNTHETIC owner',requesterEmail:owner.email}),201,'Create');const doc=made.document.id;
 ok(await owner.client.storage.from(made.upload.bucket).uploadToSignedUrl(made.upload.path,made.upload.token,pdf,{contentType:'application/pdf'}));expect(await api(owner,'/documents/'+doc+'/upload-finalize',{documentVersionId:made.version.id}),200,'Upload finalize');expect(await api(owner,'/documents/'+doc+'/review-approval',{agreed:true}),200,'Review');
 const usage=ok(await db.from('billing_usage_events').select('*').eq('document_id',doc).order('id'));assert.equal(usage.length,1);
 await snapshot(owner,account,mapping.provider_price_id,'canceled');assert.equal(expect(await api(owner,'/billing/member-membership'),200,'Lapse').eligibility.canCreateWorkflow,false);
 checks.push('Actual upload/review consumes once before lapse; lapsed owner cannot create new workflows');
 let signing=expect(await api(owner,'/documents/'+doc+'/signing'),200,'Lapsed signing');
 const targets=ok(await db.from('document_output_signers').select('*').eq('document_id',doc));assert(targets.length>0);
 const source=targets[0],invited=ok(await db.from('document_output_signers').insert({document_id:doc,generation_run_id:source.generation_run_id,output_key:source.output_key,document_key:source.document_key,party_role:'agent',party_name:'SYNTHETIC signer',obligation_type:'signer',resolution_source:'manual_override',metadata:{fixture:run,signatureField:{pageNumber:1,label:'SYNTHETIC signer',includeDate:false,signatureRect:{x:40,y:150,width:180,height:40},dateRect:null}}}).select('id').single());
 const invite=ok(await db.from('document_access_invites').insert({document_id:doc,document_output_signer_id:invited.id,invite_kind:'document_signing',access_scope:'sign',status:'claimed',claimed_user_id:signer.id,output_key_snapshot:source.output_key,created_by_user_id:owner.id,metadata:{fixture:run}}).select('id').single());ok(await db.from('invite_recipients').insert({invite_id:invite.id,channel:'email',delivery_address:signer.email}));
 for(const target of [...targets,{...source,id:invited.id}])expect(await api(target.id===invited.id?signer:owner,'/documents/'+doc+'/signatures',{generationRunId:target.generation_run_id,outputSignerId:target.id,captureMethod:'type',typedValue:target.id===invited.id?'SYNTHETIC signer':'SYNTHETIC owner',typedKind:'name'}),201,'Lapsed capture');
 assert.equal(ok(await db.from('documents').select('status').eq('id',doc).single()).status,'pending_notary');checks.push('Owner and bound invited signer capture signatures after lapse; completion automatically advances to notarization');
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
 await require('./dist/services/notaryProfileService').upsertMyNotaryProfile({supabaseUserId:notary.authId,jurisdiction:'US-CA',serviceAreaKind:'county',serviceAreaName:'SYNTHETIC County',commissionNumber:'SYNTHETIC-NOT-VALID',commissionExpiresAt:'2030-12-31',signatureDataUrl:png,sealDataUrl:png});
 const submitted=expect(await api(owner,'/documents/'+doc+'/submit-notarization',{selectedNotaryUserId:notary.id}),201,'Lapsed submit');
 const req=ok(await db.from('notarization_requests').select('id').eq('document_id',doc).single());
 const idn=ok(await db.from('documents').select('idn').eq('id',doc).single()).idn;
 expect(await api(wrong,'/notary/idn/resolve',{idn}),409,'Wrong notary cannot claim');
 expect(await api(notary,'/notary/idn/resolve',{idn}),200,'Assigned notary opens review');
 expect(await api(notary,'/notary/requests/'+req.id+'/review-decision',{decision:'approved',summary:'SYNTHETIC FIXTURE ONLY'}),200,'Notary approve');
 const geo={latitude:37,longitude:-122,accuracyMeters:1};
 expect(await api(notary,'/notary/requests/'+req.id+'/meeting/start',{participantRole:'notary',geolocation:geo,notes:'SYNTHETIC coordinates, not actual co-presence'}),201,'Session start');
 expect(await api(owner,'/notary/requests/'+req.id+'/meeting/check-in',{participantRole:'member',checkinKind:'arrival',geolocation:geo,notes:'SYNTHETIC coordinates'}),201,'Member check-in');
 expect(await api(notary,'/notary/requests/'+req.id+'/meeting/proximity-evaluation',{}),201,'Proximity');
 const venue={state:'CA',county:'SYNTHETIC County',city:'SYNTHETIC City',addressLine1:'1 SYNTHETIC TEST PLACE',locationLabel:'NO LEGAL EFFECT'};
 expect(await api(notary,'/notary/requests/'+req.id+'/meeting/identity-verification',{participantRole:'member',verificationMethod:'in_person_document',status:'verified',subjectName:'SYNTHETIC owner',documentType:'state_driver_license',documentNumber:'D0000001',issuingJurisdiction:'US-CA',documentExpirationDate:'2030-12-31',venue,notes:'Synthetic identity fixture; no real identity verified'}),201,'Identity');
 expect(await api(notary,'/notary/requests/'+req.id+'/sign',{acknowledgment:{signerAppeared:true,signerAcknowledged:true},notes:'SYNTHETIC TEST ONLY'}),200,'Acknowledgment');
 const storage=require('./dist/services/storageService'),download=storage.downloadDocumentObject;
 storage.downloadDocumentObject=async()=>Buffer.from('SYNTHETIC INVALID TRANSIENT RESPONSE');
 try{const failure=await api(notary,'/notary/requests/'+req.id+'/session/advance',{});assert(failure.status>=400||failure.status===201,'Injected invalid PDF must not finalize');}finally{storage.downloadDocumentObject=download;}
 assert.notEqual(ok(await db.from('documents').select('status').eq('id',doc).single()).status,'completed');
 assert.equal(ok(await db.from('document_versions').select('id').eq('document_id',doc).eq('is_final',true)).length,0);
 assert.deepEqual(ok(await db.from('billing_usage_events').select('*').eq('document_id',doc).order('id')),usage);
 assert(signals.some(s=>s.category==='document'),'Originating PDF failure signal missing');
 const finished=await api(notary,'/notary/requests/'+req.id+'/submit',{});expect(finished,200,'Complete');
 checks.push('Lapsed workflow proceeds through actual assigned-notary approval, session start/check-in, proximity, protected identity, acknowledgment and completion APIs; all identity/location inputs synthetic');
 const control=ok(await db.from('document_release_controls').select('*').eq('document_id',doc).single());assert.equal(control.release_status,'billing_held');
 const version=ok(await db.from('document_versions').select('*').eq('id',control.document_version_id).single()),hash=ok(await db.from('document_hash_records').select('hash').eq('id',control.document_hash_record_id).single());
 const bytes=Buffer.from(await ok(await db.storage.from('documents').download(version.storage_path)).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),hash.hash);
 const routes=['/documents/'+doc,'/documents/'+doc+'/versions','/documents/'+doc+'/review','/documents/'+doc+'/signing','/documents/'+doc+'/generation-runs/'+source.generation_run_id,'/requests/'+req.id,'/notary/requests/'+req.id+'/context'];
 for(const state of ['held','released']){
  if(state==='released'){await snapshot(owner,account,mapping.provider_price_id,'active');await require('./dist/services/billingPolicyService').releaseMemberBillingHeldDocuments({billingAccountId:account.id,sourceEventId:'isolated-reactivation'});}
  for(const route of routes)for(const a of [null,unrelated,wrong,owner,signer,notary,admin]){
   const r=await api(a,route);assert(r.status<500,'Server error in access matrix '+route);
   matrix.push({state,route:route.replace(doc,':document').replace(req.id,':request'),actor:a===null?'anonymous':a===owner?'owner':a===signer?'signer':a===notary?'assigned-notary':a===wrong?'wrong-notary':a===admin?'admin':'unrelated',status:r.status});
   if((a===owner&&route!=='/notary/requests/'+req.id+'/context')||(a===signer&&route.endsWith('/signing'))||((a===notary||a===admin)&&route.endsWith('/context')))assert.equal(r.status,200,'Expected authorized read '+route);
   if([null,unrelated,wrong].includes(a)){assert([401,403,404].includes(r.status),'Unauthorized '+route);continue;}
   if(state==='held'&&(a===owner||a===signer))assert(!JSON.stringify(r.body).includes(version.storage_path),'Held asset path leak '+route);
  }
  for(const a of [owner,signer,unrelated,notary,wrong,admin])assert((await a.client.storage.from('documents').createSignedUrl(version.storage_path,60)).error,'Direct Storage URL bypass');
  const publicResult=await api(null,'/verify/'+idn);
  assert.equal(publicResult.status,state==='held'?404:200,'Public metadata visibility');
  assert(!JSON.stringify(publicResult.body).includes(version.storage_path),'Public PDF path leaked');
 }
 assert(Buffer.from(await ok(await db.storage.from('documents').download(version.storage_path)).arrayBuffer()).equals(bytes));
 assert.deepEqual(ok(await db.from('billing_usage_events').select('*').eq('document_id',doc).order('id')),usage);
 ok(await db.from('document_access_invites').update({status:'revoked'}).eq('id',invite.id));assert.equal((await api(signer,'/documents/'+doc+'/signing')).status,404);
 checks.push('Held/released seven-route by seven-role matrix; direct Storage denied; same bytes released and original single usage unchanged; revoked signer denied');
 console.log('RESULT '+JSON.stringify({passed:true,run,documentId:doc,requestId:req.id,checks,matrix,signals,crossTrackFailureRecovered:true,requestCount,hash:hash.hash,scope:'Actual isolated API flow; provider snapshot, invited-signature placement, identity, venue and coordinates are synthetic, not a real IPEN session; Realtime disabled'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(async()=>{for(const a of actors){if(a.role!=='member')await roles.upsertUserRoleAssignmentBySupabaseUserId({supabaseUserId:a.authId,role:a.role,status:'revoked',makeActive:false,grantedReason:'isolated continuity drill complete'});await a.client.auth.signOut({scope:'global'});}if(server)await new Promise(r=>server.close(r));const redis=require('./dist/middleware/productionSafety').getSafetyRedis();if(redis)redis.disconnect();});
