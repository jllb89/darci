import { describe, expect, it } from "vitest";
import { hashDocument } from "../../src/services/hashingService";

describe("hashDocument", () => {
  it("returns a sha256 hash", async () => {
    const result = await hashDocument("doc-123", Buffer.from("abc"));
    expect(result).toEqual({
      documentId: "doc-123",
      hash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    });
  });
  it("never substitutes a document ID for missing file bytes", async () => {
    await expect(hashDocument("doc-123")).rejects.toThrow("bytes are required");
  });
});
