import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({health:vi.fn(),query:vi.fn(),signal:vi.fn(),chains:[] as Array<Record<string,ReturnType<typeof vi.fn>>>}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({from:()=>{const q:Record<string,ReturnType<typeof vi.fn>>={};for(const key of ['select','in','lt','gte','or','limit'])q[key]=vi.fn(()=>q);q.abortSignal=vi.fn(()=>mocks.query());mocks.chains.push(q);return q;}})}));
vi.mock("../../src/services/operationalHealthService",()=>({checkOperationalReadiness:mocks.health}));
vi.mock("../../src/telemetry/criticalSignals",async importOriginal=>({...await importOriginal<typeof import('../../src/telemetry/criticalSignals')>(),emitCriticalSignal:mocks.signal}));
import { createOperationalWatchdogRunner, evaluateWatchdog, generationOverdueFilter, readWatchdogSnapshot } from "../../src/services/operationalWatchdogService";
const healthy = { ready: true, notificationOverdue: false, notificationFailed: false, stripeOverdue: false, generationOverdue: false };
beforeEach(()=>{vi.clearAllMocks();mocks.chains.length=0;mocks.health.mockResolvedValue({ready:true});mocks.query.mockResolvedValue({data:[],error:null});});
describe("operational watchdog thresholds", () => {
  it("does not alarm on healthy queues", () => expect(evaluateWatchdog(healthy)).toEqual([]));
  it.each([['notificationOverdue','notification'],['notificationFailed','notification'],['stripeOverdue','billing'],['generationOverdue','document']] as const)("detects %s", (key,category) => {
    expect(evaluateWatchdog({ ...healthy, [key]: true })).toEqual([category]);
  });
  it("detects dependency readiness failure and coalesces delivery alarms", () => {
    expect(evaluateWatchdog({ ...healthy, ready:false,notificationOverdue:true,notificationFailed:true })).toEqual(["platform","notification"]);
  });
  it("bounds every queue query to one ID and a five-second abort signal",async()=>{
    expect(await readWatchdogSnapshot()).toEqual(healthy);
    expect(mocks.chains).toHaveLength(4);
    for(const q of mocks.chains){expect(q.select).toHaveBeenCalledWith('id');expect(q.limit).toHaveBeenCalledWith(1);expect(q.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));}
  });
  it("does not emit a success heartbeat when a queue cannot be read",async()=>{
    mocks.query.mockResolvedValue({data:null,error:{message:'PRIVATE DATABASE DETAIL'}});
    const log=vi.spyOn(console,'log').mockImplementation(()=>{});
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),run=createOperationalWatchdogRunner();
    try{await run();expect(mocks.signal).not.toHaveBeenCalled();await run();expect(mocks.signal).toHaveBeenCalledWith('platform',{diagnostic:{reason:'queue_probe_failed',probe:'notificationOverdue',consecutive:2}});expect(log).not.toHaveBeenCalled();expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE DATABASE DETAIL');}finally{log.mockRestore();warn.mockRestore();}
  });
  it("ages generation retries by started_at, retaining a fallback for missing lifecycle timestamps",()=>{
    const filter=generationOverdueFilter('2026-09-22T00:00:00.000Z');
    expect(filter).toContain('status.eq.queued,created_at.lt.');
    expect(filter).toContain('status.eq.rendering,started_at.lt.');
    expect(filter).toContain('status.eq.rendering,started_at.is.null,created_at.lt.');
    expect(filter).not.toContain('updated_at');
  });
  it("emits a heartbeat for a completed probe while separately alarming unhealthy dependencies",async()=>{
    mocks.health.mockResolvedValue({ready:false,checks:{database:false,redis:true}});const log=vi.spyOn(console,'log').mockImplementation(()=>{}),warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),run=createOperationalWatchdogRunner();
    try{await run();expect(mocks.signal).not.toHaveBeenCalled();await run();expect(mocks.signal).toHaveBeenCalledWith('platform',{diagnostic:{reason:'dependency_unready',checks:['database'],consecutive:2}});expect(JSON.parse(log.mock.calls[0]![0])).toMatchObject({kind:'darci_watchdog_heartbeat'});}finally{log.mockRestore();warn.mockRestore();}
  });
  it('resets transient failure counting after a healthy probe',async()=>{
    const log=vi.spyOn(console,'log').mockImplementation(()=>{}),warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),run=createOperationalWatchdogRunner();
    try{mocks.health.mockResolvedValueOnce({ready:false});await run();await run();mocks.health.mockResolvedValueOnce({ready:false});await run();expect(mocks.signal).not.toHaveBeenCalled();expect(warn).toHaveBeenCalledTimes(2);}finally{log.mockRestore();warn.mockRestore();}
  });
  it('does not debounce durable notification failures while a dependency has one transient failure',async()=>{
    const log=vi.spyOn(console,'log').mockImplementation(()=>{}),warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),run=createOperationalWatchdogRunner();
    try{mocks.health.mockResolvedValueOnce({ready:false});mocks.query.mockResolvedValueOnce({data:[{id:'fixture'}],error:null});await run();expect(mocks.signal).toHaveBeenCalledExactlyOnceWith('notification');}finally{log.mockRestore();warn.mockRestore();}
  });
});
