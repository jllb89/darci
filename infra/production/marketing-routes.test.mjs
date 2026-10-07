import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildRuntime} from './runtime.mjs';
import {withMarketingRoutes} from './marketing-routes.mjs';
const cert = 'arn:aws:acm:us-east-1:427057633951:certificate/308a3dde-3fbb-4468-b743-6357bf0dffbd';
test('marketing exposes only read-only root/static files, preserves existing private routes and all configuration', () => {
  const before = buildRuntime(), after = withMarketingRoutes(before, cert);
  for (const [name, resource] of Object.entries(before.Resources)) assert.deepEqual(after.Resources[name], resource);
  assert.deepEqual(after.Parameters, before.Parameters);
  for (const [name, resource] of Object.entries(after.Resources)) {
    if (!name.startsWith('Marketing') || resource.Type !== 'AWS::ElasticLoadBalancingV2::ListenerRule') continue;
    const c = resource.Properties.Conditions;
    assert.deepEqual(c.find(x => x.Field === 'http-request-method').HttpRequestMethodConfig.Values, ['GET', 'HEAD']);
    assert(c.reduce((n, x) => n + Object.values(x).filter(v => typeof v === 'object').reduce((sum, v) => sum + v.Values.length, 0), 0) <= 5);
    if (resource.Properties.Actions[0].Type === 'forward') {
      const paths = c.find(x => x.Field === 'path-pattern').PathPatternConfig.Values;
      assert(paths.every(p => ['/', '/_next/static/*', '/images/*', '/icons/*', '/favicon.ico', '/footer/*'].includes(p)));
      assert.deepEqual(resource.Properties.Actions[0].TargetGroupArn, {Ref: 'webTarget'});
    }
  }
  assert.equal(after.Resources.MarketingAppRedirect.Properties.Actions[0].RedirectConfig.Host, 'app.illuminotary.com');
  assert.equal(after.Resources.MarketingCanonical.Properties.Actions[0].RedirectConfig.Host, 'illuminotary.com');
});
test('rejects unguarded baseline, duplicate routes, priority collisions and foreign certificate', () => {
  const open = buildRuntime(); open.Resources.apiRoute.Properties.Conditions = [];
  assert.throws(() => withMarketingRoutes(open, cert));
  assert.throws(() => withMarketingRoutes(withMarketingRoutes(buildRuntime(), cert), cert));
  const collision = buildRuntime(); collision.Resources.apiRoute.Properties.Priority = 231;
  assert.throws(() => withMarketingRoutes(collision, cert));
  assert.throws(() => withMarketingRoutes(buildRuntime(), cert.replace('427057633951', '000000000000')));
});
