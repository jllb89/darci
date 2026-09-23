// Operator-approved provider configuration, NOT an image release or public launch.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {createRequire} from 'node:module';
import {withProductionEmail} from './email-setup.mjs';
const require = createRequire(import.meta.url);
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'],
  {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}) || '{}');
const stackName = 'darci-production-runtime';
const role = 'darci-production-cfn-release';
const policyName = 'temporary-approved-production-email-20260923';
assert(process.argv.includes('--apply-approved-email'), 'Explicit production-email approval flag required');
assert.equal(aws('sts', 'get-caller-identity').Account, '427057633951');
const local = require('../../backend/node_modules/dotenv').parse(readFileSync('.env.production'));
assert(local.RESEND_API_KEY?.startsWith('re_'), 'Missing production sending key');
assert(local.RESEND_WEBHOOK_SECRET?.startsWith('whsec_'), 'Missing production webhook signing secret');
const before = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
assert(['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(before.StackStatus));
const raw = aws('cloudformation', 'get-template', '--stack-name', stackName).TemplateBody;
const baseline = typeof raw === 'string' ? JSON.parse(raw) : raw;
assert(!baseline.Resources.ResendWebhookRoute, 'Email overlay already deployed; inspect before repeating');
const target = withProductionEmail(baseline);
for (const name of Object.keys(baseline.Resources)) {
  if (!['apiTask', 'workerTask'].includes(name)) assert.deepEqual(target.Resources[name], baseline.Resources[name]);
}
const oldVersion = before.Parameters.find(p => p.ParameterKey === 'SecretVersion').ParameterValue;
const secret = aws('secretsmanager', 'get-secret-value', '--secret-id', '/darci/production/app', '--version-id', oldVersion);
const values = JSON.parse(secret.SecretString);
assert.equal(values.SUPABASE_URL, 'https://jdrgluisxhgegdsesman.supabase.co');
assert.equal(values.STRIPE_LIVE_MODE_ENABLED, 'false');
assert(!values.STRIPE_SECRET_KEY);
assert(!values.RESEND_API_KEY && !values.RESEND_WEBHOOK_SECRET, 'Provider values already exist; inspect before replacing');
const privateDir = mkdtempSync('.recovery-private/production-email-');
const artifact = (name, value) => writeFileSync(`${privateDir}/${name}`, JSON.stringify(value, null, 2), {mode: 0o600});
artifact('baseline.json', {stack: before, template: baseline});
artifact('template.json', target);
// Credentials are passed through stdin, never command-line arguments or evidence files.
const merged = {...values, RESEND_API_KEY: local.RESEND_API_KEY.trim(), RESEND_WEBHOOK_SECRET: local.RESEND_WEBHOOK_SECRET.trim()};
const created = JSON.parse(execFileSync('aws', ['secretsmanager', 'put-secret-value', '--secret-id', '/darci/production/app',
  '--secret-string', 'file:///dev/stdin', '--region', 'us-east-1', '--output', 'json'],
  {input: JSON.stringify(merged), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}));
const check = JSON.parse(aws('secretsmanager', 'get-secret-value', '--secret-id', '/darci/production/app', '--version-id', created.VersionId).SecretString);
assert.deepEqual(check, merged);
const resources = aws('cloudformation', 'describe-stack-resources', '--stack-name', stackName).StackResources;
const listener = resources.find(r => r.LogicalResourceId === 'Https').PhysicalResourceId;
const ruleScope = listener.replace(':listener/', ':listener-rule/') + '/*';
const policy = {Version: '2012-10-17', Statement: [
  {Effect: 'Allow', Action: ['ec2:AuthorizeSecurityGroupIngress', 'ec2:RevokeSecurityGroupIngress'], Resource: 'arn:aws:ec2:us-east-1:427057633951:security-group/sg-0900a4d6e17de09fa'},
  {Effect: 'Allow', Action: ['ec2:DescribeSecurityGroups', 'ec2:DescribeSecurityGroupRules', 'elasticloadbalancing:DescribeRules', 'elasticloadbalancing:DescribeListeners', 'elasticloadbalancing:DescribeTags'], Resource: '*'},
  {Effect: 'Allow', Action: ['elasticloadbalancing:CreateRule', 'elasticloadbalancing:DeleteRule', 'elasticloadbalancing:ModifyRule', 'elasticloadbalancing:AddTags', 'elasticloadbalancing:RemoveTags'], Resource: [listener, ruleScope]},
]};
artifact('temporary-policy.json', policy);
aws('iam', 'put-role-policy', '--role-name', role, '--policy-name', policyName, '--policy-document', JSON.stringify(policy));
console.log(JSON.stringify({evidence: privateDir, secretVersion: created.VersionId, previousSecretVersion: oldVersion}));
try {
  await new Promise(r => setTimeout(r, 8000));
  const parameters = before.Parameters.map(p => p.ParameterKey === 'SecretVersion'
    ? {ParameterKey: p.ParameterKey, ParameterValue: created.VersionId}
    : {ParameterKey: p.ParameterKey, UsePreviousValue: true});
  aws('cloudformation', 'update-stack', '--stack-name', stackName, '--template-body', `file://${process.cwd()}/${privateDir}/template.json`,
    '--parameters', JSON.stringify(parameters), '--capabilities', 'CAPABILITY_NAMED_IAM');
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const now = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0];
    console.log(JSON.stringify({time: new Date().toISOString(), status: now.StackStatus}));
    if (!now.StackStatus.endsWith('_IN_PROGRESS')) {
      artifact('result.json', {status: now.StackStatus, secretVersion: created.VersionId, completedAt: new Date().toISOString()});
      assert.equal(now.StackStatus, 'UPDATE_COMPLETE', 'Email rollout did not complete; baseline image rollback remains enabled');
      assert.deepEqual(now.Parameters.filter(p => p.ParameterKey !== 'SecretVersion'), before.Parameters.filter(p => p.ParameterKey !== 'SecretVersion'));
      break;
    }
    assert(i < 99, 'Rollout exceeded 25 minutes; inspect before further changes');
  }
} finally {
  const status = aws('cloudformation', 'describe-stacks', '--stack-name', stackName).Stacks[0].StackStatus;
  if (!status.endsWith('_IN_PROGRESS')) {
    aws('iam', 'delete-role-policy', '--role-name', role, '--policy-name', policyName);
    assert(!aws('iam', 'list-role-policies', '--role-name', role).PolicyNames.includes(policyName));
    console.log(JSON.stringify({temporaryPermissionsRemoved: true}));
  } else console.log(JSON.stringify({temporaryPolicyRetainedForActiveRecovery: policyName, status}));
}
