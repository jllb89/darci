// Complete the approved production SMS receipt configuration without changing billing or images.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {withProductionSmsReceipts} from './sms-receipt-setup.mjs';
assert(process.argv.includes('--approved-production-provider-configuration'));
process.umask(0o077);
const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const role='darci-production-cfn-release',policyName='temporary-approved-production-sms-receipts-20260923';
const policy={Version:'2012-10-17',Statement:[{Effect:'Allow',Action:['iam:GetRole','iam:GetRolePolicy','iam:ListRolePolicies','iam:PutRolePolicy','iam:DeleteRolePolicy'],Resource:'arn:aws:iam::427057633951:role/darci-production-app-task',Condition:{DateLessThan:{'aws:CurrentTime':new Date(Date.now()+30*60*1000).toISOString()}}}]};
let stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
assert(['UPDATE_COMPLETE','UPDATE_ROLLBACK_FAILED'].includes(stack.StackStatus));
if(stack.StackStatus==='UPDATE_ROLLBACK_FAILED'){
  const events=aws('cloudformation','describe-stack-events','--stack-name',stack.StackName).StackEvents;
  const latestFailure=events.find(e=>e.ResourceStatus==='UPDATE_FAILED');
  assert.equal(latestFailure.LogicalResourceId,'TaskRole');assert(latestFailure.ResourceStatusReason.includes('iam:DeleteRolePolicy'));
}
// Same temporary operator-deploy path as deploy-providers.mjs, narrower resources,
// with an expiry and removal. The normal release role retains no IAM write access.
aws('iam','put-role-policy','--role-name',role,'--policy-name',policyName,'--policy-document',JSON.stringify(policy));
try {
await new Promise(r=>setTimeout(r,8000));
if(stack.StackStatus==='UPDATE_ROLLBACK_FAILED'){
  aws('cloudformation','continue-update-rollback','--stack-name',stack.StackName);
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,5000));
    stack=aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0];
    if(!stack.StackStatus.endsWith('_IN_PROGRESS'))break;
  }
  assert.equal(stack.StackStatus,'UPDATE_ROLLBACK_COMPLETE');
}
const raw=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
const baseline=typeof raw==='string'?JSON.parse(raw):raw,template=withProductionSmsReceipts(baseline);
assert.equal(template.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode,'403');
assert.deepEqual(template.Resources.apiTask,baseline.Resources.apiTask,'API configuration was already attached; only the missing IAM statement may change');
assert.deepEqual(template.Resources.workerTask,baseline.Resources.workerTask);
const dir=mkdtempSync('.recovery-private/production-sms-permission-');
writeFileSync(dir+'/baseline.json',JSON.stringify(baseline),{mode:0o600});writeFileSync(dir+'/template.json',JSON.stringify(template),{mode:0o600});
aws('cloudformation','update-stack','--stack-name',stack.StackName,'--template-body','file://'+process.cwd()+'/'+dir+'/template.json','--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
let complete=false;
for(let i=0;i<40;i++){
  await new Promise(r=>setTimeout(r,5000));
  const after=aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0];
  if(after.StackStatus.endsWith('_IN_PROGRESS'))continue;
  assert.equal(after.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(after.Parameters,stack.Parameters);
  const report={at:new Date().toISOString(),passed:true,evidence:dir,smsSent:0,change:'Exact production configuration-set SendTextMessage permission only'};
  writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report));complete=true;break;
}
assert(complete,'Inspect CloudFormation state before retry');
}finally{
  aws('iam','delete-role-policy','--role-name',role,'--policy-name',policyName);
  console.log(JSON.stringify({temporaryPermissionsRemoved:true}));
}
