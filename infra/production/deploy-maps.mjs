import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {withProductionServerMaps} from './maps-setup.mjs';
assert(process.argv.includes('--deploy-approved-shared-server-key'));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
// This exact probe exercised forward/place-ID/reverse fallback from production egress.
const probe=aws('ecs','describe-tasks','--cluster','darci-production','--tasks','5be82b55105d474e8e391c38f0560c1d').tasks[0];
assert.equal(probe.lastStatus,'STOPPED');assert.equal(probe.containers[0].exitCode,0);
const stackName='darci-production-runtime';
const before=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];assert.equal(before.StackStatus,'UPDATE_COMPLETE');
const oldVersion=before.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
const readSecret=version=>JSON.parse(aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app','--version-id',version).SecretString);
const targetVersion='cb42c704-cd85-49a0-8884-48d83502f7e3';const previous=readSecret(oldVersion),candidate=readSecret(targetVersion);
assert.equal(candidate.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');assert(candidate.GOOGLE_MAPS_SERVER_API_KEY);
assert.deepEqual(candidate,{...previous,GOOGLE_MAPS_SERVER_API_KEY:candidate.GOOGLE_MAPS_SERVER_API_KEY});
const raw=aws('cloudformation','get-template','--stack-name',stackName).TemplateBody;const baseline=typeof raw==='string'?JSON.parse(raw):raw;
const target=withProductionServerMaps(baseline);
for(const key of Object.keys(baseline.Resources))if(key!=='apiTask')assert.deepEqual(target.Resources[key],baseline.Resources[key]);
const dir=mkdtempSync('.recovery-private/production-maps-deploy-');
writeFileSync(dir+'/baseline.json',JSON.stringify({stack:before,template:baseline}),{mode:0o600});writeFileSync(dir+'/template.json',JSON.stringify(target),{mode:0o600});
const parameters=before.Parameters.map(p=>p.ParameterKey==='SecretVersion'?{ParameterKey:p.ParameterKey,ParameterValue:targetVersion}:{ParameterKey:p.ParameterKey,UsePreviousValue:true});
aws('cloudformation','update-stack','--stack-name',stackName,'--template-body',`file://${process.cwd()}/${dir}/template.json`,'--parameters',JSON.stringify(parameters),'--capabilities','CAPABILITY_NAMED_IAM');
console.log(JSON.stringify({evidence:dir,secretVersion:targetVersion,change:'API server Maps only; same images, closed checkout/signup, unchanged routes'}));
let done=false;
for(let i=0;i<80;i++){
  await new Promise(r=>setTimeout(r,15000));const now=aws('cloudformation','describe-stacks','--stack-name',stackName).Stacks[0];console.log(JSON.stringify({at:new Date().toISOString(),state:now.StackStatus}));
  if(!now.StackStatus.endsWith('_IN_PROGRESS')){
    const report={at:new Date().toISOString(),state:now.StackStatus,secretVersion:targetVersion};writeFileSync(dir+'/result.json',JSON.stringify(report),{mode:0o600});
    assert.equal(now.StackStatus,'UPDATE_COMPLETE');assert.deepEqual(now.Parameters.filter(p=>p.ParameterKey!=='SecretVersion'),before.Parameters.filter(p=>p.ParameterKey!=='SecretVersion'));done=true;break;
  }
}
assert(done,'Rollout exceeded 20 minutes; inspect exact stack before retrying');
