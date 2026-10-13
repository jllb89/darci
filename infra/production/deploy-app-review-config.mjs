import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {withAppReviewConfig} from './app-review-config.mjs';
process.umask(0o077);assert(process.argv.includes('--approved-review-config'));
const aws=(...a)=>JSON.parse(execFileSync('aws',[...a,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const dir='.recovery-private/apple-review-2026-10-13';
const config=JSON.parse(readFileSync(dir+'/config.json'));
assert.equal(config.email,'apple-review@illuminotary.com');assert.equal(config.enabled,true);
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
assert.equal(stack.StackStatus,'UPDATE_COMPLETE');
const version=stack.Parameters.find(p=>p.ParameterKey==='SecretVersion').ParameterValue;
const secret=aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app');
assert.equal(secret.VersionId,version,'An unpromoted secret version exists; inspect before merging');
const env=JSON.parse(secret.SecretString);
assert.equal(env.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
const raw=aws('cloudformation','get-template','--stack-name',stack.StackName).TemplateBody;
const baseline=typeof raw==='string'?JSON.parse(raw):raw;
const template=withAppReviewConfig(baseline);
writeFileSync(dir+'/runtime-before.json',JSON.stringify(baseline),{mode:0o600});
writeFileSync(dir+'/runtime-review.json',JSON.stringify(template),{mode:0o600});
writeFileSync(dir+'/runtime-secret.json',JSON.stringify({...env,APP_REVIEW_ACCESS_CONFIG:JSON.stringify(config)}),{mode:0o600});
const created=aws('secretsmanager','put-secret-value','--secret-id','/darci/production/app','--secret-string','file://'+dir+'/runtime-secret.json');
const params=stack.Parameters.map(p=>p.ParameterKey==='SecretVersion'
  ?{ParameterKey:p.ParameterKey,ParameterValue:created.VersionId}:{ParameterKey:p.ParameterKey,UsePreviousValue:true});
const result=aws('cloudformation','update-stack','--stack-name',stack.StackName,'--template-body','file://'+dir+'/runtime-review.json',
  '--parameters',JSON.stringify(params),'--capabilities','CAPABILITY_NAMED_IAM');
writeFileSync(dir+'/config-deployment.json',JSON.stringify({at:new Date().toISOString(),previousSecretVersion:version,
  secretVersion:created.VersionId,stackId:result.StackId,scope:'API-only review config; images, network and paid billing preserved'}),{mode:0o600});
console.log(JSON.stringify({started:true,scope:'API-only reviewer configuration',secretVersion:created.VersionId,evidence:dir+'/config-deployment.json'}));
