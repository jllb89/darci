import assert from 'node:assert/strict';
import {test} from 'node:test';
import {withAppReviewConfig} from './app-review-config.mjs';
test('overlay changes only the API secret reference; preserves images, workers, routing and billing',()=>{
  const baseline={Resources:{apiTask:{Properties:{ContainerDefinitions:[{Name:'api',Image:'same-api',
    Environment:[{Name:'BILLING_ENFORCEMENT_MODE',Value:'enforced'}],Secrets:[{Name:'SUPABASE_SERVICE_ROLE_KEY',
      ValueFrom:{'Fn::Sub':'arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/production/app-gwMt7d:SUPABASE_SERVICE_ROLE_KEY::${SecretVersion}'}}]}]}},
    workerTask:{Properties:{unchanged:true}},apiRoute:{Properties:{unchanged:true}}}};
  const result=withAppReviewConfig(baseline);
  assert.equal(result.Resources.apiTask.Properties.ContainerDefinitions[0].Secrets.length,2);
  const stripped=structuredClone(result);
  stripped.Resources.apiTask.Properties.ContainerDefinitions[0].Secrets.pop();
  assert.deepEqual(stripped,baseline);assert.deepEqual(withAppReviewConfig(result),result);
});
