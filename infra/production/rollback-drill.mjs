// Operator-only, explicitly approved private-production readiness/rollback drill.
// The candidate serves only 503; it never imports application code or writes data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readReleaseSnapshot, verifyReleaseSnapshot, productionServices} from './release-verification.mjs';

export function buildReadinessFailure(template) {
  const next = structuredClone(template);
  const service = next.Resources.apiService.Properties;
  assert.equal(service.DesiredCount, 2);
  assert.equal(service.DeploymentConfiguration.MinimumHealthyPercent, 100);
  assert.equal(service.DeploymentConfiguration.MaximumPercent, 200);
  assert.deepEqual(service.DeploymentConfiguration.DeploymentCircuitBreaker, {Enable: true, Rollback: true});
  const containers = next.Resources.apiTask.Properties.ContainerDefinitions;
  assert.equal(containers.length, 1);
  const api = containers[0];
  assert.equal(api.Name, 'api');
  assert.equal(api.Command, undefined, 'Refuse an unexpected pre-existing command override');
  assert.equal(api.Environment.find(e => e.Name === 'STRIPE_LIVE_MODE_ENABLED')?.Value, 'false');
  assert.equal(api.Environment.find(e => e.Name === 'NOTIFICATION_OUTBOX_RUNNER_ENABLED')?.Value, 'false');
  assert(api.HealthCheck.Command.at(-1).includes('/health/ready'));
  assert(next.Resources.apiRoute.Properties.Conditions.some(c => c.Field === 'source-ip'));
  api.Command = ['node', '-e', "const h=require('node:http');const s=h.createServer((q,r)=>{r.writeHead(503,{'Content-Type':'text/plain'});r.end('SYNTHETIC_READINESS_FAILURE');});s.listen(4000,'0.0.0.0',()=>console.log('SYNTHETIC_READINESS_FAILURE: approved rollback drill; no application imports'));process.on('SIGTERM',()=>s.close(()=>process.exit(0))); "];
  const restored = structuredClone(next);
  delete restored.Resources.apiTask.Properties.ContainerDefinitions[0].Command;
  assert.deepEqual(restored, template, 'Fault must change only API container startup');
  return next;
}

export function verifyRollback({before, after, evidence}) {
  assert.equal(after.stack.StackStatus, 'UPDATE_ROLLBACK_COMPLETE');
  assert.equal(evidence.manualRecovery, false, 'Manual recovery is not automatic rollback acceptance');
  assert.equal(evidence.unhealthyCandidate, true, 'Actual candidate 503 target-health failure not observed');
  assert.equal(evidence.circuitBreaker, true, 'Actual circuit-breaker failure not observed');
  const images = Object.fromEntries(productionServices.map(s => [s,
    before.stack.Parameters.find(p => p.ParameterKey === `${s}Image`).ParameterValue]));
  // The common verifier requires a successful release state. Validate the real
  // rollback state above, then reuse its exact image/configuration/health checks.
  return verifyReleaseSnapshot({before, after: {...after, stack: {...after.stack, StackStatus: 'UPDATE_COMPLETE'}}, images});
}

