import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withPublicVerificationRoutes} from './public-verification-routes.mjs';
const baseline=()=>({Resources:{Https:{Properties:{DefaultActions:[{FixedResponseConfig:{StatusCode:'403'}}]}},apiRoute:{Properties:{Conditions:[{Field:'source-ip'}]}},webRoute:{Properties:{Conditions:[{Field:'source-ip'}]}}}});
test('adds only host-scoped read-only verification and static assets; preserves every existing resource',()=>{
  const before=baseline(),after=withPublicVerificationRoutes(before);
  for(const [key,value] of Object.entries(before.Resources))assert.deepEqual(after.Resources[key],value);
  assert.equal(Object.keys(after.Resources).length,Object.keys(before.Resources).length+3);
  for(const name of ['PublicVerificationWeb','PublicVerificationApi','PublicVerificationAssets']){
    const c=after.Resources[name].Properties.Conditions;
    assert.deepEqual(c.find(x=>x.Field==='http-request-method').HttpRequestMethodConfig.Values,['GET','HEAD']);
    const paths=c.find(x=>x.Field==='path-pattern').PathPatternConfig.Values;
    assert(!paths.some(p=>p==='/app/*'||p==='/documents/*'||p==='/*'));
    assert(c.reduce((sum,item)=>sum+Object.values(item).filter(v=>typeof v==='object').reduce((n,v)=>n+v.Values.length,0),0)<=5);
  }
  assert.throws(()=>withPublicVerificationRoutes(after));
});
test('refuses a missing private gate',()=>{
  const input=baseline();input.Resources.apiRoute.Properties.Conditions=[];assert.throws(()=>withPublicVerificationRoutes(input));
});
