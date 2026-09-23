import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildProductionCache} from './cache.mjs';
const t = buildProductionCache(), r = t.Resources;
test('production cache requires app authentication with a production-only secret reference', () => {
  assert.equal(r.AppUser.Properties.NoPasswordRequired, false);
  assert(r.AppUser.Properties.Passwords[0]['Fn::Sub'].includes('resolve:secretsmanager:'));
  const allowed = new RegExp(`^${t.Parameters.ProductionAppSecretArn.AllowedPattern}$`);
  assert(!allowed.test('arn:aws:secretsmanager:us-east-1:427057633951:secret:/darci/staging/app-abcdef'));
  assert.deepEqual(r.Cache.Properties.UserGroupId, {Ref: 'AppUsers'});
});
test('production cache is isolated, usage-bounded and retained on stack removal', () => {
  assert.deepEqual(r.Cache.Properties.SubnetIds, {Ref: 'ProductionPrivateSubnets'});
  assert.equal(r.Cache.Properties.CacheUsageLimits.DataStorage.Maximum, 1);
  assert.equal(r.Cache.Properties.CacheUsageLimits.ECPUPerSecond.Maximum, 1000);
  assert.equal(r.Cache.DeletionPolicy, 'Retain');
  assert(r.AppUser.Properties.AccessString.includes('-flushall -flushdb'));
});
