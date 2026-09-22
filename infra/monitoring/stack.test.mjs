import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMonitoringTemplate,categories} from './stack.mjs';
const t=buildMonitoringTemplate(),resources=Object.values(t.Resources);
test('bounded cost/cardinality and no added infrastructure privileges',()=>{
  assert.equal(resources.filter(r=>r.Type==='AWS::CloudWatch::Alarm').length,8);
  assert(resources.every(r=>['AWS::CloudWatch::Alarm','AWS::Logs::MetricFilter'].includes(r.Type)));
  const metrics=resources.filter(r=>r.Type==='AWS::Logs::MetricFilter').flatMap(r=>r.Properties.MetricTransformations);
  assert.equal(new Set(metrics.map(m=>m.MetricName)).size,8);
  assert(metrics.every(m=>!m.Dimensions));
});
test('sole approved route and safely gated missing-heartbeat detector',()=>{
  for(const r of resources.filter(r=>r.Type==='AWS::CloudWatch::Alarm')) assert.deepEqual(r.Properties.AlarmActions,[{Ref:'CriticalTopicArn'}]);
  assert.equal(t.Parameters.HeartbeatActionsEnabled.Default,'false');
  assert.equal(t.Resources.HeartbeatAlarm.Properties.TreatMissingData,'breaching');
  for(const category of categories){const n=category[0].toUpperCase()+category.slice(1);assert.equal(t.Resources[n+'Alarm'].Properties.TreatMissingData,'notBreaching');}
});
