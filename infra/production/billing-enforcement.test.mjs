import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withEnforcedPrivateBilling} from './billing-enforcement.mjs';
const baseline = () => {
  const t = buildRuntime();
  for (const s of ['api', 'worker']) {
    const c = t.Resources[s + 'Task'].Properties.ContainerDefinitions[0];
    c.Environment = c.Environment.filter(e => e.Name !== 'BILLING_LIVE_ACCESS_MODE');
    c.Environment.push({Name: 'BILLING_LIVE_ACCESS_MODE', Value: 'closed'});
  }
  return t;
};
test('enforcement changes only one variable on API and worker, retaining images/secrets/access/sales gates', () => {
  const before = baseline(), after = withEnforcedPrivateBilling(before);
  for (const s of ['api', 'worker']) {
    const env = after.Resources[s + 'Task'].Properties.ContainerDefinitions[0].Environment;
    assert.deepEqual(env.pop(), {Name: 'BILLING_ENFORCEMENT_MODE', Value: 'enforced'});
  }
  assert.deepEqual(after, before);
});
test('enforcement is idempotent and refuses conflicting configuration or opened sales/access', () => {
  const t = withEnforcedPrivateBilling(baseline()); assert.deepEqual(withEnforcedPrivateBilling(t), t);
  for (const [name, value] of [['BILLING_LIVE_ACCESS_MODE', 'open'], ['IOS_MEMBER_CHECKOUT_ENABLED', 'true']]) {
    const t = baseline(); t.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.find(e => e.Name === name).Value = value;
    assert.throws(() => withEnforcedPrivateBilling(t));
  }
  const t2 = baseline(); t2.Resources.apiRoute.Properties.Conditions = []; assert.throws(() => withEnforcedPrivateBilling(t2));
  const t3 = baseline(); t3.Resources.apiTask.Properties.ContainerDefinitions[0].Secrets.push({Name:'BILLING_ENFORCEMENT_MODE',ValueFrom:'conflict'}); assert.throws(() => withEnforcedPrivateBilling(t3));
});
