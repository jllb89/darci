import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {buildReadinessFailure, verifyRollback} from './rollback-drill.mjs';

test('fault changes only API command, without importing application code or touching storage', () => {
  const before = buildRuntime();
  const fault = buildReadinessFailure(before);
  const command = fault.Resources.apiTask.Properties.ContainerDefinitions[0].Command;
  assert(command[2].includes('writeHead(503'));
  assert(!/supabase|fetch|process\.env|dist\/|fs/.test(command[2]));
  delete fault.Resources.apiTask.Properties.ContainerDefinitions[0].Command;
  assert.deepEqual(fault, before);
});
for (const [name, mutate] of [
  ['live payments', t => {t.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.find(e => e.Name === 'STRIPE_LIVE_MODE_ENABLED').Value = 'true';}],
  ['live messages', t => {t.Resources.apiTask.Properties.ContainerDefinitions[0].Environment.find(e => e.Name === 'NOTIFICATION_OUTBOX_RUNNER_ENABLED').Value = 'true';}],
  ['no healthy capacity floor', t => {t.Resources.apiService.Properties.DeploymentConfiguration.MinimumHealthyPercent = 0;}],
  ['no rollback', t => {t.Resources.apiService.Properties.DeploymentConfiguration.DeploymentCircuitBreaker.Rollback = false;}],
  ['unexpected startup', t => {t.Resources.apiTask.Properties.ContainerDefinitions[0].Command = ['other'];}],
  ['public access', t => {t.Resources.apiRoute.Properties.Conditions = t.Resources.apiRoute.Properties.Conditions.filter(c => c.Field !== 'source-ip');}],
]) test(`refuses ${name}`, () => {const t = buildRuntime(); mutate(t); assert.throws(() => buildReadinessFailure(t));});

test('does not substitute manual recovery or missing health-failure evidence for rollback acceptance', () => {
  const after = {stack: {StackStatus: 'UPDATE_ROLLBACK_COMPLETE'}};
  assert.throws(() => verifyRollback({after, evidence: {manualRecovery: true}}), /Manual recovery/);
  assert.throws(() => verifyRollback({after, evidence: {manualRecovery: false, unhealthyCandidate: false}}), /503/);
  assert.throws(() => verifyRollback({after, evidence: {manualRecovery: false, unhealthyCandidate: true, circuitBreaker: false}}), /circuit-breaker/);
});
