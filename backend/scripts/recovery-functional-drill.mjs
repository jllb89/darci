// Run only against an application reconstructed on a Docker --internal network.
// No hosted requests, outgoing messages, charges or source-PDF modifications.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
const exec = promisify(execFile);
const work = path.resolve(process.argv[2] ?? '');
assert(process.argv.includes('--confirm-isolated'));
process.umask(0o077);
const runtime = JSON.parse(await readFile(path.join(work, 'runtime.json'), 'utf8'));
assert(/^darci-app-recovery-[a-f0-9]{8}$/.test(runtime.name));
assert(runtime.success);
const folder = runtime.backupFolder??path.dirname(work), manifest = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8'));
assert.equal(manifest.snapshotId,runtime.snapshotId);
const docker = async args => (await exec('docker', args, { timeout: 30000, maxBuffer: 16 * 1024 ** 2 })).stdout.trim();
assert.equal(JSON.parse(await docker(['network','inspect',runtime.name]))[0].Internal, true);
const db = runtime.name+'-db', gateway = runtime.name+'-gateway';
const sql = async source => JSON.parse(await docker(['exec',db,'psql','-h','/tmp','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',source]));
const checks=[];
function pass(name) { checks.push(name); console.log(JSON.stringify({pass:name})); }
// Transfer request credentials via stdin, never process arguments or logs.
async function inside(body, values={},container=gateway) {
  const source=`const assert=require('node:assert/strict');const v=${JSON.stringify(values)};(async()=>{${body}})().catch(e=>{console.error(JSON.stringify({code:e.code??'DRILL_FAILED',message:e.message}));process.exitCode=1});`;
  return new Promise((resolve,reject)=>{
    const p=spawn('docker',['exec','-i',container,'node'],{stdio:['pipe','pipe','pipe']});let out='',err='';
    const timer=setTimeout(()=>p.kill('SIGKILL'),45000);
    p.stdout.on('data',c=>out+=c);p.stderr.on('data',c=>err+=c);
    p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);code===0?resolve(out.trim()?JSON.parse(out):null):reject(new Error('Isolated request failed: '+err.slice(0,200)));});
    p.stdin.end(source);
  });
}
async function call(url, token, body, method) {
  return inside(`const r=await fetch(v.url,{method:v.method??(v.body===undefined?'GET':'POST'),headers:{apikey:v.anon,...(v.token?{Authorization:'Bearer '+v.token}:{}),'Content-Type':'application/json'},...(v.body===undefined?{}:{body:JSON.stringify(v.body)}),signal:AbortSignal.timeout(10000)});const text=await r.text();let body;try{body=JSON.parse(text)}catch{body=null}console.log(JSON.stringify({status:r.status,body}));`,{url,token,body,method,anon:runtime.anon});
}
async function login(email) {
  const link=await call('http://gateway:8000/auth/v1/admin/generate_link',runtime.service,{type:'magiclink',email});
  assert.equal(link.status,200,'Restored Auth link generation');
  const login=await call('http://gateway:8000/auth/v1/verify',null,{type:'magiclink',token_hash:link.body.hashed_token});
  assert.equal(login.status,200,'Restored Auth verification');return login.body;
}
let original, objectPath;
const started=Date.now();
try {
  const production=runtime.target?.production===true;
  // Fresh production has unsigned, clearly labeled test drafts only. Never
  // manufacture completed notarization/hash/release evidence to make a drill pass.
  const candidates=await sql(production
    ? `select coalesce(json_agg(x),'[]') from (select d.id,d.idn,u.supabase_user_id,a.email,v.id as version_id,v.storage_path from documents d join users u on u.id=d.owner_id join auth.users a on a.id=u.supabase_user_id join document_versions v on v.document_id=d.id and not v.is_final where d.status='draft' and a.raw_user_meta_data->>'synthetic_recovery_test'='true' and v.file_name='SYNTHETIC RECOVERY - UNSIGNED - NO LEGAL EFFECT.pdf') x`
    : `select coalesce(json_agg(x),'[]') from (select d.id,d.idn,u.supabase_user_id,a.email,v.id as version_id,v.storage_path,h.hash,r.release_status from documents d join users u on u.id=d.owner_id join auth.users a on a.id=u.supabase_user_id join document_versions v on v.document_id=d.id and v.is_final join document_hash_records h on h.document_version_id=v.id and h.status='completed' left join document_release_controls r on r.document_version_id=v.id where u.status='active' and u.role='member' order by v.created_at desc limit 100) x`);
  if(production) {
    assert.equal(candidates.length,1,'Require the explicitly approved unsigned production fixture');
    candidates[0].hash=manifest.objects.find(o=>o.bucket_id==='documents'&&o.name===candidates[0].storage_path)?.backup.sha256;
    assert(candidates[0].hash,'Unsigned fixture must be in exact backup manifest');
  }
  const candidate=candidates.find(c=>manifest.objects.some(o=>o.name===c.storage_path && o.backup.sha256===c.hash));
  assert(candidate,'No backed-up PDF with matching hash and Auth owner');
  const object=manifest.objects.find(o=>o.name===candidate.storage_path && o.backup.sha256===candidate.hash);
  const before=await sql(`select json_build_object('versions',(select json_agg(v order by id) from document_versions v where document_id='${candidate.id}'),'hashes',(select json_agg(h order by id) from document_hash_records h where document_id='${candidate.id}'),'release',(select json_agg(r order by id) from document_release_controls r where document_id='${candidate.id}'))`);
  const owner=await login(candidate.email);
  assert.equal(owner.user.id,candidate.supabase_user_id);
  pass('Restored Auth issues a genuine session for the unchanged application owner mapping; no email sent');
  const list=await call(`http://api:4000/documents/${candidate.id}/versions`,owner.access_token);
  assert.equal(list.status,200,'Recovered authorized version listing');
  assert.equal(list.body.versions.some(v=>v.id===candidate.version_id),candidate.release_status!=='billing_held');
  assert.equal((await call(`http://api:4000/documents/${candidate.id}/versions`)).status,401);
  // Create only a local synthetic Auth account and application profile for a negative test.
  const email='recovery-'+randomUUID()+'@example.invalid';
  const created=await call('http://gateway:8000/auth/v1/admin/users',runtime.service,{email,email_confirm:true,user_metadata:{recovery_drill:true}});
  assert.equal(created.status,200);
  const other=await login(email);
  const denied=await call(`http://api:4000/documents/${candidate.id}/versions`,other.access_token);
  assert([401,403,404].includes(denied.status));
  pass('Recovered API preserves owner access and rejects anonymous/unrelated sessions');
  const objectRoute='/'+object.bucket_id+'/'+object.name.split('/').map(encodeURIComponent).join('/');
  const mint=await call('http://gateway:8000/storage/v1/object/sign'+objectRoute,owner.access_token,{expiresIn:60});
  assert(mint.status>=400,'Member must not bypass application release checks by minting Storage URLs');
  const bytes=await inside(`const r=await fetch(v.url,{headers:{Authorization:'Bearer '+v.token},signal:AbortSignal.timeout(10000)});const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({status:r.status,bytes:b.length,sha256:require('node:crypto').createHash('sha256').update(b).digest('hex')}));`,{url:'http://gateway:8000/storage/v1/object/authenticated'+objectRoute,token:runtime.service});
  assert.equal(bytes.status,200);assert.equal(bytes.bytes,object.backup.bytes);assert.equal(bytes.sha256,candidate.hash);
  pass('Recovered Storage serves exact backed-up PDF bytes; direct member URL minting remains denied');
  if(production) {
    assert.equal(manifest.objects.length,3,'Production fixture drill expects three approved unsigned test objects');
    for(const item of manifest.objects) {
      const url='http://gateway:8000/storage/v1/object/authenticated/'+item.bucket_id+'/'+item.name.split('/').map(encodeURIComponent).join('/');
      const actual=await inside(`const r=await fetch(v.url,{headers:{Authorization:'Bearer '+v.token}});const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({status:r.status,sha256:require('node:crypto').createHash('sha256').update(b).digest('hex')}));`,{url,token:runtime.service});
      assert.equal(actual.status,200);assert.equal(actual.sha256,item.backup.sha256);
      assert((await call(url,other.access_token)).status>=400);
      assert((await call(url)).status>=400);
    }
    pass('All three recovered private buckets serve exact synthetic objects and reject anonymous/unrelated access');
    await inside(`const {encryptIdentityValue,decryptIdentityValue}=require('./dist/services/protectedIdentityService');const id=require('node:crypto').randomUUID(),meeting=require('node:crypto').randomUUID();const value='SYNTHETIC-IDENTITY-NO-LEGAL-EFFECT';const encrypted=encryptIdentityValue(value,id,meeting);assert.equal(decryptIdentityValue(encrypted,id,meeting),value);assert.throws(()=>decryptIdentityValue(encrypted,id,require('node:crypto').randomUUID()));`,{},runtime.name+'-api');
    pass('Recovered identity key encrypts/decrypts synthetic evidence and rejects the wrong record context');
  }
  const publicResult=await call('http://api:4000/verify/'+candidate.idn);
  assert([200,404].includes(publicResult.status));
  assert(!/signedUrl|downloadUrl|storagePath|fileName|\/storage\/v1/.test(JSON.stringify(publicResult.body)));
  pass('Recovered public verification exposes no document-download URLs or filenames');
  objectPath=path.resolve(work,'storage','recovery','recovery',object.bucket_id,object.name,...(object.version?[object.version]:[]));
  assert(objectPath.startsWith(path.join(work,'storage')+path.sep));
  original=await readFile(objectPath);assert.equal(createHash('sha256').update(original).digest('hex'),object.backup.sha256);
  const nativePath=objectPath.replace(path.join(work,'storage'),'/mnt');
  await inside(`await require('node:fs/promises').rename(v.path,v.path+'.drill-preserved');`,{path:nativePath},runtime.name+'-storage');
  try {
    const missing=await inside(`const r=await fetch(v.url,{headers:{Authorization:'Bearer '+v.token},signal:AbortSignal.timeout(10000)});console.log(JSON.stringify({status:r.status}));`,{url:'http://gateway:8000/storage/v1/object/authenticated'+objectRoute,token:runtime.service});
    assert(missing.status>=400);
  } finally { await inside(`await require('node:fs/promises').rename(v.path+'.drill-preserved',v.path);`,{path:nativePath},runtime.name+'-storage'); }
  await writeFile(objectPath,Buffer.from('DRILL CORRUPTION - ISOLATED COPY ONLY'));
  assert.notEqual(createHash('sha256').update(await readFile(objectPath)).digest('hex'),object.backup.sha256);
  await writeFile(objectPath,original);original=null;
  pass('Missing-object Storage failure and checksum-corruption detection exercised on isolated copy, exact original bytes restored');
  const after=await sql(`select json_build_object('versions',(select json_agg(v order by id) from document_versions v where document_id='${candidate.id}'),'hashes',(select json_agg(h order by id) from document_hash_records h where document_id='${candidate.id}'),'release',(select json_agg(r order by id) from document_release_controls r where document_id='${candidate.id}'))`);
  assert.deepEqual(after,before);
  pass('Fault injection preserves all recovered version/hash/release records');
  await inside(`let denied=false;try{await fetch('https://api.staging.darciregistry.dev/health/live',{signal:AbortSignal.timeout(1500)})}catch{denied=true}assert(denied);`);
  pass('Docker internal network blocks outbound hosted application access');
  const queueState=()=>sql(`select json_build_object('notifications',(select md5(coalesce(json_agg(t order by id)::text,'')) from notification_jobs t),'stripe',(select md5(coalesce(json_agg(t order by id)::text,'')) from stripe_webhook_events t),'generation',(select md5(coalesce(json_agg(t order by id)::text,'')) from document_generation_runs t))`);
  const queueBefore=await queueState();
  assert.equal((await call('http://api:4000/health/ready')).status,200);
  await docker(['stop','--time','5',runtime.name+'-worker']);
  try {
    let unavailable=false;
    for(let i=0;i<21;i++){
      if((await call('http://api:4000/health/ready')).status===503){unavailable=true;break;}
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    assert(unavailable,'Readiness must fail after real stopped-worker heartbeat expires');
  } finally {await docker(['start',runtime.name+'-worker']);}
  let ready=false;
  for(let i=0;i<12;i++){
    if((await call('http://api:4000/health/ready')).status===200){ready=true;break;}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert(ready);assert.deepEqual(await queueState(),queueBefore);
  pass('Real isolated worker stop, natural heartbeat expiry, unhealthy readiness and restart recovery; durable queues unchanged');
  await writeFile(path.join(work,'functional-report.json'),JSON.stringify({snapshotId:manifest.snapshotId,checks,completedAt:new Date().toISOString(),functionalSeconds:(Date.now()-started)/1000,sourceChanged:false,workerReplayEnabled:false,limitations:[...(production?['Unsigned synthetic production draft only; no completed legal package or released-final acceptance claimed']:[]),'No claim of full queue reconstruction or physical-device acceptance','Historical source readability exceptions remain preserved','Auth/Storage use isolated privileged database connections; production credentials are not restored']},null,2),{mode:0o600});
} finally {
  if(original && objectPath)await writeFile(objectPath,original);
}
