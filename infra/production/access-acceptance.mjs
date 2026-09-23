// Actual hosted API/Auth/Storage tests; only newly created, labeled unsigned fixtures.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {mkdtempSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{createClient}=require('../../backend/node_modules/@supabase/supabase-js');
const {PDFDocument}=require('../../backend/node_modules/pdf-lib');
assert(process.argv.includes('--approved-isolated-production-acceptance'));
process.umask(0o077);
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const secret=JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue).SecretString);
assert.equal(secret.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');assert.equal(secret.STRIPE_LIVE_MODE_ENABLED,'false');
const options={auth:{persistSession:false,autoRefreshToken:false}};
const db=createClient(secret.SUPABASE_URL,secret.SUPABASE_SERVICE_ROLE_KEY,options);
const anon=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,options);
const ok=r=>{assert(!r.error,`Provider failure ${r.error?.code??r.error?.status??'unknown'}`);return r.data;};
const dir=mkdtempSync('.recovery-private/production-access-acceptance-'),runId=randomUUID(),actors=[],checks=[],cleanup=[],requests=[];
let stage='preflight',passed=false,documentId;
const receipt=()=>writeFileSync(dir+'/report.json',JSON.stringify({at:new Date().toISOString(),runId,stage,passed,documentId,
  actors:actors.map(a=>({id:a.id,authId:a.authId,label:a.label,role:a.role})),checks,cleanup,requests,
  scope:'New unsigned fixtures only. No legal acts, charges or client messages. Full signer/held-release/device acceptance is separate.'},null,2),{mode:0o600});
