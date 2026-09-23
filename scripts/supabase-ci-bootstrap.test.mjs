import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bootstrap, retryableImageFailure, sanitize} from './supabase-ci-bootstrap.mjs';

const ok = stdout => ({status: 0, stdout, stderr: ''});
const error = stderr => ({status: 1, stdout: '', stderr});
const registryError = 'failed to pull image ghcr.io/supabase/postgres: unexpected EOF';
function exercise(results) {
  const calls = [], files = new Map(), messages = [];
  const code = bootstrap('/tmp/disposable', {
    run: args => { calls.push(args); assert.ok(results.length, 'unexpected CLI call'); return results.shift(); },
    write: (path, content, options) => { files.set(path, content); assert.equal(options.mode, 0o600); },
    log: text => messages.push(text),
  });
  return {code, calls, files, logs: messages.join('\n'), diagnostics: files.get('/tmp/disposable/bootstrap.sanitized.log')};
}

test('credentials and ANSI sequences are redacted while SQL errors remain useful', () => {
  const cleaned = sanitize('\u001b[31mSQLSTATE 42501 permission denied\u001b[0m\n'
    + 'anon key: opaque-anon\nservice_role key: opaque-service\n'
    + 'JWT_SECRET=private-secret\n"password": "private-password"\n'
    + 'postgresql://postgres:database-password@127.0.0.1:54322/postgres\n'
    + 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature\n'
    + 'sb_secret_testsecret sb_publishable_testpublic');
  assert.match(cleaned, /SQLSTATE 42501 permission denied/);
  assert.doesNotMatch(cleaned, /opaque-|private-|database-password|eyJ|testsecret|testpublic|\u001b/);
});

test('successful startup persists private status but never logs status credentials', () => {
  const result = exercise([ok('migrations installed'), ok('{"SERVICE_ROLE_KEY":"private-fixture"}')]);
  assert.equal(result.code, 0);
  assert.equal(result.calls.length, 2);
  assert.match(result.files.get('/tmp/disposable/status.json'), /private-fixture/);
  assert.doesNotMatch(result.diagnostics + result.logs, /private-fixture/);
});

test('an explicit transient image failure retries once then proceeds normally', () => {
  const result = exercise([error(registryError), ok('installed'), ok('{}')]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.calls.map(c => c[0]), ['start', 'start', 'status']);
  assert.match(result.diagnostics, /unexpected EOF/);
});

test('persistent registry failure stops after two attempts and retains diagnostics', () => {
  const result = exercise([error(registryError), error(registryError)]);
  assert.equal(result.code, 1);
  assert.equal(result.calls.length, 2);
  assert.match(result.logs, /unexpected EOF/);
  assert.equal(result.files.has('/tmp/disposable/status.json'), false);
});

test('migration, health and unknown failures fail immediately without retry', () => {
  for (const message of [
    'Applying migration 20260923.sql\nERROR: missing table (SQLSTATE 42P01)',
    'unhealthy container: storage-api',
    'unknown error',
    `${registryError}\nApplying migration 20260923.sql\nSQLSTATE 42501`,
  ]) {
    const result = exercise([error(message)]);
    assert.equal(result.code, 1);
    assert.equal(result.calls.length, 1);
  }
});

test('process failures and status failures fail closed without exposing stdout', () => {
  const killed = exercise([{status: null, error: new Error('process terminated')}]);
  assert.equal(killed.code, 1);
  assert.match(killed.logs, /process terminated/);
  const status = exercise([ok('started'), {status: 7, stdout: 'sensitive-status', stderr: 'status failed'}]);
  assert.equal(status.code, 7);
  assert.doesNotMatch(status.logs + status.diagnostics, /sensitive-status/);
  const invalid = exercise([ok('started'), ok('invalid-sensitive-json')]);
  assert.equal(invalid.code, 1);
  assert.doesNotMatch(invalid.logs + invalid.diagnostics, /invalid-sensitive-json/);
});

test('only explicit pre-migration transient registry failures qualify for retry', () => {
  assert.equal(retryableImageFailure('ghcr.io registry response: 503'), true);
  assert.equal(retryableImageFailure('database connection reset'), false);
  assert.equal(retryableImageFailure('ghcr.io unauthorized'), false);
  assert.equal(retryableImageFailure('ghcr.io manifest unknown'), false);
  assert.equal(retryableImageFailure('Initializing schema\n' + registryError), false);
});
