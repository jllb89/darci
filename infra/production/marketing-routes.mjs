import assert from 'node:assert/strict';

// Marketing only: never forward authentication, document or API paths on the apex.
export function withMarketingRoutes(baseline, certificateArn) {
  assert.match(certificateArn, /^arn:aws:acm:us-east-1:427057633951:certificate\/[a-f0-9-]{36}$/);
  assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  for (const service of ['api', 'web']) {
    assert(baseline.Resources[service + 'Route'].Properties.Conditions.some(c => c.Field === 'source-ip'));
  }
  const next = structuredClone(baseline);
  const add = (name, priority, host, paths, action) => {
    assert(!next.Resources[name], 'Marketing already configured; inspect before replacing');
    assert(!Object.values(next.Resources).some(r => r.Type === 'AWS::ElasticLoadBalancingV2::ListenerRule' && Number(r.Properties.Priority) === priority), 'Priority collision');
    next.Resources[name] = {Type: 'AWS::ElasticLoadBalancingV2::ListenerRule', Properties: {
      ListenerArn: {Ref: 'Https'}, Priority: priority,
      Conditions: [
        {Field: 'host-header', HostHeaderConfig: {Values: [host]}},
        ...(paths ? [{Field: 'path-pattern', PathPatternConfig: {Values: paths}}] : []),
        {Field: 'http-request-method', HttpRequestMethodConfig: {Values: ['GET', 'HEAD']}},
      ], Actions: [action],
    }};
  };
  const forward = {Type: 'forward', TargetGroupArn: {Ref: 'webTarget'}};
  const redirect = host => ({Type: 'redirect', RedirectConfig: {
    Protocol: 'HTTPS', Port: '443', Host: host, Path: '/#{path}', Query: '#{query}', StatusCode: 'HTTP_301',
  }});
  add('MarketingCanonical', 230, 'www.illuminotary.com', null, redirect('illuminotary.com'));
  for (const [index, paths] of [
    ['/', '/_next/static/*'],
    ['/images/*', '/icons/*'],
    ['/favicon.ico', '/footer/*'],
  ].entries()) add('MarketingPublic' + index, 231 + index, 'illuminotary.com', paths, forward);
  add('MarketingAppRedirect', 239, 'illuminotary.com', null, redirect('app.illuminotary.com'));
  assert(!next.Resources.MarketingCertificate);
  next.Resources.MarketingCertificate = {Type: 'AWS::ElasticLoadBalancingV2::ListenerCertificate', Properties: {
    ListenerArn: {Ref: 'Https'}, Certificates: [{CertificateArn: certificateArn}],
  }};
  return next;
}
