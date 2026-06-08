import { describe, expect, it } from "vitest";

import { getRoleLabel } from "../../src/services/documentActionService";

describe("documentActionService", () => {
  it("uses client-facing labels for trust signer roles", () => {
    expect(getRoleLabel("grantor")).toBe("Trustmaker");
    expect(getRoleLabel("trustee")).toBe("Trustee");
  });
});