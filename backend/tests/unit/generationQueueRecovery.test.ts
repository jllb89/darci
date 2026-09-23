import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), getJob: vi.fn(), add: vi.fn(), chain: {} as Record<string, ReturnType<typeof vi.fn>> }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => mocks.chain }) }));
vi.mock("../../src/worker/queues", () => ({ generationQueue: { getJob: mocks.getJob, add: mocks.add } }));
import { reconcileQueuedGenerationRuns } from "../../src/services/generationQueueRecoveryService";
import { isRecoveryQuarantined } from "../../src/worker/recoveryQuarantine";
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["select", "eq", "order", "limit"]) mocks.chain[key] = vi.fn(() => mocks.chain);
  mocks.chain.abortSignal = mocks.query;
  mocks.query.mockResolvedValue({ data: [{ id: "run-1" }, { id: "run-2" }], error: null });
  mocks.getJob.mockResolvedValue(null); mocks.add.mockResolvedValue({});
});
describe("durable generation delivery recovery", () => {
  it("reconstructs stable IDs only for queued runs without updating evidence", async () => {
    expect(await reconcileQueuedGenerationRuns()).toEqual({ scanned: 2, enqueued: 2 });
    expect(mocks.chain.eq).toHaveBeenCalledWith("status", "queued");
    expect(mocks.add).toHaveBeenCalledWith("render-generation-run", { runId: "run-1" }, { jobId: "run-1" });
    expect(mocks.query).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("does not restart any existing active, completed or failed delivery", async () => {
    mocks.getJob.mockResolvedValue({ id: "exists" });
    expect(await reconcileQueuedGenerationRuns()).toEqual({ scanned: 2, enqueued: 0 });
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("fails closed if durable state cannot be read", async () => {
    mocks.query.mockResolvedValue({ data: null, error: { message: "private-provider-data" } });
    await expect(reconcileQueuedGenerationRuns()).rejects.toThrow("could not read durable queued runs");
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("bounds work and propagates queue failure for watchdog/operator recovery", async () => {
    mocks.add.mockRejectedValue(new Error("redis unavailable"));
    await expect(reconcileQueuedGenerationRuns(5000)).rejects.toThrow("redis unavailable");
    expect(mocks.chain.limit).toHaveBeenCalledWith(100);
  });
});
describe("recovery quarantine cannot be accidentally bypassed by enabling a runner", () => {
  it.each([{ APP_ENV: "recovery" }, { RECOVERY_QUARANTINE: "true" }, { RECOVERY_QUARANTINE: "1" }, { APP_ENV: "recovery", RECOVERY_QUARANTINE: "false", STRIPE_WEBHOOK_RUNNER_ENABLED: "true" }])("quarantines %j", env => {
    expect(isRecoveryQuarantined(env)).toBe(true);
  });
  it("does not alter normal staging or production execution", () => {
    expect(isRecoveryQuarantined({ APP_ENV: "staging" })).toBe(false);
    expect(isRecoveryQuarantined({ APP_ENV: "production" })).toBe(false);
  });
});
