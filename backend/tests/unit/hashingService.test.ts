import { describe, expect, it } from "vitest";
import { hashDocument } from "../../src/services/hashingService";

describe("hashDocument", () => {
  it("returns a sha256 hash", async () => {
    const result = await hashDocument("doc-123");
    expect(result).toEqual({
      documentId: "doc-123",
      hash: "f6a86db1cdc697588795b4e21b11606d3cc5311c3c79c570480d6fbd5f286188",
    });
  });
});
