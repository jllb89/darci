// Selective replay proof inside an already reconstructed --internal network.
// Customer queues remain quarantined. Only newly created synthetic runs execute.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {execFile, spawn} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
const execute=promisify(execFile),work=path.resolve(process.argv[2]??'');
assert(process.argv.includes('--confirm-isolated'));
process.umask(0o077);
const runtime=JSON.parse(await readFile(path.join(work,'runtime.json'),'utf8'));
assert(runtime.success && /^darci-app-recovery-[a-f0-9]{8}$/.test(runtime.name));
const docker=async args=>(await execute('docker',args,{timeout:30000,maxBuffer:1024*1024})).stdout;
const network=JSON.parse(await docker(['network','inspect',runtime.name]))[0];
assert.equal(network.Internal,true);
const api=JSON.parse(await docker(['inspect',runtime.name+'-api']))[0];
assert.deepEqual(Object.keys(api.NetworkSettings.Networks),[runtime.name]);
assert.equal(Object.keys(api.HostConfig.PortBindings??{}).length,0);
const before=await docker(['exec',runtime.name+'-db','psql','-h','/tmp','-U','postgres','-At','-c',
  "select json_build_object('notifications',(select md5(coalesce(json_agg(t order by id)::text,'')) from notification_jobs t),'stripe',(select md5(coalesce(json_agg(t order by id)::text,'')) from stripe_webhook_events t),'release',(select md5(coalesce(json_agg(t order by id)::text,'')) from document_release_controls t))"]);
