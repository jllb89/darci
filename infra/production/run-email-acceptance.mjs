import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
assert(process.argv.includes('--send-approved-operator-test'), 'Explicit operator-only test approval required');
const aws = (...args) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], {encoding: 'utf8'}) || '{}');
assert.equal(aws('sts', 'get-caller-identity').Account, '427057633951');
assert.equal(aws('cloudformation', 'describe-stacks', '--stack-name', 'darci-production-runtime').Stacks[0].StackStatus, 'UPDATE_COMPLETE');
const service = aws('ecs', 'describe-services', '--cluster', 'darci-production', '--services', 'darci-production-api').services[0];
assert.equal(service.deployments.length, 1);
assert.equal(service.deployments[0].rolloutState, 'COMPLETED');
const definition = aws('ecs', 'describe-task-definition', '--task-definition', service.taskDefinition).taskDefinition;
const container = definition.containerDefinitions.find(c => c.name === 'api');
assert(container.secrets.some(s => s.name === 'RESEND_WEBHOOK_SECRET'));
assert.equal(container.environment.find(e => e.name === 'NOTIFICATION_OUTBOX_RUNNER_ENABLED').value, 'false');
const dir = mkdtempSync('.recovery-private/production-email-acceptance-');
const input = {cluster: 'darci-production', taskDefinition: service.taskDefinition, launchType: 'FARGATE', platformVersion: '1.4.0',
  networkConfiguration: service.networkConfiguration, count: 1, startedBy: 'operator-email-acceptance',
  overrides: {containerOverrides: [{name: 'api', command: ['node', '-e', readFileSync(new URL('./email-acceptance.cjs', import.meta.url), 'utf8')]}]},
  tags: [{key: 'Purpose', value: 'operator-only-email-acceptance'}, {key: 'Environment', value: 'production'}]};
writeFileSync(`${dir}/run-task.json`, JSON.stringify(input), {mode: 0o600});
const result = aws('ecs', 'run-task', '--cli-input-json', `file://${process.cwd()}/${dir}/run-task.json`);
assert.equal(result.failures.length, 0);
const arn = result.tasks[0].taskArn;
writeFileSync(`${dir}/task.json`, JSON.stringify({arn, definition: service.taskDefinition}), {mode: 0o600});
console.log(JSON.stringify({task: arn, evidence: dir}));
let stopped;
for (let i = 0; i < 120; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const task = aws('ecs', 'describe-tasks', '--cluster', 'darci-production', '--tasks', arn).tasks[0];
  if (i % 6 === 0) console.log(JSON.stringify({state: task.lastStatus}));
  if (task.lastStatus === 'STOPPED') { stopped = task; break; }
}
assert(stopped, 'Acceptance task exceeded ten minutes; inspect and stop this exact task if needed');
await new Promise(r => setTimeout(r, 3000));
const logs = aws('logs', 'get-log-events', '--log-group-name', '/ecs/darci-production-api', '--log-stream-name', `api/api/${arn.split('/').pop()}`, '--start-from-head').events.map(e => e.message);
writeFileSync(`${dir}/result.json`, JSON.stringify({time: new Date().toISOString(), task: arn, exitCode: stopped.containers[0].exitCode, logs}, null, 2), {mode: 0o600});
for (const line of logs) console.log(line);
assert.equal(stopped.containers[0].exitCode, 0, 'Production email acceptance failed; inspect retained evidence before retrying');
assert(logs.some(line => line.includes('"passed":true')));
