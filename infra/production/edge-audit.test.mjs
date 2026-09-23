import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildEdgeAudit} from './edge-audit.mjs';
test('WAF attaches only to production and never changes application allowlists', () => {
  const t = buildEdgeAudit();
  assert(t.Parameters.ProductionAlbArn.AllowedPattern.includes('app/darci-production/'));
  assert(!Object.values(t.Resources).some(r => /Listener|SecurityGroup|ECS/.test(r.Type)));
  const rules = t.Resources.WebAcl.Properties.Rules;
  assert.equal(rules[1].Statement.RateBasedStatement.AggregateKeyType, 'IP');
  assert.equal(rules[1].Action.Block.CustomResponse.ResponseCode, 429);
  assert.deepEqual(rules[2].OverrideAction, {Count: {}});
  assert(rules.every(r => !r.VisibilityConfig.SampledRequestsEnabled));
  assert(rules[0].Statement.OrStatement.Statements.some(s => s.ByteMatchStatement.SearchString === 'TRACK'));
  assert.equal(Object.values(t.Resources).filter(r => r.Type === 'AWS::CloudWatch::Alarm').length, 10);
  assert.deepEqual(t.Resources.apiHealthyTargets.Properties.Dimensions[1].Value, {Ref: 'ApiTargetGroupFullName'});
});
test('audit retains private encrypted versioned logs with integrity validation and no PDF data events', () => {
  const r = buildEdgeAudit().Resources;
  assert.equal(r.AuditBucket.DeletionPolicy, 'Retain');
  assert.equal(r.AuditBucket.Properties.VersioningConfiguration.Status, 'Enabled');
  assert(Object.values(r.AuditBucket.Properties.PublicAccessBlockConfiguration).every(Boolean));
  assert.equal(r.Trail.Properties.EnableLogFileValidation, true);
  assert.equal(r.Trail.Properties.IsMultiRegionTrail, true);
  assert.equal(r.Trail.Properties.IsLogging, true);
  assert(!r.Trail.Properties.EventSelectors[0].DataResources);
  assert(!r.AuditBucket.Properties.LifecycleConfiguration);
  for (const statement of r.AuditPolicy.Properties.PolicyDocument.Statement.filter(s => s.Effect === 'Allow')) {
    assert(statement.Condition.StringEquals['aws:SourceArn'].endsWith('/darci-management-audit'));
  }
});
