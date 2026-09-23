import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFoundation} from './foundation.mjs';
const template = buildFoundation(), resources = template.Resources;
test('private subnets use separate same-zone NATs without public task IP defaults', () => {
  for (const zone of ['A','B']) {
    assert.equal(resources[`Private${zone}`].Properties.MapPublicIpOnLaunch, false);
    assert.deepEqual(resources[`PrivateRoute${zone}`].Properties.NatGatewayId, {Ref: `Nat${zone}`});
    assert.deepEqual(resources[`Nat${zone}`].Properties.SubnetId, {Ref: `Public${zone}`});
  }
});
test('edge is closed and app/cache ingress is security-group scoped', () => {
  assert.deepEqual(resources.EdgeSecurity.Properties.SecurityGroupIngress, []);
  for (const name of ['AppSecurity','CacheSecurity']) {
    for (const rule of resources[name].Properties.SecurityGroupIngress) {
      assert(rule.SourceSecurityGroupId); assert(!rule.CidrIp);
    }
  }
});
test('release images are scanned, immutable and retained for rollback', () => {
  for (const service of ['api','worker','web','recovery']) {
    const repo = resources[`${service}Repository`];
    assert.equal(repo.Properties.ImageTagMutability, 'IMMUTABLE');
    assert.equal(repo.Properties.ImageScanningConfiguration.ScanOnPush, true);
    assert.equal(repo.DeletionPolicy, 'Retain');
    assert.equal(repo.UpdateReplacePolicy, 'Retain');
  }
});
test('foundation cannot start application tasks, live payments or change DNS', () => {
  assert(!Object.values(resources).some(r => ['AWS::ECS::Service','AWS::Route53::RecordSet','AWS::SecretsManager::Secret'].includes(r.Type)));
  assert(!JSON.stringify(template).includes('darci-staging'));
});
