import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {isIP} from 'node:net';

// Explicit additive HTTPS access only. Retain the live template and every parameter.
const ip = process.argv[2];
assert.equal(isIP(ip ?? ''), 4, 'Provide one exact IPv4 address');
assert(process.argv.includes('--approved-addition'), 'Explicit approved addition required');
process.umask(0o077);
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}) || '{}');
const pause = () => new Promise(resolve => setTimeout(resolve, 5000));
const stackName = 'darci-production-runtime';
const role = 'darci-production-cfn-release';
const policyName = 'temporary-production-operator-ip-addition';
assert.equal(aws('sts', 'get-caller-identity').Account, '427057633951');
const getStack = () => aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
const getTemplate = () => {
  const raw = aws('cloudformation', 'get-template', '--stack-name', stackName).TemplateBody;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
};
const before = getStack();
assert.equal(before.StackStatus, 'UPDATE_COMPLETE');
const baseline = getTemplate();
assert.equal(baseline.Resources.Https.Properties.DefaultActions[0].FixedResponseConfig.StatusCode, '403');
const template = structuredClone(baseline);
const changed = [];
for (const id of ['apiRoute', 'webRoute']) {
  const rule = template.Resources[id];
  assert.equal(rule.Type, 'AWS::ElasticLoadBalancingV2::ListenerRule');
  assert.deepEqual(rule.Properties.ListenerArn, {Ref: 'Https'});
  const values = rule.Properties.Conditions.find(c => c.Field === 'source-ip').SourceIpConfig.Values;
  assert(values.some(v => v.Ref === 'OperatorCidr'), 'Original operator restriction must remain');
  if (!values.includes(`${ip}/32`)) {
    assert(values.length < 3, 'Review ALB condition limits before adding more addresses');
    values.push(`${ip}/32`);
    changed.push(id);
  }
}
if (!changed.length) {
  console.log('Address already present; no change made');
  process.exit(0);
}
const dir = mkdtempSync('.recovery-private/production-operator-ip-');
const save = (name, data) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(data, null, 2), {mode: 0o600});
save('baseline', {stack: before, template: baseline});
save('template', template);
const resources = aws('cloudformation', 'describe-stack-resources', '--stack-name', stackName).StackResources;
const listener = resources.find(r => r.LogicalResourceId === 'Https').PhysicalResourceId;
const rulesBefore = aws('elbv2', 'describe-rules', '--listener-arn', listener).Rules;
save('rules-before', rulesBefore);
const ruleArns = changed.map(id => resources.find(r => r.LogicalResourceId === id).PhysicalResourceId);
const changeSetName = `operator-ip-${Date.now()}`;
aws('cloudformation', 'create-change-set', '--stack-name', stackName, '--change-set-name', changeSetName,
  '--change-set-type', 'UPDATE', '--template-body', `file://${dir}/template.json`,
  '--parameters', JSON.stringify(before.Parameters.map(p => ({ParameterKey: p.ParameterKey, UsePreviousValue: true}))),
  '--capabilities', 'CAPABILITY_NAMED_IAM');
let ready = false;
for (let i = 0; i < 36; i++) {
  await pause();
  const set = aws('cloudformation', 'describe-change-set', '--stack-name', stackName, '--change-set-name', changeSetName);
  if (set.Status.endsWith('_IN_PROGRESS') || set.Status.endsWith('_PENDING')) continue;
  assert.equal(set.Status, 'CREATE_COMPLETE', set.StatusReason);
  assert.deepEqual(set.Changes.map(c => c.ResourceChange.LogicalResourceId).sort(), changed.slice().sort());
  for (const {ResourceChange: c} of set.Changes) {
    assert.equal(c.Action, 'Modify');
    assert.equal(c.Replacement, 'False');
    assert.equal(c.ResourceType, 'AWS::ElasticLoadBalancingV2::ListenerRule');
  }
  save('change-set', set);
  ready = true;
  break;
}
assert(ready, 'Change set not ready; do not execute');
assert.deepEqual(getTemplate(), baseline, 'Concurrent deployment detected');
assert.deepEqual(getStack().Parameters, before.Parameters);
assert.equal(getStack().StackStatus, 'UPDATE_COMPLETE');
assert(!aws('iam', 'list-role-policies', '--role-name', role).PolicyNames.includes(policyName));
const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
const Condition = {DateLessThan: {'aws:CurrentTime': expiresAt}};
const policy = {Version: '2012-10-17', Statement: [
  {Effect: 'Allow', Action: ['elasticloadbalancing:DescribeRules', 'elasticloadbalancing:DescribeListeners', 'elasticloadbalancing:DescribeTags'], Resource: '*', Condition},
  {Effect: 'Allow', Action: 'elasticloadbalancing:ModifyRule', Resource: ruleArns, Condition},
]};
aws('iam', 'put-role-policy', '--role-name', role, '--policy-name', policyName, '--policy-document', JSON.stringify(policy));
try {
  await pause();
  aws('cloudformation', 'execute-change-set', '--stack-name', stackName, '--change-set-name', changeSetName);
  console.log(JSON.stringify({stage: 'Applying two HTTPS allowlist additions only', ip, evidence: dir}));
  let done = false;
  for (let i = 0; i < 100; i++) {
    await pause();
    const state = getStack();
    if (state.StackStatus.endsWith('_IN_PROGRESS')) continue;
    assert.equal(state.StackStatus, 'UPDATE_COMPLETE');
    assert.deepEqual(state.Parameters, before.Parameters);
    done = true;
    break;
  }
  assert(done, 'Update still active; inspect before retry');
  assert.deepEqual(getTemplate(), template);
  const rules = aws('elbv2', 'describe-rules', '--listener-arn', listener).Rules;
  assert.equal(rules.length, rulesBefore.length);
  for (const old of rulesBefore) {
    const current = rules.find(r => r.RuleArn === old.RuleArn);
    assert(current);
    if (!ruleArns.includes(old.RuleArn)) assert.deepEqual(current, old, 'Unrelated rule changed');
    else {
      assert.deepEqual(current.Actions, old.Actions);
      assert.equal(current.Priority, old.Priority);
      assert.deepEqual(current.Conditions.filter(c => c.Field !== 'source-ip'), old.Conditions.filter(c => c.Field !== 'source-ip'));
      assert.deepEqual(current.Conditions.find(c => c.Field === 'source-ip').SourceIpConfig.Values.slice().sort(),
        [...old.Conditions.find(c => c.Field === 'source-ip').SourceIpConfig.Values, `${ip}/32`].sort());
    }
  }
  const report = {at: new Date().toISOString(), passed: true, ip, scope: 'Additive production app/API HTTPS access only', parametersUnchanged: true, otherRulesUnchanged: true};
  save('rules-after', rules);
  save('report', report);
  console.log(JSON.stringify({...report, evidence: dir}));
} finally {
  if (!getStack().StackStatus.endsWith('_IN_PROGRESS')) {
    aws('iam', 'delete-role-policy', '--role-name', role, '--policy-name', policyName);
    assert(!aws('iam', 'list-role-policies', '--role-name', role).PolicyNames.includes(policyName));
    console.log('Temporary route-update permission removed');
  } else console.log(`Update active; scoped permission expires ${expiresAt}. Remove when stable.`);
}