async function main() {
  assert(process.argv.includes('--apply-approved-private-drill'), 'Explicit operator approval flag required');
  process.umask(0o077);
  const aws = (...a) => JSON.parse(execFileSync('aws', [...a, '--region', 'us-east-1', '--output', 'json',
    '--cli-connect-timeout', '10', '--cli-read-timeout', '20'], {encoding: 'utf8', timeout: 35000, stdio: ['ignore', 'pipe', 'pipe']}) || '{}');
  assert.equal(aws('sts', 'get-caller-identity').Account, '427057633951');
  const before = readReleaseSnapshot(aws);
  const images = Object.fromEntries(productionServices.map(s => [s,
    before.stack.Parameters.find(p => p.ParameterKey === `${s}Image`).ParameterValue]));
  verifyReleaseSnapshot({before, after: before, images});
  const fault = buildReadinessFailure(before.template);
  const group = before.services.api.service.loadBalancers[0].targetGroupArn;
  const baselineDefinition = before.services.api.service.taskDefinition;
  const root = new URL('../../.recovery-private/', import.meta.url);
  mkdirSync(root, {recursive: true, mode: 0o700});
  const folder = mkdtempSync(new URL('production-rollback-', root).pathname);
  const save = (name, value) => writeFileSync(`${folder}/${name}.json`, JSON.stringify(value, null, 2), {mode: 0o600});
  save('baseline', before);
  save('fault-template', fault);
  const started = Date.now();
  const evidence = {startedAt: new Date(started).toISOString(), manualRecovery: false, unhealthyCandidate: false, circuitBreaker: false, samples: []};
  const previous = before.stack.Parameters.map(p => ({ParameterKey: p.ParameterKey, UsePreviousValue: true}));
  const update = template => aws('cloudformation', 'update-stack', '--stack-name', 'darci-production-runtime',
    '--template-body', JSON.stringify(template), '--parameters', JSON.stringify(previous), '--capabilities', 'CAPABILITY_NAMED_IAM',
    '--role-arn', 'arn:aws:iam::427057633951:role/darci-production-cfn-release', '--client-request-token', `rollback-drill-${randomUUID()}`);
  const recover = status => {
    evidence.manualRecovery = true;
    if (status === 'UPDATE_IN_PROGRESS') aws('cloudformation', 'cancel-update-stack', '--stack-name', 'darci-production-runtime');
    else if (status === 'UPDATE_COMPLETE') update(before.template);
    else if (status === 'UPDATE_ROLLBACK_FAILED') aws('cloudformation', 'continue-update-rollback', '--stack-name', 'darci-production-runtime');
    save('evidence', evidence);
  };
  console.log(JSON.stringify({prepared: true, folder, baselineDefinition, fault: 'API-only HTTP 503; application never starts', recoveryDeadlineMinutes: 20}));
  const preflight = await fetch('https://api.illuminotary.com/health/ready', {signal: AbortSignal.timeout(10000)});
  assert(preflight.ok, 'Operator API readiness must pass before injection');
  save('update', update(fault));
  let lastStatus = 'UPDATE_IN_PROGRESS';
  let failedReads = 0;
  for (;;) {
    try {
      const stack = aws('cloudformation', 'describe-stacks', '--stack-name', 'darci-production-runtime').Stacks[0];
      lastStatus = stack.StackStatus;
      const service = aws('ecs', 'describe-services', '--cluster', 'darci-production', '--services', 'darci-production-api').services[0];
      const arns = aws('ecs', 'list-tasks', '--cluster', 'darci-production', '--service-name', 'darci-production-api', '--desired-status', 'RUNNING').taskArns;
      const tasks = arns.length ? aws('ecs', 'describe-tasks', '--cluster', 'darci-production', '--tasks', ...arns).tasks : [];
      const healthyBaseline = tasks.filter(t => t.taskDefinitionArn === baselineDefinition && t.lastStatus === 'RUNNING' && t.healthStatus === 'HEALTHY').length;
      const targets = aws('elbv2', 'describe-target-health', '--target-group-arn', group).TargetHealthDescriptions;
      const candidateIps = tasks.filter(t => t.taskDefinitionArn !== baselineDefinition).flatMap(t => t.attachments ?? [])
        .flatMap(a => a.details ?? []).filter(d => d.name === 'privateIPv4Address').map(d => d.value);
      evidence.unhealthyCandidate ||= targets.some(t => candidateIps.includes(t.Target.Id) && t.TargetHealth.State === 'unhealthy' && /503/.test(t.TargetHealth.Description ?? ''));
      const events = aws('cloudformation', 'describe-stack-events', '--stack-name', 'darci-production-runtime').StackEvents
        .filter(e => Date.parse(e.Timestamp) >= started);
      evidence.circuitBreaker ||= events.some(e => /circuit breaker/i.test(e.ResourceStatusReason ?? '')) || service.deployments.some(d => d.rolloutState === 'FAILED' && /health|circuit/i.test(d.rolloutStateReason ?? ''));
      const response = await fetch('https://api.illuminotary.com/health/ready', {signal: AbortSignal.timeout(10000)});
      const sample = {at: new Date().toISOString(), elapsedSeconds: Math.round((Date.now() - started) / 1000), stack: lastStatus,
        healthyBaseline, apiStatus: response.status, unhealthyTargets: targets.filter(t => t.TargetHealth.State === 'unhealthy').length,
        deployments: service.deployments.map(d => ({definition: d.taskDefinition, state: d.rolloutState, running: d.runningCount, failedTasks: d.failedTasks}))};
      evidence.samples.push(sample); save('evidence', evidence); save('stack-events', events); failedReads = 0;
      console.log(JSON.stringify(sample));
      if (lastStatus === 'UPDATE_ROLLBACK_COMPLETE') {
        const after = readReleaseSnapshot(aws); save('after', after);
        evidence.verification = verifyRollback({before, after, evidence});
        evidence.finishedAt = new Date().toISOString(); save('evidence', evidence);
        console.log(JSON.stringify({passed: true, automaticRollback: true, folder, elapsedSeconds: sample.elapsedSeconds})); return;
      }
      if (!evidence.manualRecovery && (healthyBaseline < 2 || !response.ok || Date.now() - started > 20 * 60_000 || ['UPDATE_COMPLETE', 'UPDATE_ROLLBACK_FAILED'].includes(lastStatus))) recover(lastStatus);
      if (evidence.manualRecovery && lastStatus === 'UPDATE_COMPLETE') {
        const after = readReleaseSnapshot(aws);
        verifyReleaseSnapshot({before, after, images}); save('after', after);
        throw new Error('Original configuration recovered manually; automatic rollback not accepted');
      }
      if (Date.now() - started > 30 * 60_000) throw new Error('Recovery deadline exceeded; operator action required');
    } catch (error) {
      failedReads++;
      save('failure', {at: new Date().toISOString(), message: error.message.slice(0,300), stack: lastStatus, failedReads});
      if (!evidence.manualRecovery) recover(lastStatus);
      if (failedReads >= 3 || ['UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'].includes(lastStatus)) throw error;
      console.log(JSON.stringify({recovering: true, stack: lastStatus, failedReads}));
    }
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(`Rollback drill stopped: ${error.message.slice(0,300)}`); process.exitCode = 1;});
}
