import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withProductionEmail} from './email-setup.mjs';
import {withProductionProviders} from './provider-setup.mjs';
import {withProductionSmsReceipts} from './sms-receipt-setup.mjs';
test('SMS receipts change only API configuration and exact production configuration-set permission',()=>{
  const base=withProductionProviders(withProductionEmail(buildRuntime()),{sms:true,smsSenderArn:'arn:aws:sms-voice:us-east-1:427057633951:phone-number/phone-123abc'});
  const result=withProductionSmsReceipts(base),entry=result.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.pop();
  assert.deepEqual(entry,{Name:'SUPABASE_AUTH_SMS_CONFIGURATION_SET',Value:'darci-production-auth-sms'});
  const policy=result.Resources.TaskRole.Properties.Policies.pop();
  assert.deepEqual(policy,{PolicyName:'production-auth-sms-receipts',PolicyDocument:{Version:'2012-10-17',Statement:[{
    Effect:'Allow',Action:['sms-voice:SendTextMessage'],Resource:'arn:aws:sms-voice:us-east-1:427057633951:configuration-set/darci-production-auth-sms',
  }]}});
  assert.deepEqual(result,base);
  const once=withProductionSmsReceipts(base);assert.deepEqual(withProductionSmsReceipts(once),once);
  const wrong=structuredClone(base);wrong.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.push({...entry,Value:'darci-staging-auth-sms'});
  assert.throws(()=>withProductionSmsReceipts(wrong));
});
