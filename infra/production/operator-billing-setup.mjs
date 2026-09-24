import assert from 'node:assert/strict';
export const operatorUserId='b85bfa13-0e4d-4766-b691-180b904f57a9';
export const operatorPriceCode='member_starter_monthly_v2';

// Separate, explicit approval from provider credential installation. No public rollout.
export function withOperatorBilling(baseline,{startsAt,expiresAt}) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  for(const service of ['api','web'])assert(baseline.Resources[`${service}Route`].Properties.Conditions.some(c=>c.Field==='source-ip'));
  const start=Date.parse(startsAt),end=Date.parse(expiresAt);
  assert(Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end-start<=86400000);
  const next=structuredClone(baseline);
  for(const service of ['api','worker']) {
    const container=next.Resources[`${service}Task`].Properties.ContainerDefinitions[0];
    const env=Object.fromEntries(container.Environment.map(e=>[e.Name,e.Value]));
    for(const flag of ['STRIPE_LIVE_MODE_ENABLED','STRIPE_WEBHOOK_RUNNER_ENABLED','BILLING_RECONCILIATION_RUNNER_ENABLED','NOTIFICATION_OUTBOX_RUNNER_ENABLED','IOS_MEMBER_CHECKOUT_ENABLED'])assert.equal(env[flag],'false',`${flag} not in reviewed closed baseline`);
    const changes={STRIPE_LIVE_MODE_ENABLED:'true',BILLING_LIVE_ACCESS_MODE:'operator',BILLING_LIVE_OPERATOR_USER_ID:operatorUserId,
      BILLING_LIVE_OPERATOR_STARTS_AT:startsAt,BILLING_LIVE_OPERATOR_EXPIRES_AT:expiresAt,
      STRIPE_WEBHOOK_RUNNER_ENABLED:service==='worker'?'true':'false',BILLING_RECONCILIATION_RUNNER_ENABLED:service==='worker'?'true':'false'};
    container.Environment=container.Environment.filter(e=>!(e.Name in changes));
    container.Environment.push(...Object.entries(changes).map(([Name,Value])=>({Name,Value})));
  }
  return next;
}

// End new purchases without interrupting webhook/cancellation/renewal processing.
export function withClosedOperatorBilling(baseline) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  for(const service of ['api','web'])assert(baseline.Resources[`${service}Route`].Properties.Conditions.some(c=>c.Field==='source-ip'));
  const next=structuredClone(baseline);
  for(const service of ['api','worker']) {
    const container=next.Resources[`${service}Task`].Properties.ContainerDefinitions[0];
    const env=Object.fromEntries(container.Environment.map(e=>[e.Name,e.Value]));
    assert.equal(env.BILLING_LIVE_ACCESS_MODE,'operator');
    assert.equal(env.BILLING_LIVE_OPERATOR_USER_ID,operatorUserId);
    assert.equal(env.STRIPE_LIVE_MODE_ENABLED,'true');
    assert.equal(env.STRIPE_WEBHOOK_RUNNER_ENABLED,service==='worker'?'true':'false');
    assert.equal(env.BILLING_RECONCILIATION_RUNNER_ENABLED,service==='worker'?'true':'false');
    assert.equal(env.NOTIFICATION_OUTBOX_RUNNER_ENABLED,'false');
    assert.equal(env.IOS_MEMBER_CHECKOUT_ENABLED,'false');
    container.Environment=container.Environment.filter(e=>!['BILLING_LIVE_ACCESS_MODE','BILLING_LIVE_OPERATOR_USER_ID','BILLING_LIVE_OPERATOR_STARTS_AT','BILLING_LIVE_OPERATOR_EXPIRES_AT'].includes(e.Name));
    container.Environment.push({Name:'BILLING_LIVE_ACCESS_MODE',Value:'closed'});
  }
  return next;
}
