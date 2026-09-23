// Run behind the required production GitHub environment approval.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const aws=(...args)=>JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
assert.equal(process.env.GITHUB_REF,'refs/heads/master');
assert.equal(process.env.GITHUB_REPOSITORY,'jllb89/darci');
assert.equal(aws('sts','get-caller-identity').Account,'427057633951');
const m=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(m.revision,process.env.GITHUB_SHA);
assert.equal(m.runtimeTrackedChanges,false,'Automated promotion requires clean runtime source');
const stack=aws('cloudformation','describe-stacks','--stack-name','darci-production-runtime').Stacks[0];
assert(['CREATE_COMPLETE','UPDATE_COMPLETE','UPDATE_ROLLBACK_COMPLETE'].includes(stack.StackStatus));
const parameters=stack.Parameters.map(p=>({ParameterKey:p.ParameterKey,UsePreviousValue:true}));
for(const service of ['api','worker','web']) {
  const uri=m.images[service];
  assert(new RegExp(`^427057633951\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/darci-production-${service}@sha256:[a-f0-9]{64}$`).test(uri));
  let scan;
  for(let i=0;i<24;i++) {
    // Scan registration can lag a successful push. A bounded retry still fails
    // closed on persistent API/permission errors and never authorizes no scan.
    try {
      scan=aws('ecr','describe-image-scan-findings','--repository-name',`darci-production-${service}`,'--image-id',`imageDigest=${uri.split('@')[1]}`);
    } catch(error) {
      if(i===23) throw error;
      await new Promise(r=>setTimeout(r,5000)); continue;
    }
    if(scan.imageScanStatus.status==='COMPLETE') break;
    assert(['PENDING','IN_PROGRESS'].includes(scan.imageScanStatus.status),'Image scan unavailable');
    await new Promise(r=>setTimeout(r,5000));
  }
  assert.equal(scan?.imageScanStatus.status,'COMPLETE');
  const counts=scan.imageScanFindings?.findingSeverityCounts??{};
  assert.equal(counts.CRITICAL??0,0);
  assert.equal(counts.HIGH??0,0);
  const p=parameters.find(p=>p.ParameterKey===`${service}Image`); assert(p);
  delete p.UsePreviousValue; p.ParameterValue=uri;
}
// Deliberately preserve all non-image parameters and the deployed template.
console.log(JSON.stringify(aws('cloudformation','update-stack','--stack-name','darci-production-runtime','--use-previous-template',
  '--parameters',JSON.stringify(parameters),'--role-arn','arn:aws:iam::427057633951:role/darci-production-cfn-release','--capabilities','CAPABILITY_NAMED_IAM')));
execFileSync('aws',['cloudformation','wait','stack-update-complete','--stack-name','darci-production-runtime','--region','us-east-1'],{stdio:'inherit'});
for(const service of ['api','worker','web']) {
  const s=aws('ecs','describe-services','--cluster','darci-production','--services',`darci-production-${service}`).services[0];
  assert.equal(s.runningCount,s.desiredCount); assert.equal(s.pendingCount,0);
  assert(s.deployments.length===1&&s.deployments[0].rolloutState==='COMPLETED');
}
console.log('PASS: exact-revision production images deployed; closed-launch configuration and access boundary preserved.');
