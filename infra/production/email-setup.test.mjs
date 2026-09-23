import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withProductionEmail} from './email-setup.mjs';

test('email overlay preserves private app/API routes, images and payment/runner gates', () => {
  const baseline = buildRuntime();
  const t = withProductionEmail(baseline);
  for (const key of ['Https', 'HttpIngress', 'apiRoute', 'webRoute', 'webTask', 'apiService', 'workerService', 'webService']) {
    assert.deepEqual(t.Resources[key], baseline.Resources[key]);
  }
  for (const s of ['api', 'worker']) {
    const c = t.Resources[`${s}Task`].Properties.ContainerDefinitions[0];
    assert.deepEqual(c.Image, baseline.Resources[`${s}Task`].Properties.ContainerDefinitions[0].Image);
    for (const n of ['STRIPE_LIVE_MODE_ENABLED', 'NOTIFICATION_OUTBOX_RUNNER_ENABLED', 'IOS_MEMBER_CHECKOUT_ENABLED']) {
      assert.equal(c.Environment.find(e => e.Name === n).Value, 'false');
    }
    assert.equal(c.Environment.find(e => e.Name === 'RESEND_FAILURE_MODE').Value, 'strict');
    for (const s of c.Secrets) assert(s.ValueFrom['Fn::Sub'].endsWith('::${SecretVersion}'));
  }
  assert(!JSON.stringify(baseline).includes('RESEND_API_KEY'));
});
test('public exception is exact production host, POST and callback path; opens only after healthy API and route', () => {
  const r = withProductionEmail(buildRuntime()).Resources;
  assert.deepEqual(r.ResendWebhookRoute.Properties.Conditions, [
    {Field: 'host-header', HostHeaderConfig: {Values: ['api.illuminotary.com']}},
    {Field: 'path-pattern', PathPatternConfig: {Values: ['/webhooks/resend']}},
    {Field: 'http-request-method', HttpRequestMethodConfig: {Values: ['POST']}},
  ]);
  assert.equal(r.ResendWebhookRoute.DependsOn, 'apiService');
  assert.equal(r.ResendHttpsIngress.DependsOn, 'ResendWebhookRoute');
  assert.equal(r.ResendHttpsIngress.Properties.FromPort, 443);
  assert.equal(r.ResendHttpsIngress.Properties.ToPort, 443);
});
test('overlay is repeatable and rejects an already public app route', () => {
  const t = withProductionEmail(buildRuntime());
  assert.deepEqual(withProductionEmail(t), t);
  t.Resources.apiRoute.Properties.Conditions = [];
  assert.throws(() => withProductionEmail(t));
});
