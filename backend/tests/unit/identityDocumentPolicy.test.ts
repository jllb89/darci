import { describe, expect, it } from "vitest";

import { validateIdentityDocument } from "../../src/services/identityDocumentPolicy";

describe("identityDocumentPolicy", () => {
  it("rejects vague government ID document types", () => {
    const result = validateIdentityDocument({
      documentType: "government_id",
      issuingJurisdiction: "OH",
      documentExpirationDate: "2030-01-01",
      documentNumberTail: "1234",
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ field: "documentType" });
  });

  it("requires jurisdiction and expiration date", () => {
    const missingJurisdiction = validateIdentityDocument({
      documentType: "state_driver_license",
      documentExpirationDate: "2030-01-01",
      documentNumberTail: "1234",
    });
    const missingExpiration = validateIdentityDocument({
      documentType: "state_driver_license",
      issuingJurisdiction: "OH",
      documentNumberTail: "1234",
    });

    expect(missingJurisdiction).toMatchObject({ ok: false, field: "issuingJurisdiction" });
    expect(missingExpiration).toMatchObject({ ok: false, field: "documentExpirationDate" });
  });

  it("normalizes a document number tail and artifact ids", () => {
    const result = validateIdentityDocument({
      documentType: "state_driver_license",
      issuingJurisdiction: " oh ",
      documentExpirationDate: "2030-01-01",
      documentNumberTail: "ab12",
      evidenceArtifactIds: [" artifact-1 ", "artifact-1", "artifact-2"],
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        documentType: "state_driver_license",
        issuingJurisdiction: "oh",
        documentNumberTail: "AB12",
        evidenceArtifactIds: ["artifact-1", "artifact-2"],
      },
    });
  });

  it("accepts a masked identifier when no tail is retained", () => {
    const result = validateIdentityDocument({
      documentType: "passport",
      issuingJurisdiction: "US",
      documentExpirationDate: "2032-05-20",
      maskedIdentifier: "XXXXX1234",
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        documentType: "passport",
        maskedIdentifier: "XXXXX1234",
        documentNumberTail: null,
      },
    });
  });
});