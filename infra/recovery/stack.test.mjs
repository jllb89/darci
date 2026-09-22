import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stack = JSON.parse(readFileSync(new URL('./stack.json', import.meta.url), 'utf8'));
const resources = stack.Resources;
const properties = name => resources[name].Properties;
const statements = name => properties(name).Policies.flatMap(p => p.PolicyDocument.Statement);
const actions = statement => [statement.Action].flat();

test('schedule is opt-in, digest-pinned, bounded and scoped to the backup task', () => {
  assert.equal(stack.Parameters.BackupScheduleState.Default, 'DISABLED');
  const pattern = new RegExp(stack.Parameters.BackupImage.AllowedPattern);
  assert(pattern.test(`427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-recovery@sha256:${'a'.repeat(64)}`));
  assert(!pattern.test('public.ecr.aws/untrusted:latest'));
  assert(!pattern.test('427057633951.dkr.ecr.us-east-1.amazonaws.com/darci-recovery:latest'));
  assert.equal(properties('BackupSchedule').ScheduleExpression, 'cron(0 2,14 * * ? *)');
  assert.equal(properties('BackupSchedule').ScheduleExpressionTimezone, 'America/Mexico_City');
  assert.deepEqual(properties('BackupSchedule').Target.EcsParameters.TaskDefinitionArn, { Ref: 'BackupTask' });
  const run = statements('BackupScheduleRole').find(s => actions(s).includes('ecs:RunTask'));
  assert.deepEqual(run.Resource, { Ref: 'BackupTask' });
  assert(run.Condition.ArnEquals['ecs:cluster']);
  const pass = statements('BackupScheduleRole').find(s => actions(s).includes('iam:PassRole'));
  assert.equal(pass.Resource.length, 2);
  assert.equal(pass.Condition.StringEquals['iam:PassedToService'], 'ecs-tasks.amazonaws.com');
});

test('backup runtime has no ingress, no root filesystem writes and no extra provider secrets', () => {
  const task = properties('BackupTask');
  assert.equal(task.Cpu, '512');
  assert.equal(task.Memory, '2048');
  const container = task.ContainerDefinitions[0];
  assert.equal(container.User, '1000');
  assert.equal(container.ReadonlyRootFilesystem, true);
  assert.deepEqual(container.LinuxParameters.Capabilities.Drop, ['ALL']);
  assert.deepEqual(container.Environment.map(e => e.Name).sort(), ['AWS_DEFAULT_REGION', 'AWS_REGION']);
  assert.deepEqual(properties('BackupNetwork').SecurityGroupIngress, []);
  assert.deepEqual(properties('BackupNetwork').SecurityGroupEgress.map(r => r.FromPort).sort(), [443, 5432]);
  const secret = statements('BackupWriter').filter(s => actions(s).some(a => a.startsWith('secretsmanager:')));
  assert.equal(secret.length, 1);
  assert.deepEqual(secret[0].Resource, { Ref: 'RecoverySourceSecret' });
  assert.equal(secret[0].Action, 'secretsmanager:GetSecretValue');
  const dockerfile = readFileSync(new URL('./Dockerfile', import.meta.url), 'utf8');
  assert(dockerfile.includes('"2700"'));
  assert(dockerfile.includes('USER node'));
});

test('backup writer cannot read/delete objects, and recovery evidence is retained', () => {
  const writerActions = statements('BackupWriter').flatMap(actions);
  assert(writerActions.includes('s3:PutObject'));
  assert(!writerActions.some(a => ['s3:*', 's3:GetObject', 's3:GetObjectVersion', 's3:DeleteObject', 's3:DeleteObjectVersion'].includes(a)));
  for (const name of ['RecoveryBucket', 'RecoveryKey', 'RecoverySourceSecret']) {
    assert.equal(resources[name].DeletionPolicy, 'Retain');
  }
  assert.equal(properties('RecoveryBucket').VersioningConfiguration.Status, 'Enabled');
});

test('task failures use scoped SQS delivery instead of unsupported SNS event conditions', () => {
  for (const name of ['BackupFailed', 'BackupStartFailed']) {
    assert.deepEqual(properties(name).Targets[0].Arn, { 'Fn::GetAtt': ['BackupDeadLetters', 'Arn'] });
  }
  assert(!properties('CriticalAlertsPolicy').PolicyDocument.Statement.some(s => s.Principal?.Service === 'events.amazonaws.com'));
  const delivery = properties('BackupFailureQueuePolicy').PolicyDocument.Statement[0];
  assert.equal(delivery.Action, 'sqs:SendMessage');
  assert(delivery.Condition.ArnLike['aws:SourceArn']['Fn::Sub'].endsWith(':rule/darci-recovery-backup-*'));
  assert.equal(properties('BackupDeadLetters').SqsManagedSseEnabled, true);
  assert.deepEqual(properties('BackupDeadLetterAlarm').AlarmActions, [{ Ref: 'CriticalAlerts' }]);
});
