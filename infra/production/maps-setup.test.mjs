import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withProductionServerMaps} from './maps-setup.mjs';
test('server Maps changes only the API key reference/flag, never browser, payments or routes',()=>{
  const baseline={Resources:{Https:{Properties:{DefaultActions:[{FixedResponseConfig:{StatusCode:'403'}}]}},
    apiRoute:{Properties:{Conditions:[{Field:'source-ip'}]}},apiTask:{Properties:{ContainerDefinitions:[{Environment:[{Name:'STRIPE_LIVE_MODE_ENABLED',Value:'false'}],Secrets:[]}]}},
    webTask:{Properties:{marker:'unchanged'}},ResendWebhookRoute:{Properties:{marker:'unchanged'}}}};
  const next=withProductionServerMaps(baseline);
  for(const key of Object.keys(baseline.Resources).filter(k=>k!=='apiTask'))assert.deepEqual(next.Resources[key],baseline.Resources[key]);
  assert.deepEqual(withProductionServerMaps(next),next);
  assert.equal(next.Resources.apiTask.Properties.ContainerDefinitions[0].Secrets[0].Name,'GOOGLE_MAPS_SERVER_API_KEY');
  assert(!JSON.stringify(next.Resources.webTask).includes('GOOGLE_MAPS_SERVER_API_KEY'));
  baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode='200';assert.throws(()=>withProductionServerMaps(baseline));
});
