import assert from 'node:assert/strict';

export function withProductionPush(baseline) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
  for (const service of ['api','web']) assert(baseline.Resources[service+'Route'].Properties.Conditions.some(c=>c.Field==='source-ip'));
  const next = structuredClone(baseline);
  for (const service of ['api','worker']) {
    const container = next.Resources[service+'Task'].Properties.ContainerDefinitions[0];
    const env = Object.fromEntries(container.Environment.map(e=>[e.Name,e.Value]));
    assert.equal(env.APNS_ENVIRONMENT,'production');
    assert.equal(env.APNS_BUNDLE_ID,'com.illuminote.darci');
    assert.equal(env.NOTIFICATION_OUTBOX_RUNNER_ENABLED,service==='worker'?'true':'false');
    const flags = {NOTIFICATION_PUSH_PROVIDER:'apns',NOTIFICATION_PROVIDER_APNS_ENABLED:'true',NOTIFICATION_PROVIDER_APNS_ROLLOUT_PERCENT:'100',NOTIFICATION_PUSH_ALLOWED_ENVS:'production'};
    for (const [Name,Value] of Object.entries(flags)) {
      const entry = container.Environment.find(e=>e.Name===Name);
      if (entry) entry.Value=Value; else container.Environment.push({Name,Value});
    }
  }
  return next;
}
