// Bootstrap/update the private production runtime only after immutable image scans.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {buildRuntime} from './runtime.mjs';
const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
assert(process.argv.includes('--apply-private-candidate'),'Explicit private candidate deployment required');
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const manifest=JSON.parse(readFileSync(process.argv[2],'utf8'));
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
assert(['CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus),'Edge stack must be stable');
const cidr=stack.Parameters.find(p=>p.ParameterKey==='OperatorCidr')?.ParameterValue;
assert(cidr?.endsWith('/32')&&cidr!=='127.0.0.1/32');
const secret=aws('secretsmanager','get-secret-value','--secret-id','/darci/production/app');
const s=JSON.parse(secret.SecretString);
assert.equal(s.SUPABASE_URL,'https://jdrgluisxhgegdsesman.supabase.co');
assert.equal(s.STRIPE_LIVE_MODE_ENABLED,'false');
assert(!s.STRIPE_SECRET_KEY&&!s.RESEND_API_KEY,'Provider activation requires a separate approved release');
const config=await fetch(`${s.SUPABASE_URL}/rest/v1/billing_runtime_configuration?select=stripe_environment,live_activation_approved`,{headers:{apikey:s.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${s.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(15000)});
assert(config.ok); assert.deepEqual(await config.json(),[{stripe_environment:'live',live_activation_approved:false}]);
for(const service of ['api','worker','web']) {
  const uri=manifest.images[service];
  assert(new RegExp(`^427057633951\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/darci-production-${service}@sha256:[a-f0-9]{64}$`).test(uri));
  const scan=aws('ecr','describe-image-scan-findings','--repository-name',`darci-production-${service}`,'--image-id',`imageDigest=${uri.split('@')[1]}`);
  assert.equal(scan.imageScanStatus.status,'COMPLETE');
  const counts=scan.imageScanFindings?.findingSeverityCounts??{};
  assert.equal(counts.CRITICAL??0,0); assert.equal(counts.HIGH??0,0);
}
const path='/private/tmp/darci-production-runtime-reviewed.json';
writeFileSync(path,JSON.stringify(buildRuntime()),{mode:0o600});
const parameters=[{ParameterKey:'OperatorCidr',UsePreviousValue:true},{ParameterKey:'SecretVersion',ParameterValue:secret.VersionId},
  ...['api','worker','web'].map(service=>({ParameterKey:`${service}Image`,ParameterValue:manifest.images[service]}))];
const roleArgs=process.argv.includes('--use-release-role')?['--role-arn','arn:aws:iam::427057633951:role/darci-production-cfn-release']:[];
console.log(JSON.stringify(aws('cloudformation','update-stack','--stack-name','darci-production-runtime','--template-body',`file://${path}`,'--parameters',JSON.stringify(parameters),'--capabilities','CAPABILITY_NAMED_IAM',...roleArgs)));
