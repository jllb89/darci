import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prepareCatalog,verifyPrice,accountId} from './stripe-catalog.mjs';
import {MEMBER_PRICING_V2} from '../../backend/src/config/memberPricing.ts';
test('catalog preparation is idempotent and has no payment or activation APIs', async()=>{
  const products=[],prices=[],portals=[];
  const stripe={accounts:{retrieve:async()=>({id:accountId})},products:{list:async()=>({data:products,has_more:false}),create:async p=>{const r={...p,id:'prod_fixture',livemode:true};products.push(r);return r;}},
    prices:{list:async p=>({data:prices.filter(r=>p.lookup_keys.includes(r.lookup_key)),has_more:false}),create:async p=>{const r={...p,id:'price_'+prices.length,type:'recurring',livemode:true};prices.push(r);return r;}},
    billingPortal:{configurations:{list:async()=>({data:portals,has_more:false}),create:async p=>{const r={...p,id:'bpc_fixture',active:true,livemode:true};portals.push(r);return r;}}}};
  const first=await prepareCatalog(stripe),second=await prepareCatalog(stripe);
  assert.equal(products.length,1);assert.equal(prices.length,6);assert.equal(portals.length,1);assert.equal(first.product.id,second.product.id);
  assert.deepEqual(prices.map(p=>p.unit_amount),[999,1999,5999,9900,19900,59900]);
  assert(prices.every(p=>p.metadata.darci_allowance_period==='month'));
  const plan=MEMBER_PRICING_V2[0];
  for(const changed of [{livemode:false},{unit_amount:1},{tax_behavior:'inclusive'},{active:false},{product:'unrelated'}])
    assert.throws(()=>verifyPrice({...prices[0],...changed},plan,products[0].id));
  stripe.accounts.retrieve=async()=>({id:'wrong_account'});await assert.rejects(()=>prepareCatalog(stripe));
});
