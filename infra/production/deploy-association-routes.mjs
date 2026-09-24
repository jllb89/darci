import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {withAssociationRoutes} from './association-routes.mjs';
assert(process.argv.includes('--approved-two-static-get-routes'));
process.umask(0o077);
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stackName='darci-production-runtime',role='darci-production-cfn-release',policyName='temporary-production-association-route';
const stack=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const raw=aws('cloudformation','get-template','--stack-name',stackName).TemplateBody,baseline=typeof raw==='string'?JSON.parse(raw):raw;
const template=withAssociationRoutes(baseline),dir=mkdtempSync('.recovery-private/production-association-');
const save=(name,data)=>writeFileSync(`${dir}/${name}.json`,JSON.stringify(data,null,2),{mode:0o600});
save('baseline',{stack,template:baseline});save('template',template);
const listener=aws('cloudformation','describe-stack-resources','--stack-name',stackName).StackResources.find(r=>r.LogicalResourceId==='Https').PhysicalResourceId;
const expiresAt=new Date(Date.now()+30*60000).toISOString();
const policy={Version:'2012-10-17',Statement:[
 {Effect:'Allow',Action:['elasticloadbalancing:DescribeRules','elasticloadbalancing:DescribeListeners','elasticloadbalancing:DescribeTags'],Resource:'*',Condition:{DateLessThan:{'aws:CurrentTime':expiresAt}}},
 {Effect:'Allow',Action:['elasticloadbalancing:CreateRule','elasticloadbalancing:DeleteRule','elasticloadbalancing:ModifyRule','elasticloadbalancing:AddTags','elasticloadbalancing:RemoveTags'],Resource:[listener,listener.replace(':listener/',':listener-rule/')+'/*'],Condition:{DateLessThan:{'aws:CurrentTime':expiresAt}}},
]};
save('temporary-policy',policy);
aws('iam','put-role-policy','--role-name',role,'--policy-name',policyName,'--policy-document',JSON.stringify(policy));
try{
 await new Promise(r=>setTimeout(r,8000));
 aws('cloudformation','update-stack','--stack-name',stackName,'--template-body','file://'+dir+'/template.json','--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
 console.log(JSON.stringify({stage:'deploying exact GET association routes',evidence:dir}));
 let completed=false;
 for(let i=0;i<60;i++){
   await new Promise(r=>setTimeout(r,10000));
   const state=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];
   if(state.StackStatus.endsWith('_IN_PROGRESS'))continue;
   assert.equal(state.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(state.Parameters,stack.Parameters);completed=true;break;
 }
 assert(completed,'Inspect stack before retry');
 const afterRaw=aws('cloudformation','get-template','--stack-name',stackName).TemplateBody;
 assert.deepEqual(typeof afterRaw==='string'?JSON.parse(afterRaw):afterRaw,template);
 const report={at:new Date().toISOString(),passed:true,scope:'Only GET on the two exact app.illuminotary.com association paths',imagesAndConfigurationUnchanged:true};
 save('report',report);console.log(JSON.stringify({...report,evidence:dir}));
}finally{
 const status=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0].StackStatus;
 if(!status.endsWith('_IN_PROGRESS')){
  aws('iam','delete-role-policy','--role-name',role,'--policy-name',policyName);
  assert(!aws('iam','list-role-policies','--role-name',role).PolicyNames.includes(policyName));
  console.log('Temporary association-route permission removed');
 }else console.log('Update still active: temporary scoped permission expires at '+expiresAt);
}
