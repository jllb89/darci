import assert from 'node:assert/strict';

// Configuration-only private rollout. Does not enable push, SMS, sales or signup.
export function withPrivateNotificationWorker(baseline) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  for(const service of ['api','web']) assert(baseline.Resources[`${service}Route`].Properties.Conditions.some(c=>c.Field==='source-ip'));
  const next=structuredClone(baseline);
  for(const service of ['api','worker']) {
    const container=next.Resources[`${service}Task`].Properties.ContainerDefinitions[0];
    const env=Object.fromEntries(container.Environment.map(e=>[e.Name,e.Value]));
    assert.equal(env.BILLING_LIVE_ACCESS_MODE,'closed');
    assert.equal(env.NOTIFICATION_PROVIDER_APNS_ENABLED,'false');
    assert.equal(env.NOTIFICATION_OUTBOX_RUNNER_ENABLED,'false');
    assert.equal(env.IOS_MEMBER_CHECKOUT_ENABLED,'false');
    assert.equal(env.NOTIFICATION_PROVIDER,'resend');
    assert.equal(env.NOTIFICATION_PROVIDER_RESEND_ENABLED,'true');
    if(service==='worker') container.Environment.find(e=>e.Name==='NOTIFICATION_OUTBOX_RUNNER_ENABLED').Value='true';
  }
  return next;
}

export function assertEmptyNotificationBacklog(jobs) {
  assert(!jobs.some(j=>['queued','scheduled','processing','failed','partially_sent'].includes(j.status)),
    'Review exact pending recipients/jobs before activating the worker');
}
