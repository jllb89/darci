import {pathToFileURL} from 'node:url';
import {buildMonitoringTemplate} from '../monitoring/stack.mjs';
export function buildProductionMonitoring({enableActions=false}={}) {
  const t = JSON.parse(JSON.stringify(buildMonitoringTemplate()).replaceAll('staging', 'production'));
  for (const r of Object.values(t.Resources)) if (r.Type === 'AWS::CloudWatch::Alarm') r.Properties.ActionsEnabled = enableActions;
  // Register detectors now, but never alert for app processes not yet deployed.
  t.Description = 'Production critical detectors, actions opt-in after actual application acceptance; production-tagged AWS cost notifications.';
  t.Resources.ProductionBudget = {Type: 'AWS::Budgets::Budget', Properties: {
    Budget: {BudgetName: 'darci-production-monthly-planning', BudgetType: 'COST', TimeUnit: 'MONTHLY',
      BudgetLimit: {Amount: 315, Unit: 'USD'}, CostFilters: {TagKeyValue: ['user:Environment$production']}},
    NotificationsWithSubscribers: [
      {Notification: {NotificationType: 'ACTUAL', ComparisonOperator: 'GREATER_THAN', Threshold: 80, ThresholdType: 'PERCENTAGE'},
        Subscribers: [{SubscriptionType: 'EMAIL', Address: 'lopezb.jl@gmail.com'}]},
      {Notification: {NotificationType: 'FORECASTED', ComparisonOperator: 'GREATER_THAN', Threshold: 100, ThresholdType: 'PERCENTAGE'},
        Subscribers: [{SubscriptionType: 'EMAIL', Address: 'lopezb.jl@gmail.com'}]},
    ],
  }};
  return t;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(buildProductionMonitoring({enableActions:process.argv.includes('--enable-actions')}), null, 2));
