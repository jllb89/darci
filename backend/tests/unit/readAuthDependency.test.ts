import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthDependencyError, readAuthDependency } from "../../src/auth/readAuthDependency";

afterEach(() => vi.restoreAllMocks());

describe("read-only authorization dependency recovery", () => {
  it.each([true, false, null])("returns successful %s unchanged without retry or caching", async data => {
    const read = vi.fn().mockResolvedValue({ data, error: null });
    expect((await readAuthDependency("session_liveness", read)).data).toBe(data);
    expect(read).toHaveBeenCalledTimes(1);
    await readAuthDependency("session_liveness", read);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    { error: { message: "TypeError: fetch failed", code: "" }, status: 0 },
    { error: { code: "PGRST003", message: "pool busy" }, status: 504 },
    { error: { code: "57014", message: "statement timeout" }, status: 500 },
    { error: { message: "gateway unavailable" }, status: 503 },
  ])("recovers one transient result (%j) using a fresh bounded read", async failure => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const read = vi.fn().mockResolvedValueOnce(failure).mockResolvedValueOnce({ data: false, error: null });
    expect((await readAuthDependency("session_liveness", read)).data).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]![0]).not.toBe(read.mock.calls[1]![0]);
    expect(timeout.mock.calls).toEqual([[2500], [2500]]);
  });

  it("recovers a thrown connection reset without retaining the provider exception", async () => {
    const read = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))
      .mockResolvedValueOnce({ error: null, data: true });
    expect((await readAuthDependency("identity_lookup", read)).data).toBe(true);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("stops after two timeout failures and retains only safe diagnostics", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort());
    const read = vi.fn().mockResolvedValue({ error: { message: "private-token secret@example.com", details: "sensitive query" }, status: 0 });
    const failure = await readAuthDependency("role_lookup", read).catch(error => error);
    expect(failure).toBeInstanceOf(AuthDependencyError);
    expect(failure).toMatchObject({ operation: "role_lookup", attempts: 2, code: "AUTH_READ_TIMEOUT", retryable: true });
    expect(read).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(failure)).not.toMatch(/private-token|secret@example|sensitive query/);
  });

  it.each(["42501", "PGRST301", "42883", "42703", "PGRST204", "23505"])("does not retry permission/schema/conflict failure %s", async code => {
    const read = vi.fn().mockResolvedValue({ error: { code }, status: 400 });
    await expect(readAuthDependency("identity_lookup", read)).rejects.toMatchObject({ code, attempts: 1, retryable: false });
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not retry unknown programming failures", async () => {
    const read = vi.fn().mockRejectedValue(new Error("Unexpected implementation error"));
    await expect(readAuthDependency("role_lookup", read)).rejects.toMatchObject({ code: "AUTH_READ_UNKNOWN", attempts: 1 });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
