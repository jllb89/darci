import {test} from 'node:test';
import assert from 'node:assert/strict';
import {productionServices, readReleaseSnapshot, verifyReleaseSnapshot} from './release-verification.mjs';

function fixture() {
  const images = Object.fromEntries(productionServices.map(name => [name,
    `427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-production-${name}@sha256:${'a'.repeat(64)}`]));
  const before = {stack: {StackStatus: 'UPDATE_COMPLETE', Parameters: [
    {ParameterKey: 'OperatorCidr', ParameterValue: '192.0.2.1/32'},
    {ParameterKey: 'SecretVersion', ParameterValue: 'pinned-version'},
    ...productionServices.map(name => ({ParameterKey: `${name}Image`, ParameterValue: images[name]}))]},
  template: {Resources: {privateAccess: true}}, services: {}};
  for (const name of productionServices) {
    const taskDefinition = `arn:aws:ecs:us-east-1:427057633951:task-definition/darci-production-${name}:3`;
    before.services[name] = {
      service: {serviceName: `darci-production-${name}`, taskDefinition, desiredCount: name === 'worker' ? 1 : 2,
        runningCount: name === 'worker' ? 1 : 2, pendingCount: 0,
        deployments: [{status: 'PRIMARY', rolloutState: 'COMPLETED', taskDefinition}]},
      runningTasks: Array.from({length: name === 'worker' ? 1 : 2}, (_, i) => ({taskArn: `task-${name}-${i}`,
        taskDefinitionArn: taskDefinition, lastStatus: 'RUNNING', healthStatus: 'HEALTHY',
        containers: [{name, image: images[name], imageDigest: images[name].split('@')[1]}]})),
    };
    before.template.Resources[`${name}Task`] = {Properties: {ContainerDefinitions: [{Name: name,
      Environment: [{Name: 'STRIPE_LIVE_MODE_ENABLED', Value: 'false'}], Secrets: [{ValueFrom: 'pinned-secret-reference'}]}]}};
  }
  return {before, after: structuredClone(before), images};
}

test('exact digest rollout produces credential-free configuration fingerprints', () => {
  const f = fixture();
  const receipt = verifyReleaseSnapshot(f);
  assert.equal(receipt.verified, true);
  assert.match(receipt.protectedParametersSha256, /^[a-f0-9]{64}$/);
  assert(!JSON.stringify(receipt).includes('192.0.2.1'));
  assert(!JSON.stringify(receipt).includes('pinned-secret-reference'));
});

test('accepts genuinely new image digests and task revisions with preserved configuration', () => {
  const f = fixture();
  for (const name of productionServices) {
    f.images[name] = f.images[name].replace(/a{64}$/, 'b'.repeat(64));
    f.after.stack.Parameters.find(p => p.ParameterKey === `${name}Image`).ParameterValue = f.images[name];
    const current = f.after.services[name];
    current.service.taskDefinition = current.service.taskDefinition.replace(/:3$/, ':4');
    current.service.deployments[0].taskDefinition = current.service.taskDefinition;
    for (const live of current.runningTasks) {
      live.taskDefinitionArn = current.service.taskDefinition;
      live.containers[0].image = f.images[name];
      live.containers[0].imageDigest = f.images[name].split('@')[1];
    }
  }
  assert.equal(verifyReleaseSnapshot(f).verified, true);
});

for (const [name, mutate, message] of [
  ['healthy previous image after rollback', f => { f.after.services.api.runningTasks[0].containers[0].image = f.images.api.replace(/a{64}$/, 'b'.repeat(64)); }, /wrong image/],
  ['rolled-back stack', f => { f.after.stack.StackStatus = 'UPDATE_ROLLBACK_COMPLETE'; }, /did not complete/],
  ['wrong stack image parameter', f => { f.after.stack.Parameters.find(p => p.ParameterKey === 'apiImage').ParameterValue = 'old'; }, /stack image differs/],
  ['changed allowlist', f => { f.after.stack.Parameters[0].ParameterValue = '0.0.0.0/0'; }, /configuration parameters/],
  ['changed secret version', f => { f.after.stack.Parameters[1].ParameterValue = 'other'; }, /configuration parameters/],
  ['changed template', f => { f.after.template.Resources.privateAccess = false; }, /deployed template/],
  ['payment activation', f => { f.after.template.Resources.apiTask.Properties.ContainerDefinitions[0].Environment[0].Value = 'true'; }, /deployed template/],
  ['secret reference drift', f => { f.after.template.Resources.apiTask.Properties.ContainerDefinitions[0].Secrets[0].ValueFrom = 'other'; }, /deployed template/],
  ['scaled-to-zero service', f => { f.after.services.api.service.desiredCount = 0; f.after.services.api.service.runningCount = 0; }, /scaled to zero/],
  ['capacity changed', f => { f.after.services.api.service.desiredCount = 3; }, /capacity changed/],
  ['missing task', f => { f.after.services.api.service.runningCount = 1; }, /missing running tasks/],
  ['pending task', f => { f.after.services.api.service.pendingCount = 1; }, /still pending/],
  ['incomplete rollout', f => { f.after.services.api.service.deployments[0].rolloutState = 'IN_PROGRESS'; }, /COMPLETED/],
  ['old deployment task definition', f => { f.after.services.api.service.deployments[0].taskDefinition = 'old'; }, /strictly equal/],
  ['actual running digest differs', f => { f.after.services.api.runningTasks[0].containers[0].imageDigest = 'old'; }, /actual running digest/],
  ['unhealthy running task', f => { f.after.services.api.runningTasks[0].healthStatus = 'UNHEALTHY'; }, /not healthy/],
  ['old running task definition', f => { f.after.services.api.runningTasks[0].taskDefinitionArn = 'old'; }, /old definition/],
  ['missing actual task', f => { f.after.services.api.runningTasks.pop(); }, /actual task count/],
  ['network drift', f => { f.after.services.api.service.networkConfiguration = {public: true}; }, /networkConfiguration changed/],
  ['staging image', f => { f.images.api = f.images.api.replace('darci-production-api', 'darci-api'); }, /regular expression/],
]) test(`rejects ${name}`, () => { const f = fixture(); mutate(f); assert.throws(() => verifyReleaseSnapshot(f), message); });

test('snapshot uses only scoped read operations and rejects missing ECS services', () => {
  const f = fixture();
  const calls = [];
  const aws = (...args) => {
    calls.push(args);
    if (args[1] === 'describe-stacks') return {Stacks: [f.before.stack]};
    if (args[1] === 'get-template') return {TemplateBody: JSON.stringify(f.before.template)};
    if (args[1] === 'describe-services') return {services: [Object.values(f.before.services).find(s => s.service.serviceName === args.at(-1)).service], failures: []};
    if (args[1] === 'list-tasks') return {taskArns: Object.values(f.before.services).find(s => s.service.serviceName === args[5]).runningTasks.map(t => t.taskArn)};
    if (args[1] === 'describe-tasks') return {tasks: Object.values(f.before.services).flatMap(s => s.runningTasks).filter(t => args.includes(t.taskArn)), failures: []};
    assert.fail('Unexpected AWS operation');
  };
  assert.deepEqual(readReleaseSnapshot(aws), f.before);
  assert.equal(calls.length, 11);
  assert.throws(() => readReleaseSnapshot((...args) => args[1] === 'describe-services'
    ? {services: [], failures: [{reason: 'MISSING'}]} : aws(...args)), /ECS read failed/);
});
