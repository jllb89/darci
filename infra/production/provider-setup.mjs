import assert from 'node:assert/strict';

export const productionWebhookUrl = 'https://api.illuminotary.com/webhooks/stripe';
export const productionStripeEvents = [
  'checkout.session.completed', 'checkout.session.expired',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required',
];

// Configuration only. In particular, installing keys must not approve live billing.
export function withProductionProviders(baseline, {stripe = false, sms = false, smsSenderArn, apns = false} = {}) {
  const t = structuredClone(baseline), r = t.Resources;
  assert.equal(r.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
  for (const service of ['api', 'web']) assert(r[`${service}Route`].Properties.Conditions.some(c => c.Field === 'source-ip'));
  assert(r.ResendHttpsIngress, 'Use the existing HTTPS callback ingress; never add a broad app route');
  const route = (name, path, priority) => {
    const value = {Type: 'AWS::ElasticLoadBalancingV2::ListenerRule', DependsOn: 'apiService', Properties: {
      ListenerArn: {Ref: 'Https'}, Priority: priority,
      Conditions: [
        {Field: 'host-header', HostHeaderConfig: {Values: ['api.illuminotary.com']}},
        {Field: 'path-pattern', PathPatternConfig: {Values: [path]}},
        {Field: 'http-request-method', HttpRequestMethodConfig: {Values: ['POST']}},
      ], Actions: [{Type: 'forward', TargetGroupArn: {Ref: 'apiTarget'}}],
    }};
    if (r[name]) assert.deepEqual(r[name], value, 'Existing callback route differs; review before replacing');
    r[name] = value;
  };
  for (const service of ['api', 'worker']) {
    const c = r[`${service}Task`].Properties.ContainerDefinitions[0];
    const env = Object.fromEntries(c.Environment.map(e => [e.Name, e.Value]));
    for (const key of ['STRIPE_LIVE_MODE_ENABLED', 'STRIPE_WEBHOOK_RUNNER_ENABLED', 'BILLING_RECONCILIATION_RUNNER_ENABLED', 'NOTIFICATION_OUTBOX_RUNNER_ENABLED', 'IOS_MEMBER_CHECKOUT_ENABLED']) {
      assert.equal(env[key], 'false', `${key} must remain closed`);
    }
    const additions = {}, secrets = [];
    if (stripe) {
      additions.STRIPE_RETURN_URL = 'https://app.illuminotary.com/app/billing';
      secrets.push('STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET');
    }
    if (sms && service === 'api') {
      assert.match(smsSenderArn ?? '', /^arn:aws:sms-voice:us-east-1:427057633951:phone-number\/phone-[a-f0-9]+$/);
      Object.assign(additions, {SUPABASE_AUTH_SMS_HOOK_ENABLED: 'true', PINPOINT_SMS_REGION: 'us-east-1',
        SUPABASE_AUTH_SMS_ORIGINATION_IDENTITY: smsSenderArn, SUPABASE_AUTH_SMS_MESSAGE_TYPE: 'TRANSACTIONAL'});
      secrets.push('SUPABASE_AUTH_SMS_HOOK_SECRET');
    }
    if (apns) {
      Object.assign(additions, {APNS_BUNDLE_ID: 'com.illuminote.darci', APNS_ENVIRONMENT: 'production',
        NOTIFICATION_PROVIDER_APNS_ENABLED: 'false'});
      secrets.push('APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY');
    }
    c.Environment = c.Environment.filter(e => !(e.Name in additions));
    c.Environment.push(...Object.entries(additions).map(([Name, Value]) => ({Name, Value})));
    c.Secrets = c.Secrets.filter(s => !secrets.includes(s.Name));
    for (const Name of secrets) c.Secrets.push({Name, ValueFrom: {'Fn::Sub':
      `arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/production/app-gwMt7d:${Name}::` + '${SecretVersion}'}});
  }
  if (stripe) route('StripeWebhookRoute', '/webhooks/stripe', 6);
  if (sms) {
    route('SupabaseSmsWebhookRoute', '/webhooks/supabase/auth/send-sms', 7);
    const policy = {PolicyName: 'production-auth-sms-send', PolicyDocument: {Version: '2012-10-17', Statement: [
      {Effect: 'Allow', Action: ['sms-voice:SendTextMessage'], Resource: smsSenderArn},
    ]}};
    const policies = r.TaskRole.Properties.Policies ?? [];
    const existing = policies.find(p => p.PolicyName === policy.PolicyName);
    if (existing) assert.deepEqual(existing, policy, 'Existing SMS permissions differ');
    else r.TaskRole.Properties.Policies = [...policies, policy];
  }
  return t;
}

export function verifyPreparedStripeEndpoint(endpoint) {
  assert.equal(endpoint.url, productionWebhookUrl);
  assert.equal(endpoint.livemode, true);
  assert.equal(endpoint.api_version, '2026-07-29.dahlia');
  assert.equal(endpoint.status, 'disabled', 'Endpoint activation needs separate billing approval');
  assert.deepEqual([...endpoint.enabled_events].sort(), [...productionStripeEvents].sort());
  return true;
}
