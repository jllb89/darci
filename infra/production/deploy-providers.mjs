import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {withProductionProviders} from './provider-setup.mjs';
const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
assert(process.argv.includes('--approved-private-provider-deploy'));
const dir=realpathSync(process.argv[2]);assert(dir.startsWith(resolve('.recovery-private')+'/production-provider-deploy-'));
const prepared=JSON.parse(readFileSync(dir+'/prepared.json'));
const snapshot=JSON.parse(readFileSync(dir+'/baseline.json'));
const template=JSON.parse(readFileSync(dir+'/template.json'));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stackName='darci-production-runtime',role='darci-production-cfn-release',policyName='temporary-approved-production-providers-20260923';
const current=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];
assert.equal(current.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(current.Parameters,snapshot.stack.Parameters,'Production changed after preparation');
const raw=aws('cloudformation','get-template','--stack-name',stackName).TemplateBody;
assert.deepEqual(typeof raw==='string'?JSON.parse(raw):raw,snapshot.template);
assert.deepEqual(template,withProductionProviders(snapshot.template,{stripe:true,sms:true,smsSenderArn:prepared.smsSenderArn,apns:prepared.apnsConfigured}));
const resources=aws('cloudformation','describe-stack-resources','--stack-name',stackName).StackResources;
const listener=resources.find(r=>r.LogicalResourceId==='Https').PhysicalResourceId;
const policy={Version:'2012-10-17',Statement:[
  {Effect:'Allow',Action:['elasticloadbalancing:DescribeRules','elasticloadbalancing:DescribeListeners','elasticloadbalancing:DescribeTags'],Resource:'*'},
  {Effect:'Allow',Action:['elasticloadbalancing:CreateRule','elasticloadbalancing:DeleteRule','elasticloadbalancing:ModifyRule','elasticloadbalancing:AddTags','elasticloadbalancing:RemoveTags'],Resource:[listener,listener.replace(':listener/',':listener-rule/')+'/*']},
  {Effect:'Allow',Action:['iam:GetRole','iam:GetRolePolicy','iam:ListRolePolicies','iam:PutRolePolicy','iam:DeleteRolePolicy'],Resource:'arn:aws:iam::427057633951:role/darci-production-app-task'},
]};
writeFileSync(dir+'/temporary-policy.json',JSON.stringify(policy),{mode:0o600});
aws('iam','put-role-policy','--role-name',role,'--policy-name',policyName,'--policy-document',JSON.stringify(policy));
try {
  await new Promise(r=>setTimeout(r,8000));
  const parameters=current.Parameters.map(p=>p.ParameterKey==='SecretVersion'?{ParameterKey:p.ParameterKey,ParameterValue:prepared.secretVersion}:{ParameterKey:p.ParameterKey,UsePreviousValue:true});
  aws('cloudformation','update-stack','--stack-name',stackName,'--template-body','file://'+dir+'/template.json','--parameters',JSON.stringify(parameters),'--capabilities','CAPABILITY_NAMED_IAM');
  let complete=false;
  for(let i=0;i<100;i++){
    await new Promise(r=>setTimeout(r,15000));
    const stack=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];
    console.log(JSON.stringify({at:new Date().toISOString(),status:stack.StackStatus}));
    if(stack.StackStatus.endsWith('_IN_PROGRESS'))continue;
    writeFileSync(dir+'/deployment.json',JSON.stringify({at:new Date().toISOString(),status:stack.StackStatus,secretVersion:prepared.secretVersion}),{mode:0o600});
    assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
    assert.deepEqual(stack.Parameters.filter(p=>p.ParameterKey!=='SecretVersion'),current.Parameters.filter(p=>p.ParameterKey!=='SecretVersion'));
    complete=true;break;
  }
  assert(complete,'Deployment still active after 25 minutes; inspect before changing anything');
}finally{
  const status=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0].StackStatus;
  if(!status.endsWith('_IN_PROGRESS')){
    aws('iam','delete-role-policy','--role-name',role,'--policy-name',policyName);
    console.log(JSON.stringify({temporaryPermissionsRemoved:true}));
  }else console.log(JSON.stringify({activeDeploymentTemporaryPolicy:policyName}));
}
