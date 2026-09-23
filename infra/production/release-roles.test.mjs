import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReleaseRoles} from './release-roles.mjs';
test('release requires the production environment; cannot read credentials or administer infrastructure',()=>{
  const t=buildReleaseRoles();
  const r=t.Resources.GithubRole.Properties;
  assert.equal(r.AssumeRolePolicyDocument.Statement[0].Condition.StringEquals['token.actions.githubusercontent.com:sub'],'repo:jllb89/darci:environment:production');
  const text=JSON.stringify(t);
  assert(text.includes('elasticloadbalancing:DescribeLoadBalancers'));
  for(const disallowed of ['secretsmanager:GetSecretValue','ecs:RunTask','ecs:DeregisterTaskDefinition','iam:CreateRole','ec2:AuthorizeSecurityGroupIngress','darci-staging']) assert(!text.includes(disallowed));
});
test('production workflow is manual, exact-CI gated, serial and protected',()=>{
  const source=readFileSync(new URL('../../.github/workflows/deploy-production.yml',import.meta.url),'utf8');
  assert(source.includes('workflow_dispatch:')); assert(!source.includes('  push:'));
  assert(source.includes('environment: production')); assert(source.includes('cancel-in-progress: false'));
  assert(source.indexOf('workflow-gates.mjs wait-ci')<source.indexOf('promote-images.mjs'));
  const promote=readFileSync(new URL('./promote-images.mjs',import.meta.url),'utf8');
  assert(promote.includes('--use-previous-template')); assert(promote.includes('UsePreviousValue:true'));
  assert(promote.includes("assert.equal(m.revision,process.env.GITHUB_SHA)"));
});
