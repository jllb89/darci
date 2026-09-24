import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withPrivateNotificationWorker,assertEmptyNotificationBacklog} from './notification-rollout.mjs';
const baseline=()=>{
  const t=buildRuntime();
  for(const s of ['api','worker']){
    const c=t.Resources[`${s}Task`].Properties.ContainerDefinitions[0];
    const values={BILLING_LIVE_ACCESS_MODE:'closed',NOTIFICATION_PROVIDER:'resend',NOTIFICATION_PROVIDER_RESEND_ENABLED:'true',NOTIFICATION_PROVIDER_APNS_ENABLED:'false'};
    c.Environment=c.Environment.filter(e=>!(e.Name in values));
    c.Environment.push(...Object.entries(values).map(([Name,Value])=>({Name,Value})));
  }
  return t;
};
test('private notification rollout changes exactly one worker flag and preserves every other resource',()=>{
  const before=baseline(),after=withPrivateNotificationWorker(before);
  after.Resources.workerTask.Properties.ContainerDefinitions[0].Environment.find(e=>e.Name==='NOTIFICATION_OUTBOX_RUNNER_ENABLED').Value='false';
  assert.deepEqual(after,before);
});
test('refuses public routing, open sales, enabled push or an already enabled runner',()=>{
  for(const [name,value] of [['BILLING_LIVE_ACCESS_MODE','open'],['NOTIFICATION_PROVIDER_APNS_ENABLED','true'],['NOTIFICATION_OUTBOX_RUNNER_ENABLED','true']]){
    const t=baseline();t.Resources.workerTask.Properties.ContainerDefinitions[0].Environment.find(e=>e.Name===name).Value=value;
    assert.throws(()=>withPrivateNotificationWorker(t));
  }
  const t=baseline();t.Resources.apiRoute.Properties.Conditions=[];assert.throws(()=>withPrivateNotificationWorker(t));
});
test('activation refuses any unfinished backlog, including future scheduled jobs',()=>{
  for(const status of ['queued','scheduled','processing','failed','partially_sent']) assert.throws(()=>assertEmptyNotificationBacklog([{status}]));
  assertEmptyNotificationBacklog([{status:'completed'},{status:'canceled'},{status:'suppressed'}]);
});
