import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProductionMonitoring} from './monitoring.mjs';
test('production detectors do not read beta logs or alert before app deployment', () => {
  const t = buildProductionMonitoring();
  assert(!JSON.stringify(t).includes('staging'));
  const alarms = Object.values(t.Resources).filter(r => r.Type === 'AWS::CloudWatch::Alarm');
  assert.equal(alarms.length, 8);
  assert(alarms.every(r => r.Properties.ActionsEnabled === false));
});
test('budget is production-tagged, notification-only and reserves $35 for Supabase', () => {
  const p = buildProductionMonitoring().Resources.ProductionBudget.Properties;
  assert.equal(p.Budget.BudgetLimit.Amount + 35, 350);
  assert.deepEqual(p.Budget.CostFilters.TagKeyValue, ['user:Environment$production']);
  assert.equal(p.NotificationsWithSubscribers.length, 2);
  assert(p.NotificationsWithSubscribers.every(n => n.Subscribers[0].Address === 'lopezb.jl@gmail.com'));
});
test('acceptance explicitly enables existing production alarms without new email subscriptions',()=>{
  const t=buildProductionMonitoring({enableActions:true});
  const alarms=Object.values(t.Resources).filter(r=>r.Type==='AWS::CloudWatch::Alarm');
  assert.equal(alarms.length,8); assert(alarms.every(r=>r.Properties.ActionsEnabled===true));
  assert(!Object.values(t.Resources).some(r=>r.Type==='AWS::SNS::Subscription'));
});