const call=async(a,path,body)=>{
  const r=await fetch('https://api.illuminotary.com'+path,{method:body?'POST':'GET',headers:{...(a?{Authorization:'Bearer '+a.token}:{}),'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  requests.push({actor:a?.label??'anonymous',path,method:body?'POST':'GET',status:r.status});receipt();
  return {status:r.status,body:await r.json().catch(()=>null)};
};
async function actor(label,role='member'){
  stage=`create ${label}`;
  const email=`production-acceptance-${runId}-${label}@example.invalid`;
  const auth=ok(await db.auth.admin.createUser({email,email_confirm:true,user_metadata:{production_acceptance:runId,synthetic:true}})).user;
  const a={authId:auth.id,label,role};actors.push(a);receipt();
  const existing=ok(await db.from('users').select('id').eq('supabase_user_id',auth.id).maybeSingle());
  a.id=(existing??ok(await db.from('users').insert({supabase_user_id:auth.id,email,status:'active',role:'member'}).select('id').single())).id;
  ok(await db.from('user_roles').update({is_active_profile:false}).eq('user_id',a.id));
  ok(await db.from('user_roles').upsert({user_id:a.id,role,status:'active',is_active_profile:true,granted_reason:`Approved isolated production acceptance ${runId}`},{onConflict:'user_id,role'}));
  ok(await db.from('users').update({role,status:'active'}).eq('id',a.id));receipt();
  a.client=createClient(secret.SUPABASE_URL,secret.SUPABASE_ANON_KEY,options);
  const link=ok(await db.auth.admin.generateLink({type:'magiclink',email}));
  const session=ok(await a.client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session;
  assert(session);a.token=session.access_token;
  assert.equal((await call(a,'/users/me')).status,200,`Real ${label} session rejected`);
  return a;
}
try{
  assert.equal((await call(null,'/health/ready')).status,200);
  const owner=await actor('owner'),other=await actor('unrelated'),selected=await actor('assigned-notary','notary'),wrong=await actor('wrong-notary','notary'),admin=await actor('admin','admin');
  stage='unsigned fixture';
  const doc=ok(await db.from('documents').insert({owner_id:owner.id,status:'pending_notary',document_type:'document',jurisdiction:'US-CA'}).select('id').single());documentId=doc.id;receipt();
  const pdf=await PDFDocument.create();pdf.addPage().drawText('SYNTHETIC PRODUCTION ACCEPTANCE - UNSIGNED - NO LEGAL EFFECT');
  const bytes=Buffer.from(await pdf.save()),hash=createHash('sha256').update(bytes).digest('hex');
  const path=`${owner.id}/${doc.id}/TEST-${runId}.pdf`;
  ok(await db.storage.from('documents').upload(path,bytes,{contentType:'application/pdf',upsert:false}));
  ok(await db.from('document_versions').insert({document_id:doc.id,version:1,storage_path:path,file_name:'UNSIGNED TEST.pdf',mime_type:'application/pdf',size_bytes:bytes.length,is_final:false,created_by:owner.id}));
  const request=ok(await db.from('notarization_requests').insert({document_id:doc.id,assigned_notary_id:selected.id,status:'in_review'}).select('id').single());
  stage='API authorization';
  for(const route of [`/documents/${doc.id}`,`/documents/${doc.id}/versions`,`/documents/${doc.id}/review`,`/requests/${request.id}`,`/notary/requests/${request.id}/context`]){
    for(const a of [null,other,wrong])assert([401,403,404].includes((await call(a,route)).status),`Unauthorized read: ${a?.label??'anonymous'} ${route}`);
  }
  for(const route of [`/documents/${doc.id}`,`/documents/${doc.id}/versions`,`/requests/${request.id}`])assert.equal((await call(owner,route)).status,200,`Owner ${route}`);
  assert.equal((await call(selected,`/notary/requests/${request.id}/context`)).status,200,'Assigned notary context');
  assert.equal((await call(admin,`/documents/${doc.id}/versions`)).status,200,'Admin version listing');
  checks.push('Anonymous/unrelated/wrong-notary denied on five routes; owner/assigned-notary/admin permitted scoped reads');receipt();
  stage='Storage authorization';
  for(const client of [anon,...actors.map(a=>a.client)]){
    assert((await client.storage.from('documents').download(path)).error,'Direct evidence download allowed');
    assert((await client.storage.from('documents').createSignedUrl(path,60)).error,'Direct signed URL mint allowed');
    const list=await client.storage.from('documents').list(`${owner.id}/${doc.id}`);
    assert(list.error||!list.data?.some(x=>x.name===`TEST-${runId}.pdf`),'Evidence listing exposed');
  }
  const returned=Buffer.from(await ok(await db.storage.from('documents').download(path)).arrayBuffer());
  assert.equal(createHash('sha256').update(returned).digest('hex'),hash);
  checks.push('Anonymous and all five actors denied direct Storage access; service read preserves exact unsigned PDF bytes');receipt();
  stage='MFA step-up';
  const rolePath=`/admin/users/${other.authId}/roles`, roleBody={role:'member',status:'active',grantedReason:`Synthetic MFA acceptance ${runId}`};
  const noMfa=await call(admin,rolePath,roleBody);assert.equal(noMfa.status,403);assert.equal(noMfa.body.error,'recent_reauthentication_required');
  const factor=ok(await admin.client.auth.mfa.enroll({factorType:'totp',friendlyName:'Production TEST '+runId}));
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits=[...factor.totp.secret.replace(/=+$/,'').toUpperCase()].map(c=>{assert(alphabet.includes(c));return alphabet.indexOf(c).toString(2).padStart(5,'0');}).join('');
  const key=Buffer.from((bits.match(/.{8}/g)??[]).map(b=>parseInt(b,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const mac=createHmac('sha1',key).update(counter).digest(),offset=mac.at(-1)&15;
  const code=String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
  const challenge=ok(await admin.client.auth.mfa.challenge({factorId:factor.id}));
  const mfa=ok(await admin.client.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code}));admin.token=mfa.access_token;
  assert.equal((await call(admin,rolePath,roleBody)).status,200,'Recent real TOTP must authorize only the test-member update');
  checks.push('Real hosted TOTP enrollment/challenge/verification: admin mutation denied at AAL1, accepted at recent AAL2 on isolated member');receipt();
  stage='private Realtime';
  async function channelStatus(actor,topic='request:'+request.id){
    await actor.client.realtime.setAuth(actor.token);
    const channel=actor.client.channel(topic,{config:{private:true}}).on('broadcast',{event:'production-acceptance'},()=>{});
    try{return await new Promise(resolve=>{const timer=setTimeout(()=>resolve('TIMEOUT'),15000);channel.subscribe((status,error)=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);requests.push({actor:actor.label,transport:'private-realtime',status,errorClass:error?(/permission|authoriz/i.test(error.message)?'authorization':/connect|socket|network/i.test(error.message)?'connection':'other'):null});receipt();resolve(status);}});});}
    finally{await actor.client.removeChannel(channel);}
  }
  assert.equal(await channelStatus(owner),'SUBSCRIBED','Owner private request channel');
  assert.equal(await channelStatus(selected),'SUBSCRIBED','Assigned notary private request channel');
  assert.equal(await channelStatus(admin),'SUBSCRIBED','Active admin private request channel');
  assert.equal(await channelStatus(other),'CHANNEL_ERROR','Unrelated member private request channel must be rejected, not merely time out');
  assert.equal(await channelStatus(wrong),'CHANNEL_ERROR','Wrong notary must be rejected');
  assert.equal(await channelStatus(selected,'notary-queue:'+selected.id),'SUBSCRIBED','Own active notary queue');
  assert.equal(await channelStatus(selected,'notary-queue:'+wrong.id),'CHANNEL_ERROR','Another notary queue must be rejected');
  checks.push('Actual private Realtime subscriptions: owner/assigned notary/admin accepted; unrelated/wrong notary rejected; own queue accepted and other queue denied');receipt();
  stage='role revocation and logout';
  ok(await db.from('user_roles').update({status:'revoked',is_active_profile:false}).eq('user_id',selected.id).eq('role','notary'));
  assert.equal((await call(selected,`/notary/requests/${request.id}/context`)).status,403);
  assert.equal(await channelStatus(selected),'CHANNEL_ERROR','Revoked notary reconnect must be denied with unchanged JWT');
  ok(await owner.client.auth.signOut({scope:'global'}));assert.equal((await call(owner,'/users/me')).status,401);
  assert.equal(await channelStatus(owner),'CHANNEL_ERROR','Logged-out owner reconnect must be denied with unchanged JWT');
  checks.push('Revoked notary and logged-out owner denied at API and new private Realtime subscriptions with unchanged JWTs; existing-socket eviction not claimed');
  passed=true;
}catch(error){console.error(JSON.stringify({passed:false,stage,reason:error instanceof assert.AssertionError?error.message:'Provider operation failed; sensitive details omitted',evidence:dir}));process.exitCode=1;}
finally{
  for(const a of actors){
    try{
      const user=ok(await db.auth.admin.getUserById(a.authId)).user;assert.equal(user.user_metadata.production_acceptance,runId);
      if(a.client)await a.client.auth.signOut({scope:'global'});
      if(a.id){ok(await db.from('user_roles').update({status:'revoked',is_active_profile:false,granted_reason:`Acceptance finished ${runId}`}).eq('user_id',a.id));ok(await db.from('users').update({status:'suspended',role:'member'}).eq('id',a.id));}
      ok(await db.auth.admin.updateUserById(a.authId,{ban_duration:'876000h'}));cleanup.push({label:a.label,privilegesRevoked:true,accountBanned:true});
    }catch{cleanup.push({label:a.label,privilegesRevoked:false});passed=false;process.exitCode=1;}
    finally{if(a.client){await a.client.removeAllChannels();a.client.realtime.disconnect();}}
  }
  receipt();console.log(JSON.stringify({passed,evidence:dir,checks,cleanup}));
}
