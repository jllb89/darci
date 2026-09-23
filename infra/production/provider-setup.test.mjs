import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withProductionEmail} from './email-setup.mjs';
import {withProductionProviders, verifyPreparedStripeEndpoint, productionStripeEvents, productionWebhookUrl} from './provider-setup.mjs';
const base = () => withProductionEmail(buildRuntime());
const options = {stripe: true, sms: true, apns: true, smsSenderArn: 'arn:aws:sms-voice:us-east-1:427057633951:phone-number/phone-123abc'};

test('provider preparation preserves images, services, private routes and closed payment/runner gates', () => {
  const b=base(), t=withProductionProviders(b,options);
  for(const key of ['apiRoute','webRoute','Https','ResendWebhookRoute','ResendHttpsIngress','apiService','workerService','webService','webTask']) assert.deepEqual(t.Resources[key],b.Resources[key]);
  for(const s of ['api','worker']) {
    const c=t.Resources[`${s}Task`].Properties.ContainerDefinitions[0];
    assert.deepEqual(c.Image,b.Resources[`${s}Task`].Properties.ContainerDefinitions[0].Image);
    for(const n of ['STRIPE_LIVE_MODE_ENABLED','STRIPE_WEBHOOK_RUNNER_ENABLED','NOTIFICATION_OUTBOX_RUNNER_ENABLED','NOTIFICATION_PROVIDER_APNS_ENABLED']) assert.equal(c.Environment.find(e=>e.Name===n).Value,'false');
    for(const secret of c.Secrets) assert(secret.ValueFrom['Fn::Sub'].endsWith('::${SecretVersion}'));
  }
  assert.equal(b.Resources.StripeWebhookRoute,undefined);
  assert.deepEqual(withProductionProviders(t,options),t);
});
test('callback exceptions allow only the exact production host/path and POST',()=>{
  const r=withProductionProviders(base(),options).Resources;
  for(const [name,path] of [['StripeWebhookRoute','/webhooks/stripe'],['SupabaseSmsWebhookRoute','/webhooks/supabase/auth/send-sms']]){
    assert.deepEqual(r[name].Properties.Conditions,[
      {Field:'host-header',HostHeaderConfig:{Values:['api.illuminotary.com']}},
      {Field:'path-pattern',PathPatternConfig:{Values:[path]}},
      {Field:'http-request-method',HttpRequestMethodConfig:{Values:['POST']}},
    ]);
  }
  assert.deepEqual(r.TaskRole.Properties.Policies[0].PolicyDocument.Statement,[{Effect:'Allow',Action:['sms-voice:SendTextMessage'],Resource:options.smsSenderArn}]);
});
test('preparation refuses public routes, open sales and wildcard SMS permissions',()=>{
  const b=base();b.Resources.apiRoute.Properties.Conditions=[];
  assert.throws(()=>withProductionProviders(b,options));
  const c=base();c.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.find(e=>e.Name==='STRIPE_LIVE_MODE_ENABLED').Value='true';
  assert.throws(()=>withProductionProviders(c,options));
  assert.throws(()=>withProductionProviders(base(),{sms:true,smsSenderArn:'*'}));
});
test('only a disabled, exact-version live production endpoint satisfies preactivation',()=>{
  const e={url:productionWebhookUrl,livemode:true,api_version:'2026-07-29.dahlia',status:'disabled',enabled_events:productionStripeEvents};
  assert.equal(verifyPreparedStripeEndpoint(e),true);
  for(const patch of [{url:'https://api.staging.darciregistry.dev/webhooks/stripe'},{livemode:false},{status:'enabled'},{enabled_events:['*']},{api_version:'2020-08-27'}]) assert.throws(()=>verifyPreparedStripeEndpoint({...e,...patch}));
});
