import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),stripe:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({rpc:mocks.rpc})}));
vi.mock("../../src/config/stripe",()=>({getStripeClient:mocks.stripe,getStripeEnvironment:()=>"test",assertStripeObjectMatchesEnvironment:vi.fn(),getStripeWebhookSecret:vi.fn()}));
import {processStoredStripeWebhook} from "../../src/services/stripeWebhookService";
beforeEach(()=>vi.clearAllMocks());
describe("Stripe lease acquisition",()=>{
  it.each([null,{id:null,event_id:null,event_type:null,attempt_count:null}])("does not process a null composite claim: %j",async data=>{
    mocks.rpc.mockResolvedValue({data,error:null});
    expect(await processStoredStripeWebhook({storedEventId:"fixture",workerId:"duplicate"})).toEqual({claimed:false});
    expect(mocks.stripe).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("fails visibly if lease acquisition itself fails",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:"unavailable"}});
    await expect(processStoredStripeWebhook({storedEventId:"fixture",workerId:"worker"})).rejects.toThrow("claim failed");expect(mocks.stripe).not.toHaveBeenCalled();
  });
});
