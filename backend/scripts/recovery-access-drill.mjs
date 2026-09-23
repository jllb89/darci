// Real API/Auth/Storage matrix on a new synthetic document in an internal clone.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const work=path.resolve(process.argv[2]??'');assert(process.argv.includes('--confirm-isolated'));process.umask(0o077);
const runtime=JSON.parse(await readFile(path.join(work,'runtime.json'),'utf8'));
const queued=JSON.parse(await readFile(path.join(work,'queue-report.json'),'utf8'));
assert(runtime.success&&queued.customerQueuesUnchanged&&queued.snapshotId===runtime.snapshotId);
assert(/^darci-app-recovery-[a-f0-9]{8}$/.test(runtime.name));
const exec=promisify(execFile);
assert.equal(JSON.parse((await exec('docker',['network','inspect',runtime.name])).stdout)[0].Internal,true);
const source=String.raw`
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto'),{createClient}=require('@supabase/supabase-js');
assert.equal(process.env.APP_ENV,'recovery');assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');
const input=INPUT;
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),roles=require('./dist/services/userRoleService');
const ok=r=>{assert(!r.error,JSON.stringify({code:r.error?.code,status:r.error?.status,message:r.error?.message}));return r.data;};
const checks=[],actors=[],sessions=[];
let requests=0;
const call=async(actor,route,body)=>{requests++;const r=await fetch('http://api:4000'+route,{method:body?'POST':'GET',headers:{...(actor?{Authorization:'Bearer '+actor.token}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});return {status:r.status,body:await r.json()};};
async function login(email){const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const link=ok(await db.auth.admin.generateLink({type:'magiclink',email}));const session=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).session;sessions.push(client);return {token:session.access_token,client,email};}
async function actor(label,role){const email='access-'+randomUUID()+'@example.invalid';const auth=ok(await db.auth.admin.createUser({email,email_confirm:true})).user;const logged=await login(email);assert.equal((await call(logged,'/auth/session/sync',{intent:'signup'})).status,200);const user=ok(await db.from('users').select('id').eq('supabase_user_id',auth.id).single());const value={...logged,id:user.id,authId:auth.id,label,role};actors.push(value);if(role!=='member')await roles.upsertUserRoleAssignmentBySupabaseUserId({supabaseUserId:auth.id,role,status:'active',makeActive:true,grantedReason:'isolated synthetic recovery access matrix'});return value;}
const main=async()=>{
 const doc=ok(await db.from('documents').select('*').eq('id',input.documentId).single());const ownerRow=ok(await db.from('users').select('email').eq('id',doc.owner_id).single());assert(ownerRow.email==='recovery-'+input.fixture+'@example.invalid');const owner=await login(ownerRow.email);
 const unrelated=await actor('unrelated','member'),signer=await actor('signer','member'),notary=await actor('selected','notary'),wrong=await actor('wrong','notary'),admin=await actor('admin','admin');
 const version=ok(await db.from('document_versions').select('*').eq('document_id',doc.id).eq('is_final',false).single());
 const original=Buffer.from(await ok(await db.storage.from('documents').download(version.storage_path)).arrayBuffer());assert.equal(createHash('sha256').update(original).digest('hex'),input.sha256);
 const finalPath=doc.owner_id+'/'+doc.id+'/'+randomUUID()+'-synthetic-final.pdf';ok(await db.storage.from('documents').upload(finalPath,original,{contentType:'application/pdf',upsert:false}));
 const priorVersions=ok(await db.from('document_versions').select('version').eq('document_id',doc.id));
 const final=ok(await db.from('document_versions').insert({document_id:doc.id,version:Math.max(...priorVersions.map(v=>v.version))+1,storage_path:finalPath,file_name:'synthetic-final.pdf',mime_type:'application/pdf',size_bytes:original.length,is_final:true,created_by:doc.owner_id}).select('id').single());
 const hash=ok(await db.from('document_hash_records').insert({document_id:doc.id,document_version_id:final.id,hash:input.sha256,status:'completed',metadata:{fixture:true}}).select('id').single());
 ok(await db.from('document_release_controls').insert({document_id:doc.id,document_version_id:final.id,document_hash_record_id:hash.id,release_status:'billing_held',hold_reason:'synthetic_access_matrix',held_at:new Date().toISOString(),metadata:{fixture:true}}));
 const request=ok(await db.from('notarization_requests').insert({document_id:doc.id,assigned_notary_id:notary.id,status:'completed'}).select('id').single());
 const idn=randomUUID().replaceAll('-','').slice(0,12).toUpperCase();ok(await db.from('documents').update({status:'completed',idn}).eq('id',doc.id));
 const run=ok(await db.from('document_generation_runs').select('id').eq('document_id',doc.id).eq('status','rendered').eq('document_version_id',version.id).single());
 const outputSigner=ok(await db.from('document_output_signers').insert({document_id:doc.id,generation_run_id:run.id,output_key:'recovery_fixture',document_key:'recovery_fixture',party_role:'principal',party_name:'Synthetic Signer',obligation_type:'signer',resolution_source:'manual_override',metadata:{fixture:true}}).select('id').single());
 const invite=ok(await db.from('document_access_invites').insert({document_id:doc.id,document_output_signer_id:outputSigner.id,invite_kind:'document_signing',access_scope:'sign',status:'claimed',claimed_user_id:signer.id,output_key_snapshot:'recovery_fixture',created_by_user_id:doc.owner_id,metadata:{fixture:true}}).select('id').single());
 ok(await db.from('invite_recipients').insert({invite_id:invite.id,channel:'email',delivery_address:signer.email}));
 const paths=['/documents/'+doc.id,'/documents/'+doc.id+'/versions','/documents/'+doc.id+'/review','/requests/'+request.id,'/notary/requests/'+request.id+'/context'];
 for(const route of paths){for(const actor of [null,unrelated,wrong]){const result=await call(actor,route);assert([401,403,404].includes(result.status),'Unauthorized matrix '+route+' '+result.status);assert(!JSON.stringify(result.body).includes(finalPath));}}
 checks.push('Anonymous, unrelated member and unassigned notary denied across document, version, review, shared-request and notary-context routes');
 for(const route of paths.slice(0,4)){const result=await call(owner,route);assert.equal(result.status,200,'owner '+route);assert(!JSON.stringify(result.body).includes(finalPath),'Held path leaked');if(route.endsWith('/versions')||route.endsWith('/review'))assert(!JSON.stringify(result.body).includes(final.id),'Held final version leaked');}
 for(const [actor,route] of [[notary,paths[4]],[admin,paths[1]]])assert.equal((await call(actor,route)).status,200,'authorized operator');
 const signed=await call(signer,'/documents/'+doc.id+'/signing');assert.equal(signed.status,200,'claimed signer signing scope');assert(!JSON.stringify(signed.body).includes(finalPath));
 assert.equal((await call(signer,paths[1])).status,404,'Signer must not gain owner version listing');
 ok(await db.from('document_access_invites').update({status:'revoked'}).eq('id',invite.id));assert.equal((await call(signer,'/documents/'+doc.id+'/signing')).status,404,'revoked signer');
 checks.push('Held owner and bound signer can access permitted workflow data but not final bytes; revocation removes signer access; selected notary/admin retain scoped access');
 for(const actor of [owner,signer,unrelated,notary,wrong,admin]){const r=await actor.client.storage.from('documents').createSignedUrl(finalPath,60);assert(r.error,'Direct Storage mint must be denied');}
 const pub=await call(null,'/verify/'+idn);assert.equal(pub.status,404);assert(!JSON.stringify(pub.body).includes(finalPath));
 const code='REC-'+randomUUID().slice(0,8);ok(await db.from('illuminotarization_codes').insert({request_id:request.id,code,status:'active',expires_at:new Date(Date.now()+600000).toISOString()}));
 assert.equal((await call(wrong,'/notary/code/resolve',{code})).status,409,'Legacy code cannot replace assigned notary');assert.equal(ok(await db.from('notarization_requests').select('assigned_notary_id').eq('id',request.id).single()).assigned_notary_id,notary.id);
 checks.push('Direct Storage mint denied for all human roles, held public verification hidden, legacy code cannot take over assigned request');
 ok(await db.from('document_release_controls').update({release_status:'released',released_at:new Date().toISOString()}).eq('document_id',doc.id));
 const released=await call(owner,paths[1]);assert.equal(released.status,200);assert(JSON.stringify(released.body).includes(final.id));
 const bytes=Buffer.from(await ok(await db.storage.from('documents').download(finalPath)).arrayBuffer());assert(bytes.equals(original));
 checks.push('Controlled synthetic release exposes the same final version without byte changes; this matrix does not simulate payment');
 return {checks,requests,documentId:doc.id,sha256:input.sha256,scope:'Isolated real API/Auth/Storage, synthetic evidence only; not a hosted or legal IPEN session'};
};
main().then(r=>console.log('ACCESS_RESULT '+JSON.stringify(r))).catch(e=>{console.error('ACCESS_FAILED '+e.message);process.exitCode=1;}).finally(async()=>{for(const a of actors)if(a.role!=='member')await roles.upsertUserRoleAssignmentBySupabaseUserId({supabaseUserId:a.authId,role:a.role,status:'revoked',makeActive:false,grantedReason:'isolated drill complete'});for(const c of sessions)await c.auth.signOut({scope:'global'});});
`.replace('INPUT',JSON.stringify(queued));
const result=await new Promise((resolve,reject)=>{
 const p=spawn('docker',['exec','-i',runtime.name+'-api','node'],{stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>p.kill('SIGKILL'),180000);
 p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);p.on('error',reject);p.on('exit',async code=>{clearTimeout(timer);await writeFile(path.join(work,'access-private.log'),out+'\n'+err,{mode:0o600});const line=out.split('\n').find(l=>l.startsWith('ACCESS_RESULT '));code===0&&line?resolve(JSON.parse(line.slice(14))):reject(new Error('Access matrix failed; inspect private recovery log'));});p.stdin.end(source);
});
const report={...result,snapshotId:runtime.snapshotId,completedAt:new Date().toISOString()};await writeFile(path.join(work,'access-report.json'),JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));
