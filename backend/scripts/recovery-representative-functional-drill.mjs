// Full-volume production snapshot acceptance, only in an isolated local clone.
// Never contacts the source project or enables restored provider queues.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const execute=promisify(execFile),work=path.resolve(process.argv[2]??'');
assert(process.argv.includes('--confirm-isolated')&&process.argv.includes('--approved-production-volume'));
process.umask(0o077);
const runtime=JSON.parse(await readFile(path.join(work,'runtime.json'),'utf8'));
assert(runtime.success&&runtime.target?.production===true&&/^darci-app-recovery-[a-f0-9]{8}$/.test(runtime.name));
const manifest=JSON.parse(await readFile(path.join(runtime.backupFolder,'manifest.json'),'utf8'));
assert.equal(manifest.sourceProject,'jdrgluisxhgegdsesman');assert.equal(manifest.snapshotId,runtime.snapshotId);assert.equal(manifest.complete,true);
const docker=async args=>(await execute('docker',args,{timeout:45000,maxBuffer:16*1024**2})).stdout.trim();
assert.equal(JSON.parse(await docker(['network','inspect',runtime.name]))[0].Internal,true);
for(const name of runtime.containers){const c=JSON.parse(await docker(['inspect',name]))[0];assert.deepEqual(Object.keys(c.NetworkSettings.Networks),[runtime.name]);assert.equal(Object.keys(c.HostConfig.PortBindings??{}).length,0);}
const sql=async q=>JSON.parse(await docker(['exec',runtime.name+'-db','psql','-h','/tmp','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',q]));
const checks=[],started=Date.now();
const pass=name=>{checks.push(name);console.log(JSON.stringify({pass:name}));};
async function inside(body,values={},container=runtime.name+'-gateway'){
 return new Promise((resolve,reject)=>{
  const p=spawn('docker',['exec','-i',container,'node'],{stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>p.kill('SIGTERM'),120000);
  p.stdout.on('data',c=>{out+=c;if(out.length>1024*1024)p.kill('SIGTERM');});p.stderr.on('data',c=>err+=c);
  p.on('error',reject);p.on('exit',async code=>{clearTimeout(timer);if(code===0){resolve(out.trim()?JSON.parse(out):null);return;}await writeFile(path.join(work,'representative-functional-private.log'),err,{mode:0o600});reject(new Error('Isolated functional check failed; sensitive diagnostics retained locally'));});
  p.stdin.end(`const assert=require('node:assert/strict');const v=${JSON.stringify(values)};(async()=>{${body}})().catch(e=>{console.error(e.stack??e.name);process.exitCode=1;});`);
 });
}
const call=(url,token,body)=>inside(`const r=await fetch(v.url,{method:v.body===undefined?'GET':'POST',headers:{apikey:v.anon,...(v.token?{Authorization:'Bearer '+v.token}:{}),'content-type':'application/json'},...(v.body===undefined?{}:{body:JSON.stringify(v.body)}),signal:AbortSignal.timeout(15000)});console.log(JSON.stringify({status:r.status,body:await r.json().catch(()=>null)}));`,{url,token,body,anon:runtime.anon});
async function login(email){const link=await call('http://gateway:8000/auth/v1/admin/generate_link',runtime.service,{type:'magiclink',email});assert.equal(link.status,200);const session=await call('http://gateway:8000/auth/v1/verify',null,{type:'magiclink',token_hash:link.body.hashed_token});assert.equal(session.status,200);return session.body;}
const fingerprint=()=>sql(`select json_build_object('versions',(select md5(coalesce(json_agg(t order by id)::text,'')) from document_versions t),'signatures',(select md5(coalesce(json_agg(t order by id)::text,'')) from signatures t),'hashes',(select md5(coalesce(json_agg(t order by id)::text,'')) from document_hash_records t),'release',(select md5(coalesce(json_agg(t order by id)::text,'')) from document_release_controls t),'identity',(select md5(coalesce(json_agg(t order by id)::text,'')) from private.identity_document_values t),'notifications',(select md5(coalesce(json_agg(t order by id)::text,'')) from notification_jobs t),'stripe',(select md5(coalesce(json_agg(t order by id)::text,'')) from stripe_webhook_events t))`);
let original,objectPath,summary;
try{
 await inside(`assert.equal(process.env.RECOVERY_QUARANTINE,'true');assert(!process.env.STRIPE_SECRET_KEY&&!process.env.RESEND_API_KEY&&!process.env.APNS_PRIVATE_KEY);for(const n of ['NOTIFICATION_OUTBOX_RUNNER_ENABLED','STRIPE_WEBHOOK_RUNNER_ENABLED','BILLING_RECONCILIATION_RUNNER_ENABLED'])assert.equal(process.env[n],'false');`,{},runtime.name+'-api');
 const before=await fingerprint();
 const unmatched=await sql("select coalesce(json_agg(json_build_object('status',status,'count',n)),'[]') from (select u.status,count(*) n from users u left join auth.users a on a.id=u.supabase_user_id where a.id is null group by u.status) x");
 assert(!unmatched.some(row=>row.status==='active'&&Number(row.count)>0),'Active application identity is missing from recovered Auth');
 pass('Every active recovered application identity has its original Auth mapping; closed-account tombstones are distinguished');
 const inventory=await sql("select coalesce(json_agg(json_build_object('id',id,'bucket',bucket_id,'name',name,'version',version)),'[]') from storage.objects");assert.equal(inventory.length,manifest.objects.length);
 for(const row of inventory){const item=manifest.objects.find(o=>o.id===row.id);assert(item&&item.bucket_id===row.bucket&&item.name===row.name&&item.version===row.version);}
 pass('Every restored Storage row matches the pinned complete production manifest');
 const allBytes=await inside(`let index=0,checked=0,totalBytes=0;const crypto=require('node:crypto');await Promise.all(Array.from({length:4},async()=>{while(index<v.objects.length){const o=v.objects[index++];const url='http://gateway:8000/storage/v1/object/authenticated/'+o.bucket+'/'+o.name.split('/').map(encodeURIComponent).join('/');const r=await fetch(url,{headers:{Authorization:'Bearer '+v.service},signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());assert.equal(b.length,o.bytes);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),o.hash);checked++;totalBytes+=b.length;}}));console.log(JSON.stringify({checked,totalBytes}));`,{service:runtime.service,objects:manifest.objects.map(o=>({bucket:o.bucket_id,name:o.name,bytes:o.backup.bytes,hash:o.backup.sha256}))});
 assert.equal(allBytes.checked,manifest.objects.length);pass('Every recovered object is served by reconstructed Storage with its exact original bytes and SHA-256');
 const hashes=await sql("select coalesce(json_agg(json_build_object('id',h.id,'hash',h.hash,'path',v.storage_path)),'[]') from document_hash_records h join document_versions v on v.id=h.document_version_id and v.document_id=h.document_id where h.status='completed'");
 for(const h of hashes)assert.equal(manifest.objects.find(o=>o.bucket_id==='documents'&&o.name===h.path)?.backup.sha256,h.hash);assert(hashes.length>0);pass('All restored completed final hash records match backed-up final PDFs');
 const candidates=await sql("select coalesce(json_agg(x),'[]') from (select d.id,d.idn,d.jurisdiction,u.supabase_user_id,a.email,v.id version_id,v.storage_path,h.hash from documents d join users u on u.id=d.owner_id join auth.users a on a.id=u.supabase_user_id join document_release_controls r on r.document_id=d.id and r.release_status='released' join document_versions v on v.id=r.document_version_id join document_hash_records h on h.id=r.document_hash_record_id and h.status='completed' where d.status='completed' and u.status='active' and u.role='member') x");
 const samples=['US-CA','US-OH'].map(j=>candidates.find(c=>c.jurisdiction===j));assert(samples.every(Boolean),'Released CA/OH sample required in the recovered snapshot');
 const created=await call('http://gateway:8000/auth/v1/admin/users',runtime.service,{email:'isolated-restore-'+runtime.name+'@example.invalid',email_confirm:true,user_metadata:{isolated_recovery:true}});assert.equal(created.status,200);const other=await login(created.body.email);
 for(const d of samples){
  const owner=await login(d.email);assert.equal(owner.user.id,d.supabase_user_id);const route='http://api:4000/documents/'+d.id+'/versions';const list=await call(route,owner.access_token);assert.equal(list.status,200);assert(list.body.versions.some(v=>v.id===d.version_id));
  assert.equal((await call(route)).status,401);assert([403,404].includes((await call(route,other.access_token)).status));
  const objectRoute='/documents/'+d.storage_path.split('/').map(encodeURIComponent).join('/');const mint=await call('http://gateway:8000/storage/v1/object/sign'+objectRoute,owner.access_token,{expiresIn:60});assert(mint.status>=400);
  const publicResult=await call('http://api:4000/verify/'+d.idn);assert.equal(publicResult.status,200);assert.equal(publicResult.body.status,'verified');assert.equal(publicResult.body.ledgerTxId,null);assert.equal(publicResult.body.anchoredAt,null);assert(publicResult.body.documents.length>0&&publicResult.body.documents.every(v=>v.isFinal));
  for(const v of publicResult.body.documents){const url=new URL(v.downloadUrl);assert.equal(url.hostname,'gateway','Recovered public preview must not contact a hosted provider');const fetched=await inside(`const r=await fetch(v.url,{signal:AbortSignal.timeout(20000)});const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({status:r.status,sha256:require('node:crypto').createHash('sha256').update(b).digest('hex')}));`,{url:url.href});assert.equal(fetched.status,200);assert(manifest.objects.some(o=>o.backup.sha256===fetched.sha256));}
 }
 pass('Recovered CA/OH owner logins, owner-only versions, anonymous/unrelated denials and direct Storage mint denial pass');
 pass('Released CA/OH public verification serves exact verified final bytes with truthful hash-only status');
 const protectedRows=await sql("select coalesce(json_agg(json_build_object('id',id,'meeting_id',meeting_id,'envelope',encrypted_value)),'[]') from private.identity_document_values");
 const keyResult=await inside(`const {decryptIdentityValue,encryptIdentityValue}=require('./dist/services/protectedIdentityService');for(const row of v.rows){const value=decryptIdentityValue(row.envelope,row.id,row.meeting_id);assert(value.length>0);assert.throws(()=>decryptIdentityValue(row.envelope,row.id,require('node:crypto').randomUUID()));}const id=require('node:crypto').randomUUID(),meeting=require('node:crypto').randomUUID(),envelope=encryptIdentityValue('SYNTHETIC RECOVERY KEY CHECK',id,meeting);assert.equal(decryptIdentityValue(envelope,id,meeting),'SYNTHETIC RECOVERY KEY CHECK');assert.throws(()=>decryptIdentityValue(envelope,id,require('node:crypto').randomUUID()));console.log(JSON.stringify({actualProtectedRowsVerified:v.rows.length,wrongContextRejected:true,syntheticRoundtrip:true}));`,{rows:protectedRows},runtime.name+'-api');
 pass(protectedRows.length>0?'Backed-up recovery key decrypts stored protected records and rejects incorrect context; no plaintext logged':'Backed-up recovery key passes a synthetic roundtrip/context test; no stored identity ciphertexts exist in this snapshot');
 const first=manifest.objects.find(o=>o.bucket_id==='documents'&&hashes.some(h=>h.path===o.name));assert(first);
 objectPath=path.resolve(work,'storage','recovery','recovery',first.bucket_id,first.name,...(first.version?[first.version]:[]));assert(objectPath.startsWith(path.join(work,'storage')+path.sep));original=await readFile(objectPath);assert.equal(createHash('sha256').update(original).digest('hex'),first.backup.sha256);
 const filePath=objectPath.replace(path.join(work,'storage'),'/mnt'),url='http://gateway:8000/storage/v1/object/authenticated/documents/'+first.name.split('/').map(encodeURIComponent).join('/');
 await inside(`await require('node:fs/promises').rename(v.path,v.path+'.drill-preserved');`,{path:filePath},runtime.name+'-storage');
 try{const missing=await inside(`const r=await fetch(v.url,{headers:{Authorization:'Bearer '+v.token},signal:AbortSignal.timeout(10000)});console.log(JSON.stringify({status:r.status}));`,{url,token:runtime.service});assert(missing.status>=400);}finally{await inside(`await require('node:fs/promises').rename(v.path+'.drill-preserved',v.path);`,{path:filePath},runtime.name+'-storage');}
 await writeFile(objectPath,Buffer.from('ISOLATED DRILL CORRUPTION'));assert.notEqual(createHash('sha256').update(await readFile(objectPath)).digest('hex'),first.backup.sha256);await writeFile(objectPath,original);original=null;
 pass('Missing-object and corrupted-copy faults detected only in the isolated clone; original bytes restored');
 await inside(`for(const url of ['https://api.illuminotary.com/health/live','https://api.stripe.com','https://api.resend.com']){let blocked=false;try{await fetch(url,{signal:AbortSignal.timeout(1200)})}catch{blocked=true}assert(blocked);}`);
 pass('Internal Docker network blocks hosted production and payment/email provider egress');
 assert.equal((await call('http://api:4000/health/ready')).status,200);
 await docker(['stop','--time','5',runtime.name+'-worker']);
 try{let unready=false;for(let i=0;i<22;i++){if((await call('http://api:4000/health/ready')).status===503){unready=true;break;}await new Promise(r=>setTimeout(r,5000));}assert(unready,'Stopped worker must expire its real heartbeat');}finally{await docker(['start',runtime.name+'-worker']);}
 let ready=false;for(let i=0;i<15;i++){if((await call('http://api:4000/health/ready')).status===200){ready=true;break;}await new Promise(r=>setTimeout(r,1000));}assert(ready);assert.deepEqual(await fingerprint(),before);
 pass('Stopped worker fails readiness after natural heartbeat expiry and recovers on restart; signed evidence and provider queues unchanged');
 summary={snapshotId:manifest.snapshotId,completedAt:new Date().toISOString(),functionalSeconds:(Date.now()-started)/1000,checks,unmatchedIdentityStatuses:unmatched,objectsServed:allBytes.checked,objectBytes:allBytes.totalBytes,completedHashesVerified:hashes.length,protectedRowsVerified:keyResult.actualProtectedRowsVerified,sourceChanged:false,workerReplayEnabled:false,networkInternal:true,publishedPorts:0,customerEvidenceUnchanged:true,providerQueuesUnchanged:true,limitations:['Local isolated recovery of the current production snapshot; not a full-region AWS/Supabase reprovisioning or DNS cutover drill','Real provider deliveries remain quarantined and physical-device acceptance is separate',...(protectedRows.length===0?['No persisted identity ciphertexts existed; recovery-key usability is synthetic, not an actual-record decryption claim']:[])]};
 await writeFile(path.join(work,'representative-functional-report.json'),JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify(summary));
}finally{if(original&&objectPath)await writeFile(objectPath,original);}
