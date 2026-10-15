import {beforeEach, describe, expect, it, vi} from 'vitest';
const mocks = vi.hoisted(() => ({rpc: vi.fn(), from: vi.fn(), event: vi.fn(), subscription: vi.fn(), release: vi.fn()}));
vi.mock('@supabase/supabase-js', () => ({createClient: () => ({rpc: mocks.rpc, from: mocks.from})}));
vi.mock('../../src/services/billingPolicyService', () => ({releaseMemberBillingHeldDocuments: mocks.release}));
vi.mock('../../src/config/stripe', () => ({
  getStripeEnvironment: () => 'test', getStripeWebhookSecret: vi.fn(),
  assertStripeObjectMatchesEnvironment: (object: {livemode: boolean}) => {if (object.livemode !== false) throw Error('environment mismatch');},
  getStripeClient: () => ({events: {retrieve: mocks.event}, subscriptions: {retrieve: mocks.subscription}}),
}));
import {processStoredStripeWebhook} from '../../src/services/stripeWebhookService';

describe('shared Stripe account webhook scope', () => {
  let mapped: Record<string, unknown[]>;
  let lookupError: object | null;
  const run = () => processStoredStripeWebhook({storedEventId: 'inbox', workerId: 'fixture'});
  const subscription = () => ({
    id: 'sub_other', livemode: false, metadata: {}, customer: 'cus_other', items: {data: [{price: {id: 'price_other', livemode: false, metadata: {}}}]},
  });
  beforeEach(() => {
    vi.resetAllMocks(); mapped = {}; lookupError = null;
    mocks.rpc.mockImplementation(async (name) => ({data: name === 'claim_stripe_webhook_event' ? {id: 'inbox', event_id: 'evt_fixture', attempt_count: 1} : {}, error: null}));
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, any> = {then: (resolve: (value: unknown) => unknown) => Promise.resolve({data: mapped[table] ?? [], error: lookupError}).then(resolve)};
      for (const key of ['select', 'eq', 'in', 'limit', 'update']) q[key] = vi.fn(() => q);
      return q;
    });
    mocks.subscription.mockResolvedValue(subscription());
    mocks.event.mockResolvedValue({id: 'evt_fixture', livemode: false, type: 'customer.subscription.updated', data: {object: subscription()}});
  });
  it.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed', 'checkout.session.completed'])(
    'ignores unmapped unrelated %s without fulfillment or retries', async type => {
      const object = type.startsWith('invoice.') ? {parent: {subscription_details: {subscription: 'sub_other'}}}
        : type.startsWith('checkout.') ? {id: 'cs_other', subscription: 'sub_other', metadata: {}} : subscription();
      mocks.event.mockResolvedValue({id: 'evt_fixture', livemode: false, type, data: {object}});
      expect(await run()).toEqual({claimed: true, outcome: 'ignored'});
      expect(mocks.rpc).toHaveBeenCalledWith('resolve_stripe_webhook_event', expect.objectContaining({p_status: 'ignored'}));
      expect(mocks.rpc).not.toHaveBeenCalledWith('apply_stripe_member_subscription_snapshot', expect.anything());
      expect(mocks.release).not.toHaveBeenCalled();
    },
  );
  it.each(['billing_subscriptions', 'billing_provider_price_mappings'])(
    'does not silently ignore missing metadata on locally mapped %s', async table => {
      mapped[table] = [{id: 'owned'}];
      await expect(run()).rejects.toThrow('outside the configured DARCi member allowlist');
      expect(mocks.rpc).toHaveBeenCalledWith('resolve_stripe_webhook_event', expect.objectContaining({p_status: 'failed'}));
    },
  );
  it.each(['subscription', 'price', 'event', 'invoice', 'checkout', 'checkout_mapping'])(
    'preserves an actionable failure for a DARCi reference on %s', async source => {
      const sub: any = subscription();
      if (source === 'subscription') sub.metadata = {darci_environment: 'test'};
      if (source === 'price') sub.items.data[0].price.metadata = {darci_product_code: 'member_membership'};
      mocks.subscription.mockResolvedValue(sub);
      let type = 'customer.subscription.updated', object: any = subscription();
      if (source === 'event') object.metadata = {darci_environment: 'test'};
      if (source === 'invoice') {type = 'invoice.paid'; object = {parent: {subscription_details: {subscription: sub.id, metadata: {darci_environment: 'test'}}}};}
      if (source.startsWith('checkout')) {
        type = 'checkout.session.completed'; object = {id: 'cs_darci', subscription: sub.id, metadata: source === 'checkout' ? {darci_order_id: 'order'} : {}};
        if (source === 'checkout_mapping') mapped.billing_orders = [{id: 'order'}];
      }
      mocks.event.mockResolvedValue({id: 'evt_fixture', livemode: false, type, data: {object}});
      await expect(run()).rejects.toThrow('outside the configured DARCi member allowlist');
      expect(mocks.rpc).toHaveBeenCalledWith('resolve_stripe_webhook_event', expect.objectContaining({p_status: 'failed'}));
    },
  );
  it('fails closed when scope lookup is unavailable', async () => {
    lookupError = {message: 'private provider details'};
    await expect(run()).rejects.toThrow('scope lookup failed');
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_stripe_webhook_event', expect.objectContaining({p_status: 'failed'}));
  });
  it('preserves environment isolation even for unrelated subscriptions', async () => {
    mocks.subscription.mockResolvedValue({...subscription(), livemode: true});
    await expect(run()).rejects.toThrow('environment mismatch');
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_stripe_webhook_event', expect.objectContaining({p_status: 'failed'}));
  });
  it.each(['checkout.session.completed', 'checkout.session.expired'])('ignores unrelated non-subscription %s', async type => {
    mocks.event.mockResolvedValue({id: 'evt_fixture', livemode: false, type, data: {object: {id: 'cs_other', subscription: null, metadata: {}}}});
    expect(await run()).toEqual({claimed: true, outcome: 'ignored'});
    expect(mocks.subscription).not.toHaveBeenCalled();
  });
  it('does not ignore a DARCi Checkout missing its subscription', async () => {
    mocks.event.mockResolvedValue({id: 'evt_fixture', livemode: false, type: 'checkout.session.completed', data: {object: {id: 'cs_owned', subscription: null, metadata: {darci_order_id: 'order'}}}});
    await expect(run()).rejects.toThrow('has no Subscription');
  });
});
