import assert from 'node:assert/strict';

// Opens hosted live checkout only within the existing private production boundary.
// Does not change signup, IP access, credentials, images, runners or task capacity.
export function withPrivateMemberSales(baseline) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  for (const name of ['api', 'web']) {
    assert(baseline.Resources[`${name}Route`].Properties.Conditions.some(c => c.Field === 'source-ip'));
  }
  const next = structuredClone(baseline);
  for (const name of ['api', 'worker']) {
    const container = next.Resources[`${name}Task`].Properties.ContainerDefinitions[0];
    const env = Object.fromEntries(container.Environment.map(e => [e.Name, e.Value]));
    assert.equal(env.APP_ENV, 'production');
    assert.equal(env.STRIPE_PROVIDER_ENVIRONMENT, 'live');
    assert.equal(env.STRIPE_LIVE_MODE_ENABLED, 'true');
    assert.equal(env.BILLING_ENFORCEMENT_MODE, 'enforced');
    assert.equal(env.STRIPE_WEBHOOK_RUNNER_ENABLED, name === 'worker' ? 'true' : 'false');
    assert.equal(env.BILLING_RECONCILIATION_RUNNER_ENABLED, name === 'worker' ? 'true' : 'false');
    assert(['closed', 'open'].includes(env.BILLING_LIVE_ACCESS_MODE));
    assert(['false', 'true'].includes(env.IOS_MEMBER_CHECKOUT_ENABLED));
    const changes = {BILLING_LIVE_ACCESS_MODE: 'open', IOS_MEMBER_CHECKOUT_ENABLED: 'true'};
    assert(!container.Secrets.some(s => s.Name in changes), 'Conflicting secret binding');
    for (const [key, value] of Object.entries(changes)) {
      assert.equal(container.Environment.filter(e => e.Name === key).length, 1);
      container.Environment.find(e => e.Name === key).Value = value;
    }
  }
  return next;
}
