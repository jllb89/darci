import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withPublicAppAccess} from './public-app-access.mjs';
const baseline = () => {
  const t = buildRuntime();
  t.Resources.ResendHttpsIngress = {Type: 'AWS::EC2::SecurityGroupIngress', Properties: {
    GroupId: 'sg-0900a4d6e17de09fa', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0',
  }};
  return t;
};
test('public access is additive, exact-host scoped, and preserves every previous resource/parameter', () => {
  const before = baseline(), after = withPublicAppAccess(before);
  for (const [id, value] of Object.entries(before.Resources)) assert.deepEqual(after.Resources[id], value);
  assert.deepEqual(after.Parameters, before.Parameters);
  assert.equal(Object.keys(after.Resources).length, Object.keys(before.Resources).length + 5);
  for (const [name, service, host] of [['PublicAppAccess', 'web', 'app.illuminotary.com'], ['PublicApiAccess', 'api', 'api.illuminotary.com']]) {
    const p = after.Resources[name].Properties;
    assert.deepEqual(p.Conditions, [{Field: 'host-header', HostHeaderConfig: {Values: [host]}}]);
    assert.deepEqual(p.Actions, [{Type: 'forward', TargetGroupArn: {Ref: `${service}Target`}}]);
  }
  assert.deepEqual(withPublicAppAccess(after), after);
});
test('operational paths are denied before public API fallback, but after existing operator/tester grants', () => {
  const t = withPublicAppAccess(baseline());
  for (const id of ['PublicApiInternalDeny', 'PublicApiDiagnosticsDeny']) {
    const p = t.Resources[id].Properties;
    assert(p.Priority > t.Resources.apiRoute.Properties.Priority);
    assert(p.Priority < t.Resources.PublicApiAccess.Properties.Priority);
    assert.equal(p.Actions[0].FixedResponseConfig.StatusCode, '403');
    assert(p.Conditions.reduce((n, c) => n + Object.values(c).filter(x => typeof x === 'object').reduce((s, x) => s + x.Values.length, 0), 0) <= 5);
  }
  const ingress = t.Resources.PublicAppHttpIngress.Properties;
  assert.equal(ingress.FromPort, 80); assert.equal(ingress.ToPort, 80);
  assert.equal(ingress.GroupId, t.Resources.LoadBalancer.Properties.SecurityGroups[0]);
  assert.equal(t.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
});
test('fails closed for foreign host/target, priority collisions, unexpected existing route or missing HTTPS/redirect', () => {
  for (const change of [
    t => { t.Resources.webRoute.Properties.Conditions = []; },
    t => { t.Resources.apiRoute.Properties.Conditions[0].HostHeaderConfig.Values = ['*.illuminotary.com']; },
    t => { t.Resources.webRoute.Properties.Actions[0].TargetGroupArn = {Ref: 'apiTarget'}; },
    t => { t.Resources.apiRoute.Properties.Priority = 300; },
    t => { delete t.Resources.ResendHttpsIngress; },
    t => { t.Resources.Http.Properties.DefaultActions[0].RedirectConfig.Protocol = 'HTTP'; },
    t => { t.Resources.PublicAppAccess = {Type: 'unreviewed'}; },
  ]) { const t = baseline(); change(t); assert.throws(() => withPublicAppAccess(t)); }
});
