import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withProductionPush} from './push-rollout.mjs';
const baseline = () => ({Resources:{Https:{Properties:{DefaultActions:[{FixedResponseConfig:{StatusCode:'403'}}]}},
  ...Object.fromEntries(['api','web'].map(s=>[s+'Route',{Properties:{Conditions:[{Field:'source-ip'}]}}])),
  ...Object.fromEntries(['api','worker'].map(s=>[s+'Task',{Properties:{ContainerDefinitions:[{Image:'unchanged',Environment:Object.entries({APNS_ENVIRONMENT:'production',APNS_BUNDLE_ID:'com.illuminote.darci',NOTIFICATION_OUTBOX_RUNNER_ENABLED:s==='worker'?'true':'false',NOTIFICATION_PROVIDER_APNS_ENABLED:'false',BILLING_LIVE_ACCESS_MODE:'private_members'}).map(([Name,Value])=>({Name,Value}))}]}}]))}});
test('enables only push flags; preserves images, private access, billing and worker ownership',()=>{
  const before=baseline(), result=withProductionPush(before);
  assert.deepEqual(before,baseline());
  for(const s of ['api','worker']) {
    const old=before.Resources[s+'Task'].Properties.ContainerDefinitions[0];
    const next=result.Resources[s+'Task'].Properties.ContainerDefinitions[0];
    assert.equal(next.Image,old.Image);
    for(const entry of old.Environment.filter(e=>e.Name!=='NOTIFICATION_PROVIDER_APNS_ENABLED')) assert(next.Environment.some(e=>e.Name===entry.Name&&e.Value===entry.Value));
    assert(next.Environment.some(e=>e.Name==='NOTIFICATION_PUSH_PROVIDER'&&e.Value==='apns'));
  }
  assert.deepEqual(result.Resources.Https,before.Resources.Https);
  assert.deepEqual(result.Resources.apiRoute,before.Resources.apiRoute);
  assert.deepEqual(withProductionPush(result),result);
});
test('refuses sandbox APNs or a missing private gate',()=>{
  const input=baseline();input.Resources.apiTask.Properties.ContainerDefinitions[0].Environment[0].Value='sandbox';
  assert.throws(()=>withProductionPush(input));
  const open=baseline();open.Resources.apiRoute.Properties.Conditions=[];assert.throws(()=>withProductionPush(open));
});
