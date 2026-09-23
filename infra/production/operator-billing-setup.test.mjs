import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withOperatorBilling,operatorUserId} from './operator-billing-setup.mjs';
const window={startsAt:'2026-09-23T21:00:00Z',expiresAt:'2026-09-24T21:00:00Z'};
test('operator billing changes only API/worker flags; preserves private routes, keys, images and general notifications',()=>{
  const before=buildRuntime(),after=withOperatorBilling(before,window);
  for(const [key,value] of Object.entries(before.Resources)) {
    if(['apiTask','workerTask'].includes(key)) {
      assert.deepEqual({...after.Resources[key].Properties.ContainerDefinitions[0],Environment:[]},{...value.Properties.ContainerDefinitions[0],Environment:[]});
      const env=Object.fromEntries(after.Resources[key].Properties.ContainerDefinitions[0].Environment.map(e=>[e.Name,e.Value]));
      assert.equal(env.BILLING_LIVE_ACCESS_MODE,'operator');assert.equal(env.BILLING_LIVE_OPERATOR_USER_ID,operatorUserId);
      assert.equal(env.NOTIFICATION_OUTBOX_RUNNER_ENABLED,'false');assert.equal(env.IOS_MEMBER_CHECKOUT_ENABLED,'false');
      assert.equal(env.STRIPE_WEBHOOK_RUNNER_ENABLED,key==='workerTask'?'true':'false');
    }else assert.deepEqual(after.Resources[key],value);
  }
});
test('operator activation rejects malformed/long windows or changed public/sales gates',()=>{
  for(const patch of [{expiresAt:'bad'},{expiresAt:'2026-09-25T21:00:00Z'},{startsAt:'2026-09-24T22:00:00Z'}])assert.throws(()=>withOperatorBilling(buildRuntime(),{...window,...patch}));
  const publicTemplate=buildRuntime();publicTemplate.Resources.apiRoute.Properties.Conditions=[];assert.throws(()=>withOperatorBilling(publicTemplate,window));
  const changed=buildRuntime();changed.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.find(e=>e.Name==='STRIPE_LIVE_MODE_ENABLED').Value='true';assert.throws(()=>withOperatorBilling(changed,window));
});
