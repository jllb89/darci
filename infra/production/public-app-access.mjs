import assert from 'node:assert/strict';

// Public network reachability is not anonymous document/admin authorization.
// Existing operator/tester routes retain access to diagnostics/internal endpoints.
export function withPublicAppAccess(baseline) {
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  for (const [service, host] of [['web', 'app.illuminotary.com'], ['api', 'api.illuminotary.com']]) {
    const route = baseline.Resources[`${service}Route`].Properties;
    assert(route.Conditions.some(c => c.Field === 'source-ip'), 'Expected original private operator route');
    assert.deepEqual(route.Conditions.find(c => c.Field === 'host-header').HostHeaderConfig.Values, [host]);
    assert(Number(route.Priority) < 300);
    assert.deepEqual(route.Actions, [{Type: 'forward', TargetGroupArn: {Ref: `${service}Target`}}]);
  }
  assert(Object.values(baseline.Resources).some(r => r.Type === 'AWS::EC2::SecurityGroupIngress'
    && r.Properties.GroupId === 'sg-0900a4d6e17de09fa' && r.Properties.FromPort === 443
    && r.Properties.ToPort === 443 && r.Properties.CidrIp === '0.0.0.0/0'), 'Expected existing public HTTPS ingress');
  const next = structuredClone(baseline);
  const rules = [
    ['PublicAppAccess', 300, 'app.illuminotary.com', null, 'web'],
    ['PublicApiInternalDeny', 301, 'api.illuminotary.com', ['/internal', '/internal/*', '/debug-sentry'], null],
    ['PublicApiDiagnosticsDeny', 302, 'api.illuminotary.com', ['/docs', '/docs/*', '/openapi.yaml'], null],
    ['PublicApiAccess', 303, 'api.illuminotary.com', null, 'api'],
  ];
  for (const [name, priority, host, paths, service] of rules) {
    const resource = {Type: 'AWS::ElasticLoadBalancingV2::ListenerRule', Properties: {
      ListenerArn: {Ref: 'Https'}, Priority: priority,
      Conditions: [
        {Field: 'host-header', HostHeaderConfig: {Values: [host]}},
        ...(paths ? [{Field: 'path-pattern', PathPatternConfig: {Values: paths}}] : []),
      ], Actions: service
        ? [{Type: 'forward', TargetGroupArn: {Ref: `${service}Target`}}]
        : [{Type: 'fixed-response', FixedResponseConfig: {StatusCode: '403', ContentType: 'text/plain', MessageBody: 'Restricted operational endpoint.'}}],
    }};
    assert(!Object.entries(baseline.Resources).some(([id, r]) => id !== name && r.Type === resource.Type && Number(r.Properties.Priority) === priority), 'Priority collision');
    if (baseline.Resources[name]) assert.deepEqual(baseline.Resources[name], resource, 'Existing public route differs; inspect before replacing');
    next.Resources[name] = resource;
  }
  const ingress = {Type: 'AWS::EC2::SecurityGroupIngress', Properties: {
    GroupId: 'sg-0900a4d6e17de09fa', IpProtocol: 'tcp', FromPort: 80, ToPort: 80,
    CidrIp: '0.0.0.0/0', Description: 'Public HTTP only redirects to HTTPS; application authorization remains enforced',
  }};
  if (baseline.Resources.PublicAppHttpIngress) assert.deepEqual(baseline.Resources.PublicAppHttpIngress, ingress);
  assert.equal(baseline.Resources.Http.Properties.DefaultActions[0].RedirectConfig.Protocol, 'HTTPS');
  assert.equal(baseline.Resources.Http.Properties.DefaultActions[0].RedirectConfig.StatusCode, 'HTTP_301');
  next.Resources.PublicAppHttpIngress = ingress;
  return next;
}
