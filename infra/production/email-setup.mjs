import assert from 'node:assert/strict';

export const emailEnvironment = {
  RESEND_FROM_ADDRESS: 'DARCi <notifications@notify.illuminotary.com>',
  AUTH_OTP_FROM_ADDRESS: 'DARCi <notifications@notify.illuminotary.com>',
  NOTIFICATION_DEFAULT_FROM: 'DARCi <notifications@notify.illuminotary.com>',
  NOTIFICATION_REPLY_TO: 'lopezb.jl@gmail.com',
  RESEND_REPLY_TO_ADDRESS: 'lopezb.jl@gmail.com',
  RESEND_FAILURE_MODE: 'strict',
  NOTIFICATION_PROVIDER: 'resend',
  NOTIFICATION_PROVIDER_RESEND_ENABLED: 'true',
  NOTIFICATION_RESEND_ALLOWED_ENVS: 'production',
  NOTIFICATION_OUTBOX_RUNNER_ENABLED: 'false',
};

// An explicit provider overlay: image-only releases must preserve this template.
// Port 443 becomes reachable, but default deny and operator-only app routes remain.
export function withProductionEmail(baseline) {
  const t = structuredClone(baseline);
  const r = t.Resources;
  assert.equal(r.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  for (const service of ['api', 'web']) {
    assert(r[`${service}Route`].Properties.Conditions.some(c => c.Field === 'source-ip'));
  }
  for (const service of ['api', 'worker']) {
    const c = r[`${service}Task`].Properties.ContainerDefinitions[0];
    assert.equal(c.Environment.find(e => e.Name === 'STRIPE_LIVE_MODE_ENABLED').Value, 'false');
    c.Environment = c.Environment.filter(e => !(e.Name in emailEnvironment));
    c.Environment.push(...Object.entries(emailEnvironment).map(([Name, Value]) => ({Name, Value})));
    c.Secrets = c.Secrets.filter(s => !['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'].includes(s.Name));
    for (const Name of ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET']) {
      c.Secrets.push({Name, ValueFrom: {'Fn::Sub': `arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/production/app-gwMt7d:${Name}::` + '${SecretVersion}'}});
    }
  }
  r.ResendWebhookRoute = {
    Type: 'AWS::ElasticLoadBalancingV2::ListenerRule', DependsOn: 'apiService',
    Properties: {
      ListenerArn: {Ref: 'Https'}, Priority: 5,
      Conditions: [
        {Field: 'host-header', HostHeaderConfig: {Values: ['api.illuminotary.com']}},
        {Field: 'path-pattern', PathPatternConfig: {Values: ['/webhooks/resend']}},
        {Field: 'http-request-method', HttpRequestMethodConfig: {Values: ['POST']}},
      ],
      Actions: [{Type: 'forward', TargetGroupArn: {Ref: 'apiTarget'}}],
    },
  };
  r.ResendHttpsIngress = {
    Type: 'AWS::EC2::SecurityGroupIngress', DependsOn: 'ResendWebhookRoute',
    Properties: {GroupId: 'sg-0900a4d6e17de09fa', IpProtocol: 'tcp', FromPort: 443, ToPort: 443,
      CidrIp: '0.0.0.0/0', Description: 'Signed Resend POST callback only; listener default denies all other public traffic'},
  };
  return t;
}
