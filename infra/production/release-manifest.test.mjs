import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateProductionManifest} from './release-manifest.mjs';
const candidate = () => ({schemaVersion: 1, environment: 'production', publicTrafficEnabled: false,
  livePaymentsEnabled: false, betaDataImport: false, revision: 'a'.repeat(40), awsAccountId: '123456789012',
  region: 'us-east-1', supabaseProjectRef: 'abcdefghijklmnopqrst', supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  webOrigin: 'https://app.example.com', apiOrigin: 'https://api.example.com', ecsCluster: 'darci-production',
  redisTls: true, redisHost: 'darci-production.example.cache.amazonaws.com', ledgerMode: 'hash_only',
  automaticIdentityDeletion: false, deploymentCircuitBreaker: true, deploymentRollback: true, taskPublicIp: false,
  githubEnvironment: 'production', environmentApprovalVerified: true, rpoHours: 24, rtoHours: 4,
  migrationManifestSha256: 'b'.repeat(64), configVersion: 'c'.repeat(32), approvedMonthlyBudgetUsd: 1,
  appSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:/darci/production/app-ABC123',
  recoverySecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:/darci/production/recovery-source-ABC123',
  images: Object.fromEntries(['api','worker','web'].map(s => [s, `123456789012.dkr.ecr.us-east-1.amazonaws.com/darci-production-${s}@sha256:${'d'.repeat(64)}`]))});
test('accepts a fully specified private candidate, without claiming deployed acceptance', () => {
  assert.equal(validateProductionManifest(candidate()).valid, true);
});
for (const [name, mutate] of [
  ['beta project', m => {m.supabaseProjectRef = 'oqferisuloumoojgbjde';}],
  ['staging origin', m => {m.webOrigin = 'https://app.staging.darciregistry.dev';}],
  ['test secret reference', m => {m.appSecretArn = m.appSecretArn.replace('/production/', '/staging/');}],
  ['mutable image', m => {m.images.api = m.images.api.replace(/@sha256:.*/, ':latest');}],
  ['public traffic', m => {m.publicTrafficEnabled = true;}],
  ['live payments', m => {m.livePaymentsEnabled = true;}],
  ['beta import', m => {m.betaDataImport = true;}],
  ['unapproved budget', m => {m.approvedMonthlyBudgetUsd = null;}],
  ['unprotected release', m => {m.environmentApprovalVerified = false;}],
  ['rollback disabled', m => {m.deploymentRollback = false;}],
  ['automatic deletion', m => {m.automaticIdentityDeletion = true;}],
  ['secret value', m => {m.accidentalSecret = 'sk_live_NOT_A_REAL_KEY';}],
  ['plaintext Redis', m => {m.redisTls = false;}],
]) test(`rejects ${name}`, () => {const m = candidate(); mutate(m); assert.throws(() => validateProductionManifest(m));});
