import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import Redis from "ioredis";
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ready: vi.fn(), send: vi.fn(), handoff: vi.fn() }));
vi.mock("../../src/middleware/productionSafety", async (original) => ({ ...await original<object>(), readySafetyRedis: mocks.ready }));
vi.mock("../../src/services/supabaseAuthSmsHookService", () => ({ sendSupabaseAuthSms: mocks.send }));
vi.mock("../../src/telemetry/smsTelemetry", async (original) => ({ ...await original<object>(), logSmsHandoff: mocks.handoff }));
import { phoneLinkService } from "../../src/services/phoneLinkService";

// Exercise the actual Lua against a private, disposable Unix-socket Redis.
// Never connect to an environment/database supplied by the caller.
describe("phone link distributed proof store", () => {
  let redis: Redis;
  let server: ChildProcess;
  let directory: string;
  const phone = "+12025550147";
  beforeAll(async () => {
    directory = await mkdtemp("/tmp/darci-phone-link-");
    const socket = `${directory}/redis.sock`;
    server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--save", "", "--appendonly", "no"], { stdio: ["ignore", "pipe", "pipe"] });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Disposable Redis did not start (install redis-server)")), 4000);
      server.once("error", (error) => { clearTimeout(timeout); reject(error); });
      server.stdout?.on("data", (chunk) => { if (String(chunk).toLowerCase().includes("ready to accept connections")) { clearTimeout(timeout); resolve(); } });
    });
    redis = new Redis(socket, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redis.connect();
  });
  beforeEach(async () => {
    await redis.flushdb(); // This process owns this isolated, non-networked instance.
    vi.clearAllMocks();
    vi.stubEnv("APP_ENV", "phone-link-unit");
    vi.stubEnv("ABUSE_RATE_KEY_SECRET", "synthetic-unit-only");
    vi.stubEnv("REDIS_URL", "unused-by-private-test-store");
    mocks.ready.mockResolvedValue(redis);
    mocks.send.mockResolvedValue({ messageId: "synthetic-message" });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    if (redis) await redis.quit();
    if (server?.exitCode === null) { const stopped = once(server, "exit"); server.kill("SIGTERM"); await stopped; }
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const issueProof = async () => {
    await phoneLinkService.requestSms(phone);
    const otp = mocks.send.mock.calls.at(-1)![0].otp as string;
    return (await phoneLinkService.verifySms(phone, otp))!;
  };
  const keys = (kind: string) => redis.keys(`darci:phone-link:phone-link-unit:${kind}:*`);

  it("stores keyed digests, expires SMS at three minutes, correlates delivery without leaking codes", async () => {
    await phoneLinkService.requestSms(phone);
    const sent = mocks.send.mock.calls[0]![0];
    expect(sent.otp).toMatch(/^\d{8}$/);
    const [smsKey] = await keys("sms");
    expect(await redis.ttl(smsKey!)).toBeGreaterThanOrEqual(179);
    expect(await redis.ttl(smsKey!)).toBeLessThanOrEqual(180);
    expect(await redis.get(smsKey!)).not.toContain(sent.otp);
    expect(smsKey).not.toContain(phone);
    expect(JSON.stringify(mocks.handoff.mock.calls)).not.toContain(sent.otp);
    expect(mocks.handoff).toHaveBeenCalledWith(expect.objectContaining({ messageId: "synthetic-message", hookHash: sent.hookHash }));
  });
  it("permits only one concurrent SMS verifier and only one email completion", async () => {
    await phoneLinkService.requestSms(phone);
    const otp = mocks.send.mock.calls[0]![0].otp;
    const attempts = await Promise.all(Array.from({ length: 8 }, () => phoneLinkService.verifySms(phone, otp)));
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const proof = attempts.find(Boolean)!;
    await phoneLinkService.bindEmail(proof, "member@example.com", "auth-id");
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => phoneLinkService.consumeProof(proof, "member@example.com", "auth-id")));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  });
  it("rejects a code for a different phone and burns it after five wrong attempts", async () => {
    await phoneLinkService.requestSms(phone);
    const otp = mocks.send.mock.calls[0]![0].otp;
    expect(await phoneLinkService.verifySms("+12025550148", otp)).toBeNull();
    for (let i = 0; i < 5; i++) expect(await phoneLinkService.verifySms(phone, "wrong")).toBeNull();
    expect(await phoneLinkService.verifySms(phone, otp)).toBeNull();
  });
  it("rejects expired SMS and expired phone proofs", async () => {
    const proof = await issueProof();
    const [proofKey] = await keys("proof");
    await redis.pexpire(proofKey!, 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    await expect(phoneLinkService.readProof(proof)).rejects.toMatchObject({ statusCode: 401 });
    await redis.del(...await keys("sms-cooldown"));
    await phoneLinkService.requestSms(phone);
    const [smsKey] = await keys("sms");
    await redis.pexpire(smsKey!, 1);
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(await phoneLinkService.verifySms(phone, mocks.send.mock.calls.at(-1)![0].otp)).toBeNull();
  });
  it("binds the target once and rejects wrong email, wrong account and sixth email attempt", async () => {
    const proof = await issueProof();
    await phoneLinkService.bindEmail(proof, "member@example.com", "auth-id");
    await expect(phoneLinkService.bindEmail(proof, "other@example.com", "other-id")).rejects.toMatchObject({ statusCode: 401 });
    await expect(phoneLinkService.attemptEmail(proof, "other@example.com")).rejects.toMatchObject({ statusCode: 401 });
    await expect(phoneLinkService.consumeProof(proof, "member@example.com", "other-id")).rejects.toMatchObject({ statusCode: 401 });
    for (let i = 0; i < 5; i++) expect(await phoneLinkService.attemptEmail(proof, "member@example.com")).toMatchObject({ phone, authId: "auth-id" });
    await expect(phoneLinkService.attemptEmail(proof, "member@example.com")).rejects.toMatchObject({ statusCode: 401 });
  });
  it("limits SMS and email resends across requests, including an hourly destination cap", async () => {
    const proof = await issueProof();
    await expect(phoneLinkService.requestSms(phone)).rejects.toMatchObject({ statusCode: 429 });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) { await redis.del(...await keys("sms-cooldown")); await phoneLinkService.requestSms(phone); }
    await redis.del(...await keys("sms-cooldown"));
    await expect(phoneLinkService.requestSms(phone)).rejects.toMatchObject({ statusCode: 429 });
    await phoneLinkService.bindEmail(proof, "member@example.com", "auth-id");
    await expect(phoneLinkService.bindEmail(proof, "member@example.com", "auth-id")).rejects.toMatchObject({ statusCode: 429 });
  });
  it("invalidates a failed handoff without automatic retries and fails closed if Redis is unavailable", async () => {
    mocks.send.mockRejectedValueOnce(new Error("provider timeout"));
    await expect(phoneLinkService.requestSms(phone)).rejects.toMatchObject({ statusCode: 503 });
    expect(await keys("sms")).toHaveLength(0);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    mocks.ready.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(phoneLinkService.requestSms("+12025550148")).rejects.toThrow("Redis unavailable");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("serializes account updates and releases the lock after failure", async () => {
    let release!: () => void;
    const work = new Promise<void>(resolve => { release = resolve; });
    const first = phoneLinkService.withAccountLock("auth-id", () => work);
    while (!(await keys("account-lock")).length) await new Promise(resolve => setTimeout(resolve, 1));
    await expect(phoneLinkService.withAccountLock("auth-id", async () => true)).rejects.toMatchObject({ statusCode: 409 });
    release(); await first;
    await expect(phoneLinkService.withAccountLock("auth-id", async () => { throw new Error("synthetic"); })).rejects.toThrow("synthetic");
    expect(await keys("account-lock")).toHaveLength(0);
  });
});
