// No new compute, roles, secrets, subscriptions or application permissions.
export const categories = ['auth','notification','document','audit','billing','retention','platform'];
export function buildMonitoringTemplate() {
  const Resources = {};
  const namespace = 'DARCi/Operations/staging';
  for (const category of categories) {
    const name = category[0].toUpperCase()+category.slice(1);
    for (const service of ['api','worker']) Resources[name+service+'Filter'] = {
      Type:'AWS::Logs::MetricFilter', Properties:{
        LogGroupName:'/ecs/darci-staging-'+service,
        FilterPattern:`{ ($.kind = "darci_critical_signal") && ($.category = "${category}") && ($.environment = "staging") }`,
        MetricTransformations:[{MetricNamespace:namespace,MetricName:name+'Failures',MetricValue:'1',DefaultValue:0}],
      },
    };
    Resources[name+'Alarm'] = {Type:'AWS::CloudWatch::Alarm',Properties:{
      AlarmName:'darci-recovery-staging-app-'+category,
      AlarmDescription:`DARCi ${category} failure. Responder: lopezb.jl@gmail.com. Runbook: docs/production-operations-runbook.md#${category}. Find kind=darci_critical_signal and correlationId in staging API/worker logs. No client data is included in alert metrics.`,
      Namespace:namespace,MetricName:name+'Failures',Statistic:'Sum',Period:300,EvaluationPeriods:1,DatapointsToAlarm:1,
      Threshold:category==='auth'?5:1,ComparisonOperator:'GreaterThanOrEqualToThreshold',TreatMissingData:'notBreaching',
      AlarmActions:[{Ref:'CriticalTopicArn'}],OKActions:[{Ref:'CriticalTopicArn'}],
    }};
  }
  Resources.HeartbeatFilter={Type:'AWS::Logs::MetricFilter',Properties:{
    LogGroupName:'/ecs/darci-staging-worker',FilterPattern:'{ $.kind = "darci_watchdog_heartbeat" }',
    MetricTransformations:[{MetricNamespace:namespace,MetricName:'WatchdogHeartbeat',MetricValue:'1'}],
  }};
  Resources.HeartbeatAlarm={Type:'AWS::CloudWatch::Alarm',Properties:{
    AlarmName:'darci-recovery-staging-app-watchdog-missing',
    AlarmDescription:'No completed durable queue/dependency probe for five minutes. Check worker rollout, Redis/database, and queue probe errors. Owner: lopezb.jl@gmail.com. Runbook: docs/production-operations-runbook.md#platform.',
    Namespace:namespace,MetricName:'WatchdogHeartbeat',Statistic:'Sum',Period:60,EvaluationPeriods:5,DatapointsToAlarm:5,
    Threshold:1,ComparisonOperator:'LessThanThreshold',TreatMissingData:'breaching',
    ActionsEnabled:{'Fn::If':['EnableHeartbeatActions',true,false]},
    AlarmActions:[{Ref:'CriticalTopicArn'}],OKActions:[{Ref:'CriticalTopicArn'}],
  }};
  return {AWSTemplateFormatVersion:'2010-09-09',Description:'DARCi staging critical signals; no Sentry or additional compute. Eight fixed-cardinality metrics and alarms.',
    Parameters:{CriticalTopicArn:{Type:'String',AllowedPattern:'arn:aws:sns:us-east-1:427057633951:darci-recovery-critical'},
      HeartbeatActionsEnabled:{Type:'String',Default:'false',AllowedValues:['true','false'],Description:'Enable only after deployed watchdog emits genuine heartbeats.'}},
    Conditions:{EnableHeartbeatActions:{'Fn::Equals':[{Ref:'HeartbeatActionsEnabled'},'true']}},Resources};
}
