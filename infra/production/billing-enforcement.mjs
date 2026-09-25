import assert from 'node:assert/strict';

export function withEnforcedPrivateBilling(baseline) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  for (const service of ['api', 'web']) assert(baseline.Resources[`${service}Route`].Properties.Conditions.some(c => c.Field === 'source-ip'));
  const next = structuredClone(baseline);
  for (const service of ['api', 'worker']) {
    const container = next.Resources[`${service}Task`].Properties.ContainerDefinitions[0];
    const env = Object.fromEntries(container.Environment.map(e => [e.Name, e.Value]));
    assert.equal(env.BILLING_LIVE_ACCESS_MODE, 'closed');
    assert.equal(env.IOS_MEMBER_CHECKOUT_ENABLED, 'false');
    assert(!container.Secrets.some(s => s.Name === 'BILLING_ENFORCEMENT_MODE'), 'Review conflicting secret binding');
    assert([undefined, 'observe', 'enforced'].includes(env.BILLING_ENFORCEMENT_MODE), 'Unexpected enforcement baseline');
    container.Environment = container.Environment.filter(e => e.Name !== 'BILLING_ENFORCEMENT_MODE');
    container.Environment.push({Name: 'BILLING_ENFORCEMENT_MODE', Value: 'enforced'});
  }
  return next;
}
