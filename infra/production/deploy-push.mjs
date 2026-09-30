import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync} from 'node:fs';
import {pushPreflight,aws} from './push-preflight.mjs';
import {withProductionPush} from './push-rollout.mjs';

assert(process.argv.includes('--approved-future-production-push'));
process.umask(0o077);
const {stack,baseline,report:preflight}=await pushPreflight();
assert.equal(preflight.pendingPushJobs,0,'Stop: review pending push jobs before rollout; never replay old alerts');
const template=withProductionPush(baseline);
const dir=mkdtempSync('.recovery-private/production-push-rollout-');
const report={at:new Date().toISOString(),scope:'Enable future production workflow push only; no notification replay or test send',preflight,stage:'deploying'};
const save=()=>writeFileSync(dir+'/report.json',JSON.stringify(report,null,2),{mode:0o600});
writeFileSync(dir+'/baseline.json',JSON.stringify(baseline),{mode:0o600});
writeFileSync(dir+'/template.json',JSON.stringify(template),{mode:0o600});save();
assert.notDeepEqual(template,baseline,'Already enabled; no update required');
aws('cloudformation','update-stack','--stack-name',stack.StackName,'--template-body','file://'+dir+'/template.json','--parameters',JSON.stringify(stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}))),'--capabilities','CAPABILITY_NAMED_IAM');
console.log(JSON.stringify({stage:'deploying',evidence:dir}));
for(let i=0;i<80;i++) {
  await new Promise(r=>setTimeout(r,15000));
  const state=aws('cloudformation','describe-stacks','--stack-name',stack.StackName).Stacks[0];
  if(state.StackStatus.endsWith('_IN_PROGRESS')) continue;
  assert.equal(state.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(state.Parameters,stack.Parameters);
  const raw=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
  assert.deepEqual(typeof raw==='string'?JSON.parse(raw):raw,template);
  const services=aws('ecs','describe-services','--cluster','darci-production','--services','darci-production-api','darci-production-worker').services;
  for(const s of services){assert.equal(s.deployments.length,1);assert.equal(s.deployments[0].rolloutState,'COMPLETED');assert.equal(s.runningCount,s.desiredCount);}
  Object.assign(report,{stage:'complete',passed:true,completedAt:new Date().toISOString(),services:services.map(s=>({name:s.serviceName,taskDefinition:s.taskDefinition}))});save();
  console.log(JSON.stringify({passed:true,evidence:dir,services:report.services}));process.exit(0);
}
throw Error('Bounded wait exceeded; inspect current stack before retrying');
