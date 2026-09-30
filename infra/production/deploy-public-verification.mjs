import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {aws} from './push-preflight.mjs';
import {withPublicVerificationRoutes} from './public-verification-routes.mjs';
assert(process.argv.includes('--approved-public-verification-links'));
process.umask(0o077);
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stackName='darci-production-runtime',role='darci-production-cfn-release',policyName='temporary-production-verification-routes';
const stack=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];
assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const raw=aws('cloudformation','get-template','--stack-name',stackName).TemplateBody;
const baseline=typeof raw==='string'?JSON.parse(raw):raw,template=withPublicVerificationRoutes(baseline);
const dir=mkdtempSync('.recovery-private/production-public-verification-');
const save=(name,data)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,name==='template'?0:2),{mode:0o600});
save('baseline',{stack,template:baseline});save('template',template);
const listener=aws('cloudformation','describe-stack-resources','--stack-name',stackName).StackResources.find(r=>r.LogicalResourceId==='Https').PhysicalResourceId;
const expiresAt=new Date(Date.now()+30*60000).toISOString();
const policy={Version:'2012-10-17',Statement:[
  {Effect:'Allow',Action:['elasticloadbalancing:DescribeRules','elasticloadbalancing:DescribeListeners','elasticloadbalancing:DescribeTags'],Resource:'*',Condition:{DateLessThan:{'aws:CurrentTime':expiresAt}}},
  {Effect:'Allow',Action:['elasticloadbalancing:CreateRule','elasticloadbalancing:DeleteRule','elasticloadbalancing:ModifyRule','elasticloadbalancing:AddTags','elasticloadbalancing:RemoveTags'],Resource:[listener,listener.replace(':listener/',':listener-rule/')+'/*'],Condition:{DateLessThan:{'aws:CurrentTime':expiresAt}}},
]};
assert(!aws('iam','list-role-policies','--role-name',role).PolicyNames.includes(policyName),'Existing temporary policy requires review');
aws('iam','put-role-policy','--role-name',role,'--policy-name',policyName,'--policy-document',JSON.stringify(policy));
try {
  await new Promise(r=>setTimeout(r,8000));
  aws('cloudformation','update-stack','--stack-name',stackName,'--template-body','file://'+dir+'/template.json','--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
  console.log(JSON.stringify({stage:'deploying verification-only public routes',evidence:dir}));
  let complete=false;
  for(let i=0;i<60;i++) {
    await new Promise(r=>setTimeout(r,10000));
    const state=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];
    if(state.StackStatus.endsWith('_IN_PROGRESS'))continue;
    assert.equal(state.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(state.Parameters,stack.Parameters);complete=true;break;
  }
  assert(complete,'Inspect stack before retry');
  const after=aws('cloudformation','get-template','--stack-name',stackName).TemplateBody;
  assert.deepEqual(typeof after==='string'?JSON.parse(after):after,template);
  const rules=aws('elbv2','describe-rules','--listener-arn',listener).Rules;
  for(const name of ['PublicVerificationWeb','PublicVerificationApi','PublicVerificationAssets']) {
    const expected=template.Resources[name].Properties;
    const rule=rules.find(r=>Number(r.Priority)===expected.Priority);assert(rule);
    for(const condition of expected.Conditions) {
      const key=Object.keys(condition)[1];
      assert.deepEqual(rule.Conditions.find(c=>c.Field===condition.Field)[key].Values.slice().sort(),condition[key].Values.slice().sort());
    }
  }
  assert.equal(rules.find(r=>r.IsDefault).Actions[0].FixedResponseConfig.StatusCode,'403');
  const report={at:new Date().toISOString(),passed:true,scope:'GET/HEAD verification and static assets only; application access, images, secrets, billing and existing rules preserved',previewApplicationCodeDeployed:false};
  save('report',report);console.log(JSON.stringify({...report,evidence:dir}));
} finally {
  const status=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0].StackStatus;
  if(!status.endsWith('_IN_PROGRESS')) {
    aws('iam','delete-role-policy','--role-name',role,'--policy-name',policyName);
    assert(!aws('iam','list-role-policies','--role-name',role).PolicyNames.includes(policyName));
    console.log('Temporary verification-route permission removed');
  } else console.log('Update still active; scoped temporary permission expires at '+expiresAt);
}
