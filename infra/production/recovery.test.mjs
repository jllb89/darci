import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProductionRecovery} from './recovery.mjs';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const t = buildProductionRecovery(), r = t.Resources;
test('production recovery cannot target beta network or source secrets', () => {
  const serialized = JSON.stringify(t);
  assert(!/staging|vpc-013a5826615911fb4|subnet-042cb0a5539feffec|subnet-0608170673e5bf376|subnet-0707c07870cd29926/.test(serialized));
  assert.equal(r.RecoverySourceSecret.Properties.Name, '/darci/production/recovery-source');
  assert.equal(r.BackupLogs.Properties.LogGroupName, '/darci/production/recovery/backup');
  assert.equal(r.BackupSchedule.Properties.Target.EcsParameters.NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp, 'DISABLED');
  assert(r.BackupTask.Properties.ContainerDefinitions[0].Command.includes('--environment=production'));
});
test('production recovery preserves encrypted, versioned, retained objects and no-delete writer', () => {
  assert.equal(r.BackupRepository.Properties.ImageScanningConfiguration.ScanOnPush, true);
  assert.equal(r.RecoveryBucket.Properties.VersioningConfiguration.Status, 'Enabled');
  assert.equal(r.RecoveryBucket.DeletionPolicy, 'Retain');
  assert.equal(r.RecoveryKey.Properties.EnableKeyRotation, true);
  assert.equal(r.RecoverySourceSecret.DeletionPolicy, 'Retain');
  const actions = r.BackupWriter.Properties.Policies.flatMap(p => p.PolicyDocument.Statement.flatMap(s => [s.Action].flat()));
  assert(!actions.includes('s3:DeleteObject')); assert(!actions.includes('s3:GetObject'));
});
test('no new email subscription, no premature missing-snapshot alarms or scheduled work', () => {
  assert(!Object.values(r).some(x => x.Type === 'AWS::SNS::Subscription'));
  assert.equal(t.Parameters.BackupScheduleState.Default, 'DISABLED');
  assert.equal(r.SnapshotSuccessMissing.Properties.ActionsEnabled, false);
});
test('snapshot executable binds project, stack, secret, pooler and metrics to the chosen environment', () => {
  const source = readFileSync(new URL('../../backend/scripts/recovery-snapshot.mjs', import.meta.url), 'utf8');
  assert(source.includes("assert.equal(stackName, expectedStack"));
  assert(source.includes('`${sourceProject}.supabase.co`'));
  assert(source.includes('`postgres.${sourceProject}`'));
  assert(source.includes('Value: environment'));
});
test('cross-environment stack selection is rejected before any external call', () => {
  const result = spawnSync(process.execPath, [new URL('../../backend/scripts/recovery-snapshot.mjs', import.meta.url).pathname,
    'backup', '--environment=production', '--stack=darci-recovery'], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Recovery stack\/environment mismatch/);
});
