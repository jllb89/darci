import { afterEach, beforeEach, expect, vi } from "vitest";

// Opt in for service-mocked suites. Supertest's in-process HTTP requests still
// work, but an omitted provider mock must fail even if production code catches
// the fetch failure and returns a fallback. AbortError avoids SDK retry sleeps.
export const requireNoNetwork = () => {
  let calls: string[];
  let restore: () => void;

  beforeEach(() => {
    calls = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      // Only expose a PostgREST resource name, never query strings, tokens or headers.
      calls.push(url.pathname.match(/^\/rest\/v1\/(?:rpc\/)?[a-z_]+/)?.[0] ?? "provider fetch");
      throw new DOMException("Unexpected provider fetch: add an explicit service mock", "AbortError");
    });
    restore = () => spy.mockRestore();
  });

  afterEach(() => {
    restore();
    expect(calls, "This suite must not issue real provider requests; mock its dependency").toEqual([]);
  });
};