const source=String.raw`
const assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {createClient}=require('@supabase/supabase-js'),{Queue,Worker}=require('bullmq'),Redis=require('ioredis');
const {spawn}=require('node:child_process');
const {isRecoveryQuarantined}=require('./dist/worker/recoveryQuarantine');
assert(isRecoveryQuarantined());assert.equal(process.env.APP_ENV,'recovery');
assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');
assert.equal(new URL(process.env.REDIS_URL).hostname,'redis');
assert(!process.env.STRIPE_SECRET_KEY&&!process.env.RESEND_API_KEY);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const ok=r=>{assert(!r.error,JSON.stringify({code:r.error?.code,status:r.error?.status??r.error?.statusCode,message:r.error?.message}));return r.data;};
const checks=[],fixture=randomUUID(),prefix='{recovery-'+fixture+'}:bull';
let queue,worker,connection;
const main=async()=>{
 const email='recovery-'+fixture+'@example.invalid';
 const auth=ok(await db.auth.admin.createUser({email,email_confirm:true})).user;
 const existing=ok(await db.from('users').select('id').eq('supabase_user_id',auth.id).maybeSingle());
 const owner=existing??ok(await db.from('users').insert({supabase_user_id:auth.id,email,role:'member',status:'active'}).select('id').single());
 const doc=ok(await db.from('documents').insert({owner_id:owner.id,status:'pending_signature',document_type:'poa',jurisdiction:'US-CA'}).select('id').single());
 const template='# SYNTHETIC RECOVERY TEST — NO LEGAL EFFECT\n\nQueue reconstruction must preserve exact output bytes.\n';
 const templatePath=owner.id+'/'+doc.id+'/recovery-template.md';
 ok(await db.storage.from('documents').upload(templatePath,Buffer.from(template),{contentType:'text/markdown',upsert:false}));
 const artifact=ok(await db.from('template_artifacts').insert({template_key:'recovery_'+fixture,template_version:'fixture-v1',template_hash:createHash('sha256').update(template).digest('hex'),artifact_storage_path:templatePath,artifact_mime_type:'text/markdown',render_engine:'other',artifact_metadata:{templateLabel:'SYNTHETIC RECOVERY NO LEGAL EFFECT'}}).select('id').single());
 const runs=ok(await db.from('document_generation_runs').insert(['queued','rendering','rendered','failed','canceled','blocked'].map(status=>({document_id:doc.id,intake_revision:1,output_key:'recovery_fixture',document_key:'recovery_fixture',template_key:'recovery_'+fixture,template_version:'fixture-v1',template_hash:createHash('sha256').update(template).digest('hex'),template_artifact_id:artifact.id,status}))).select('id,status'));
 const ids=runs.map(r=>r.id),queued=runs.find(r=>r.status==='queued').id;
 const untouched=runs.filter(r=>r.id!==queued);
 const frozen=ok(await db.from('document_generation_runs').select('*').in('id',untouched.map(r=>r.id)).order('id'));
 connection=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null});queue=new Queue('generation-runs',{connection,prefix});
 const recover=require('./dist/services/generationQueueRecoveryService').reconcileQueuedGenerationRuns;
 const options={db,queue,runIds:ids};
 assert.deepEqual(await recover(100,options),{scanned:1,enqueued:1});
 assert.deepEqual(await recover(100,options),{scanned:1,enqueued:0});
 // Remove only this synthetic delivery, emulating a Redis-loss window before claim.
 await (await queue.getJob(queued)).remove();
 assert.equal((await recover(100,options)).enqueued,1);
 checks.push('Database reconstructs one missing queued delivery; stable IDs deduplicate retries; all other lifecycle states excluded');
 const render=require('./dist/services/documentGenerationRenderService').processDocumentGenerationRun;
 await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('synthetic render timeout')),60000);
   worker=new Worker('generation-runs',j=>render({runId:j.data.runId,rendererJobId:prefix+':'+j.id}),{connection,prefix});
   worker.on('completed',()=>{clearTimeout(timer);resolve();});worker.on('failed',()=>{clearTimeout(timer);reject(new Error('synthetic render failed'));});worker.on('error',()=>{clearTimeout(timer);reject(new Error('synthetic worker failed'));});
 });
 await worker.close();worker=null;
 const versions=ok(await db.from('document_versions').select('*').eq('generation_run_id',queued));assert.equal(versions.length,1);assert.equal(versions[0].is_final,false);
 const bytes=Buffer.from(await ok(await db.storage.from('documents').download(versions[0].storage_path)).arrayBuffer());
 assert(bytes.subarray(0,5).toString()==='%PDF-');const hash=createHash('sha256').update(bytes).digest('hex');
 assert.equal(await render({runId:queued,rendererJobId:'duplicate-fixture'}),null);
 assert.deepEqual(ok(await db.from('document_versions').select('*').eq('generation_run_id',queued)),versions);
 assert.equal(createHash('sha256').update(Buffer.from(await ok(await db.storage.from('documents').download(versions[0].storage_path)).arrayBuffer())).digest('hex'),hash);
 assert.deepEqual(ok(await db.from('document_generation_runs').select('*').in('id',untouched.map(r=>r.id)).order('id')),frozen);
 checks.push('Real renderer processes recovered synthetic work once; duplicate delivery preserves one exact readable version and untouched states');
 // Abrupt child exit immediately after actual Storage upload, before version insert.
 const crash=ok(await db.from('document_generation_runs').insert({document_id:doc.id,intake_revision:1,output_key:'recovery_crash',document_key:'recovery_fixture',template_key:'recovery_'+fixture,template_version:'fixture-v1',template_hash:'fixture',template_artifact_id:artifact.id,status:'queued'}).select('id').single());
 const childSource="const storage=require('./dist/services/storageService');const original=storage.uploadGeneratedDocument;storage.uploadGeneratedDocument=async(...args)=>{await original(...args);process.exit(77)};require('./dist/services/documentGenerationRenderService').processDocumentGenerationRun({runId:"+JSON.stringify(crash.id)+",rendererJobId:'synthetic-crash-after-storage'}).then(()=>process.exit(1)).catch(()=>process.exit(2));";
 const exit=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['-e',childSource],{stdio:'ignore'});const t=setTimeout(()=>p.kill('SIGKILL'),60000);p.on('error',reject);p.on('exit',c=>{clearTimeout(t);resolve(c);});});assert.equal(exit,77);
 const interrupted=ok(await db.from('document_generation_runs').select('status,document_version_id').eq('id',crash.id).single());assert.equal(interrupted.status,'rendering');assert.equal(interrupted.document_version_id,null);
 assert.deepEqual(await recover(100,{db,queue,runIds:[crash.id]}),{scanned:0,enqueued:0});
 assert.equal(await render({runId:crash.id,rendererJobId:'must-not-blind-retry'}),null);
 assert.equal(ok(await db.from('document_versions').select('id').eq('generation_run_id',crash.id)).length,0);
 assert.equal(ok(await db.from('document_release_controls').select('id').eq('document_id',doc.id)).length,0);
 checks.push('Abrupt exit after upload cannot falsely complete/release or auto-rerender an interrupted run; operator review required');
 return {checks,fixture,documentId:doc.id,sha256:hash,customerQueuesReplayed:false,realProviderCalls:false};
};
main().then(result=>console.log('RECOVERY_RESULT '+JSON.stringify(result))).catch(e=>{console.error('RECOVERY_FAILED '+e.message);process.exitCode=1;}).finally(async()=>{if(worker)await worker.close();if(queue)await queue.close();if(connection)await connection.quit();});
`;
const result=await new Promise((resolve,reject)=>{
 const child=spawn('docker',['exec','-i',runtime.name+'-api','node'],{stdio:['pipe','pipe','pipe']});let output='',errors='';
 const timer=setTimeout(()=>child.kill('SIGKILL'),180000);
 child.stdout.on('data',c=>{output+=c;});child.stderr.on('data',c=>{errors+=c;});
 child.on('error',reject);child.on('exit',async code=>{clearTimeout(timer);await writeFile(path.join(work,'queue-private.log'),output+'\n'+errors,{mode:0o600});const line=output.split('\n').find(l=>l.startsWith('RECOVERY_RESULT '));code===0&&line?resolve(JSON.parse(line.slice(16))):reject(new Error('Isolated queue drill failed; inspect queue-private.log in the private recovery directory'));});
 child.stdin.end(source);
});
const after=await docker(['exec',runtime.name+'-db','psql','-h','/tmp','-U','postgres','-At','-c',
  "select json_build_object('notifications',(select md5(coalesce(json_agg(t order by id)::text,'')) from notification_jobs t),'stripe',(select md5(coalesce(json_agg(t order by id)::text,'')) from stripe_webhook_events t),'release',(select md5(coalesce(json_agg(t order by id)::text,'')) from document_release_controls t))"]);
assert.equal(after,before,'Restored customer notification, Stripe and release rows must remain byte-for-byte unchanged');
const report={...result,snapshotId:runtime.snapshotId,completedAt:new Date().toISOString(),customerQueuesUnchanged:true,limitations:['Synthetic selected generation replay, not permission to resume historical notifications or Stripe events','Interrupted rendering remains quarantined for audited operator decision']};
await writeFile(path.join(work,'queue-report.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report));
