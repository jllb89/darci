import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {withTesterAccess} from './tester-access.mjs';
assert(process.argv.includes('--approved-client-ips'));
process.umask(0o077);
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})||'{}');
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stackName='darci-production-runtime',role='darci-production-cfn-release',policyName='temporary-production-tester-routes';
const stack=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const raw=aws('cloudformation','get-template','--stack-name',stackName).TemplateBody,baseline=typeof raw==='string'?JSON.parse(raw):raw;
const addresses=['146.75.129.125','23.245.227.237','146.75.154.172','67.170.239.201'];
const template=withTesterAccess(baseline,addresses),dir=mkdtempSync('.recovery-private/production-tester-access-');
assert.notDeepEqual(template,baseline,'Already installed; inspect existing rules instead');
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
 console.log(JSON.stringify({stage:'adding approved client HTTPS access',evidence:dir}));
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
 const resources=aws('cloudformation','describe-stack-resources','--stack-name',stackName).StackResources;
 const rules=aws('elbv2','describe-rules','--listener-arn',listener).Rules;
 for(const service of ['api','web']) for(const group of [1,2]){
   const id=service+'TesterRoute'+group;
   const arn=resources.find(r=>r.LogicalResourceId===id)?.PhysicalResourceId;
   const rule=rules.find(r=>r.RuleArn===arn);assert(rule,'Missing live tester rule');
   assert.deepEqual(rule.Conditions.find(c=>c.Field==='source-ip').SourceIpConfig.Values.slice().sort(),
     template.Resources[id].Properties.Conditions.find(c=>c.Field==='source-ip').SourceIpConfig.Values.slice().sort());
   assert.equal(rule.Conditions.find(c=>c.Field==='host-header').HostHeaderConfig.Values[0],service==='api'?'api.illuminotary.com':'app.illuminotary.com');
 }
 assert.equal(rules.find(r=>r.IsDefault).Actions[0].FixedResponseConfig.StatusCode,'403');
 save('live-rules',rules);
 const report={at:new Date().toISOString(),passed:true,scope:'Four exact client IPv4 /32s on production app/API HTTPS',imagesAndConfigurationUnchanged:true,addresses};
 save('report',report);console.log(JSON.stringify({...report,evidence:dir}));
}finally{
 const status=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0].StackStatus;
 if(!status.endsWith('_IN_PROGRESS')){
  aws('iam','delete-role-policy','--role-name',role,'--policy-name',policyName);
  assert(!aws('iam','list-role-policies','--role-name',role).PolicyNames.includes(policyName));
  console.log('Temporary tester-route permission removed');
 }else console.log('Update still active: temporary scoped permission expires at '+expiresAt);
}
