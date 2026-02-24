import { describe, expect, it } from "vitest";
import { hashDocument } from "../../src/services/hashingService";

describe("hashDocument", () => {
  it("returns a placeholder hash", async () => {
    const result = await hashDocument("doc-123");
    expect(result).toEqual({ documentId: "doc-123", hash: "TODO_HASH" });
  });
});
