import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {withPublicAppAccess} from './public-app-access.mjs';
assert(process.argv.includes('--approved-public-app-access'));
process.umask(0o077);
const aws = (...a) => {
  try { return JSON.parse(execFileSync('aws', [...a, '--region', 'us-east-1', '--output', 'json'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}) || '{}'); }
  catch (error) { throw new Error(`AWS ${a[0]} ${a[1]} failed (${String(error.stderr ?? '').match(/An error occurred \(([^)]+)\)/)?.[1] ?? 'command_failed'}); provider payload omitted`); }
};
assert.equal(aws('sts', 'get-caller-identity').Account, '427057633951');
const stackName = 'darci-production-runtime', role = 'darci-production-cfn-release', policyName = 'temporary-production-public-app';
const stack = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
assert.equal(stack.StackStatus, 'UPDATE_COMPLETE');
const raw = aws('cloudformation', 'get-template', '--stack-name', stackName).TemplateBody;
const baseline = typeof raw === 'string' ? JSON.parse(raw) : raw;
const template = withPublicAppAccess(baseline);
if (JSON.stringify(baseline) === JSON.stringify(template)) { console.log('Public app access already configured; no change'); process.exit(0); }
for (const [id, resource] of Object.entries(baseline.Resources)) assert.deepEqual(template.Resources[id], resource);
assert(Buffer.byteLength(JSON.stringify(template)) <= 51200);
const dir = mkdtempSync('.recovery-private/production-public-app-');
const save = (name, data) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, name === 'template' ? 0 : 2), {mode: 0o600});
save('baseline', {stack, template: baseline}); save('template', template);
const listener = aws('cloudformation', 'describe-stack-resources', '--stack-name', stackName).StackResources.find(r => r.LogicalResourceId === 'Https').PhysicalResourceId;
const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
const condition = {DateLessThan: {'aws:CurrentTime': expiresAt}};
const policy = {Version: '2012-10-17', Statement: [
  {Effect: 'Allow', Action: ['elasticloadbalancing:DescribeRules', 'elasticloadbalancing:DescribeListeners', 'elasticloadbalancing:DescribeTags', 'ec2:DescribeSecurityGroups'], Resource: '*', Condition: condition},
  {Effect: 'Allow', Action: ['elasticloadbalancing:CreateRule', 'elasticloadbalancing:DeleteRule', 'elasticloadbalancing:ModifyRule', 'elasticloadbalancing:AddTags', 'elasticloadbalancing:RemoveTags'], Resource: [listener, listener.replace(':listener/', ':listener-rule/') + '/*'], Condition: condition},
  {Effect: 'Allow', Action: ['ec2:AuthorizeSecurityGroupIngress', 'ec2:RevokeSecurityGroupIngress'], Resource: 'arn:aws:ec2:us-east-1:427057633951:security-group/sg-0900a4d6e17de09fa', Condition: condition},
]};
save('temporary-policy', policy);
aws('iam', 'put-role-policy', '--role-name', role, '--policy-name', policyName, '--policy-document', JSON.stringify(policy));
try {
  await new Promise(r => setTimeout(r, 8000));
  aws('cloudformation', 'update-stack', '--stack-name', stackName, '--template-body', 'file://' + dir + '/template.json', '--parameters', JSON.stringify(stack.Parameters.map(p => ({ParameterKey: p.ParameterKey, UsePreviousValue: true}))), '--capabilities', 'CAPABILITY_NAMED_IAM');
  console.log(JSON.stringify({stage: 'opening production app and client API network access', evidence: dir}));
  let complete = false;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const state = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
    if (state.StackStatus.endsWith('_IN_PROGRESS')) continue;
    assert.equal(state.StackStatus, 'UPDATE_COMPLETE');
    assert.deepEqual(state.Parameters, stack.Parameters); complete = true; break;
  }
  assert(complete, 'Inspect active stack before retry');
  const afterRaw = aws('cloudformation', 'get-template', '--stack-name', stackName).TemplateBody;
  assert.deepEqual(typeof afterRaw === 'string' ? JSON.parse(afterRaw) : afterRaw, template);
  const rules = aws('elbv2', 'describe-rules', '--listener-arn', listener).Rules;
  for (const id of ['PublicAppAccess', 'PublicApiInternalDeny', 'PublicApiDiagnosticsDeny', 'PublicApiAccess']) {
    const expected = template.Resources[id].Properties;
    const actual = rules.find(r => Number(r.Priority) === expected.Priority); assert(actual);
    assert.deepEqual(actual.Conditions.find(c => c.Field === 'host-header').HostHeaderConfig.Values, expected.Conditions[0].HostHeaderConfig.Values);
    assert(!actual.Conditions.some(c => c.Field === 'source-ip'));
    assert.equal(actual.Actions[0].Type, expected.Actions[0].Type);
  }
  const report = {at: new Date().toISOString(), passed: true, scope: 'Public app/client API network access; internal/diagnostic endpoints restricted', existingResourcesParametersImagesConfigurationPreserved: true};
  save('live-rules', rules); save('report', report); console.log(JSON.stringify({...report, evidence: dir}));
} finally {
  const status = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0].StackStatus;
  if (!status.endsWith('_IN_PROGRESS')) {
    aws('iam', 'delete-role-policy', '--role-name', role, '--policy-name', policyName);
    assert(!aws('iam', 'list-role-policies', '--role-name', role).PolicyNames.includes(policyName));
    console.log('Temporary deployment permissions removed');
  } else console.log('Update active; temporary permission expires at ' + expiresAt);
}
