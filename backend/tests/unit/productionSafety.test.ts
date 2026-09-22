import { describe,it,expect,vi,afterEach } from 'vitest';
const mocks=vi.hoisted(()=>({eval:vi.fn(),connect:vi.fn(),on:vi.fn()}));
vi.mock('ioredis',()=>({default:vi.fn(function(){return {...mocks,status:'ready'};})}));
vi.mock('../../src/utils/sentry',()=>({captureMessage:vi.fn()}));
import { abusePolicy,enforceAbuseLimits,safeRequestId,safeRequestPath } from '../../src/middleware/productionSafety';

afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
describe('production safety',()=>{
  it('redacts bearer paths and query credentials',()=>{
    expect(safeRequestPath('/invites/public/secret/claim?token=private')).toBe('/invites/public/[redacted]/claim');
    expect(safeRequestPath('/verify/ABC123?key=secret')).toBe('/verify/[idn]');
    expect(safeRequestId('bad\r\nheader')).not.toContain('bad');
  });
  it('covers sensitive routes without blocking provider callbacks',()=>{
    for(const p of ['/auth/otp/start','/invites/public/token/claim','/verify/id','/documents/id/sign','/billing/member/checkout','/notary/requests/id/session/advance']) expect(abusePolicy('POST',p)).not.toBeNull();
    expect(abusePolicy('POST','/webhooks/stripe')).toBeNull();
    expect(abusePolicy('GET','/documents/id')).toBeNull();
  });
  it.each([[1,undefined],[21,429],['outage',503]])('handles distributed limit result %s',async(result,status)=>{
    vi.stubEnv('APP_ENV','production');vi.stubEnv('REDIS_URL','redis://localhost');vi.stubEnv('ABUSE_RATE_KEY_SECRET','unit-test-only');
    if(result==='outage')mocks.eval.mockRejectedValue(new Error('redis://secret'));else mocks.eval.mockResolvedValue(result);
    const res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};const next=vi.fn();
    await enforceAbuseLimits({method:'POST',path:'/auth/otp/start',ip:'127.0.0.1',requestId:'req-1',socket:{}} as never,res as never,next);
    if(status)expect(res.status).toHaveBeenCalledWith(status);else expect(next).toHaveBeenCalledOnce();
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret');
    expect(mocks.eval.mock.calls[0]?.[2]).not.toContain('127.0.0.1');
  });
});
