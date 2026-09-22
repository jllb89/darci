// Additive, idempotent key preparation. No restart, rotation or plaintext output.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
assert(process.argv.includes('--approve-protected-storage'));
const aws = (args, input) => JSON.parse(execFileSync('aws', [...args, '--region','us-east-1','--output','json'], {
  encoding:'utf8', input, stdio:['pipe','pipe','ignore'], env:{...process.env,AWS_PAGER:''},
}));
try {
  assert.equal(aws(['sts','get-caller-identity']).Account,'427057633951');
  const secretId='/darci/staging/app';
  const current=aws(['secretsmanager','get-secret-value','--secret-id',secretId]);
  const config=JSON.parse(current.SecretString);
  assert.equal(new URL(config.SUPABASE_URL).hostname,'oqferisuloumoojgbjde.supabase.co');
  if (config.IDENTITY_FIELD_ENCRYPTION_KEY || config.IDENTITY_FIELD_ENCRYPTION_KEY_ID) {
    const key=Buffer.from(config.IDENTITY_FIELD_ENCRYPTION_KEY ?? '', 'base64');
    assert.equal(key.length,32); assert.equal(key.toString('base64'),config.IDENTITY_FIELD_ENCRYPTION_KEY);
    assert(/^[A-Za-z0-9_-]{1,64}$/.test(config.IDENTITY_FIELD_ENCRYPTION_KEY_ID ?? ''));
    console.log(JSON.stringify({status:'already_prepared',secretVersion:current.VersionId,noRotation:true}));
  } else {
    config.IDENTITY_FIELD_ENCRYPTION_KEY=randomBytes(32).toString('base64');
    config.IDENTITY_FIELD_ENCRYPTION_KEY_ID='staging-20260917-v1';
    const latest=aws(['secretsmanager','get-secret-value','--secret-id',secretId]);
    assert.equal(latest.VersionId,current.VersionId,'Secret changed concurrently; retry from current values');
    const result=aws(['secretsmanager','put-secret-value','--secret-id',secretId,'--client-request-token',randomUUID(),
      '--secret-string','file:///dev/stdin'],JSON.stringify(config));
    const verified=aws(['secretsmanager','get-secret-value','--secret-id',secretId,'--version-id',result.VersionId]);
    assert.deepEqual(JSON.parse(verified.SecretString),config);
    console.log(JSON.stringify({status:'prepared',secretVersion:result.VersionId,addedKeys:2,otherValuesPreserved:true,
      deployed:false,next:'Back up and recover this key before activating protected writes.'}));
  }
} catch { console.error('Identity key preparation failed; inspect configuration securely. No credentials are logged.');process.exitCode=1; }
