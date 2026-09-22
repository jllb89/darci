// Read-only release preflight; no customer rows, secret values or tokens logged.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const aws = args => JSON.parse(execFileSync('aws',[...args,'--region','us-east-1','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
try {
  assert.equal(aws(['sts','get-caller-identity']).Account,'427057633951');
  const c=JSON.parse(aws(['secretsmanager','get-secret-value','--secret-id','/darci/staging/app']).SecretString);
  assert.equal(new URL(c.SUPABASE_URL).hostname,'oqferisuloumoojgbjde.supabase.co');
  const key=Buffer.from(c.IDENTITY_FIELD_ENCRYPTION_KEY ?? '', 'base64');
  assert.equal(key.length,32,'Protected identity key has not been prepared');
  assert.equal(key.toString('base64'),c.IDENTITY_FIELD_ENCRYPTION_KEY);
  assert(/^[A-Za-z0-9_-]{1,64}$/.test(c.IDENTITY_FIELD_ENCRYPTION_KEY_ID ?? ''),'Protected identity key ID is missing');
  const get = async path => {
    const response=await fetch(`${c.SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:c.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:`Bearer ${c.SUPABASE_SERVICE_ROLE_KEY}`},signal:AbortSignal.timeout(10_000)});
    assert(response.ok,'Required database schema/configuration is unavailable');
    return response.json();
  };
  const schema=await get('');
  for (const rpc of ['claim_document_invite','record_protected_identity_verification','record_document_render_provenance',
    'commit_hash_only_output','complete_hash_only_package','is_auth_session_active']) {
    assert(schema.paths?.[`/rpc/${rpc}`],`Missing Phase 1 database capability: ${rpc}. Apply reviewed migrations before deployment.`);
  }
  const config=await get('billing_runtime_configuration?singleton=eq.true&select=stripe_environment');
  assert.equal(config[0]?.stripe_environment,'test','Staging database must remain Stripe test-only');
  console.log('PASS: required Phase 1 database API capabilities and protected-storage configuration present. This is not full release acceptance.');
} catch(error) {
  console.error(error instanceof assert.AssertionError ? error.message : 'Staging preflight unavailable; deployment must stop.');
  process.exitCode=1;
}
