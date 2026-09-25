import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withPrivateMemberSales} from './private-member-sales.mjs';

function baseline() {
  const template = buildRuntime();
  for (const name of ['api', 'worker']) {
    const c = template.Resources[name + 'Task'].Properties.ContainerDefinitions[0];
    const values = {STRIPE_LIVE_MODE_ENABLED:'true', BILLING_ENFORCEMENT_MODE:'enforced',
      BILLING_LIVE_ACCESS_MODE:'closed', STRIPE_WEBHOOK_RUNNER_ENABLED: name === 'worker' ? 'true' : 'false',
      BILLING_RECONCILIATION_RUNNER_ENABLED: name === 'worker' ? 'true' : 'false'};
    c.Environment = c.Environment.filter(e => !(e.Name in values));
    c.Environment.push(...Object.entries(values).map(([Name, Value]) => ({Name, Value})));
  }
  return template;
}
test('private live sales changes only the two approved flags, preserving every other resource', () => {
  const before = baseline(), after = withPrivateMemberSales(before);
  assert.deepEqual(withPrivateMemberSales(after), after);
  for (const name of ['api', 'worker']) {
    const env = after.Resources[name + 'Task'].Properties.ContainerDefinitions[0].Environment;
    assert.equal(env.find(e => e.Name === 'BILLING_LIVE_ACCESS_MODE').Value, 'open');
    assert.equal(env.find(e => e.Name === 'IOS_MEMBER_CHECKOUT_ENABLED').Value, 'true');
    env.find(e => e.Name === 'BILLING_LIVE_ACCESS_MODE').Value = 'closed';
    env.find(e => e.Name === 'IOS_MEMBER_CHECKOUT_ENABLED').Value = 'false';
  }
  assert.deepEqual(after, before);
});
test('rejects unexpected or unsafe baselines rather than silently changing them', () => {
  for (const [key, value] of [['APP_ENV','staging'], ['STRIPE_LIVE_MODE_ENABLED','false'],
    ['BILLING_ENFORCEMENT_MODE','observe'], ['STRIPE_WEBHOOK_RUNNER_ENABLED','true']]) {
    const t = baseline();
    t.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.find(e => e.Name === key).Value = value;
    assert.throws(() => withPrivateMemberSales(t));
  }
  const t = baseline(); t.Resources.apiRoute.Properties.Conditions = [];
  assert.throws(() => withPrivateMemberSales(t));
  const conflict = baseline(); conflict.Resources.apiTask.Properties.ContainerDefinitions[0].Secrets.push({Name:'IOS_MEMBER_CHECKOUT_ENABLED',ValueFrom:'conflict'});
  assert.throws(() => withPrivateMemberSales(conflict));
});
