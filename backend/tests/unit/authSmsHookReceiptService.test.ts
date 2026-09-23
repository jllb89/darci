import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({row:null as any,failClaim:false,failSave:false}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({from:()=>({
  insert:async(row:any)=>{
    if(state.failClaim)return {error:{code:"network"}};
    if(state.row)return {error:{code:"23505"}};
    state.row={...row};return {error:null};
  },
  select:()=>({eq:()=>({single:async()=>({data:state.row,error:null})})}),
  update:(patch:any)=>({eq:async()=>{
    if(state.failSave)return {error:{code:"network"}};
    Object.assign(state.row,patch);return {error:null};
  }}),
})})}));
import {withAuthSmsHookReceipt} from "../../src/services/authSmsHookReceiptService";
const fixture={hookId:"signed-id",rawBody:'{"sms":{"otp":"fixture-secret"}}',signingSecret:"synthetic-signing-key"};
describe("production SMS durable handoff receipts",()=>{
  beforeEach(()=>{state.row=null;state.failClaim=false;state.failSave=false;vi.stubEnv("APP_ENV","production");});
  afterEach(()=>vi.unstubAllEnvs());
  it("sends once and acknowledges a completed signed replay without resending",async()=>{
    const send=vi.fn(async()=>({messageId:"message-one"}));
    expect(await withAuthSmsHookReceipt({...fixture,send})).toEqual({messageId:"message-one",replayed:false});
    expect(await withAuthSmsHookReceipt({...fixture,send})).toEqual({messageId:"message-one",replayed:true});
    expect(send).toHaveBeenCalledTimes(1);expect(JSON.stringify(state.row)).not.toContain("fixture-secret");
  });
  it("blocks concurrent processing and payload substitution",async()=>{
    let release!:()=>void;
    const send=vi.fn(async()=>{await new Promise<void>(r=>release=r);return {messageId:"one"};});
    const first=withAuthSmsHookReceipt({...fixture,send});await vi.waitFor(()=>expect(send).toHaveBeenCalledOnce());
    await expect(withAuthSmsHookReceipt({...fixture,send})).rejects.toMatchObject({statusCode:503});
    release();await first;
    await expect(withAuthSmsHookReceipt({...fixture,rawBody:"changed",send})).rejects.toMatchObject({statusCode:503});
    expect(send).toHaveBeenCalledOnce();
  });
  it("fails closed before send if the receipt store is unavailable",async()=>{
    state.failClaim=true;const send=vi.fn();
    await expect(withAuthSmsHookReceipt({...fixture,send})).rejects.toMatchObject({statusCode:503});expect(send).not.toHaveBeenCalled();
  });
  it.each(["provider","receipt"])("never repeats an uncertain %s operation",async failure=>{
    const send=vi.fn(async()=>{if(failure==="provider")throw Error("timeout");state.failSave=true;return {messageId:"accepted-but-not-recorded"};});
    await expect(withAuthSmsHookReceipt({...fixture,send})).rejects.toThrow();
    state.failSave=false;
    await expect(withAuthSmsHookReceipt({...fixture,send})).rejects.toMatchObject({statusCode:503});expect(send).toHaveBeenCalledOnce();
  });
  it("does not require the unapproved staging migration",async()=>{
    vi.stubEnv("APP_ENV","staging");state.failClaim=true;const send=vi.fn(async()=>({messageId:"stage"}));
    expect((await withAuthSmsHookReceipt({...fixture,send})).messageId).toBe("stage");expect(state.row).toBeNull();
  });
});
