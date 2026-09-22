import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
const ci = read('ci'), deploy = read('deploy-staging'), ios = read('ios');
const job = (source, name) => source.split(`\n  ${name}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0] ?? '';

test('server deployment reuses exact-commit CI instead of running the suite twice', () => {
  assert.doesNotMatch(deploy, /uses: .*ci\.yml/);
  assert.match(job(deploy, 'validate'), /node scripts\/workflow-gates\.mjs wait-ci/);
  assert.doesNotMatch(ci, /\n  ios:/);
  assert.match(ios, /xcodebuild test/);
  assert.match(ios, /actions\/cache@v4/);
});

test('prerequisites gate candidate builds, which run alongside validation', () => {
  assert.match(job(deploy, 'preflight'), /node backend\/scripts\/check-phase1-staging-deploy\.mjs/);
  assert.match(job(deploy, 'build-images'), /needs: \[changes, preflight\]/);
  assert.match(job(deploy, 'validate'), /needs: \[changes, preflight\]/);
  assert.match(job(deploy, 'deploy'), /- validate/);
  assert.match(job(deploy, 'deploy'), /- build-images/);
  assert.match(job(deploy, 'deploy'), /check-phase1-staging-deploy\.mjs/);
});

test('digest scans and database-security tests remain mandatory', () => {
  assert.match(job(deploy, 'build-images'), /--scanners vuln --severity HIGH,CRITICAL/);
  assert.match(job(deploy, 'build-images'), /--ignorefile \/dev\/null --exit-code 1/);
  assert.doesNotMatch(job(deploy, 'build-images'), /:staging-latest/);
  assert.match(ci, /test-phase1-storage-boundary\.mjs/);
  assert.match(ci, /test-phase1-billing-sql\.mjs/);
});

test('failed-rollout changes and runtime templates remain in the next build', () => {
  assert.match(job(deploy, 'changes'), /workflow-gates\.mjs baseline/);
  assert.match(job(deploy, 'changes'), /base: \$\{\{ steps\.baseline\.outputs\.base \}\}/);
  assert.match(job(deploy, 'changes'), /'docs\/\*\*'/);
  assert.match(job(deploy, 'changes'), /'supabase\/migrations\/\*\*'/);
});
