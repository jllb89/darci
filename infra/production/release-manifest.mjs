// Offline fail-closed review gate. Never deploys or reads secret values.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function validateProductionManifest(m) {
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.environment, 'production');
  assert.equal(m.publicTrafficEnabled, false, 'Phase 2 must remain private');
  assert.equal(m.livePaymentsEnabled, false, 'Live payment activation belongs to Phase 3');
  assert.equal(m.betaDataImport, false);
  assert.match(m.revision ?? '', /^[a-f0-9]{40}$/);
  assert.match(m.awsAccountId ?? '', /^\d{12}$/);
  assert.equal(m.region, 'us-east-1');
  assert.match(m.supabaseProjectRef ?? '', /^[a-z]{20}$/);
  assert.notEqual(m.supabaseProjectRef, 'oqferisuloumoojgbjde', 'Beta database is forbidden');
  assert.equal(m.supabaseUrl, `https://${m.supabaseProjectRef}.supabase.co`);
  const origins = ['webOrigin', 'apiOrigin'].map(key => {
    const url = new URL(m[key]);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.origin, m[key]);
    assert(!/staging|localhost|127\.0\.0\.1/i.test(url.hostname));
    return url.origin;
  });
  assert.notEqual(origins[0], origins[1]);
  assert.equal(m.ecsCluster, 'darci-production');
  assert.equal(m.redisTls, true);
  assert.match(m.redisHost ?? '', /^[a-z0-9.-]+\.cache\.amazonaws\.com$/);
  assert(!/staging/i.test(m.redisHost));
  assert.equal(m.ledgerMode, 'hash_only');
  assert.equal(m.automaticIdentityDeletion, false);
  assert.equal(m.deploymentCircuitBreaker, true);
  assert.equal(m.deploymentRollback, true);
  assert.equal(m.taskPublicIp, false);
  assert.equal(m.githubEnvironment, 'production');
  assert.equal(m.environmentApprovalVerified, true, 'Protected production environment must be independently verified');
  assert.equal(m.rpoHours, 24);
  assert.equal(m.rtoHours, 4);
  assert.match(m.migrationManifestSha256 ?? '', /^[a-f0-9]{64}$/);
  assert.match(m.configVersion ?? '', /^[a-zA-Z0-9-]{32,64}$/);
  const secretPrefix = `arn:aws:secretsmanager:${m.region}:${m.awsAccountId}:secret:/darci/production/`;
  for (const name of ['appSecretArn', 'recoverySecretArn']) assert(m[name]?.startsWith(secretPrefix), `${name} must be a production secret reference`);
  for (const service of ['api', 'worker', 'web']) {
    assert.match(m.images?.[service] ?? '', new RegExp(`^${m.awsAccountId}\\.dkr\\.ecr\\.${m.region}\\.amazonaws\\.com/darci-production-${service}@sha256:[a-f0-9]{64}$`));
  }
  assert(m.approvedMonthlyBudgetUsd > 0 && Number.isFinite(m.approvedMonthlyBudgetUsd));
  assert(!/sk_(test|live)_|service_role_key|whsec_|postgres(ql)?:\/\//i.test(JSON.stringify(m)), 'Manifest must contain references, never credentials');
  return {valid: true, scope: 'Offline manifest validation only; AWS/Supabase configuration, protection, image scans, health and restore evidence must be independently verified.'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(validateProductionManifest(JSON.parse(readFileSync(process.argv[2], 'utf8'))))); }
  catch (error) { console.error(`Production manifest rejected: ${error.message}`); process.exitCode = 1; }
}
