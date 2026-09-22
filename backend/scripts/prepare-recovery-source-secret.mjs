// Explicit approved staging backup configuration; no app/provider secrets are logged.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
assert(process.argv.includes('--approve-scheduled-backup'));
const aws = (args, input) => JSON.parse(execFileSync('aws', [...args, '--region', 'us-east-1', '--output', 'json'], {
  encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, AWS_PAGER: '' },
}));
try {
  assert.equal(aws(['sts', 'get-caller-identity']).Account, '427057633951');
  const source = aws(['secretsmanager', 'get-secret-value', '--secret-id', '/darci/staging/app']);
  const config = JSON.parse(source.SecretString);
  assert.equal(new URL(config.SUPABASE_URL).hostname, 'oqferisuloumoojgbjde.supabase.co');
  const keys = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'IDENTITY_FIELD_ENCRYPTION_KEY', 'IDENTITY_FIELD_ENCRYPTION_KEY_ID'];
  const subset = Object.fromEntries(keys.map(key => { assert(typeof config[key] === 'string' && config[key], `Required source setting missing: ${key}`); return [key, config[key]]; }));
  subset.SOURCE_APP_SECRET_VERSION = source.VersionId;
  const destination = '/darci/staging/recovery-source';
  const before = aws(['secretsmanager', 'describe-secret', '--secret-id', destination]);
  assert(before.KmsKeyId?.includes('40cb017c-3311-4177-815b-fc00bb74a245'), 'Recovery secret must use the approved recovery KMS key');
  assert.equal(aws(['secretsmanager', 'get-secret-value', '--secret-id', '/darci/staging/app']).VersionId, source.VersionId, 'Source changed; retry preparation');
  const result = aws(['secretsmanager', 'put-secret-value', '--secret-id', destination, '--client-request-token', randomUUID(), '--secret-string', 'file:///dev/stdin'], JSON.stringify(subset));
  const verified = aws(['secretsmanager', 'get-secret-value', '--secret-id', destination, '--version-id', result.VersionId]);
  assert.deepEqual(JSON.parse(verified.SecretString), subset);
  console.log(JSON.stringify({ status: 'prepared', secretVersion: result.VersionId, sourceVersion: source.VersionId,
    copiedSettings: keys.length, stripeEmailSmsKeysExcluded: true, sourceUnchanged: true }));
} catch { console.error('Recovery source preparation failed. No secrets logged; source app configuration is unchanged.'); process.exitCode = 1; }
