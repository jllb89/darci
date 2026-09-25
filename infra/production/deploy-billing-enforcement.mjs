import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {withEnforcedPrivateBilling} from './billing-enforcement.mjs';
assert(process.argv.includes('--approved-private-enforcement'));
process.umask(0o077);
const aws = (...a) => JSON.parse(execFileSync('aws', [...a, '--region', 'us-east-1', '--output', 'json'], {encoding:'utf8',stdio:['ignore','pipe','pipe']}) || '{}');
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const stack = aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const raw = aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
const baseline = typeof raw === 'string' ? JSON.parse(raw) : raw;
const template = withEnforcedPrivateBilling(baseline);
const dir = mkdtempSync('.recovery-private/production-billing-enforcement-');
writeFileSync(dir+'/baseline.json',JSON.stringify(baseline));
writeFileSync(dir+'/template.json',JSON.stringify(template));
const report = {at:new Date().toISOString(),stage:'deploying',scope:'Enforcement only; purchases remain closed',passed:false};
const save = () => writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)); save();
if (JSON.stringify(template) !== JSON.stringify(baseline)) {
  aws('cloudformation','update-stack','--stack-name',stack.StackName,'--template-body','file://'+dir+'/template.json','--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
}
console.log(JSON.stringify({evidence:dir,stage:report.stage}));
for(let i=0;i<80;i++) {
  await new Promise(r=>setTimeout(r,15000));
  const current=aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0];
  if(current.StackStatus.endsWith('_IN_PROGRESS')) continue;
  assert.equal(current.StackStatus,'UPDATE_COMPLETE'); assert.deepEqual(current.Parameters,stack.Parameters);
  const rawAfter=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
  assert.deepEqual(typeof rawAfter==='string'?JSON.parse(rawAfter):rawAfter,template);
  const services=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-api','darci-production-worker').services;
  for(const service of services){
    assert.equal(service.deployments.length,1); assert.equal(service.deployments[0].rolloutState,'COMPLETED'); assert.equal(service.runningCount,service.desiredCount);
    const task=aws('ecs','describe-task-definition','--task-definition',service.taskDefinition).taskDefinition.containerDefinitions[0];
    const env=Object.fromEntries(task.environment.map(e=>[e.name,e.value]));
    assert.equal(env.BILLING_ENFORCEMENT_MODE,'enforced'); assert.equal(env.BILLING_LIVE_ACCESS_MODE,'closed'); assert.equal(env.IOS_MEMBER_CHECKOUT_ENABLED,'false');
  }
  Object.assign(report,{stage:'complete',passed:true,completedAt:new Date().toISOString(),tasks:services.map(s=>s.taskDefinition),imagesAndOtherConfigurationUnchanged:true}); save();
  console.log(JSON.stringify({...report,evidence:dir})); process.exit(0);
}
throw Error('Timed out; inspect stack before retrying');
