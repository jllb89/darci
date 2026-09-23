import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import Stripe from 'stripe';
const mocks=vi.hoisted(()=>({from:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({from:mocks.from})}));
import {ingestStripeWebhook} from '../../src/services/stripeWebhookService';
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('APP_ENV','staging');vi.stubEnv('STRIPE_PROVIDER_ENVIRONMENT','test');vi.stubEnv('STRIPE_SECRET_KEY','sk_test_isolation_fixture');vi.stubEnv('STRIPE_WEBHOOK_SECRET','whsec_isolation_fixture');vi.stubEnv('STRIPE_PUBLISHABLE_KEY','pk_test_fixture');
});
afterEach(()=>vi.unstubAllEnvs());
describe('real Stripe signature and environment boundary',()=>{
 const event=(livemode:boolean)=>JSON.stringify({id:'evt_fixture',object:'event',type:'customer.subscription.updated',livemode,data:{object:{id:'sub_fixture'}}});
 const signature=(payload:string,secret='whsec_isolation_fixture')=>Stripe.webhooks.generateTestHeaderString({payload,secret});
 it('rejects an authentic opposite-mode event before inbox persistence',async()=>{
  const payload=event(true);await expect(ingestStripeWebhook({rawBody:Buffer.from(payload),signature:signature(payload)})).rejects.toThrow(/mismatch/);expect(mocks.from).not.toHaveBeenCalled();
 });
 it('rejects a different endpoint secret before inbox persistence',async()=>{
  const payload=event(false);await expect(ingestStripeWebhook({rawBody:Buffer.from(payload),signature:signature(payload,'whsec_other_endpoint')})).rejects.toThrow();expect(mocks.from).not.toHaveBeenCalled();
 });
 it('rejects edited raw bytes before inbox persistence',async()=>{
  const payload=event(false);await expect(ingestStripeWebhook({rawBody:Buffer.from(payload+' '),signature:signature(payload)})).rejects.toThrow();expect(mocks.from).not.toHaveBeenCalled();
 });
});
