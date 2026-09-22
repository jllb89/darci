import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const requiredCIJobs = ['backend', 'database-security', 'web', 'types'];

export function selectCIRun(runs, { sha, repository, branch = 'master' }) {
  return runs.filter(run => run.head_sha === sha && ['push', 'workflow_dispatch'].includes(run.event)
    && run.head_branch === branch && run.head_repository?.full_name === repository
    && run.path === '.github/workflows/ci.yml')
    .sort((a, b) => b.id - a.id)[0];
}

export function verifyCIJobs(jobs) {
  for (const name of requiredCIJobs) {
    const matches = jobs.filter(job => job.name === name);
    assert(matches.length === 1 && matches[0].conclusion === 'success',
      `CI job ${name} did not pass; skipped/missing jobs cannot authorize deployment`);
  }
}

export async function waitForCI({ get, sha, repository, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 15 * 60_000 }) {
  assert(/^[a-f0-9]{40}$/.test(sha), 'A full commit SHA is required');
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const data = await get(`/actions/workflows/ci.yml/runs?head_sha=${sha}&branch=master&per_page=100`);
    const run = selectCIRun(data.workflow_runs, { sha, repository });
    if (run?.status === 'completed') {
      assert.equal(run.conclusion, 'success', `CI run ${run.id} did not pass for ${sha}`);
      const { jobs } = await get(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
      verifyCIJobs(jobs);
      return run;
    }
    await sleep(15_000);
  }
  throw new Error(`No successful CI for ${sha} within 15 minutes. Run CI for this revision; never reuse another commit's result.`);
}

export async function findDeploymentBase(get) {
  // Compare against the last actual rollout, not the previous push. This keeps
  // web/API changes from a failed deployment in scope on the next attempt.
  for (let page = 1; page <= 25; page++) {
    const { workflow_runs: runs } = await get(`/actions/workflows/deploy-staging.yml/runs?status=success&branch=master&per_page=20&page=${page}`);
    for (const run of runs) {
      if (!['push', 'workflow_dispatch'].includes(run.event) || run.head_branch !== 'master') continue;
      const { jobs } = await get(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
      if (jobs.some(job => job.name === 'Deploy Staging' && job.conclusion === 'success')) {
        assert(/^[a-f0-9]{40}$/.test(run.head_sha), 'Invalid deployment baseline SHA');
        return run.head_sha;
      }
    }
    if (runs.length < 20) break;
  }
  return null; // First deployment: rebuild every service.
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  assert(/^[\w.-]+\/[\w.-]+$/.test(repository ?? ''), 'Invalid repository');
  assert(token, 'A read-only Actions token is required');
  assert.equal(process.env.GITHUB_REF, 'refs/heads/master', 'Staging only deploys master');
  const get = async path => {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    });
    assert(response.ok, `GitHub Actions metadata unavailable (${response.status}); deployment must stop`);
    return response.json();
  };
  if (process.argv[2] === 'baseline') {
    const base = await findDeploymentBase(get);
    appendFileSync(process.env.GITHUB_OUTPUT, `base=${base ?? ''}\nfull_build=${base === null}\n`);
    console.log(base ? `Last successful staging rollout: ${base}` : 'No rollout baseline; building all services');
  } else if (process.argv[2] === 'wait-ci') {
    const run = await waitForCI({ get, sha: process.env.GITHUB_SHA, repository });
    console.log(`PASS: all server CI jobs passed for ${run.head_sha}: ${run.html_url}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `Validated exact revision against [CI run ${run.id}](${run.html_url}). No duplicate test run.\n`);
  } else throw new Error('Expected baseline or wait-ci');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
