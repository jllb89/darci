const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{createClient}=require('@supabase/supabase-js');
assert.equal(process.env.APP_ENV,'recovery');assert.equal(new URL(process.env.SUPABASE_URL).hostname,'gateway');assert(!process.env.RESEND_API_KEY);
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}),service=require('./dist/services/notificationOutboxService');
const ok=r=>{assert(!r.error,JSON.stringify(r.error));return r.data;};
(async()=>{
 const cases=[];
 for(const eventType of ['delivered','deferred','bounced','suppressed']){
  const run=randomUUID(),job=ok(await db.from('notification_jobs').insert({job_kind:'transactional',channel:'email',status:'sent',dedupe_key:'phase1-delivery-'+run,attempt_count:1,metadata:{synthetic:true}}).select('id').single());
  const delivery=ok(await db.from('notification_deliveries').insert({notification_job_id:job.id,channel:'email',provider:'resend',status:'sent',recipient_address:'synthetic@example.invalid',provider_message_id:run,metadata:{synthetic:true}}).select('id').single());
  const input={deliveryId:delivery.id,provider:'resend',eventType,providerMessageId:run,providerEventId:'evt_'+run,eventAt:new Date().toISOString()};
  await service.recordNotificationDeliveryEvent(input);await service.recordNotificationDeliveryEvent(input);
  const final=ok(await db.from('notification_deliveries').select('status').eq('id',delivery.id).single());assert.equal(final.status,eventType==='deferred'?'sent':eventType);
  const events=ok(await db.from('outbound_message_events').select('id').eq('provider_event_id',input.providerEventId));assert.equal(events.length,1);
  const outcome=await service.runDueNotificationJobs({notificationJobIds:[job.id]});
  assert.equal(ok(await db.from('notification_jobs').select('attempt_count').eq('id',job.id).single()).attempt_count,1);
  cases.push({eventType,status:final.status,deduplicated:true,noResend:true});
 }
 console.log('RESULT '+JSON.stringify({passed:true,cases,scope:'Actual isolated callback persistence and duplicate handling; no external email delivery claimed'}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
