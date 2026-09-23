// Scoped one-shot AWS worker. Never starts a general runner or discovers recipients.
const assert = require('node:assert/strict');
const {createClient} = require('@supabase/supabase-js');
async function main() {
  assert.equal(process.env.SUPABASE_URL, 'https://jdrgluisxhgegdsesman.supabase.co');
  assert.equal(process.env.NOTIFICATION_OUTBOX_RUNNER_ENABLED, 'false');
  const fixture = JSON.parse(process.env.OPERATOR_OUTBOX_FIXTURE);
  assert.equal(fixture.marker, 'production-operator-outbox-20260923');
  assert.equal(fixture.jobs.length, 2);
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
  const ok = r => {assert(!r.error, 'Fixture query failed'); return r.data;};
  const jobs = ok(await db.from('notification_jobs').select('id,status,metadata,attempt_count').in('id',fixture.jobs));
  assert.equal(jobs.length, 2);
  assert(jobs.every(j => j.metadata.purpose === fixture.marker && j.metadata.synthetic === true && j.status === 'queued' && j.attempt_count === 0), 'Already attempted: no automatic resend');
  const deliveries = ok(await db.from('notification_deliveries').select('id,channel,target_user_id,recipient_address,device_push_token_id,metadata').in('notification_job_id',fixture.jobs));
  assert.equal(deliveries.length, 2);
  for (const d of deliveries) {
    assert.equal(d.target_user_id, fixture.userId);
    assert.equal(d.metadata.purpose, fixture.marker);
    if (d.channel === 'email') assert.equal(d.recipient_address, 'lopezb.jl@gmail.com');
    else {assert.equal(d.channel, 'push');assert.equal(d.device_push_token_id, fixture.deviceId);}
  }
  const {runDueNotificationJobs} = require('./dist/services/notificationOutboxService');
  const first = await runDueNotificationJobs({notificationJobIds:fixture.jobs,limit:2,workerId:fixture.marker});
  assert.equal(first.processedCount, 2);
  assert(first.jobs.every(j => j.attemptedDeliveryCount === 1 && j.failedCount === 0));
  const second = await runDueNotificationJobs({notificationJobIds:fixture.jobs,limit:2,workerId:fixture.marker});
  assert.equal(second.processedCount, 0, 'Completed jobs were selected again');
  console.log(JSON.stringify({operatorOutbox:true,passed:true,processed:2,repeatedDispatches:0}));
}
main().then(() => process.exit(0)).catch(e => {
  console.log(JSON.stringify({operatorOutbox:true,passed:false,errorClass:e.name}));process.exit(1);
});
