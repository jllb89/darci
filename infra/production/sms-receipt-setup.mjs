import assert from 'node:assert/strict';
export function withProductionSmsReceipts(baseline) {
  const template=structuredClone(baseline);
  const container=template.Resources.apiTask.Properties.ContainerDefinitions[0];
  assert.equal(container.Environment.find(e=>e.Name==='SUPABASE_AUTH_SMS_HOOK_ENABLED')?.Value,'true');
  const name='SUPABASE_AUTH_SMS_CONFIGURATION_SET',value='darci-production-auth-sms';
  const existing=container.Environment.find(e=>e.Name===name);
  if(existing)assert.equal(existing.Value,value,'Never inherit a staging SMS receipt route');
  else container.Environment.push({Name:name,Value:value});
  // AWS evaluates SendTextMessage against the configuration set as well as the sender.
  // Keep the original exact sender permission; add only this production receipt set.
  const policies=template.Resources.TaskRole.Properties.Policies;
  assert(Array.isArray(policies));
  const policy={PolicyName:'production-auth-sms-receipts',PolicyDocument:{Version:'2012-10-17',Statement:[{
    Effect:'Allow',Action:['sms-voice:SendTextMessage'],Resource:'arn:aws:sms-voice:us-east-1:427057633951:configuration-set/darci-production-auth-sms',
  }]}};
  const found=policies.find(p=>p.PolicyName===policy.PolicyName);
  if(found)assert.deepEqual(found,policy);else policies.push(policy);
  return template;
}
