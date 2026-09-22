import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectCIRun, verifyCIJobs, waitForCI, findDeploymentBase, requiredCIJobs } from './workflow-gates.mjs';

const sha = 'a'.repeat(40);
const repository = 'jllb89/darci';
const run = { id: 10, head_sha: sha, event: 'push', head_branch: 'master',
  head_repository: { full_name: repository }, path: '.github/workflows/ci.yml',
  status: 'completed', conclusion: 'success', run_attempt: 2 };
const jobs = requiredCIJobs.map(name => ({ name, conclusion: 'success' }));

test('only the exact trusted revision and server workflow can authorize rollout', () => {
  for (const change of [{ head_sha: 'b'.repeat(40) }, { event: 'pull_request' },
    { head_branch: 'feature' }, { head_repository: { full_name: 'fork/darci' } },
    { path: '.github/workflows/ios.yml' }]) {
    assert.equal(selectCIRun([{ ...run, ...change }], { sha, repository }), undefined);
  }
  assert.equal(selectCIRun([run], { sha, repository }), run);
  assert.equal(selectCIRun([{ ...run, event: 'workflow_dispatch' }], { sha, repository }).id, 10);
});

test('a newer failed run supersedes an older success', () => {
  const failed = { ...run, id: 11, conclusion: 'failure' };
  assert.equal(selectCIRun([run, failed], { sha, repository }), failed);
});

test('every mandatory CI job must actually pass, not skip or disappear', () => {
  verifyCIJobs(jobs);
  for (const required of requiredCIJobs) {
    assert.throws(() => verifyCIJobs(jobs.filter(job => job.name !== required)));
    for (const conclusion of ['failure', 'skipped', 'cancelled', 'timed_out', null]) {
      assert.throws(() => verifyCIJobs(jobs.map(job => job.name === required ? { ...job, conclusion } : job)));
    }
  }
  assert.throws(() => verifyCIJobs([...jobs, jobs[0]]));
});

test('waits for CI then verifies jobs from the current run attempt', async () => {
  let clock = 0; let calls = 0;
  const actual = await waitForCI({ sha, repository, now: () => clock,
    sleep: async ms => { clock += ms; }, get: async path => {
      if (path.includes('/jobs?')) {
        assert.match(path, /\/10\/attempts\/2\/jobs/);
        return { jobs };
      }
      return { workflow_runs: ++calls === 1 ? [] : [run] };
    } });
  assert.equal(actual.id, 10);
  assert.equal(clock, 15_000);
});

test('failed CI, a missing job, and unavailable GitHub all stop deployment', async () => {
  await assert.rejects(waitForCI({ sha, repository, get: async () => ({ workflow_runs: [{ ...run, conclusion: 'failure' }] }) }));
  await assert.rejects(waitForCI({ sha, repository, get: async path => path.includes('/jobs?')
    ? { jobs: [] } : { workflow_runs: [run] } }));
  await assert.rejects(waitForCI({ sha, repository, get: async () => { throw new Error('API unavailable'); } }));
});

test('missing or wrong-revision CI times out without authorizing deployment', async () => {
  let clock = 0;
  await assert.rejects(waitForCI({ sha, repository, timeoutMs: 30_000, now: () => clock,
    sleep: async ms => { clock += ms; }, get: async () => ({ workflow_runs: [{ ...run, head_sha: 'b'.repeat(40) }] }) }), /No successful CI/);
  assert.equal(clock, 30_000);
});

test('deployment baseline ignores no-op successes, preserving previously undeployed changes', async () => {
  const base = await findDeploymentBase(async path => {
    if (path.includes('/workflows/')) return { workflow_runs: [{ ...run, id: 12 }, { ...run, id: 11 }, run] };
    if (path.includes('/12/')) return { jobs: [{ name: 'Deploy Staging', conclusion: 'skipped' }] };
    if (path.includes('/11/')) return { jobs: [{ name: 'Deploy Staging', conclusion: 'failure' }] };
    return { jobs: [{ name: 'Deploy Staging', conclusion: 'success' }] };
  });
  assert.equal(base, sha);
});

test('first deployment builds all; GitHub lookup errors never become an empty diff', async () => {
  assert.equal(await findDeploymentBase(async () => ({ workflow_runs: [] })), null);
  await assert.rejects(findDeploymentBase(async () => { throw new Error('API unavailable'); }));
});
