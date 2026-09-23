// Exercise actual controller/service/worker catch paths with isolated dependency faults.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
assert.equal(process.env.APP_ENV,'recovery');assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');
assert(!process.env.STRIPE_SECRET_KEY&&!process.env.RESEND_API_KEY);
async function scenario(category){
 const assert=require('node:assert/strict');assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');
 process.env.APP_ENV='staging';process.env.NODE_ENV='production';process.env.OTEL_SDK_DISABLED='1';process.env.DISABLE_REDIS_QUEUES='true';process.env.RECOVERY_QUARANTINE='false';
 for(const name of ['NOTIFICATION_OUTBOX_RUNNER_ENABLED','STRIPE_WEBHOOK_RUNNER_ENABLED','BILLING_RECONCILIATION_RUNNER_ENABLED','STRIPE_WEBHOOK_RETENTION_RUNNER_ENABLED','GENERATION_RECOVERY_RUNNER_ENABLED'])process.env[name]='false';
 const emitted=[],originalError=console.error;
 console.error=(...args)=>{for(const arg of args)if(typeof arg==='string'){try{const value=JSON.parse(arg);if(value.kind==='darci_critical_signal'&&value.category===category)emitted.push(value);}catch{}}};
 const original=global.fetch;
 let fail=true;
 const target=category==='auth'?'/auth/v1/token':category==='platform'?'billing_runtime_configuration':category==='notification'?'notification_jobs':'stripe_webhook_events';
 global.fetch=async(...args)=>fail&&String(args[0]).includes(target)?new Response(JSON.stringify({code:'isolated_dependency_failure',message:'PRIVATE FAULT DETAIL MUST NOT ENTER SIGNAL'}),{status:503,headers:{'Content-Type':'application/json'}}):original(...args);
 if(category==='auth'){
  const controller=require('./dist/controllers/authController');
  await Promise.all(Array.from({length:5},async()=>{let status,body;const res={setHeader(){},status(n){status=n;return this;},json(b){body=b;return this;}};await controller.refresh({body:{refreshToken:'isolated-invalid-transport-only'},headers:{},method:'POST',path:'/auth/refresh'},res);assert.equal(status,503);assert.equal(body.error,'auth_temporarily_unavailable');}));
  fail=false;let status;await controller.refresh({body:{refreshToken:'isolated-invalid-transport-only'},headers:{},method:'POST',path:'/auth/refresh'},{setHeader(){},status(n){status=n;return this;},json(){return this;}});assert.equal(status,401,'Healthy provider must still reject invalid credentials');
 }else if(category==='audit'){
  fail=false;const service=require('./dist/services/auditService');await service.recordAuditEvent({entityType:'isolated_fixture',entityId:'not-a-uuid',action:'phase1.failure_drill'});
  const n=emitted.length;await service.recordAuditEvent({entityType:'isolated_fixture',action:'phase1.recovered_drill'});assert.equal(emitted.length,n);
 }else if(category==='platform'){
  const run=require('./dist/services/operationalWatchdogService').createOperationalWatchdogRunner();await run();await run();fail=false;
  // Dependency recovery is checked directly; old source-backup queue ages are not rewritten.
  const response=await original(process.env.SUPABASE_URL+'/rest/v1/billing_runtime_configuration?select=stripe_environment',{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY}});assert.equal(response.status,200);
 }else{
  process.env[category==='notification'?'NOTIFICATION_OUTBOX_RUNNER_ENABLED':category==='billing'?'STRIPE_WEBHOOK_RUNNER_ENABLED':'STRIPE_WEBHOOK_RETENTION_RUNNER_ENABLED']='true';
  require('./dist/worker/index');
  const until=Date.now()+15000;while(!emitted.length&&Date.now()<until)await new Promise(r=>setTimeout(r,100));
  fail=false;
  const response=await original(process.env.SUPABASE_URL+'/rest/v1/'+target+'?select=id&limit=1',{headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY}});assert.equal(response.status,200);
 }
 assert(emitted.length>=(category==='auth'?5:1),'No genuine source signal for '+category);
 for(const signal of emitted)assert(!JSON.stringify(signal).includes('PRIVATE FAULT'));
 originalError('SOURCE_RESULT '+JSON.stringify({category,signals:emitted,dependencyRecovered:true}));
}
(async()=>{
 const cases=[];
 for(const category of ['auth','audit','platform','notification','billing','retention']){
  const source='('+scenario.toString()+')('+JSON.stringify(category)+').then(()=>process.exit(0)).catch(e=>{process.stderr.write("SOURCE_FAILED "+e.message);process.exit(2)})';
  const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['-e',source],{stdio:['ignore','ignore','pipe']});let out='';p.stderr.on('data',v=>out+=v);const timer=setTimeout(()=>p.kill('SIGKILL'),90000);p.on('error',reject);p.on('exit',code=>{clearTimeout(timer);const line=out.split('\n').find(l=>l.startsWith('SOURCE_RESULT '));if(code===0&&line)resolve(JSON.parse(line.slice(14)));else reject(new Error(category+': '+out));});});
  cases.push(result);console.log('PROGRESS '+JSON.stringify({category,signals:result.signals.length,dependencyRecovered:true}));
 }
 console.log('RESULT '+JSON.stringify({passed:true,cases,scope:'Actual controller/service/worker source catch paths; dependency responses failed only inside internal clone; no customer/provider calls'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
