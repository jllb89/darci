import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildRuntime} from './runtime.mjs';
import {withAssociationRoutes} from './association-routes.mjs';
test('both public association files are identical and include billing return links',()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../../apps/web/public/'+p,import.meta.url),'utf8'));
 const root=read('apple-app-site-association');
 assert.deepEqual(read('.well-known/apple-app-site-association'),root);
 assert.deepEqual(root.applinks.details[0].appIDs,['38K3YA2857.com.illuminote.darci']);
 for(const result of ['success','canceled']) assert(root.applinks.details[0].components.some(c=>c['/']==='/app'&&c['?']?.billing===result));
});
test('AASA rollout adds only an exact host/path/GET rule; preserves services, private routes and all flags',()=>{
 const before=buildRuntime(),after=withAssociationRoutes(before),rule=after.Resources.AppAssociationRoute;
 assert.deepEqual(rule.Properties.Conditions,[
 {Field:'host-header',HostHeaderConfig:{Values:['app.illuminotary.com']}},
 {Field:'path-pattern',PathPatternConfig:{Values:['/.well-known/apple-app-site-association','/apple-app-site-association']}},
 {Field:'http-request-method',HttpRequestMethodConfig:{Values:['GET']}},
 ]);
 delete after.Resources.AppAssociationRoute;assert.deepEqual(after,before);
});
test('AASA setup rejects public baseline, priority collision or repeat activation',()=>{
 const base=buildRuntime();base.Resources.webRoute.Properties.Conditions=[];assert.throws(()=>withAssociationRoutes(base));
 const collision=buildRuntime();collision.Resources.apiRoute.Properties.Priority=8;assert.throws(()=>withAssociationRoutes(collision));
 assert.throws(()=>withAssociationRoutes(withAssociationRoutes(buildRuntime())));
});
