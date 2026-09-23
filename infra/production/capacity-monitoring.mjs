const topic = 'arn:aws:sns:us-east-1:427057633951:darci-recovery-critical';
const alb = 'app/darci-production/ee039814dd7d7fd1';
export function capacityAlarms({apiTarget, webTarget}) {
  const resources = {};
  const add = (id, name, properties) => {
    resources[id] = {Type: 'AWS::CloudWatch::Alarm', Properties: {
      // The existing topic permits only this account's darci-recovery-* alarms.
      AlarmName: `darci-recovery-production-capacity-${name}`,
      AlarmDescription: 'Sustained production capacity/availability issue. Owner lopezb.jl@gmail.com; docs/production-operations-runbook.md#platform. Inspect task/ALB metrics before scaling.',
      ActionsEnabled: true, AlarmActions: [topic], TreatMissingData: 'notBreaching',
      Period: 60, EvaluationPeriods: 5, DatapointsToAlarm: 3, ComparisonOperator: 'GreaterThanOrEqualToThreshold', ...properties,
    }};
  };
  for (const service of ['api', 'worker', 'web']) for (const [metric, threshold] of [['CPUUtilization', 85], ['MemoryUtilization', 80]]) {
    add(service + metric, `${service}-${metric.toLowerCase()}`, {Namespace: 'AWS/ECS', MetricName: metric, Statistic: 'Average', Threshold: threshold,
      Dimensions: [{Name: 'ClusterName', Value: 'darci-production'}, {Name: 'ServiceName', Value: 'darci-production-' + service}]});
  }
  for (const [service, group] of [['api', apiTarget], ['web', webTarget]]) {
    add(service + 'HealthyTargets', service + '-healthy-targets', {Namespace: 'AWS/ApplicationELB', MetricName: 'HealthyHostCount', Statistic: 'Minimum', Threshold: 2,
      ComparisonOperator: 'LessThanThreshold', TreatMissingData: 'breaching',
      Dimensions: [{Name: 'LoadBalancer', Value: alb}, {Name: 'TargetGroup', Value: group}]});
  }
  add('ApiTargetErrors', 'api-errors', {Namespace: 'AWS/ApplicationELB', MetricName: 'HTTPCode_Target_5XX_Count', Statistic: 'Sum', Threshold: 5,
    Dimensions: [{Name: 'LoadBalancer', Value: alb}, {Name: 'TargetGroup', Value: apiTarget}]});
  add('ApiLatency', 'api-latency', {Namespace: 'AWS/ApplicationELB', MetricName: 'TargetResponseTime', ExtendedStatistic: 'p95', Threshold: 3,
    EvaluateLowSampleCountPercentile: 'ignore', Dimensions: [{Name: 'LoadBalancer', Value: alb}, {Name: 'TargetGroup', Value: apiTarget}]});
  return resources;
}
