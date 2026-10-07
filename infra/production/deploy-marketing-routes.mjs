import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {withMarketingRoutes} from './marketing-routes.mjs';
assert(process.argv.includes('--approved-public-marketing'));
process.umask(0o077);
const aws = (...a) => JSON.parse(execFileSync('aws', [...a, '--region', 'us-east-1', '--output', 'json'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}) || '{}');
assert.equal(aws('sts', 'get-caller-identity').Account, '427057633951');
const cert = process.argv[2];
const certificate = aws('acm', 'describe-certificate', '--certificate-arn', cert).Certificate;
assert.equal(certificate.Status, 'ISSUED');
assert.deepEqual([...certificate.SubjectAlternativeNames].sort(), ['illuminotary.com', 'www.illuminotary.com']);
const stackName = 'darci-production-runtime', role = 'darci-production-cfn-release', policyName = 'temporary-production-marketing-route';
const stack = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
assert.equal(stack.StackStatus, 'UPDATE_COMPLETE');
const raw = aws('cloudformation', 'get-template', '--stack-name', stackName).TemplateBody;
const baseline = typeof raw === 'string' ? JSON.parse(raw) : raw;
const template = withMarketingRoutes(baseline, cert);
assert(Buffer.byteLength(JSON.stringify(template)) <= 51200, 'Template exceeds CloudFormation inline limit');
const dir = mkdtempSync('.recovery-private/production-marketing-');
const save = (name, data) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, name === 'template' ? undefined : 2), {mode: 0o600});
save('baseline', {stack, template: baseline}); save('template', template);
const listener = aws('cloudformation', 'describe-stack-resources', '--stack-name', stackName).StackResources.find(r => r.LogicalResourceId === 'Https').PhysicalResourceId;
const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
const condition = {DateLessThan: {'aws:CurrentTime': expiresAt}};
const policy = {Version: '2012-10-17', Statement: [
  {Effect: 'Allow', Action: ['elasticloadbalancing:DescribeRules', 'elasticloadbalancing:DescribeListeners', 'elasticloadbalancing:DescribeTags', 'elasticloadbalancing:DescribeListenerCertificates', 'acm:DescribeCertificate'], Resource: '*', Condition: condition},
  {Effect: 'Allow', Action: ['elasticloadbalancing:CreateRule', 'elasticloadbalancing:DeleteRule', 'elasticloadbalancing:ModifyRule', 'elasticloadbalancing:AddTags', 'elasticloadbalancing:RemoveTags', 'elasticloadbalancing:AddListenerCertificates', 'elasticloadbalancing:RemoveListenerCertificates'], Resource: [listener, listener.replace(':listener/', ':listener-rule/') + '/*'], Condition: condition},
]};
save('temporary-policy', policy);
aws('iam', 'put-role-policy', '--role-name', role, '--policy-name', policyName, '--policy-document', JSON.stringify(policy));
try {
  await new Promise(r => setTimeout(r, 8000));
  aws('cloudformation', 'update-stack', '--stack-name', stackName, '--template-body', 'file://' + dir + '/template.json', '--parameters', JSON.stringify(stack.Parameters.map(p => ({ParameterKey: p.ParameterKey, UsePreviousValue: true}))), '--capabilities', 'CAPABILITY_NAMED_IAM');
  console.log(JSON.stringify({stage: 'deploying marketing-only routes', evidence: dir}));
  let completed = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const state = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
    if (state.StackStatus.endsWith('_IN_PROGRESS')) continue;
    assert.equal(state.StackStatus, 'UPDATE_COMPLETE');
    assert.deepEqual(state.Parameters, stack.Parameters); completed = true; break;
  }
  assert(completed, 'Inspect stack before retry');
  const after = aws('cloudformation', 'get-template', '--stack-name', stackName).TemplateBody;
  assert.deepEqual(typeof after === 'string' ? JSON.parse(after) : after, template);
  save('report', {passed: true, at: new Date().toISOString(), privateAppAndApiUnchanged: true, imagesAndConfigurationUnchanged: true});
  console.log(JSON.stringify({passed: true, evidence: dir}));
} finally {
  const status = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0].StackStatus;
  if (!status.endsWith('_IN_PROGRESS')) {
    aws('iam', 'delete-role-policy', '--role-name', role, '--policy-name', policyName);
    assert(!aws('iam', 'list-role-policies', '--role-name', role).PolicyNames.includes(policyName));
    console.log('Temporary marketing-route permissions removed');
  } else console.log('Temporary permissions expire at ' + expiresAt);
}
