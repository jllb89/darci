// Reuse reviewed backup controls, but never their staging resource destinations.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function buildProductionRecovery({snapshotActionsEnabled = false} = {}) {
  const original = readFileSync(new URL('../recovery/stack.json', import.meta.url), 'utf8');
  const t = JSON.parse(original.replaceAll('darci-recovery', 'darci-production-backup').replaceAll('/darci/recovery/', '/darci/production/recovery/').replaceAll('staging', 'production'));
  const r = t.Resources;
  r.BackupRepository.Properties.ImageTagMutability = 'IMMUTABLE';
  r.BackupRepository.Properties.ImageScanningConfiguration = {ScanOnPush: true};
  // Reuse the already confirmed email route; do not send another subscription email.
  delete r.CriticalAlerts; delete r.CriticalAlertsPolicy; delete r.CriticalEmail; delete r.RecoveryBudget;
  t.Parameters.CriticalAlerts = {Type: 'String', AllowedPattern: 'arn:aws:sns:us-east-1:427057633951:darci-recovery-critical'};
  t.Parameters.ProductionVpc = {Type: 'AWS::EC2::VPC::Id'};
  t.Parameters.ProductionPrivateSubnets = {Type: 'List<AWS::EC2::Subnet::Id>'};
  for (const resource of Object.values(r)) {
    if (resource.Type === 'AWS::CloudWatch::Alarm') {
      resource.Properties.AlarmName = resource.Properties.AlarmName.replace('darci-production-backup-', 'darci-recovery-production-');
    }
  }
  // Missing-snapshot actions are enabled only after an actual successful backup.
  r.SnapshotSuccessMissing.Properties.ActionsEnabled = snapshotActionsEnabled;
  r.BackupNetwork.Properties.VpcId = {Ref: 'ProductionVpc'};
  const network = r.BackupSchedule.Properties.Target.EcsParameters.NetworkConfiguration.AwsvpcConfiguration;
  network.AssignPublicIp = 'DISABLED';
  network.Subnets = {Ref: 'ProductionPrivateSubnets'};
  r.BackupTask.Properties.ContainerDefinitions[0].Command = ['backup', '--environment=production', '--task-role=true', '--session-pooler=true', '--pg-bin=/usr/bin', '--ca-file=/app/infra/recovery/supabase-ca.crt'];
  return t;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(buildProductionRecovery({snapshotActionsEnabled: process.argv.includes('--enable-snapshot-alerts')}), null, 2));
