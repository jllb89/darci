import { setTimeout as delay } from "node:timers/promises";

type Operation = "session_liveness" | "identity_lookup" | "role_lookup";
type Result = { error: unknown; status?: number };
const transientCodes = new Set(["08000", "08003", "08006", "08001", "08004", "40001", "53300", "57014", "57P01", "57P02", "57P03", "PGRST000", "PGRST001", "PGRST002", "PGRST003"]);
const networkCodes = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);

export class AuthDependencyError extends Error {
  constructor(
    readonly operation: Operation,
    readonly code: string,
    readonly retryable: boolean,
    readonly attempts: number,
    readonly elapsedMs: number,
    readonly providerStatus: number | null,
  ) {
    // Never retain provider messages, URLs, query details or credentials.
    super("Authorization dependency unavailable");
    this.name = "AuthDependencyError";
  }
}

function classify(error: unknown, status: number | undefined, timedOut: boolean) {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const cause = value.cause && typeof value.cause === "object" ? value.cause as Record<string, unknown> : {};
  const code = typeof value.code === "string" ? value.code : "";
  const message = typeof value.message === "string" ? value.message : "";
  if (timedOut || value.name === "TimeoutError" || value.name === "AbortError" || /^(TimeoutError|AbortError):/.test(message)) {
    return { code: "AUTH_READ_TIMEOUT", retryable: true };
  }
  if (networkCodes.has(code) || networkCodes.has(String(cause.code)) || /^(TypeError: )?fetch failed\b/.test(message)) {
    return { code: "AUTH_READ_TRANSPORT", retryable: true };
  }
  return {
    code: /^[A-Z0-9_]{1,40}$/.test(code) ? code : status ? `HTTP_${status}` : "AUTH_READ_UNKNOWN",
    retryable: transientCodes.has(code) || [408, 429, 502, 503, 504].includes(status ?? 0),
  };
}

/** Only for read-only authorization queries, never controller actions or writes.
 * No positive-result cache: revocations and inactive roles remain authoritative.
 */
export async function readAuthDependency<T extends Result>(operation: Operation, read: (signal: AbortSignal) => PromiseLike<T>): Promise<T> {
  const started = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    const signal = AbortSignal.timeout(2500);
    let error: unknown;
    let status: number | undefined;
    try {
      const result = await read(signal);
      if (!result.error) {
        if (attempt > 1 && process.env.NODE_ENV !== "test") {
          console.info(JSON.stringify({ kind: "auth_dependency_recovered", operation, attempts: attempt, elapsedMs: Date.now() - started }));
        }
        return result;
      }
      error = result.error;
      status = result.status;
    } catch (caught) {
      error = caught;
    }
    const failure = classify(error, status, signal.aborted);
    if (!failure.retryable || attempt === 2) {
      throw new AuthDependencyError(operation, failure.code, failure.retryable, attempt, Date.now() - started, status ?? null);
    }
    await delay(100);
  }
  throw new Error("Unreachable authorization read state");
}
