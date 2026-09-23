// Read-only release evidence. No credentials, network changes or automatic retries.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const productionServices = ['api', 'worker', 'web'];
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const fingerprint = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const nonImageParameters = stack => Object.fromEntries(stack.Parameters
  .filter(p => !productionServices.some(service => p.ParameterKey === `${service}Image`))
  .map(p => [p.ParameterKey, p.ParameterValue]));

export function readReleaseSnapshot(aws) {
  const stack = aws('cloudformation', 'describe-stacks', '--stack-name', 'darci-production-runtime').Stacks[0];
  assert(stack, 'Production runtime stack missing');
  const template = aws('cloudformation', 'get-template', '--stack-name', 'darci-production-runtime').TemplateBody;
  const services = {};
  for (const name of productionServices) {
    const response = aws('ecs', 'describe-services', '--cluster', 'darci-production', '--services', `darci-production-${name}`);
    assert.equal(response.failures?.length ?? 0, 0, `${name}: ECS read failed`);
    const service = response.services?.[0];
    assert.equal(service?.serviceName, `darci-production-${name}`);
    assert.match(service.taskDefinition, new RegExp(`^arn:aws:ecs:us-east-1:427057633951:task-definition/darci-production-${name}:[0-9]+$`));
    const listed = aws('ecs', 'list-tasks', '--cluster', 'darci-production', '--service-name', `darci-production-${name}`, '--desired-status', 'RUNNING');
    assert(listed.taskArns?.length, `${name}: no running tasks`);
    const running = aws('ecs', 'describe-tasks', '--cluster', 'darci-production', '--tasks', ...listed.taskArns);
    assert.equal(running.failures?.length ?? 0, 0, `${name}: task read failed`);
    services[name] = {service, runningTasks: running.tasks};
  }
  return {stack, template: typeof template === 'string' ? JSON.parse(template) : template, services};
}

export function verifyReleaseSnapshot({before, after, images}) {
  assert(['CREATE_COMPLETE', 'UPDATE_COMPLETE'].includes(after.stack.StackStatus), 'Production stack did not complete the requested release');
  assert.deepEqual(after.template, before.template, 'Image-only release changed the deployed template');
  assert.deepEqual(nonImageParameters(after.stack), nonImageParameters(before.stack), 'Image-only release changed configuration parameters');
  const services = {};
  for (const name of productionServices) {
    const {service} = after.services[name];
    const baseline = before.services[name];
    const expected = images[name];
    assert.match(expected ?? '', new RegExp(`^427057633951\\.dkr\\.ecr\\.us-east-1\\.amazonaws\\.com/darci-production-${name}@sha256:[a-f0-9]{64}$`));
    assert.equal(after.stack.Parameters.find(p => p.ParameterKey === `${name}Image`)?.ParameterValue, expected, `${name}: stack image differs from requested digest`);
    assert(service.desiredCount > 0, `${name}: service scaled to zero`);
    assert.equal(service.desiredCount, baseline.service.desiredCount, `${name}: desired capacity changed`);
    assert.equal(service.runningCount, service.desiredCount, `${name}: missing running tasks`);
    assert.equal(service.pendingCount, 0, `${name}: tasks still pending`);
    assert.equal(service.deployments.length, 1, `${name}: rollout still in progress`);
    const deployment = service.deployments[0];
    assert.equal(deployment.status, 'PRIMARY');
    assert.equal(deployment.rolloutState, 'COMPLETED');
    assert.equal(deployment.taskDefinition, service.taskDefinition);
    for (const key of ['networkConfiguration', 'deploymentConfiguration', 'loadBalancers', 'enableExecuteCommand']) {
      assert.deepEqual(service[key], baseline.service[key], `${name}: service ${key} changed`);
    }
    const running = after.services[name].runningTasks;
    assert.equal(running?.length, service.desiredCount, `${name}: actual task count differs`);
    for (const live of running) {
      assert.equal(live.taskDefinitionArn, service.taskDefinition, `${name}: running task uses old definition`);
      assert.equal(live.lastStatus, 'RUNNING');
      assert.equal(live.healthStatus, 'HEALTHY', `${name}: running task is not healthy`);
      assert.equal(live.containers.find(c => c.name === name)?.image, expected, `${name}: healthy service is running the wrong image`);
      assert.equal(live.containers.find(c => c.name === name)?.imageDigest, expected.split('@')[1], `${name}: actual running digest differs`);
    }
    services[name] = {image: expected, taskDefinition: service.taskDefinition, running: service.runningCount,
      runningTasks: running.map(t => t.taskArn),
      configurationSha256: fingerprint(after.template.Resources[`${name}Task`])};
  }
  // Hash configuration, rather than publishing IP allowlists or injected values.
  return {verified: true, templateSha256: fingerprint(after.template),
    protectedParametersSha256: fingerprint(nonImageParameters(after.stack)), services};
}
