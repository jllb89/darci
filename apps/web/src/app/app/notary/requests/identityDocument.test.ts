import { describe, expect, it } from "vitest";

import {
  getIdentityDocumentOption,
  identityDocumentOptions,
  parseEvidenceArtifactIds,
  validateIdentityDocumentForm,
} from "./identityDocument";

describe("identityDocument", () => {
  it("does not expose vague government ID as an option", () => {
    expect(identityDocumentOptions.some((option) => option.value === "government_id")).toBe(false);
  });

  it("changes follow-up labels by document type", () => {
    expect(getIdentityDocumentOption("state_driver_license").jurisdictionLabel).toBe("Issuing state");
    expect(getIdentityDocumentOption("passport").jurisdictionLabel).toBe("Issuing country");
  });

  it("validates required structured identity fields", () => {
    const result = validateIdentityDocumentForm({
      documentType: "state_driver_license",
      issuingJurisdiction: "",
      documentExpirationDate: "",
      documentNumberTail: "",
      maskedIdentifier: "",
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.issuingJurisdiction).toBeTruthy();
    expect(result.errors.documentExpirationDate).toBeTruthy();
    expect(result.errors.documentNumberTail).toBeTruthy();
  });

  it("accepts either a short tail or masked identifier", () => {
    expect(validateIdentityDocumentForm({
      documentType: "passport",
      issuingJurisdiction: "US",
      documentExpirationDate: "2030-01-01",
      documentNumberTail: "1234",
      maskedIdentifier: "",
    }).isValid).toBe(true);
    expect(validateIdentityDocumentForm({
      documentType: "passport",
      issuingJurisdiction: "US",
      documentExpirationDate: "2030-01-01",
      documentNumberTail: "",
      maskedIdentifier: "XXXXX1234",
    }).isValid).toBe(true);
  });

  it("parses artifact ids from comma or newline input", () => {
    expect(parseEvidenceArtifactIds(" artifact-1,artifact-2\nartifact-1 ")).toEqual([
      "artifact-1",
      "artifact-2",
    ]);
  });
});