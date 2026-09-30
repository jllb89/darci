import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withTesterAccess,withAdditionalTesterAccess} from './tester-access.mjs';
const ips = ['146.75.129.125', '23.245.227.237', '146.75.154.172', '67.170.239.201', '67.170.239.201'];
test('additional grants preserve existing access and skip already allowed addresses',()=>{
  const base=withTesterAccess(buildRuntime(),ips);
  const addresses=['157.131.202.3','185.98.169.47','146.75.154.172'];
  const next=withAdditionalTesterAccess(base,addresses);
  const added=Object.keys(next.Resources).filter(id=>!base.Resources[id]);
  assert.equal(added.length,4);
  assert.deepEqual(withAdditionalTesterAccess(next,addresses),next);
  const priorities=added.map(id=>next.Resources[id].Properties.Priority);
  assert.equal(new Set(priorities).size,4);
  for(const id of added){assert.equal(next.Resources[id].Properties.Conditions.find(c=>c.Field==='source-ip').SourceIpConfig.Values.length,1);delete next.Resources[id];}
  assert.deepEqual(next,base);
  for(const invalid of [[],['0.0.0.0/0'],['::1'],['bad']])assert.throws(()=>withAdditionalTesterAccess(base,invalid));
});
test('adds only exact tester HTTPS rules and preserves all existing resources/configuration', () => {
  const before = buildRuntime(), after = withTesterAccess(before, ips);
  for (const service of ['api', 'web']) {
    const values = [];
    for (const group of [1, 2]) {
      const id = `${service}TesterRoute${group}`, rule = after.Resources[id];
      assert.deepEqual(rule.Properties.ListenerArn, {Ref: 'Https'});
      assert.deepEqual(rule.Properties.Actions, before.Resources[`${service}Route`].Properties.Actions);
      assert.deepEqual(rule.Properties.Conditions[0], before.Resources[`${service}Route`].Properties.Conditions[0]);
      values.push(...rule.Properties.Conditions.find(c => c.Field === 'source-ip').SourceIpConfig.Values);
      delete after.Resources[id];
    }
    assert.deepEqual(values, [...new Set(ips)].sort().map(ip => `${ip}/32`));
  }
  assert.deepEqual(after, before);
});
test('idempotent but rejects changed grants, broad ranges and rule collisions', () => {
  const base = buildRuntime(), once = withTesterAccess(base, ips);
  assert.deepEqual(withTesterAccess(once, ips), once);
  for (const invalid of [[], ['0.0.0.0/0'], ['bad'], ['256.0.0.1']]) assert.throws(() => withTesterAccess(base, invalid));
  assert.throws(() => withTesterAccess(once, ['1.2.3.4']));
  base.Resources.apiRoute.Properties.Priority = 30;
  assert.throws(() => withTesterAccess(base, ips));
});
