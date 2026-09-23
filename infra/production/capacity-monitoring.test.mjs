import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capacityAlarms} from './capacity-monitoring.mjs';
test('capacity alarms are production-only, sustained, and do not spam initial OK messages', () => {
  const resources = capacityAlarms({apiTarget: 'targetgroup/darci-production-api/test', webTarget: 'targetgroup/darci-production-web/test'});
  assert.equal(Object.keys(resources).length, 10);
  for (const {Type, Properties: p} of Object.values(resources)) {
    assert.equal(Type, 'AWS::CloudWatch::Alarm');
    assert(p.AlarmName.startsWith('darci-recovery-production-capacity-'));
    assert.equal(p.EvaluationPeriods, 5); assert.equal(p.DatapointsToAlarm, 3);
    assert(!p.OKActions); assert(!p.InsufficientDataActions);
    assert.equal(p.AlarmActions[0], 'arn:aws:sns:us-east-1:427057633951:darci-recovery-critical');
    assert(!JSON.stringify(p).includes('staging'));
  }
});
