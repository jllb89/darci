import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  return {
    limitMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const query = {
      select: vi.fn(() => query),
      or: vi.fn(() => query),
      gte: vi.fn(() => query),
      in: vi.fn(() => query),
      neq: vi.fn(() => query),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: mocks.limitMock,
    };

    return {
      from: vi.fn(() => query),
    };
  }),
}));

import { listRecentAuditEventsForDocumentIds } from "../../src/services/auditService";

describe("listRecentAuditEventsForDocumentIds", () => {
  beforeEach(() => {
    mocks.limitMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("returns an empty list when the audit lookup transport fails", async () => {
    mocks.limitMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(listRecentAuditEventsForDocumentIds(["doc-1"], 20)).resolves.toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(
      "Recent document audit lookup failed",
      expect.objectContaining({ error: "fetch failed" }),
    );
  });
});