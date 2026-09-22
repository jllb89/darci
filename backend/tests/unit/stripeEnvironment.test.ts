import {describe,it,expect,afterEach,vi} from 'vitest';
import {getStripeEnvironment,getStripeClient,assertStripeObjectMatchesEnvironment} from '../../src/config/stripe';
afterEach(()=>vi.unstubAllEnvs());
describe('Stripe environment isolation',()=>{
  it('blocks test entitlements in production',()=>{
    vi.stubEnv('APP_ENV','production');vi.stubEnv('STRIPE_PROVIDER_ENVIRONMENT','test');
    expect(()=>getStripeEnvironment()).toThrow('Production');
  });
  it('blocks live keys outside production',()=>{
    vi.stubEnv('APP_ENV','staging');vi.stubEnv('STRIPE_PROVIDER_ENVIRONMENT','live');
    expect(()=>getStripeEnvironment()).toThrow('restricted');
  });
  it('does not activate live mode merely because a live key exists',()=>{
    vi.stubEnv('APP_ENV','production');vi.stubEnv('STRIPE_PROVIDER_ENVIRONMENT','live');
    vi.stubEnv('STRIPE_SECRET_KEY','sk_live_fixture');vi.stubEnv('STRIPE_LIVE_MODE_ENABLED','false');
    expect(()=>getStripeClient()).toThrow('disabled');
  });
  it.each(['test','live'] as const)('rejects opposite-mode objects and keys in %s',mode=>{
    vi.stubEnv('APP_ENV',mode==='live'?'production':'staging');vi.stubEnv('STRIPE_PROVIDER_ENVIRONMENT',mode);
    vi.stubEnv('STRIPE_SECRET_KEY',mode==='live'?'sk_test_fixture':'sk_live_fixture');
    expect(()=>getStripeClient()).toThrow('match');
    expect(()=>assertStripeObjectMatchesEnvironment({livemode:mode!=='live'},'object')).toThrow('mismatch');
    expect(()=>assertStripeObjectMatchesEnvironment({livemode:mode==='live'},'object')).not.toThrow();
  });
});
